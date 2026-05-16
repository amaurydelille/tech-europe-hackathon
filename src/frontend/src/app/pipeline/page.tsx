import { Fragment } from "react";
import type { CSSProperties } from "react";

type LogoKey = "openai" | "gradium" | "fal" | "tavily" | "pioneer";

const LOGOS: Record<
  LogoKey,
  {
    src?: string;
    alt: string;
    name: string;
    pillBg?: string;
    displayWidth?: number;
    displayHeight?: number;
  }
> = {
  openai: { src: "/logos/openai.svg", alt: "OpenAI", name: "OpenAI" },
  gradium: { src: "/logos/gradium.png", alt: "Gradium", name: "Gradium" },
  fal: { src: "/logos/fal.png", alt: "FAL", name: "FAL", pillBg: "#FFC4D8" },
  tavily: { src: "/logos/tavily.svg", alt: "Tavily", name: "Tavily" },
  pioneer: {
    src: "/logos/pioneer.svg",
    alt: "Pioneer AI",
    name: "Pioneer AI",
    displayWidth: 80,
    displayHeight: 20,
  },
};

type Tool = {
  title: string;
  sub: string;
  provider?: LogoKey;
  providerNote?: string;
};

type Agent = {
  tag: string;
  title: string;
  blurb: string;
  poweredBy: LogoKey;
  poweredByLabel: string;
  tools: Tool[];
};

const AGENTS: Agent[] = [
  {
    tag: "1 · Onboarding",
    title: "Onboarding Agent",
    blurb: "Voice chat that captures subject, level and intent.",
    poweredBy: "gradium",
    poweredByLabel: "Gradium STT-TTS Websocket",
    tools: [
      {
        title: "Speech-to-Text",
        sub: "Streaming transcription of the learner's voice.",
        provider: "gradium",
        providerNote: "Gradium STT",
      },
      {
        title: "Profile Builder",
        sub: "Extracts subject, prior knowledge and goals.",
      },
      {
        title: "Text-to-Speech",
        sub: "Assistant voice reply, low-latency.",
        provider: "gradium",
        providerNote: "Gradium TTS",
      },
    ],
  },
  {
    tag: "2 · Course Creation",
    title: "Course Creator Agent",
    blurb: "Researches the topic and drafts a structured lesson.",
    poweredBy: "openai",
    poweredByLabel: "GPT-5",
    tools: [
      {
        title: "Query Builder",
        sub: "Turns the profile into a search-ready query.",
      },
      {
        title: "Web Search",
        sub: "Fetches candidate sources.",
        provider: "tavily",
        providerNote: "Tavily",
      },
      {
        title: "Source Validator",
        sub: "Filters by relevance and entity coverage.",
        provider: "pioneer",
        providerNote: "GLiNER 2",
      },
      {
        title: "Lesson Draft",
        sub: "Full + condensed markdown lesson.",
        provider: "openai",
        providerNote: "GPT-5",
      },
    ],
  },
  {
    tag: "3 · Video Generation",
    title: "Filmmaker Agent",
    blurb: "Plans shots, generates assets and stitches the final MP4.",
    poweredBy: "openai",
    poweredByLabel: "Codex",
    tools: [
      {
        title: "gen_video",
        sub: "Image-to-video shots with Seedance.",
        provider: "fal",
        providerNote: "FAL · Seedance 2",
      },
      {
        title: "gen_image",
        sub: "Anchor + scene stills with Seedream.",
        provider: "fal",
        providerNote: "FAL · Seedream 4",
      },
      {
        title: "gen_tts",
        sub: "Narration audio + word-level timestamps.",
        provider: "gradium",
        providerNote: "Gradium TTS",
      },
      {
        title: "gen_manim",
        sub: "Math diagrams",
        providerNote: "Manim",
      },
      {
        title: "gen_map",
        sub: "Generate 3D maps",
        providerNote: "Three.js",
      },
      {
        title: "stitch",
        sub: "Mux video + audio + subtitles into final MP4.",
        providerNote: "FFmpeg",
      },
    ],
  },
];

const SIDECAR_WIDTH = 96;
const SIDECAR_HEIGHT = 84;
const SIDECAR_GUTTER = 116;

const shell: CSSProperties = {
  minHeight: "100dvh",
  background: "var(--bg)",
  color: "var(--text)",
  padding: "32px 16px 48px",
};

function LogoChip({ label }: { logo: LogoKey; label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        border: "1px solid var(--border)",
        background: "var(--bg-tint)",
        color: "var(--text)",
      }}
    >
      {label}
    </span>
  );
}

function ToolCard({ tool }: { tool: Tool }) {
  return (
    <div
      style={{
        position: "relative",
        borderRadius: 12,
        border: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "10px 12px 11px",
        boxShadow: "0 1px 0 rgba(20,17,13,.02)",
      }}
    >
      <div style={{ fontFamily: "var(--f-head)", fontSize: 15, lineHeight: 1.2 }}>
        {tool.title}
      </div>
      <div style={{ marginTop: 3, fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.4 }}>
        {tool.sub}
      </div>

      {tool.provider && tool.providerNote && (
        <>
          {/* connector line into the gutter */}
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: "50%",
              right: -16,
              width: 16,
              height: 1,
              background: "var(--border-strong)",
            }}
          />
          {/* deported card in the gutter: logo on top, label below */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "calc(100% + 16px)",
              transform: "translateY(-50%)",
              display: "inline-flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "10px 8px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: LOGOS[tool.provider].pillBg ?? "var(--surface)",
              boxShadow: "var(--shadow-sm)",
              whiteSpace: "nowrap",
              width: SIDECAR_WIDTH,
              height: SIDECAR_HEIGHT,
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                height: 48,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {LOGOS[tool.provider].src ? (
                <img
                  src={LOGOS[tool.provider].src}
                  alt={LOGOS[tool.provider].alt}
                  style={{
                    width: LOGOS[tool.provider].displayWidth ?? 44,
                    height: LOGOS[tool.provider].displayHeight ?? 44,
                    objectFit: "contain",
                  }}
                />
              ) : (
                <span
                  style={{
                    fontFamily: "var(--f-head)",
                    fontSize: 22,
                    color: "var(--text-2)",
                    lineHeight: 1,
                  }}
                >
                  {LOGOS[tool.provider].name.slice(0, 2)}
                </span>
              )}
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>
              {tool.providerNote}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function AgentColumn({ agent }: { agent: Agent }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: "1 1 0",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "var(--text-2)",
          marginBottom: 10,
        }}
      >
        {agent.tag}
      </div>

      {/* the column reserves a gutter on its right for deported logo pills */}
      <div style={{ paddingRight: SIDECAR_GUTTER, position: "relative" }}>
        <div
          style={{
            borderRadius: 20,
            border: "1.5px solid var(--border-strong)",
            background: "var(--surface-2)",
            padding: "12px 10px 10px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "var(--f-head)",
                fontSize: 22,
                lineHeight: 1.15,
                letterSpacing: "-0.01em",
              }}
            >
              {agent.title}
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: 13,
                color: "var(--text-2)",
                lineHeight: 1.45,
              }}
            >
              {agent.blurb}
            </div>
            <div
              style={{
                marginTop: 10,
                display: "flex",
                alignItems: "center",
                gap: 6,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Powered by
              </span>
              <LogoChip logo={agent.poweredBy} label={agent.poweredByLabel} />
            </div>
          </div>

          <div style={{ height: 1, background: "var(--border)", margin: "2px -10px 2px" }} />

          <div
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--text-3)",
            }}
          >
            Tools
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {agent.tools.map((t) => (
              <ToolCard key={`${agent.title}-${t.title}`} tool={t} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function UserIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  );
}

function VideoIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* film strip: outer frame + sprocket gutters on left/right */}
      <rect x="2" y="2" width="20" height="20" rx="2.5" />
      <line x1="7" y1="2" x2="7" y2="22" />
      <line x1="17" y1="2" x2="17" y2="22" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="2" y1="7" x2="7" y2="7" />
      <line x1="2" y1="17" x2="7" y2="17" />
      <line x1="17" y1="7" x2="22" y2="7" />
      <line x1="17" y1="17" x2="22" y2="17" />
    </svg>
  );
}

function ChevronRight({ size = 56 }: { size?: number }) {
  return (
    <div
      aria-hidden
      style={{
        alignSelf: "center",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-3)",
        flexShrink: 0,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </div>
  );
}

function Bookend({
  label,
  icon,
}: {
  label: string;
  icon: "user" | "video";
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        minWidth: 120,
        alignSelf: "center",
      }}
    >
      <div
        style={{
          width: 120,
          height: 120,
          borderRadius: 999,
          background: "#2a2520",
          color: "#F8F4EC",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "var(--shadow-md)",
        }}
      >
        {icon === "user" ? <UserIcon size={64} /> : <VideoIcon size={64} />}
      </div>
      <div
        style={{
          fontFamily: "var(--f-head)",
          fontSize: 32,
          letterSpacing: "-0.01em",
          color: "var(--text)",
        }}
      >
        {label}
      </div>
    </div>
  );
}

export default function PipelinePage() {
  return (
    <main style={shell}>
      <div style={{ maxWidth: 1500, margin: "0 auto" }}>
        <h1
          style={{
            margin: "0 0 6px",
            textAlign: "center",
            fontFamily: "var(--f-head)",
            fontSize: 36,
            letterSpacing: "-0.02em",
          }}
        >
          Product Pipeline
        </h1>
        <p
          style={{
            margin: "0 0 28px",
            textAlign: "center",
            color: "var(--text-2)",
            fontSize: 14.5,
          }}
        >
          Three agents, each orchestrating its own tools.
        </p>

        <section
          style={{
            display: "flex",
            gap: 4,
            alignItems: "stretch",
          }}
        >
          <Bookend label="User" icon="user" />
          <ChevronRight />
          {AGENTS.map((agent, i) => (
            <Fragment key={agent.title}>
              <AgentColumn agent={agent} />
              {i < AGENTS.length - 1 && <ChevronRight />}
            </Fragment>
          ))}
          <ChevronRight />
          <Bookend label="Video" icon="video" />
        </section>
      </div>
    </main>
  );
}
