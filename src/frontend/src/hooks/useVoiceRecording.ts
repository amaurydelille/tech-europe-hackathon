"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export type RecordingState = "idle" | "requesting" | "recording" | "error";

export function useVoiceRecording() {
  const [state, setState] = useState<RecordingState>("idle");
  const [amplitude, setAmplitude] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dataRef = useRef<any>(new Uint8Array(0));
  const rafRef = useRef<number>(0);

  const poll = useCallback(() => {
    if (!analyserRef.current) return;
    analyserRef.current.getByteFrequencyData(dataRef.current);
    const sum = (dataRef.current as Uint8Array).reduce((acc: number, v: number) => acc + v * v, 0);
    const rms = Math.sqrt(sum / dataRef.current.length) / 128;
    setAmplitude(Math.min(1, rms * 2.2));
    rafRef.current = requestAnimationFrame(poll);
  }, []);

  const start = useCallback(async () => {
    setState("requesting");
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      dataRef.current = new Uint8Array(analyser.frequencyBinCount);

      setState("recording");
      rafRef.current = requestAnimationFrame(poll);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Microphone access denied";
      setError(msg);
      setState("error");
    }
  }, [poll]);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close();
    streamRef.current = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
    setState("idle");
    setAmplitude(0);
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { state, amplitude, error, start, stop };
}
