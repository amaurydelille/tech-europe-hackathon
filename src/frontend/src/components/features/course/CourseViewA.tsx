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
import { QRCodeSVG } from "qrcode.react";
import type { ParsedCourse, Block, ListItem } from "@/lib/parseCourse";

// ── helpers ───────────────────────────────────────────────────────────
function fmtSec(s: number) {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

// ── Video block ───────────────────────────────────────────────────────
interface VideoBlockProps {
  isPlaying: boolean;
  progress: number;
  onTogglePlay: () => void;
  onSeek: (p: number) => void;
}

interface Cue { start: number; end: number; text: string }

function parseSRT(raw: string): Cue[] {
  return raw.trim().split(/\n\n+/).flatMap((block) => {
    const lines = block.trim().split("\n");
    if (lines.length < 3) return [];
    const times = lines[1].split(" --> ");
    const parseT = (t: string) => {
      const [h, m, rest] = t.trim().split(":");
      const [s, ms] = rest.replace(",", ".").split(".");
      return +h * 3600 + +m * 60 + +s + +(ms ?? 0) / 1000;
    };
    return [{ start: parseT(times[0]), end: parseT(times[1]), text: lines.slice(2).join(" ").trim() }];
  });
}

function VideoBlock({ isPlaying, progress, onTogglePlay, onSeek }: VideoBlockProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cuesRef = useRef<Cue[]>([]);
  const [subtitle, setSubtitle] = useState("");

  // Load and parse SRT once
  useEffect(() => {
    fetch("/final.srt")
      .then((r) => r.text())
      .then((raw) => { cuesRef.current = parseSRT(raw); })
      .catch(() => {});
  }, []);

  // Sync play/pause to the video element
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) v.play().catch(() => {});
    else v.pause();
  }, [isPlaying]);

  // Feed real video time back as progress + update subtitle
  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    onSeek(v.currentTime / v.duration);
    const cue = cuesRef.current.find((c) => v.currentTime >= c.start && v.currentTime <= c.end);
    setSubtitle(cue?.text ?? "");
  }, [onSeek]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "#000",
      }}
    >
      {/* real video */}
      <video
        ref={videoRef}
        src="/final.mp4"
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => onSeek(1)}
        playsInline
        preload="metadata"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />

      {/* play / pause overlay */}
      <button
        aria-label={isPlaying ? "Pause" : "Play"}
        onClick={onTogglePlay}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%,-50%)",
          width: 64,
          height: 64,
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
          opacity: isPlaying ? 0 : 1,
          transition: "opacity 0.2s",
        }}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" width={26} height={26} aria-hidden>
          <path d="M7 5v14l12-7z" />
        </svg>
      </button>

      {/* tap anywhere to toggle (invisible full overlay) */}
      <div
        onClick={onTogglePlay}
        style={{ position: "absolute", inset: 0, cursor: "pointer" }}
      />

      {/* bottom controls */}
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
          background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.6))",
        }}
      >
        {/* subtitle */}
        {subtitle && (
          <div style={{
            alignSelf: "center",
            marginBottom: 8,
            padding: "6px 14px",
            borderRadius: 10,
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(10px)",
            color: "#fff",
            fontSize: 20,
            fontWeight: 500,
            textAlign: "center",
            maxWidth: "88%",
            fontFamily: "var(--f-body)",
            lineHeight: 1.4,
            pointerEvents: "none",
          }}>
            {subtitle}
          </div>
        )}

        {/* progress bar — clickable seek */}
        <div
          onClick={(e) => {
            const v = videoRef.current;
            if (!v || !v.duration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            v.currentTime = pct * v.duration;
          }}
          style={{ height: 12, display: "flex", alignItems: "center", cursor: "pointer", pointerEvents: "auto" }}
        >
          <div style={{ width: "100%", height: 3, borderRadius: 2, background: "rgba(255,255,255,0.25)", overflow: "hidden" }}>
            <div style={{ width: `${progress * 100}%`, height: "100%", background: "#fff", borderRadius: 2, transition: "width 0.25s linear" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Share modal ───────────────────────────────────────────────────────
function ShareModal({ onClose }: { onClose: () => void }) {
  const url = typeof window !== "undefined" ? window.location.href : "";
  const [copied, setCopied] = useState(false);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  }, [url]);

  return (
    <>
      {/* backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 80,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(4px)",
        }}
      />
      {/* centering wrapper */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 90,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
      {/* card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 24 }}
        transition={{ duration: 0.22, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
        style={{
          pointerEvents: "auto",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 28,
          boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
          padding: "28px 24px 24px",
          width: "min(340px, calc(100vw - 40px))",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
        }}
      >
        {/* close */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            width: 30,
            height: 30,
            borderRadius: 15,
            background: "var(--bg-tint)",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-2)",
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" width={14} height={14} aria-hidden>
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        {/* title */}
        <div style={{ fontFamily: "var(--f-head)", fontSize: 18, fontWeight: 500, color: "var(--text)", letterSpacing: "-0.02em" }}>
          Share this course
        </div>

        {/* QR code */}
        <div
          style={{
            padding: 14,
            borderRadius: 18,
            background: "#fff",
            boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
          }}
        >
          <QRCodeSVG value={url || "https://tutor.ai"} size={200} />
        </div>

        {/* URL display */}
        <div
          style={{
            width: "100%",
            padding: "10px 14px",
            borderRadius: 12,
            background: "var(--bg-tint)",
            border: "1px solid var(--border)",
            fontSize: 12,
            color: "var(--text-2)",
            fontFamily: "var(--f-body)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            textAlign: "center",
          }}
        >
          {url}
        </div>

        {/* copy button */}
        <button
          onClick={copyLink}
          style={{
            width: "100%",
            height: 50,
            borderRadius: 25,
            border: "none",
            background: copied
              ? "linear-gradient(180deg,#3d7a55 0%,#2a5e3f 100%)"
              : "linear-gradient(180deg,#1F1B14 0%,#0B0907 100%)",
            color: "#FAF7F0",
            fontFamily: "var(--f-body)",
            fontWeight: 600,
            fontSize: 15,
            cursor: "pointer",
            transition: "background 0.3s",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {copied ? (
            <>
              <svg viewBox="0 0 24 24" fill="none" width={16} height={16} aria-hidden>
                <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" width={16} height={16} aria-hidden>
                <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.7" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
              Copy link
            </>
          )}
        </button>
      </motion.div>
      </div>
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
  const { title, chapters, sources, totalReadMin } = course;
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
                {totalReadMin} min read
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
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<Phase>("video");
  const [showShare, setShowShare] = useState(false);
  const [readProgress, setReadProgress] = useState(0);
  const articleRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<Phase>("video");
  const touchStartY = useRef(0);
  const lastPhaseChange = useRef(0); // ms timestamp — absorbs inertia bleed
  const router = useRouter();

  // keep ref in sync so non-React event listeners always read current phase
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // Central transition — records timestamp so inertia events are ignored for 350 ms
  const changePhase = useCallback((next: Phase) => {
    lastPhaseChange.current = Date.now();
    phaseRef.current = next;
    if (next === "reading" && articleRef.current) {
      articleRef.current.style.overflowY = "auto";
    }
    setPhase(next);
  }, []);

  // Non-passive touch handler — manages all three phases
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      touchStartY.current = e.touches[0].clientY;
    }

    function onTouchMove(e: TouchEvent) {
      if (Date.now() - lastPhaseChange.current < 350) { e.preventDefault(); return; }

      const dy = touchStartY.current - e.touches[0].clientY;
      const cur = phaseRef.current;

      if (cur === "reading") return;

      if (cur === "video" && dy > 12) {
        e.preventDefault();
        changePhase("reading");
        touchStartY.current = e.touches[0].clientY;
        return;
      }

      if (cur === "pivot") {
        if (dy > 12) {
          changePhase("reading");
          touchStartY.current = e.touches[0].clientY;
        } else if (dy < -12) {
          e.preventDefault();
          changePhase("video");
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
  }, [changePhase]);

  // Wheel (desktop) — same three-phase logic + inertia guard
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (Date.now() - lastPhaseChange.current < 350) return;
    const cur = phaseRef.current;

    // When already at the top of the article, an upward wheel gesture should
    // always reopen the video, even if we didn't settle into "pivot" yet.
    if (cur === "reading") {
      if (e.deltaY < 0 && (articleRef.current?.scrollTop ?? 0) <= 1) {
        changePhase("video");
      }
      return;
    }

    if (cur === "video" && e.deltaY > 0) { changePhase("reading"); return; }
    if (cur === "pivot" && e.deltaY > 0) { changePhase("reading"); return; }
    if (cur === "pivot" && e.deltaY < 0) { changePhase("video"); return; }
  }, [changePhase]);

  // Article scroll — track progress; reaching top snaps back to pivot
  const handleScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    if (Date.now() - lastPhaseChange.current < 350) return;
    const el = e.currentTarget;
    const scrollTop = el.scrollTop;
    if (scrollTop <= 1 && phaseRef.current === "reading") {
      phaseRef.current = "pivot";
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
        <PillBtn ariaLabel="Back" onClick={() => router.push("/chat")}>
          <svg viewBox="0 0 24 24" fill="none" width={20} height={20} aria-hidden>
            <path d="M14 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </PillBtn>
        <div style={{ flex: 1 }} />
        <PillBtn ariaLabel="Share" onClick={() => setShowShare(true)}>
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
          onSeek={seek} // also called by video's onTimeUpdate
        />
      </div>

      {/* ── Scrollable article */}
      <div
        ref={articleRef}
        onScroll={handleScroll}
        className="no-scrollbar"
        style={{
          flex: 1,
          overflowY: phase === "reading" ? "auto" : "hidden",
          overflowX: "hidden",
          scrollbarWidth: "none",
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

      {/* ── Share modal */}
      <AnimatePresence>
        {showShare && <ShareModal onClose={() => setShowShare(false)} />}
      </AnimatePresence>
    </div>
  );
}
