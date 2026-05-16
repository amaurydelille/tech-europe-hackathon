"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useOnboardingVoice } from "@/hooks/useOnboardingVoice";
import { CreateView } from "./CreateView";
import { VoiceView } from "./VoiceView";
import { SummaryView } from "./SummaryView";
import type { WaveMode } from "./Waveform";

type Scene = "create" | "voice" | "summary";

const EASE = [0.4, 0, 0.2, 1] as [number, number, number, number];
const fadeSlide = {
  initial: { opacity: 0, scale: 0.97 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.97 },
  transition: { duration: 0.38, ease: EASE },
};

type Override = "none" | "summary" | "create";

export function ChatFlow() {
  const [override, setOverride] = useState<Override>("none");
  const { status, amplitude, error, profile, start, stop } = useOnboardingVoice();

  const handleStart = useCallback(async () => {
    setOverride("none");
    await start();
  }, [start]);

  const handleEnd = useCallback(() => {
    stop();
    setOverride("summary");
  }, [stop]);

  const handleReset = useCallback(() => {
    stop();
    setOverride("create");
  }, [stop]);

  // Cleanup on unmount handled by the hook.
  useEffect(() => () => stop(), [stop]);

  const scene: Scene = useMemo(() => {
    if (override === "create") return "create";
    if (override === "summary" || status === "done") return "summary";
    if (status === "listening" || status === "speaking" || status === "thinking") {
      return "voice";
    }
    return "create";
  }, [status, override]);

  const voiceMode: WaveMode = useMemo(() => {
    if (status === "speaking") return "ai";
    if (status === "thinking" || status === "connecting") return "thinking";
    return "listening";
  }, [status]);

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
              loading={status === "connecting"}
              error={error}
            />
          </motion.div>
        )}

        {scene === "voice" && (
          <motion.div key="voice" {...fadeSlide} style={{ position: "absolute", inset: 0 }}>
            <VoiceView
              mode={voiceMode}
              amplitude={amplitude}
              onEnd={handleEnd}
            />
          </motion.div>
        )}

        {scene === "summary" && (
          <motion.div key="summary" {...fadeSlide} style={{ position: "absolute", inset: 0 }}>
            <SummaryView onReset={handleReset} profile={profile} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
