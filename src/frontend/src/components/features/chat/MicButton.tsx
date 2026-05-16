"use client";

interface MicButtonProps {
  size?: number;
  onClick?: () => void;
  loading?: boolean;
}

export function MicButton({ size = 200, onClick, loading }: MicButtonProps) {
  const inner = size - 56;

  return (
    <button
      onClick={onClick}
      aria-label="Start recording"
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "none",
        border: "none",
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {/* outer champagne halo */}
      <span
        style={{
          position: "absolute",
          width: size,
          height: size,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(184,153,104,0.30), rgba(184,153,104,0.08) 55%, transparent 78%)",
          animation: "tt-pulse-halo 2.4s cubic-bezier(.4,0,.2,1) infinite",
          pointerEvents: "none",
        }}
      />
      {/* mid soft white glow */}
      <span
        style={{
          position: "absolute",
          width: size - 28,
          height: size - 28,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(255,255,255,0.55), rgba(255,255,255,0) 70%)",
          pointerEvents: "none",
        }}
      />
      {/* ink sphere */}
      <span
        style={{
          width: inner,
          height: inner,
          borderRadius: "50%",
          background:
            "radial-gradient(circle at 35% 25%, #3A3026 0%, #1A1612 45%, #0A0806 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow:
            "0 30px 60px rgba(11,9,7,0.42), inset 0 -10px 28px rgba(0,0,0,0.55), inset 0 8px 24px rgba(184,153,104,0.20)",
          color: "#F0E9D8",
          animation: "tt-pulse 2.4s cubic-bezier(.4,0,.2,1) infinite",
          position: "relative",
        }}
      >
        {/* champagne inner ring */}
        <span
          style={{
            position: "absolute",
            inset: 6,
            borderRadius: "50%",
            border: "1px solid rgba(184,153,104,0.22)",
            pointerEvents: "none",
          }}
        />
        {loading ? (
          /* three dots while requesting permission */
          <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "#F0E9D8",
                  animation: `tt-dot 1.1s ${i * 0.15}s infinite`,
                }}
              />
            ))}
          </span>
        ) : (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            width={inner * 0.38}
            height={inner * 0.38}
            aria-hidden
          >
            <rect x="9" y="3" width="6" height="12" rx="3" fill="currentColor" />
            <path
              d="M6 11a6 6 0 0012 0M12 17v4M8 21h8"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        )}
      </span>
    </button>
  );
}
