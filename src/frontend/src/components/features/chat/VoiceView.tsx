"use client";

import { Waveform, type WaveMode } from "./Waveform";
import { StatusPill } from "./StatusPill";

interface VoiceViewProps {
  mode: WaveMode;
  amplitude: number;
  onEnd: () => void;
}

function BlobBg({ aiMode }: { aiMode: boolean }) {
  const blobs = aiMode
    ? [
        { c: "#DCD3BD", x: -50, y: -30, s: 240, d: 0 },
        { c: "#E8DFC8", x: 220, y: 280, s: 220, d: 1 },
        { c: "#EFEBE1", x: 260, y: -40, s: 180, d: 0.6 },
      ]
    : [
        { c: "#E8DFC8", x: -60, y: -40, s: 240, d: 0 },
        { c: "#DCD3BD", x: 200, y: 340, s: 220, d: 1.2 },
        { c: "#EFEBE1", x: 280, y: -20, s: 160, d: 0.6 },
      ];

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        opacity: 0.4,
        transition: "opacity 0.5s",
      }}
    >
      {blobs.map((b, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: b.x,
            top: b.y,
            width: b.s,
            height: b.s,
            borderRadius: "60% 40% 50% 50% / 50% 60% 40% 50%",
            background: b.c,
            filter: "blur(24px)",
            animation: `tt-blob 12s ease-in-out ${b.d}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

export function VoiceView({ mode, amplitude, onEnd }: VoiceViewProps) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
      }}
    >
      <BlobBg aiMode={mode === "ai"} />

      {/* status pill */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          paddingTop: 18,
          position: "relative",
          zIndex: 2,
        }}
      >
        <StatusPill mode={mode} />
      </div>

      {/* waveform */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          zIndex: 2,
          padding: "0 0 16px",
        }}
      >
        <Waveform mode={mode} amplitude={amplitude} />
      </div>

      {/* controls */}
      <div
        style={{
          padding: "0 24px 40px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          position: "relative",
          zIndex: 2,
          gap: 14,
        }}
      >
        {/* captions */}
        <button
          aria-label="Captions"
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-2)",
            cursor: "pointer",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" width={22} height={22} aria-hidden>
            <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
            <path d="M9 11a2 2 0 100 2M16 11a2 2 0 100 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>

        {/* end call */}
        <button
          aria-label="End conversation"
          onClick={onEnd}
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            background: "#8B453E",
            color: "#FAF7F0",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 12px 28px rgba(139,69,62,0.32)",
            cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" width={28} height={28} aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        {/* volume */}
        <button
          aria-label="Volume"
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-2)",
            cursor: "pointer",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" width={22} height={22} aria-hidden>
            <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
            <path d="M16 8a5 5 0 010 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
