"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/constants";
import { getPendingProfile, setDraft } from "@/lib/courseDraftStore";
import { courseService } from "@/services/course.service";
import type { OnboardingProfile } from "@/types";

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
  const positionOnRing = (angle: number, radius: number) => {
    const x = (Math.cos(angle) * radius).toFixed(4);
    const y = (Math.sin(angle) * radius).toFixed(4);
    return `translate(-50%, -50%) translate(${x}px, ${y}px)`;
  };

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
              transform: positionOnRing(angle, r),
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
              transform: positionOnRing(angle, r),
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

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Course generation failed. Please try again.";
}

// ── Main generate view ───────────────────────────────────────────
export function GenerateView() {
  const [profile] = useState<OnboardingProfile | null>(() => getPendingProfile());
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // DEMO MODE: real generation call commented out — mock loading then jump to /course/demo.
  const runGeneration = useCallback(async (_nextProfile: OnboardingProfile) => {
    setStatus("loading");
    setError(null);

    // try {
    //   const output = await courseService.generate(_nextProfile);
    //   setDraft(output);
    //   router.push(ROUTES.DRAFT);
    // } catch (err) {
    //   setError(getErrorMessage(err));
    //   setStatus("error");
    // }

    await new Promise((resolve) => setTimeout(resolve, 2500));
    router.push(`${ROUTES.COURSE}/f0d51345-ed73-4795-a405-9437de2bc33b`);
  }, [router]);

  useEffect(() => {
    // DEMO MODE: skip profile gating so the loading screen is always reachable.
    // if (!profile) {
    //   router.replace(ROUTES.CHAT);
    //   return;
    // }

    let cancelled = false;

    async function generateOnMount() {
      // const currentProfile = profile;
      // try {
      //   const output = await courseService.generate(currentProfile);
      //   if (cancelled) return;
      //   setDraft(output);
      //   router.push(ROUTES.DRAFT);
      // } catch (err) {
      //   if (cancelled) return;
      //   setError(getErrorMessage(err));
      //   setStatus("error");
      // }

      await new Promise((resolve) => setTimeout(resolve, 2500));
      if (cancelled) return;
      router.push(`${ROUTES.COURSE}/f0d51345-ed73-4795-a405-9437de2bc33b`);
    }

    void generateOnMount();

    return () => {
      cancelled = true;
    };
  }, [profile, router]);

  return (
    <div style={{
      position: "relative", height: "100dvh", overflow: "hidden",
      background: "var(--bg)", display: "flex", flexDirection: "column",
      padding: "24px 28px 36px", textAlign: "center",
    }}>
      <BlobBg />

      {/* close hint */}
      <div style={{ display: "flex", justifyContent: "flex-end", position: "relative", zIndex: 2 }}>
        <button
          onClick={() => router.push(ROUTES.CHAT)}
          style={{
            padding: "6px 12px", borderRadius: 999,
            background: "var(--surface)", border: "1px solid var(--border)",
            color: "var(--text-2)", fontSize: 11, fontWeight: 500,
            display: "flex", alignItems: "center", gap: 6,
            letterSpacing: "0.02em", cursor: "pointer",
            fontFamily: "var(--f-body)",
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" width={11} height={11} aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Back
        </button>
      </div>

      {/* orb */}
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        position: "relative", zIndex: 2,
      }}>
        <GenerationOrb />
      </div>

      {/* status text */}
      <div style={{ position: "relative", zIndex: 2, marginBottom: 22, padding: "0 12px" }}>
        <motion.div
          key={status}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
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
          {status === "error" ? "Course generation hit a snag" : "Preparing your course…"}
        </motion.div>

        <div style={{
          maxWidth: 360,
          margin: "0 auto",
          fontSize: 13,
          color: status === "error" ? "var(--gold-deep)" : "var(--text-3)",
          lineHeight: 1.5,
          fontFamily: "var(--f-body)",
        }}>
          {status === "error" ? error : "This usually takes a moment"}
        </div>
      </div>

      {status === "error" && (
        <div style={{
          position: "relative",
          zIndex: 2,
          display: "flex",
          gap: 10,
        }}>
          <button
            onClick={() => profile && void runGeneration(profile)}
            disabled={!profile}
            style={{
              flex: 1,
              height: 52,
              borderRadius: 26,
              border: "none",
              background: "linear-gradient(180deg,#1F1B14 0%,#0B0907 100%)",
              color: "#FAF7F0",
              fontFamily: "var(--f-body)",
              fontWeight: 600,
              fontSize: 15,
              cursor: profile ? "pointer" : "not-allowed",
              opacity: profile ? 1 : 0.48,
              boxShadow: "0 8px 24px rgba(20,17,13,.18)",
            }}
          >
            Retry
          </button>
          <button
            onClick={() => router.push(ROUTES.CHAT)}
            style={{
              flex: 1,
              height: 52,
              borderRadius: 26,
              border: "1px solid var(--border-strong)",
              background: "transparent",
              color: "var(--text)",
              fontFamily: "var(--f-body)",
              fontWeight: 500,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Back
          </button>
        </div>
      )}
    </div>
  );
}
