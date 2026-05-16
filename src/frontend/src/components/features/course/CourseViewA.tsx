"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type UIEvent,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import type { ParsedCourse, Block, ListItem } from "@/lib/parseCourse";

const PIP_THRESHOLD = 60;

// ── helpers ───────────────────────────────────────────────────────────
function fmtTime(p: number, total = 118) {
  const s = Math.round(p * total);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ── Napoleon silhouette (from design) ────────────────────────────────
function NapoleonSVG() {
  return (
    <svg
      viewBox="0 0 200 320"
      width="100%"
      height="100%"
      style={{ position: "absolute", inset: 0 }}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        <linearGradient id="cap" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a2a4a" />
          <stop offset="1" stopColor="#2a1a2a" />
        </linearGradient>
        <linearGradient id="coat" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5a3a3a" />
          <stop offset="1" stopColor="#2a1a1a" />
        </linearGradient>
      </defs>
      <path d="M50 150q50-50 100 0v10q-50-10-100 0z" fill="url(#cap)" />
      <ellipse cx="100" cy="180" rx="32" ry="40" fill="#d8b89a" />
      <path d="M50 230q50-10 100 0v90H50z" fill="url(#coat)" />
      <path d="M70 240l30 12 30-12v6l-30 12-30-12z" fill="#B89968" opacity="0.85" />
      <ellipse cx="100" cy="280" rx="14" ry="8" fill="#d8b89a" opacity="0.85" />
    </svg>
  );
}

// ── Video block ───────────────────────────────────────────────────────
interface VideoBlockProps {
  isPlaying: boolean;
  progress: number;
  pip?: boolean;
  onTogglePlay: () => void;
  onSeek: (p: number) => void;
}

function VideoBlock({ isPlaying, progress, pip = false, onTogglePlay, onSeek }: VideoBlockProps) {
  const seekBar = useRef<HTMLDivElement>(null);

  const handleSeekClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!seekBar.current) return;
      const { left, width } = seekBar.current.getBoundingClientRect();
      onSeek(Math.max(0, Math.min(1, (e.clientX - left) / width)));
    },
    [onSeek]
  );

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "linear-gradient(180deg, #2a2520 0%, #1a1714 100%)",
      }}
    >
      {/* colour wash */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 35%, rgba(255,181,160,0.28), transparent 55%)," +
            "radial-gradient(ellipse at 30% 85%, rgba(199,191,255,0.28), transparent 55%)",
          pointerEvents: "none",
        }}
      />

      {/* Napoleon silhouette */}
      <NapoleonSVG />

      {/* play / pause overlay */}
      <button
        aria-label={isPlaying ? "Pause" : "Play"}
        onClick={onTogglePlay}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%,-50%)",
          width: pip ? 36 : 64,
          height: pip ? 36 : 64,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.88)",
          backdropFilter: "blur(8px)",
          border: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#2a2520",
          boxShadow: "0 8px 24px rgba(0,0,0,0.30)",
          cursor: "pointer",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        {isPlaying ? (
          <svg viewBox="0 0 24 24" fill="currentColor" width={pip ? 14 : 26} height={pip ? 14 : 26} aria-hidden>
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor" width={pip ? 14 : 26} height={pip ? 14 : 26} aria-hidden>
            <path d="M7 5v14l12-7z" />
          </svg>
        )}
      </button>

      {/* bottom controls — hidden in PiP */}
      {!pip && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            padding: "0 18px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.52))",
          }}
        >
          {/* caption pill */}
          <div
            style={{
              alignSelf: "center",
              padding: "8px 14px",
              borderRadius: 14,
              background: "rgba(0,0,0,0.46)",
              backdropFilter: "blur(12px)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 500,
              textAlign: "center",
              maxWidth: "90%",
              fontFamily: "var(--f-body)",
              lineHeight: 1.4,
            }}
          >
            On 18 May 1804, the Senate proclaimed Napoleon Emperor of the French…
          </div>

          {/* seek bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.85)",
                fontVariantNumeric: "tabular-nums",
                minWidth: 32,
                fontFamily: "var(--f-body)",
              }}
            >
              {fmtTime(progress)}
            </span>
            <div
              ref={seekBar}
              onClick={handleSeekClick}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                background: "rgba(255,255,255,0.25)",
                cursor: "pointer",
                position: "relative",
              }}
            >
              <div
                style={{
                  width: `${progress * 100}%`,
                  height: "100%",
                  background: "#fff",
                  borderRadius: 2,
                  position: "relative",
                  transition: "width 0.1s linear",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    right: -5,
                    top: -3,
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: "#fff",
                  }}
                />
              </div>
            </div>
            <span
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.85)",
                fontVariantNumeric: "tabular-nums",
                fontFamily: "var(--f-body)",
              }}
            >
              {fmtTime(1)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── More menu ─────────────────────────────────────────────────────────
function MoreMenu({ onClose }: { onClose: () => void }) {
  const items = [
    { icon: "M4 4h12a3 3 0 013 3v13H7a3 3 0 01-3-3V4z M4 17a3 3 0 013-3h12", label: "Save to library" },
    { icon: "M12 3v13M7 8l5-5 5 5M5 14v5a2 2 0 002 2h10a2 2 0 002-2v-5", label: "Share course" },
    { icon: "M20 11a8 8 0 10-2.5 5.8M20 4v7h-7", label: "Regenerate" },
  ];

  return (
    <>
      <div
        style={{ position: "fixed", inset: 0, zIndex: 40 }}
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: -8 }}
        transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
        style={{
          position: "absolute",
          top: 58,
          right: 14,
          zIndex: 50,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 18,
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
          minWidth: 188,
        }}
      >
        {items.map((item, i) => (
          <button
            key={item.label}
            onClick={onClose}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              width: "100%",
              padding: "13px 16px",
              background: "none",
              border: "none",
              borderTop: i > 0 ? "1px solid var(--border)" : "none",
              color: "var(--text)",
              fontFamily: "var(--f-body)",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" width={18} height={18} aria-hidden>
              <path d={item.icon} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {item.label}
          </button>
        ))}
      </motion.div>
    </>
  );
}

// ── Pill button (frosted glass, overlaid on dark video) ───────────────
function PillBtn({
  onClick,
  children,
  ariaLabel,
}: {
  onClick?: () => void;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        width: 38,
        height: 38,
        borderRadius: 19,
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(12px)",
        border: "none",
        color: "#2a2520",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {children}
    </button>
  );
}

// ── Article content ───────────────────────────────────────────────────
function Callout({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: 14,
        background: "var(--bg-tint)",
        borderLeft: "2px solid var(--gold)",
        marginBottom: 22,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 500,
          color: "var(--gold-deep)",
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          marginBottom: 4,
          fontFamily: "var(--f-body)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          color: "var(--text)",
          lineHeight: 1.5,
          fontFamily: "var(--f-body)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function SectionDivider({ n, total, label }: { n: number; total: number; label: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "28px 0 20px" }}>
        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        <div style={{ width: 4, height: 4, borderRadius: 2, background: "var(--border-strong)" }} />
        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            color: "var(--text)",
            fontFamily: "var(--f-body)",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {String(n).padStart(2, "0")}
        </span>
        <span style={{ width: 16, height: 1, background: "var(--border-strong)" }} />
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            color: "var(--text-2)",
            fontFamily: "var(--f-body)",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 10,
            color: "var(--text-3)",
            fontFamily: "var(--f-body)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          · of {String(total).padStart(2, "0")}
        </span>
      </div>
    </div>
  );
}

// ── Inline markdown renderer ──────────────────────────────────────────
function Inline({ text, onCiteClick }: { text: string; onCiteClick?: (n: number) => void }) {
  const parts: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|\[(\d+)\]/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1] !== undefined)
      parts.push(<strong key={key++} style={{ fontWeight: 600 }}>{m[1]}</strong>);
    else if (m[2] !== undefined)
      parts.push(<em key={key++}>{m[2]}</em>);
    else if (m[3] !== undefined) {
      const n = parseInt(m[3], 10);
      parts.push(
        <button
          key={key++}
          onClick={() => onCiteClick?.(n)}
          style={{
            fontSize: "0.7em",
            color: "var(--gold-deep)",
            marginLeft: 1,
            background: "none",
            border: "none",
            padding: "0 1px",
            cursor: "pointer",
            verticalAlign: "super",
            fontFamily: "var(--f-body)",
            fontWeight: 600,
            lineHeight: 1,
          }}
        >
          {m[3]}
        </button>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function fmtReadTime(sec: number): string {
  return `${Math.max(1, Math.ceil(sec / 60))} min`;
}

// ── Block renderers ───────────────────────────────────────────────────
function ListBlock({ items, onCiteClick }: { items: ListItem[]; onCiteClick?: (n: number) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 }}>
      {items.map((item, i) => (
        <div
          key={i}
          style={{
            padding: "12px 14px",
            borderRadius: 14,
            background: "var(--bg-tint)",
            border: "1px solid var(--border)",
          }}
        >
          {item.term && (
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text)",
                marginBottom: 4,
                fontFamily: "var(--f-body)",
                letterSpacing: "-0.005em",
              }}
            >
              {item.term}
            </div>
          )}
          <div
            style={{
              fontSize: 14,
              color: "var(--text-2)",
              lineHeight: 1.55,
              fontFamily: "var(--f-body)",
            }}
          >
            <Inline text={item.body} onCiteClick={onCiteClick} />
          </div>
        </div>
      ))}
    </div>
  );
}

function BlocksRenderer({ blocks, onCiteClick }: { blocks: Block[]; onCiteClick?: (n: number) => void }) {
  return (
    <>
      {blocks.map((block, i) => {
        if (block.kind === "para") {
          return (
            <p
              key={i}
              style={{
                fontSize: 15,
                color: "var(--text)",
                lineHeight: 1.65,
                marginBottom: 20,
                fontFamily: "var(--f-body)",
              }}
            >
              <Inline text={block.text} onCiteClick={onCiteClick} />
            </p>
          );
        }
        if (block.kind === "callout") {
          return (
            <Callout key={i} label={block.label}>
              <Inline text={block.text} onCiteClick={onCiteClick} />
            </Callout>
          );
        }
        return <ListBlock key={i} items={block.items} onCiteClick={onCiteClick} />;
      })}
    </>
  );
}

// ── Sources section ───────────────────────────────────────────────────
function SourcesSection({
  sources,
  highlightedSource,
}: {
  sources: ParsedCourse["sources"];
  highlightedSource: number | null;
}) {
  return (
    <div
      style={{
        marginBottom: 22,
        borderRadius: 16,
        border: "1px solid var(--border)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          background: "var(--bg-tint)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" width={14} height={14} aria-hidden style={{ color: "var(--gold-deep)", flexShrink: 0 }}>
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--text)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontFamily: "var(--f-body)",
          }}
        >
          References
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 10,
            color: "var(--text-3)",
            fontFamily: "var(--f-body)",
          }}
        >
          {sources.length} sources
        </span>
      </div>

      {/* Source list */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {sources.map((s, idx) => (
          <a
            key={s.n}
            id={`source-ref-${s.n}`}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              textDecoration: "none",
              padding: "12px 16px",
              borderTop: idx > 0 ? "1px solid var(--border)" : "none",
              background: highlightedSource === s.n ? "rgba(184,153,104,0.16)" : "transparent",
              transition: "background 0.5s ease",
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: "var(--gold-deep)",
                fontVariantNumeric: "tabular-nums",
                fontWeight: 600,
                minWidth: 16,
                paddingTop: 1,
                fontFamily: "var(--f-body)",
              }}
            >
              {s.n}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--text)",
                  fontWeight: 500,
                  lineHeight: 1.4,
                  fontFamily: "var(--f-body)",
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                }}
              >
                {s.title}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--gold-deep)",
                  marginTop: 3,
                  fontFamily: "var(--f-body)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {s.site}
              </div>
            </div>
            <svg viewBox="0 0 24 24" fill="none" width={13} height={13} style={{ flexShrink: 0, marginTop: 3, color: "var(--text-3)" }} aria-hidden>
              <path d="M7 17L17 7M17 7H9M17 7v8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        ))}
      </div>
    </div>
  );
}

// ── Article content (dynamic) ─────────────────────────────────────────
function ArticleContent({ course }: { course: ParsedCourse }) {
  const { title, chapters, sources } = course;
  const [highlightedSource, setHighlightedSource] = useState<number | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToSource = useCallback((n: number) => {
    const el = document.getElementById(`source-ref-${n}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    setHighlightedSource(n);
    highlightTimer.current = setTimeout(() => setHighlightedSource(null), 1800);
  }, []);

  return (
    <div style={{ padding: "18px 22px 40px" }}>
      {/* drag handle */}
      <div
        style={{
          width: 36,
          height: 4,
          borderRadius: 2,
          background: "var(--border-strong)",
          margin: "0 auto 18px",
        }}
      />

      {/* course title (small, above first chapter) */}
      <div
        style={{
          fontSize: 11,
          color: "var(--text-3)",
          fontWeight: 500,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          fontFamily: "var(--f-body)",
          marginBottom: 14,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {title}
      </div>

      {/* chapters */}
      {chapters.map((ch, idx) => (
        <div key={ch.title}>
          {idx === 0 ? (
            /* first chapter: chapter label + large heading */
            <>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--gold-deep)",
                  fontWeight: 500,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  fontFamily: "var(--f-body)",
                  marginBottom: 8,
                }}
              >
                Chapter 1 · {fmtReadTime(ch.readTimeSec)} read
              </div>
              <h2
                style={{
                  fontFamily: "var(--f-head)",
                  fontSize: 24,
                  fontWeight: 500,
                  color: "var(--text)",
                  lineHeight: 1.15,
                  margin: "0 0 16px",
                  letterSpacing: "-0.025em",
                }}
              >
                {ch.title}
              </h2>
            </>
          ) : (
            /* subsequent chapters: divider + smaller heading */
            <>
              <SectionDivider
                n={idx + 1}
                total={chapters.length}
                label={ch.title}
              />
              <h2
                style={{
                  fontFamily: "var(--f-head)",
                  fontSize: 20,
                  fontWeight: 500,
                  color: "var(--text)",
                  lineHeight: 1.2,
                  margin: "0 0 14px",
                  letterSpacing: "-0.025em",
                }}
              >
                {ch.title}
              </h2>
            </>
          )}

          <BlocksRenderer blocks={ch.blocks} onCiteClick={scrollToSource} />
        </div>
      ))}

      {/* sources */}
      {sources.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "28px 0 20px" }}>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <div style={{ width: 4, height: 4, borderRadius: 2, background: "var(--border-strong)" }} />
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>
          <SourcesSection sources={sources} highlightedSource={highlightedSource} />
        </>
      )}

      {/* end card */}
      <div
        style={{
          marginTop: 12,
          padding: "20px 18px",
          borderRadius: 20,
          background: "var(--bg-tint)",
          border: "1px solid var(--border)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: "var(--text-3)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            marginBottom: 8,
            fontFamily: "var(--f-body)",
          }}
        >
          You&apos;ve finished
        </div>
        <h3
          style={{
            fontFamily: "var(--f-head)",
            fontSize: 18,
            fontWeight: 500,
            color: "var(--text)",
            marginBottom: 16,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
          }}
        >
          {title}
        </h3>
        <button
          style={{
            width: "100%",
            height: 52,
            borderRadius: 26,
            border: "none",
            background: "linear-gradient(180deg,#1F1B14 0%,#0B0907 100%)",
            color: "#FAF7F0",
            fontFamily: "var(--f-body)",
            fontWeight: 600,
            fontSize: 15,
            cursor: "pointer",
            boxShadow: "0 8px 20px rgba(20,17,13,.16)",
          }}
        >
          Create another course
        </button>
      </div>
    </div>
  );
}

// phase "video"  → video visible, article locked
// phase "pivot"  → video gone, article at top but still locked — decision point
// phase "reading" → article freely scrollable
type Phase = "video" | "pivot" | "reading";

// ── Main component ────────────────────────────────────────────────────
export function CourseViewA({ course }: { course: ParsedCourse }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0.36);
  const [phase, setPhase] = useState<Phase>("video");
  const [readProgress, setReadProgress] = useState(0);
  const articleRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const phaseRef = useRef<Phase>("video");
  const touchStartY = useRef(0);
  const router = useRouter();

  // keep ref in sync so non-React event listeners always read current phase
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // advance video progress when playing
  useEffect(() => {
    if (!isPlaying) return;
    function tick() {
      setProgress((p) => {
        if (p >= 1) { setIsPlaying(false); return 1; }
        return p + 0.0003;
      });
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying]);

  // Non-passive touch handler — manages all three phases
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      touchStartY.current = e.touches[0].clientY;
    }

    function onTouchMove(e: TouchEvent) {
      const dy = touchStartY.current - e.touches[0].clientY; // +ve = swipe up (scroll down)
      const cur = phaseRef.current;

      if (cur === "reading") return; // article handles its own scroll

      if (cur === "video" && dy > 12) {
        e.preventDefault();
        setPhase("pivot");
        touchStartY.current = e.touches[0].clientY; // reset baseline for next phase
        return;
      }

      if (cur === "pivot") {
        if (dy > 12) {
          // unlock article — also poke the DOM directly so the browser sees it immediately
          if (articleRef.current) articleRef.current.style.overflowY = "auto";
          setPhase("reading");
          touchStartY.current = e.touches[0].clientY;
        } else if (dy < -12) {
          e.preventDefault();
          setPhase("video");
          touchStartY.current = e.touches[0].clientY;
        }
      }
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  // Wheel (desktop) — same three-phase logic
  const handleWheel = useCallback((e: React.WheelEvent) => {
    const cur = phaseRef.current;
    if (cur === "reading") return;
    if (cur === "video" && e.deltaY > 0) { setPhase("pivot"); return; }
    if (cur === "pivot" && e.deltaY > 0) { setPhase("reading"); return; }
    if (cur === "pivot" && e.deltaY < 0) { setPhase("video"); return; }
  }, []);

  // Article scroll — track progress; reaching top snaps back to pivot
  const handleScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const scrollTop = el.scrollTop;
    if (scrollTop === 0 && phaseRef.current === "reading") {
      setPhase("pivot");
    }
    const total = el.scrollHeight - el.clientHeight;
    if (total > 0) setReadProgress(scrollTop / total);
  }, []);

  const togglePlay = useCallback(() => setIsPlaying((p) => !p), []);
  const seek = useCallback((p: number) => setProgress(p), []);

  return (
    <div
      ref={outerRef}
      onWheel={handleWheel}
      style={{
        height: "100dvh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
        position: "relative",
      }}
    >
      {/* ── Reading progress bar (very top, z60) */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          zIndex: 60,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${readProgress * 100}%`,
            background: "var(--text)",
            transition: "width 0.1s linear",
          }}
        />
      </div>

      {/* ── Top bar (always overlaid, z30) */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 30,
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <PillBtn ariaLabel="Back" onClick={() => router.back()}>
          <svg viewBox="0 0 24 24" fill="none" width={20} height={20} aria-hidden>
            <path d="M14 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </PillBtn>
        <div style={{ flex: 1 }} />
        <PillBtn ariaLabel="Share" onClick={() => navigator.share?.({ title: course.title, url: window.location.href })}>
          <svg viewBox="0 0 24 24" fill="none" width={18} height={18} aria-hidden>
            <circle cx="18" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.7" />
            <circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.7" />
            <circle cx="18" cy="19" r="2.5" stroke="currentColor" strokeWidth="1.7" />
            <path d="M8.3 10.7l7.4-4.4M8.3 13.3l7.4 4.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </PillBtn>
      </div>

      {/* ── Video section — collapses when leaving video phase */}
      <div
        style={{
          height: phase === "video" ? "82%" : 0,
          overflow: "hidden",
          flexShrink: 0,
          transition: "height 0.42s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        <VideoBlock
          isPlaying={isPlaying}
          progress={progress}
          onTogglePlay={togglePlay}
          onSeek={seek}
        />
      </div>

      {/* ── Scrollable article */}
      <div
        ref={articleRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: phase === "reading" ? "auto" : "hidden",
          overflowX: "hidden",
          background: "var(--surface)",
          borderRadius: phase === "video" ? "24px 24px 0 0" : "0",
          marginTop: phase === "video" ? -16 : 0,
          position: "relative",
          zIndex: 5,
          boxShadow: "0 -8px 24px rgba(0,0,0,0.05)",
          paddingTop: phase !== "video" ? 58 : 0,
          transition: "border-radius 0.42s cubic-bezier(0.4,0,0.2,1), padding-top 0.42s cubic-bezier(0.4,0,0.2,1)",
          WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"],
        }}
      >
        <ArticleContent course={course} />
      </div>
    </div>
  );
}
