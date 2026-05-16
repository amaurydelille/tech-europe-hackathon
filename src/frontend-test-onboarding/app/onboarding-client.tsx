"use client";

import { useEffect, useRef, useState } from "react";

type Status =
  | "disconnected"
  | "connecting"
  | "listening"
  | "speaking"
  | "done"
  | "error";

type LogEntry =
  | { kind: "you"; text: string }
  | { kind: "luma"; text: string }
  | { kind: "err"; text: string }
  | { kind: "meta"; text: string };

const MIC_SAMPLE_RATE = 24000;
const DEFAULT_PLAY_RATE = 24000;
const WS_URL =
  process.env.NEXT_PUBLIC_ONBOARDING_WS ?? "ws://localhost:8000/ws/onboarding";

export default function OnboardingClient() {
  const [status, setStatus] = useState<Status>("disconnected");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [partial, setPartial] = useState<string>("");
  const [profile, setProfile] = useState<unknown>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micNodeRef = useRef<AudioWorkletNode | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const playRateRef = useRef<number>(DEFAULT_PLAY_RATE);
  const nextStartRef = useRef<number>(0);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log, partial]);

  useEffect(() => {
    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function append(entry: LogEntry) {
    setLog((l) => [...l, entry]);
  }

  function ensurePlayCtx(rate: number): AudioContext {
    if (playCtxRef.current && playCtxRef.current.sampleRate !== rate) {
      playCtxRef.current.close().catch(() => {});
      playCtxRef.current = null;
    }
    if (!playCtxRef.current) {
      playCtxRef.current = new AudioContext({ sampleRate: rate });
      nextStartRef.current = playCtxRef.current.currentTime;
    }
    return playCtxRef.current;
  }

  function playPcm(buf: ArrayBuffer) {
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
  }

  async function startMic(ws: WebSocket) {
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
    src.connect(node);
    // Intentionally not connecting node to destination — would echo your own voice.

    // Prime the playback context on the same user gesture so autoplay policies
    // don't block the first assistant utterance. Rate may get corrected when
    // the first `audio_format` event arrives.
    ensurePlayCtx(playRateRef.current);
  }

  async function handleConnect() {
    setStatus("connecting");
    setLog([]);
    setPartial("");
    setProfile(null);

    let ws: WebSocket;
    try {
      ws = new WebSocket(WS_URL);
      ws.binaryType = "arraybuffer";
    } catch (e) {
      setStatus("error");
      append({ kind: "err", text: `WS construction failed: ${(e as Error).message}` });
      return;
    }
    wsRef.current = ws;

    ws.onopen = async () => {
      append({ kind: "meta", text: `connected to ${WS_URL}` });
      try {
        await startMic(ws);
        setStatus("listening");
      } catch (e) {
        setStatus("error");
        append({ kind: "err", text: `mic error: ${(e as Error).message}` });
      }
    };

    ws.onerror = () => {
      append({ kind: "err", text: "WebSocket error" });
    };

    ws.onclose = (evt) => {
      const detail = evt.code
        ? `disconnected (code ${evt.code}${evt.reason ? `: ${evt.reason}` : ""})`
        : "disconnected";
      append({ kind: "meta", text: detail });
      cleanup();
      setStatus((s) => (s === "done" || s === "error" ? s : "disconnected"));
    };

    ws.onmessage = (evt) => {
      if (typeof evt.data === "string") {
        let msg: {
          type?: string;
          text?: string;
          message?: string;
          profile?: unknown;
          sample_rate?: number;
        };
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
            if (msg.text) append({ kind: "you", text: msg.text });
            break;
          case "assistant_text":
            if (msg.text) append({ kind: "luma", text: msg.text });
            break;
          case "audio_format":
            if (typeof msg.sample_rate === "number" && msg.sample_rate > 0) {
              if (playRateRef.current !== msg.sample_rate) {
                append({
                  kind: "meta",
                  text: `audio sample rate: ${msg.sample_rate} Hz`,
                });
              }
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
            setStatus((s) => (s === "speaking" ? "listening" : s));
            break;
          case "done":
            setProfile(msg.profile ?? null);
            setStatus("done");
            break;
          case "error":
            append({ kind: "err", text: msg.message ?? "error" });
            setStatus("error");
            break;
        }
      } else if (evt.data instanceof ArrayBuffer) {
        playPcm(evt.data);
      }
    };
  }

  function handleStop() {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "stop" }));
      } catch {
        /* ignore */
      }
      ws.close();
    } else {
      cleanup();
      setStatus("disconnected");
    }
  }

  function cleanup() {
    if (micNodeRef.current) {
      try {
        micNodeRef.current.disconnect();
      } catch {
        /* ignore */
      }
      micNodeRef.current = null;
    }
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
      const remaining = Math.max(0, nextStartRef.current - ctx.currentTime);
      const closeFn = () => ctx.close().catch(() => {});
      if (remaining > 0.05) {
        // Let queued TTS audio finish playing before tearing down the context,
        // otherwise the final utterance gets clipped when the server closes the
        // WS right after `done`.
        setTimeout(closeFn, Math.ceil((remaining + 0.2) * 1000));
      } else {
        closeFn();
      }
    }
    nextStartRef.current = 0;
  }

  const inFlight = status === "connecting" || status === "listening" || status === "speaking";

  return (
    <>
      <div className="controls">
        <button onClick={handleConnect} disabled={inFlight}>
          {status === "done" || status === "error" ? "Restart" : "Connect"}
        </button>
        <button className="stop" onClick={handleStop} disabled={!inFlight}>
          Stop
        </button>
        <span className={`status ${status}`}>{status}</span>
      </div>

      <h2>Transcript</h2>
      <div className="log" ref={logRef}>
        {log.map((e, i) => (
          <div key={i} className={`entry ${e.kind}`}>
            {e.kind === "you"
              ? `[you] ${e.text}`
              : e.kind === "luma"
              ? `[Kheiron] ${e.text}`
              : e.kind === "err"
              ? `[error] ${e.text}`
              : `— ${e.text} —`}
          </div>
        ))}
        {partial && <div className="entry partial">[partial] {partial}</div>}
        {log.length === 0 && !partial && (
          <div className="entry meta">Click Connect to start.</div>
        )}
      </div>

      <h2>Profile</h2>
      <div className="profile">
        {profile ? JSON.stringify(profile, null, 2) : "—"}
      </div>
    </>
  );
}
