"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ONBOARDING_WS_URL } from "@/constants";
import type { OnboardingProfile, TranscriptEntry } from "@/types";

export type OnboardingStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "done"
  | "error";

const MIC_SAMPLE_RATE = 24000;
const DEFAULT_PLAY_RATE = 24000;

interface ServerMessage {
  type?: string;
  text?: string;
  message?: string;
  profile?: OnboardingProfile | null;
  sample_rate?: number;
}

export interface OnboardingVoiceState {
  status: OnboardingStatus;
  partial: string;
  transcript: TranscriptEntry[];
  profile: OnboardingProfile | null;
  error: string | null;
  amplitude: number;
  start: () => Promise<void>;
  stop: () => void;
}

export function useOnboardingVoice(): OnboardingVoiceState {
  const [status, setStatus] = useState<OnboardingStatus>("idle");
  const [partial, setPartial] = useState("");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [profile, setProfile] = useState<OnboardingProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [amplitude, setAmplitude] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micNodeRef = useRef<AudioWorkletNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  // Browser AnalyserNode wants a Uint8Array backed by an ArrayBuffer (not
  // ArrayBufferLike); TS's default Uint8Array generic widens to ArrayBufferLike
  // since SharedArrayBuffer support, so use `any` here as the existing
  // useVoiceRecording hook does.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ampDataRef = useRef<any>(null);
  const ampRafRef = useRef<number>(0);
  const playCtxRef = useRef<AudioContext | null>(null);
  const playRateRef = useRef<number>(DEFAULT_PLAY_RATE);
  const nextStartRef = useRef<number>(0);
  // `status` is read inside event callbacks attached once at connect time — keep a ref so
  // they see the current value without re-binding the WebSocket handlers.
  const statusRef = useRef<OnboardingStatus>("idle");
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const cleanup = useCallback(() => {
    if (ampRafRef.current) {
      cancelAnimationFrame(ampRafRef.current);
      ampRafRef.current = 0;
    }
    if (micNodeRef.current) {
      try {
        micNodeRef.current.disconnect();
      } catch {
        /* ignore */
      }
      micNodeRef.current = null;
    }
    analyserRef.current = null;
    ampDataRef.current = null;
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (micCtxRef.current) {
      micCtxRef.current.close().catch(() => {});
      micCtxRef.current = null;
    }
    if (playCtxRef.current) {
      const ctx = playCtxRef.current;
      playCtxRef.current = null;
      // Let queued TTS audio finish before tearing down — otherwise the final
      // utterance gets clipped when the server closes the WS right after `done`.
      const remaining = Math.max(0, nextStartRef.current - ctx.currentTime);
      const closeFn = () => ctx.close().catch(() => {});
      if (remaining > 0.05) {
        setTimeout(closeFn, Math.ceil((remaining + 0.2) * 1000));
      } else {
        closeFn();
      }
    }
    nextStartRef.current = 0;
    setAmplitude(0);
  }, []);

  const ensurePlayCtx = useCallback((rate: number): AudioContext => {
    if (playCtxRef.current && playCtxRef.current.sampleRate !== rate) {
      playCtxRef.current.close().catch(() => {});
      playCtxRef.current = null;
    }
    if (!playCtxRef.current) {
      playCtxRef.current = new AudioContext({ sampleRate: rate });
      nextStartRef.current = playCtxRef.current.currentTime;
    }
    return playCtxRef.current;
  }, []);

  const playPcm = useCallback(
    (buf: ArrayBuffer) => {
      const rate = playRateRef.current;
      const ctx = ensurePlayCtx(rate);
      const int16 = new Int16Array(buf);
      const f32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 0x8000;
      const audioBuf = ctx.createBuffer(1, f32.length, rate);
      audioBuf.getChannelData(0).set(f32);
      const src = ctx.createBufferSource();
      src.buffer = audioBuf;
      src.connect(ctx.destination);
      const startAt = Math.max(ctx.currentTime, nextStartRef.current);
      src.start(startAt);
      nextStartRef.current = startAt + audioBuf.duration;
    },
    [ensurePlayCtx]
  );

  const startMic = useCallback(
    async (ws: WebSocket) => {
      const ctx = new AudioContext({ sampleRate: MIC_SAMPLE_RATE });
      micCtxRef.current = ctx;
      const cancelled = () => micCtxRef.current !== ctx || ctx.state === "closed";

      await ctx.audioWorklet.addModule("/pcm-worklet.js");
      if (cancelled()) return;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (cancelled()) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      micStreamRef.current = stream;

      const src = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, "pcm-worklet");
      micNodeRef.current = node;
      node.port.onmessage = (evt) => {
        const buf = evt.data as ArrayBuffer;
        if (ws.readyState === WebSocket.OPEN) ws.send(buf);
      };

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      ampDataRef.current = new Uint8Array(analyser.frequencyBinCount);

      src.connect(node);
      src.connect(analyser);
      // Intentionally not connecting node to destination — would echo your own voice.

      // Prime the playback context on the same user gesture so autoplay policies
      // don't block the first assistant utterance.
      ensurePlayCtx(playRateRef.current);

      const poll = () => {
        const a = analyserRef.current;
        const d = ampDataRef.current;
        if (!a || !d) return;
        a.getByteFrequencyData(d);
        let sum = 0;
        for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
        const rms = Math.sqrt(sum / d.length) / 128;
        setAmplitude(Math.min(1, rms * 2.2));
        ampRafRef.current = requestAnimationFrame(poll);
      };
      ampRafRef.current = requestAnimationFrame(poll);
    },
    [ensurePlayCtx]
  );

  const start = useCallback(async () => {
    setStatus("connecting");
    setTranscript([]);
    setPartial("");
    setProfile(null);
    setError(null);

    let ws: WebSocket;
    try {
      ws = new WebSocket(ONBOARDING_WS_URL);
      ws.binaryType = "arraybuffer";
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
      return;
    }
    wsRef.current = ws;

    ws.onopen = async () => {
      try {
        await startMic(ws);
        setStatus("listening");
      } catch (e) {
        setError((e as Error).message);
        setStatus("error");
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      }
    };

    ws.onerror = () => {
      setError("WebSocket error");
    };

    ws.onclose = () => {
      cleanup();
      // Don't clobber done/error terminal states.
      if (statusRef.current !== "done" && statusRef.current !== "error") {
        setStatus("idle");
      }
    };

    ws.onmessage = (evt) => {
      if (typeof evt.data === "string") {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(evt.data);
        } catch {
          return;
        }
        switch (msg.type) {
          case "partial_transcript":
            setPartial(msg.text ?? "");
            break;
          case "user_turn":
            setPartial("");
            if (msg.text) {
              setTranscript((t) => [...t, { kind: "user", text: msg.text! }]);
            }
            setStatus("thinking");
            break;
          case "assistant_text":
            if (msg.text) {
              setTranscript((t) => [...t, { kind: "assistant", text: msg.text! }]);
            }
            break;
          case "audio_format":
            if (typeof msg.sample_rate === "number" && msg.sample_rate > 0) {
              playRateRef.current = msg.sample_rate;
            }
            break;
          case "speech_start":
            setStatus("speaking");
            if (playCtxRef.current) {
              nextStartRef.current = playCtxRef.current.currentTime;
            }
            break;
          case "speech_end":
            if (statusRef.current === "speaking") setStatus("listening");
            break;
          case "done":
            setProfile(msg.profile ?? null);
            setStatus("done");
            break;
          case "error":
            setError(msg.message ?? "error");
            setStatus("error");
            break;
        }
      } else if (evt.data instanceof ArrayBuffer) {
        playPcm(evt.data);
      }
    };
  }, [cleanup, playPcm, startMic]);

  const stop = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "stop" }));
      } catch {
        /* ignore */
      }
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    } else {
      cleanup();
      if (statusRef.current !== "done" && statusRef.current !== "error") {
        setStatus("idle");
      }
    }
  }, [cleanup]);

  useEffect(
    () => () => {
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          /* ignore */
        }
        wsRef.current = null;
      }
      cleanup();
    },
    [cleanup]
  );

  return { status, partial, transcript, profile, error, amplitude, start, stop };
}
