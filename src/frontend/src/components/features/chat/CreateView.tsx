"use client";

import { MicButton } from "./MicButton";

interface CreateViewProps {
  onStart: () => void;
  loading?: boolean;
  error?: string | null;
}

function BlobBg() {
  const blobs = [
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
        opacity: 0.55,
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

function RecentCard({
  color,
  stripe,
  title,
  progress,
  meta,
}: {
  color: string;
  stripe: string;
  title: string;
  progress: number;
  meta: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        padding: 14,
        borderRadius: 20,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            background: color,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M4 4h12a3 3 0 013 3v13H7a3 3 0 01-3-3V4z" stroke={stripe} strokeWidth="2" />
            <path d="M4 17a3 3 0 013-3h12" stroke={stripe} strokeWidth="2" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--f-body)",
              fontWeight: 600,
              fontSize: 14,
              color: "var(--text)",
              lineHeight: 1.25,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{meta}</div>
        </div>
      </div>
      <div
        style={{
          height: 4,
          borderRadius: 2,
          background: "var(--bg-tint)",
          overflow: "hidden",
        }}
      >
        <div
          style={{ width: `${progress}%`, height: "100%", background: stripe, borderRadius: 2 }}
        />
      </div>
    </div>
  );
}

export function CreateView({ onStart, loading, error }: CreateViewProps) {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
      <BlobBg />

      {/* greeting */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 24px 0",
          position: "relative",
          zIndex: 2,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              background: "linear-gradient(135deg, #2A2520, #0B0907)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#F0E9D8",
              fontFamily: "var(--f-body)",
              fontWeight: 600,
              fontSize: 13,
              letterSpacing: "0.02em",
            }}
          >
            JT
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 500 }}>Good evening,</div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "var(--text)",
                fontFamily: "var(--f-body)",
              }}
            >
              Julien
            </div>
          </div>
        </div>
        <button
          aria-label="Saved courses"
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text)",
            cursor: "pointer",
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" width={18} height={18} aria-hidden>
            <path d="M6 4h12v17l-6-4-6 4V4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* title */}
      <div
        style={{
          padding: "32px 28px 0",
          position: "relative",
          zIndex: 2,
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontFamily: "var(--f-head)",
            fontSize: 32,
            fontWeight: 500,
            color: "var(--text)",
            lineHeight: 1.1,
            letterSpacing: "-0.025em",
            marginBottom: 12,
          }}
        >
          What shall we
          <br />
          learn today?
        </h1>
        <p
          style={{
            fontSize: 15,
            color: "var(--text-2)",
            lineHeight: 1.5,
            maxWidth: 280,
            margin: "0 auto",
            fontFamily: "var(--f-body)",
          }}
        >
          Tell me what you want to understand — I&apos;ll build a course around it.
        </p>
      </div>

      {/* mic hero */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          zIndex: 2,
          gap: 16,
        }}
      >
        <MicButton size={200} onClick={onStart} loading={loading} />
        {error && (
          <p
            style={{
              fontSize: 13,
              color: "#8B453E",
              textAlign: "center",
              maxWidth: 260,
              fontFamily: "var(--f-body)",
              lineHeight: 1.4,
            }}
          >
            Oops, couldn&apos;t reach your mic. {error}
          </p>
        )}
      </div>

      {/* recents */}
      <div style={{ padding: "0 20px 28px", position: "relative", zIndex: 2 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
            padding: "0 8px",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: "var(--text-3)",
              fontFamily: "var(--f-body)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            Continue learning
          </div>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-2)" }}>See all</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <RecentCard
            color="#F0E9D8"
            stripe="#B89968"
            title="The French Revolution"
            meta="6 min · 60%"
            progress={60}
          />
          <RecentCard
            color="#EFEBE1"
            stripe="#6B655D"
            title="Derivatives 101"
            meta="8 min · 25%"
            progress={25}
          />
        </div>
        <div
          style={{
            textAlign: "center",
            fontSize: 12,
            color: "var(--text-3)",
            marginTop: 14,
            fontFamily: "var(--f-body)",
          }}
        >
          Tap and speak naturally — like to a friend.
        </div>
      </div>
    </div>
  );
}
