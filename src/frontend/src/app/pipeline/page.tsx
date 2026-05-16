import type { CSSProperties } from "react";

const shell: CSSProperties = {
  minHeight: "100dvh",
  background: "var(--bg)",
  color: "var(--text)",
  padding: "28px 16px 40px",
};

const node: CSSProperties = {
  borderRadius: 16,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  boxShadow: "var(--shadow-sm)",
  padding: "14px 14px 12px",
  minWidth: 220,
};

const provider: CSSProperties = {
  display: "inline-block",
  marginTop: 8,
  padding: "4px 9px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.04em",
  border: "1px solid var(--border)",
  background: "var(--bg-tint)",
};

function Node({ title, sub, p }: { title: string; sub: string; p: string }) {
  return (
    <div style={node}>
      <div style={{ fontFamily: "var(--f-head)", fontSize: 19, lineHeight: 1.15 }}>{title}</div>
      <div style={{ marginTop: 4, fontSize: 13, color: "var(--text-2)" }}>{sub}</div>
      <div style={provider}>{p}</div>
    </div>
  );
}

function DownArrow() {
  return (
    <div
      style={{
        alignSelf: "center",
        color: "var(--text-3)",
        fontSize: 22,
        fontWeight: 700,
        lineHeight: 1,
      }}
      aria-hidden
    >
      ↓
    </div>
  );
}

function FlowColumn({
  title,
  nodes,
}: {
  title: string;
  nodes: Array<{ title: string; sub: string; p: string }>;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 250, flex: 1 }}>
      <div
        style={{
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: "var(--text-3)",
          marginBottom: 2,
        }}
      >
        {title}
      </div>
      {nodes.map((n, idx) => (
        <div key={`${title}-${n.title}`} style={{ display: "contents" }}>
          <Node title={n.title} sub={n.sub} p={n.p} />
          {idx < nodes.length - 1 && <DownArrow />}
        </div>
      ))}
    </div>
  );
}

export default function PipelinePage() {
  return (
    <main style={shell}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <h1 style={{ margin: "0 0 6px", textAlign: "center", fontFamily: "var(--f-head)", fontSize: 34 }}>
          Product Pipeline
        </h1>
        <p style={{ margin: "0 0 20px", textAlign: "center", color: "var(--text-2)", fontSize: 14 }}>
          Provider-focused architecture
        </p>

        <section
          style={{
            display: "flex",
            gap: 12,
            alignItems: "stretch",
            overflowX: "auto",
            paddingBottom: 8,
          }}
        >
          <FlowColumn
            title="1. Onboarding"
            nodes={[
              { title: "Voice Input", sub: "Live transcription", p: "Gradium STT" },
              { title: "Profile Agent", sub: "Subject + boundaries", p: "OpenAI" },
              { title: "Voice Reply", sub: "Assistant speech", p: "Gradium TTS" },
            ]}
          />
          <FlowColumn
            title="2. Course Creation"
            nodes={[
              { title: "Query Build", sub: "Learning-aware search query", p: "OpenAI" },
              { title: "Web Search", sub: "Source retrieval", p: "Tavily" },
              { title: "Validation", sub: "Relevance filtering", p: "GLiNER2" },
              { title: "Course Draft", sub: "Full + condensed markdown", p: "OpenAI" },
            ]}
          />
          <FlowColumn
            title="3. Video Generation"
            nodes={[
              { title: "Director Agent", sub: "Orchestration", p: "Codex" },
              { title: "Motion Video", sub: "Image-to-video shots", p: "FAL.ai · Seedance 2" },
              { title: "Narration", sub: "Audio + timestamps", p: "Gradium TTS" },
              { title: "Final Export", sub: "MP4 + SRT", p: "FFmpeg" },
            ]}
          />
        </section>
      </div>
    </main>
  );
}
