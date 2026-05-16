"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useVoiceRecording } from "@/hooks/useVoiceRecording";
import { CreateView } from "./CreateView";
import { VoiceView } from "./VoiceView";
import { SummaryView } from "./SummaryView";
import type { WaveMode } from "./Waveform";

type Scene = "create" | "voice" | "summary";

// Demo: auto-cycle through voice states to showcase the waveform
const VOICE_CYCLE: { mode: WaveMode; duration: number }[] = [
  { mode: "listening", duration: 4000 },
  { mode: "thinking", duration: 2000 },
  { mode: "ai", duration: 4500 },
  { mode: "listening", duration: 3500 },
  { mode: "thinking", duration: 1800 },
  { mode: "ai", duration: 5000 },
];

const EASE = [0.4, 0, 0.2, 1] as [number, number, number, number];
const fadeSlide = {
  initial: { opacity: 0, scale: 0.97 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.97 },
  transition: { duration: 0.38, ease: EASE },
};

export function ChatFlow() {
  const [scene, setScene] = useState<Scene>("create");
  const [voiceMode, setVoiceMode] = useState<WaveMode>("listening");
  const { state: recState, amplitude, error, start, stop } = useVoiceRecording();

  // Demo voice-state cycling
  const cycleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cycleIdxRef = useRef(0);

  const startCycle = useCallback(() => {
    function tick() {
      const step = VOICE_CYCLE[cycleIdxRef.current % VOICE_CYCLE.length];
      setVoiceMode(step.mode);
      cycleIdxRef.current++;
      cycleRef.current = setTimeout(tick, step.duration);
    }
    tick();
  }, []);

  const stopCycle = useCallback(() => {
    if (cycleRef.current) clearTimeout(cycleRef.current);
  }, []);

  // Kick off voice scene
  const handleStart = useCallback(async () => {
    await start();
    // If mic access was denied, stay on create with error shown
    // (error is surfaced via the hook)
  }, [start]);

  // Transition to voice scene once mic is active (or if permission was denied we show error)
  useEffect(() => {
    if (recState === "recording" && scene === "create") {
      setScene("voice");
      cycleIdxRef.current = 0;
      startCycle();
    }
    if (recState === "error" && scene === "create") {
      // error shown inline in CreateView
    }
  }, [recState, scene, startCycle]);

  const handleEnd = useCallback(() => {
    stop();
    stopCycle();
    setScene("summary");
  }, [stop, stopCycle]);

  const handleReset = useCallback(() => {
    setScene("create");
    setVoiceMode("listening");
    cycleIdxRef.current = 0;
  }, []);

  // Cleanup on unmount
  useEffect(() => () => { stop(); stopCycle(); }, [stop, stopCycle]);

  return (
    <div
      style={{
        position: "relative",
        height: "100dvh",
        overflow: "hidden",
        background: "var(--bg)",
      }}
    >
      <AnimatePresence mode="wait">
        {scene === "create" && (
          <motion.div key="create" {...fadeSlide} style={{ position: "absolute", inset: 0 }}>
            <CreateView
              onStart={handleStart}
              loading={recState === "requesting"}
              error={error}
            />
          </motion.div>
        )}

        {scene === "voice" && (
          <motion.div key="voice" {...fadeSlide} style={{ position: "absolute", inset: 0 }}>
            <VoiceView mode={voiceMode} amplitude={amplitude} onEnd={handleEnd} />
          </motion.div>
        )}

        {scene === "summary" && (
          <motion.div key="summary" {...fadeSlide} style={{ position: "absolute", inset: 0 }}>
            <SummaryView onReset={handleReset} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
