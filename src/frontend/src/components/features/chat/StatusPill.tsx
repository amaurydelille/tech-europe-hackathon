import type { WaveMode } from "./Waveform";

const LABELS: Record<WaveMode, string> = {
  listening: "I'm listening…",
  thinking: "I'm thinking…",
  ai: "I'm answering…",
};

export function StatusPill({ mode }: { mode: WaveMode }) {
  const isThinking = mode === "thinking";

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 16px",
        borderRadius: 999,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
        fontSize: 12,
        color: "var(--text-2)",
        fontWeight: 500,
        letterSpacing: "0.02em",
        fontFamily: "var(--f-body)",
      }}
    >
      {/* animated dots */}
      <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: mode === "ai" ? "var(--gold)" : "var(--text)",
              animation: isThinking
                ? `tt-dot 1.2s ${i * 0.15}s infinite`
                : undefined,
              opacity: isThinking ? undefined : 0.5,
            }}
          />
        ))}
      </span>
      {LABELS[mode]}
    </div>
  );
}
