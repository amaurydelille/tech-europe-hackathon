"use client";

import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/constants";

const STEPS = [
  { label: "Preparing your course…",         duration: 3200 },
  { label: "Choosing the best examples…",    duration: 3200 },
  { label: "Filming a quick video for you…", duration: 4000 },
  { label: "Drawing a few diagrams…",        duration: 3800 },
  { label: "Almost ready",                   duration: 3000 },
] as const;

const TOTAL_MS = STEPS.reduce((s, x) => s + x.duration, 0); // ~17 200 ms

// ── Blob background ───────────────────────────────────────────────
function BlobBg() {
  const blobs = [
    { c: "#E8DFC8", x: -60, y: -40, s: 240, d: 0 },
    { c: "#DCD3BD", x: 200, y: 340, s: 220, d: 1.2 },
    { c: "#EFEBE1", x: 280, y: -20, s: 160, d: 0.6 },
  ];
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", opacity: 0.35 }}>
      {blobs.map((b, i) => (
        <div key={i} style={{
          position: "absolute", left: b.x, top: b.y, width: b.s, height: b.s,
          borderRadius: "60% 40% 50% 50% / 50% 60% 40% 50%",
          background: b.c, filter: "blur(24px)",
          animation: `tt-blob 12s ease-in-out ${b.d}s infinite`,
        }} />
      ))}
    </div>
  );
}

// ── Animated orb ─────────────────────────────────────────────────
function GenerationOrb() {
  const PARTICLES = 14;
  return (
    <div style={{ width: 220, height: 220, position: "relative" }}>
      {/* slowly rotating ring of particles */}
      <div style={{
        position: "absolute", inset: 0,
        animation: "tt-orb-spin 18s linear infinite",
      }}>
        {Array.from({ length: PARTICLES }).map((_, i) => {
          const angle = (i / PARTICLES) * Math.PI * 2;
          const r = 92 + (i % 3) * 6;
          const big = i % 4 === 0;
          return (
            <div key={i} style={{
              position: "absolute",
              left: "50%", top: "50%",
              width: big ? 5 : 3, height: big ? 5 : 3,
              borderRadius: "50%",
              background: big ? "#B89968" : "#D4C9B4",
              transform: `translate(-50%,-50%) translate(${Math.cos(angle) * r}px, ${Math.sin(angle) * r}px)`,
              animation: `tt-pulse-halo 2.4s ${i * 0.09}s ease-in-out infinite`,
            }} />
          );
        })}
      </div>

      {/* counter-rotating slower ring — depth effect */}
      <div style={{
        position: "absolute", inset: 0,
        animation: "tt-orb-spin 26s linear infinite reverse",
      }}>
        {Array.from({ length: 8 }).map((_, i) => {
          const angle = (i / 8) * Math.PI * 2 + 0.4;
          const r = 80;
          return (
            <div key={i} style={{
              position: "absolute",
              left: "50%", top: "50%",
              width: 2, height: 2,
              borderRadius: "50%",
              background: "#B89968",
              opacity: 0.4,
              transform: `translate(-50%,-50%) translate(${Math.cos(angle) * r}px, ${Math.sin(angle) * r}px)`,
            }} />
          );
        })}
      </div>

      {/* champagne halo */}
      <div style={{
        position: "absolute", inset: 14, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(184,153,104,0.32), rgba(184,153,104,0.10) 55%, transparent 78%)",
        animation: "tt-pulse-halo 2.4s ease-in-out infinite",
      }} />

      {/* ink core */}
      <div style={{
        position: "absolute", inset: 52, borderRadius: "50%",
        background: "radial-gradient(circle at 35% 25%, #3A3026 0%, #1A1612 50%, #0A0806 100%)",
        boxShadow: "0 18px 40px rgba(11,9,7,0.42), inset 0 -8px 22px rgba(0,0,0,0.5), inset 0 8px 22px rgba(184,153,104,0.22)",
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: "tt-breath 2.4s ease-in-out infinite",
      }}>
        {/* champagne inner ring */}
        <div style={{
          position: "absolute", inset: 6, borderRadius: "50%",
          border: "1px solid rgba(184,153,104,0.25)",
        }} />
        {/* bulb glyph */}
        <svg width={48} height={48} viewBox="0 0 24 24" fill="none"
          style={{ animation: "tt-bulb-glow 2.4s ease-in-out infinite" }}>
          <path
            d="M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c.5.5 1 1.5 1 2.5h6c0-1 .5-2 1-2.5A6 6 0 0012 3z"
            stroke="#E6D2A1" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}

// ── Step dots indicator ──────────────────────────────────────────
function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 5 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width: 18, height: 2, borderRadius: 2,
          background: i <= current ? "var(--text)" : "var(--border)",
          transition: "background 0.4s",
        }} />
      ))}
    </div>
  );
}

// ── Main generate view ───────────────────────────────────────────
export function GenerateView() {
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const router = useRouter();
  const startRef = useRef(performance.now());
  const rafRef = useRef<number>(0);

  // smooth progress via rAF
  useEffect(() => {
    function tick() {
      const elapsed = performance.now() - startRef.current;
      const pct = Math.min(100, (elapsed / TOTAL_MS) * 100);
      setProgress(pct);

      // advance step based on elapsed time
      let acc = 0;
      let s = 0;
      for (const st of STEPS) {
        acc += st.duration;
        if (elapsed < acc) break;
        s++;
      }
      setStep(Math.min(s, STEPS.length - 1));

      if (pct >= 100) {
        setDone(true);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // navigate to course when done
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => router.push(`${ROUTES.COURSE}/demo`), 900);
    return () => clearTimeout(t);
  }, [done, router]);

  const secondsLeft = Math.max(0, Math.round(((100 - progress) / 100) * TOTAL_MS / 1000));

  return (
    <div style={{
      position: "relative", height: "100dvh", overflow: "hidden",
      background: "var(--bg)", display: "flex", flexDirection: "column",
      padding: "24px 28px 36px", textAlign: "center",
    }}>
      <BlobBg />

      {/* close hint */}
      <div style={{ display: "flex", justifyContent: "flex-end", position: "relative", zIndex: 2 }}>
        <button style={{
          padding: "6px 12px", borderRadius: 999,
          background: "var(--surface)", border: "1px solid var(--border)",
          color: "var(--text-2)", fontSize: 11, fontWeight: 500,
          display: "flex", alignItems: "center", gap: 6,
          letterSpacing: "0.02em", cursor: "pointer",
          fontFamily: "var(--f-body)",
        }}>
          <svg viewBox="0 0 24 24" fill="none" width={11} height={11} aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Close — we&apos;ll ping you
        </button>
      </div>

      {/* orb */}
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        position: "relative", zIndex: 2,
      }}>
        <GenerationOrb />
      </div>

      {/* step text + dots */}
      <div style={{ position: "relative", zIndex: 2, marginBottom: 22, padding: "0 12px" }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] as [number,number,number,number] }}
            style={{
              fontFamily: "var(--f-head)",
              fontWeight: 500,
              fontSize: 24,
              color: "var(--text)",
              lineHeight: 1.2,
              marginBottom: 14,
              letterSpacing: "-0.025em",
            }}
          >
            {done ? "Your course is ready!" : STEPS[step].label}
          </motion.div>
        </AnimatePresence>

        <StepDots total={STEPS.length} current={done ? STEPS.length - 1 : step} />
      </div>

      {/* progress bar */}
      <div style={{ position: "relative", zIndex: 2 }}>
        <div style={{
          height: 4, borderRadius: 2,
          background: "var(--border)", overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            width: `${progress}%`,
            background: done
              ? "var(--gold)"
              : "var(--text)",
            borderRadius: 2,
            transition: "background 0.6s",
          }} />
        </div>
        <div style={{
          marginTop: 12, fontSize: 11, color: "var(--text-3)",
          letterSpacing: "0.06em", textTransform: "uppercase",
          fontFamily: "var(--f-body)",
        }}>
          {done ? "Opening your course…" : `About ${secondsLeft}s left`}
        </div>
      </div>
    </div>
  );
}
