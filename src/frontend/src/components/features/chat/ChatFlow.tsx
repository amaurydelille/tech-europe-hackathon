"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
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
const SEEN_VIDEOS_KEY = "gradium.seenVideos";

export function ChatFlow() {
  const router = useRouter();
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

  const openFeed = useCallback(async () => {
    if (typeof window !== "undefined") {
      try {
        const raw = window.sessionStorage.getItem(SEEN_VIDEOS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const ids = parsed.filter((x): x is string => typeof x === "string");
            if (ids.length > 0) {
              router.push(`/course/${encodeURIComponent(ids[ids.length - 1])}`);
              return;
            }
          }
        }
      } catch {
        // ignore storage parse errors
      }
    }

    try {
      const res = await fetch("/api/courses");
      const data = (await res.json()) as { ids?: unknown };
      const ids = Array.isArray(data.ids)
        ? data.ids.filter((x): x is string => typeof x === "string")
        : [];
      if (ids.length > 0) {
        const randomId = ids[Math.floor(Math.random() * ids.length)];
        router.push(`/course/${encodeURIComponent(randomId)}`);
        return;
      }
    } catch {
      // ignore request errors
    }

    router.push("/course/attention");
  }, [router]);

  return (
    <div
      style={{
        position: "relative",
        height: "100dvh",
        overflow: "hidden",
        background: "var(--bg)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 30,
          padding: "10px 14px",
          display: "flex",
          justifyContent: "center",
          pointerEvents: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(255,255,255,0.88)",
            borderRadius: 999,
            padding: 4,
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.65)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.16)",
          }}
        >
          <button
            onClick={() => router.push("/chat")}
            style={{
              height: 30,
              padding: "0 12px",
              borderRadius: 999,
              border: "none",
              background: "#2a2520",
              color: "#fff",
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "var(--f-body)",
              cursor: "pointer",
            }}
          >
            Chat
          </button>
          <button
            onClick={openFeed}
            style={{
              height: 30,
              padding: "0 12px",
              borderRadius: 999,
              border: "none",
              background: "transparent",
              color: "#2a2520",
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "var(--f-body)",
              cursor: "pointer",
            }}
          >
            Feed
          </button>
        </div>
      </div>

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
