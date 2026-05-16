"use client";

import { useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/constants";
import { IllusRhythm, IllusHeart, IllusMic, IllusReady } from "./illustrations";

const SLIDES = [
  {
    eyebrow: "Welcome",
    title: "Learn at your own pace",
    body: "No bells, no shame. Pick up where you left off whenever you want.",
    Illus: IllusRhythm,
  },
  {
    eyebrow: "For everyone",
    title: "A private tutor, without the price",
    body: "High-quality, personal teaching that used to cost €40/hr — for free.",
    Illus: IllusHeart,
  },
  {
    eyebrow: "Just talk",
    title: "Tell us what you want to learn",
    body: "We'll build a course around your goal, your level and your rhythm.",
    Illus: IllusMic,
  },
  {
    eyebrow: "Ready?",
    title: "Your first course is one tap away",
    body: "Tap the mic, speak naturally — like you would to a friend.",
    Illus: IllusReady,
  },
] as const;

const BLOB_COLORS = ["#E8DFC8", "#DCD3BD", "#EFEBE1"];

function BlobBg({ seed }: { seed: number }) {
  const positions = [
    { x: -60, y: -40, s: 240, delay: 0 },
    { x: 200, y: 340, s: 220, delay: 1.2 },
    { x: 280, y: -20, s: 160, delay: 0.6 },
  ];
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ opacity: 0.45 }}>
      {positions.map((b, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: b.x,
            top: b.y,
            width: b.s,
            height: b.s,
            borderRadius: "60% 40% 50% 50% / 50% 60% 40% 50%",
            background: BLOB_COLORS[(i + seed) % BLOB_COLORS.length],
            filter: "blur(24px)",
            animation: `tt-blob 12s ease-in-out ${b.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? "100%" : "-100%", opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir < 0 ? "100%" : "-100%", opacity: 0 }),
};

const transition = { duration: 0.38, ease: [0.4, 0, 0.2, 1] as const };

export function OnboardingFlow() {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const router = useRouter();
  const isLast = index === SLIDES.length - 1;

  const go = useCallback(
    (next: number) => {
      setDirection(next > index ? 1 : -1);
      setIndex(next);
    },
    [index]
  );

  const handleNext = () => {
    if (isLast) {
      router.push(ROUTES.CHAT);
    } else {
      go(index + 1);
    }
  };

  const { eyebrow, title, body, Illus } = SLIDES[index];

  return (
    <div
      className="relative flex flex-col overflow-hidden"
      style={{ height: "100dvh", background: "var(--bg)" }}
    >
      {/* Blob background — stays mounted, transitions its own color */}
      <BlobBg seed={index} />

      {/* Skip button */}
      <div className="relative z-10 flex justify-end px-7 pt-6 h-10">
        {!isLast && (
          <button
            onClick={() => router.push(ROUTES.CHAT)}
            style={{ color: "var(--text-2)", fontSize: 14, fontWeight: 500, fontFamily: "var(--f-body)", background: "none", border: "none", cursor: "pointer" }}
          >
            Skip
          </button>
        )}
      </div>

      {/* Slide area */}
      <div className="relative z-10 flex-1 overflow-hidden">
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={index}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={transition}
            className="absolute inset-0 flex flex-col"
          >
            {/* Illustration */}
            <div className="flex flex-1 items-center justify-center px-8 py-4">
              <div style={{ width: 260, height: 260, maxWidth: "80vw", maxHeight: "80vw" }}>
                <Illus />
              </div>
            </div>

            {/* Copy */}
            <div className="px-8 pb-2 text-center">
              <p
                style={{
                  color: "var(--gold-deep)",
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  marginBottom: 14,
                  fontFamily: "var(--f-body)",
                }}
              >
                {eyebrow}
              </p>
              <h1
                style={{
                  fontFamily: "var(--f-head)",
                  fontSize: "clamp(26px, 7vw, 32px)",
                  fontWeight: 500,
                  lineHeight: 1.1,
                  letterSpacing: "-0.025em",
                  color: "var(--text)",
                  marginBottom: 14,
                }}
              >
                {title}
              </h1>
              <p
                style={{
                  fontSize: 16,
                  lineHeight: 1.55,
                  color: "var(--text-2)",
                  fontFamily: "var(--f-body)",
                  margin: "0 4px",
                }}
              >
                {body}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Dots + CTA — always visible */}
      <div className="relative z-10 px-7 pb-10 pt-6 flex flex-col gap-6">
        {/* Progress dots */}
        <div className="flex gap-1.5 justify-center">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => go(i)}
              style={{
                width: i === index ? 22 : 6,
                height: 6,
                borderRadius: 3,
                background: i === index ? "var(--text)" : "var(--border-strong)",
                border: "none",
                padding: 0,
                cursor: "pointer",
                transition: "width .3s cubic-bezier(.4,0,.2,1), background .3s",
              }}
            />
          ))}
        </div>

        {/* Primary CTA */}
        <button
          onClick={handleNext}
          style={{
            width: "100%",
            height: 56,
            borderRadius: 28,
            border: "none",
            background: "linear-gradient(180deg,#1F1B14 0%,#0B0907 100%)",
            color: "#FAF7F0",
            fontFamily: "var(--f-body)",
            fontWeight: 600,
            fontSize: 16,
            letterSpacing: "-0.005em",
            cursor: "pointer",
            boxShadow: "0 8px 24px rgba(20,17,13,.18), 0 2px 6px rgba(20,17,13,.10)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {isLast ? "Create my first course" : "Next"}
          <svg viewBox="0 0 24 24" fill="none" width={18} height={18} aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
