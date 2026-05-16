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
import { InlineMath, BlockMath } from "react-katex";
import type { ParsedCourse, Block, ListItem } from "@/lib/parseCourse";

// ── helpers ───────────────────────────────────────────────────────────
function fmtSec(s: number) {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

// ── Video block ───────────────────────────────────────────────────────
interface VideoBlockProps {
  courseId: string;
  isPlaying: boolean;
  progress: number;
  onTogglePlay: () => void;
  onSeek: (p: number) => void;
}

interface Cue { start: number; end: number; text: string }
interface TimedSource { name: string; url: string; timestamp: number }
interface SocialComment { id: string; author: string; text: string; createdAt: string }
interface Socials { likes: number; shares: number; comments: SocialComment[] }

function fmtCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

function fmtRelTime(iso: string) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

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

function VideoBlock({ courseId, isPlaying, progress, onTogglePlay, onSeek }: VideoBlockProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasInteractedRef = useRef(false);
  const cuesRef = useRef<Cue[]>([]);
  const seenSourceIndicesRef = useRef<Set<number>>(new Set());
  const resumeAfterPopupRef = useRef(false);
  const timeUpdateRafRef = useRef<number | null>(null);
  const [subtitle, setSubtitle] = useState("");
  const [timedSources, setTimedSources] = useState<TimedSource[]>([]);
  const [activeSource, setActiveSource] = useState<TimedSource | null>(null);
  const [isSourceOpen, setIsSourceOpen] = useState(false);

  // Load and parse SRT once
  useEffect(() => {
    fetch(`/api/course/${encodeURIComponent(courseId)}/subtitle`)
      .then((r) => r.text())
      .then((raw) => { cuesRef.current = parseSRT(raw); })
      .catch(() => {});
  }, [courseId]);

  useEffect(() => {
    seenSourceIndicesRef.current = new Set();
    setActiveSource(null);
    setIsSourceOpen(false);
    fetch(`/api/course/${encodeURIComponent(courseId)}/sources`)
      .then((r) => r.json())
      .then((payload: { sources?: Array<{ name?: unknown; url?: unknown; timestamp?: unknown }> }) => {
        const parsed = (payload.sources ?? [])
          .map((s) => ({
            name: typeof s.name === "string" ? s.name : "",
            url: typeof s.url === "string" ? s.url : "",
            timestamp: typeof s.timestamp === "number" ? s.timestamp : Number(s.timestamp ?? 0),
          }))
          .filter((s) => s.name && s.url && Number.isFinite(s.timestamp))
          .sort((a, b) => a.timestamp - b.timestamp);
        setTimedSources(parsed);
      })
      .catch(() => setTimedSources([]));
  }, [courseId]);

  // Sync play/pause to the video element
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) {
      // Unmute on first explicit play interaction
      if (hasInteractedRef.current) v.muted = false;
      v.play().catch(() => {});
    } else {
      hasInteractedRef.current = true;
      v.pause();
    }
  }, [isPlaying]);

  // Feed real video time back as progress + update subtitle (rAF-coalesced)
  const handleTimeUpdate = useCallback(() => {
    if (timeUpdateRafRef.current !== null) return;
    timeUpdateRafRef.current = requestAnimationFrame(() => {
      timeUpdateRafRef.current = null;
      const v = videoRef.current;
      if (!v || !v.duration) return;
      onSeek(v.currentTime / v.duration);
      const cue = cuesRef.current.find((c) => v.currentTime >= c.start && v.currentTime <= c.end);
      setSubtitle(cue?.text ?? "");

      const matchWindowSec = 0.4;
      const sourceIdx = timedSources.findIndex((s, idx) => {
        if (seenSourceIndicesRef.current.has(idx)) return false;
        return Math.abs(v.currentTime - s.timestamp) <= matchWindowSec;
      });
      if (sourceIdx >= 0) {
        seenSourceIndicesRef.current.add(sourceIdx);
        setActiveSource(timedSources[sourceIdx]);
        setIsSourceOpen(false);
        resumeAfterPopupRef.current = false;
      }
    });
  }, [onSeek, timedSources]);

  useEffect(() => {
    return () => {
      if (timeUpdateRafRef.current !== null) {
        cancelAnimationFrame(timeUpdateRafRef.current);
        timeUpdateRafRef.current = null;
      }
    };
  }, []);

  const closeSourcePopup = useCallback(() => {
    setIsSourceOpen(false);
    if (resumeAfterPopupRef.current) {
      videoRef.current?.play().catch(() => {});
    }
    resumeAfterPopupRef.current = false;
  }, []);

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
        src={`/api/course/${encodeURIComponent(courseId)}/video`}
        autoPlay
        muted
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => onSeek(1)}
        onLoadedMetadata={() => {
          const v = videoRef.current;
          if (!v) return;
          v.play().catch(() => {});
        }}
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
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.08)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#ffffff",
          boxShadow: "0 10px 28px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.25)",
          cursor: "pointer",
          WebkitTapHighlightColor: "transparent",
          opacity: isPlaying ? 0 : 1,
          pointerEvents: isPlaying ? "none" : "auto",
          transition: "opacity 0.2s",
        }}
      >
        {isPlaying ? (
          <svg viewBox="0 0 24 24" fill="currentColor" width={24} height={24} aria-hidden>
            <rect x="6.2" y="5.2" width="4.4" height="13.6" rx="1.2" />
            <rect x="13.4" y="5.2" width="4.4" height="13.6" rx="1.2" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor" width={26} height={26} aria-hidden>
            <path d="M8 5.4c0-.8.9-1.3 1.6-.9l10.2 6.1c.7.4.7 1.4 0 1.8L9.6 18.5c-.7.4-1.6-.1-1.6-.9V5.4z" />
          </svg>
        )}
      </button>

      {/* tap anywhere to toggle (invisible full overlay) */}
      <div
        onClick={onTogglePlay}
        style={{ position: "absolute", inset: 0, cursor: "pointer" }}
      />

      {activeSource && (
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 14,
            zIndex: 35,
            pointerEvents: "auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
          }}
        >
          <PillBtn
            onClick={() => {
              if (isSourceOpen) {
                closeSourcePopup();
                return;
              }
              setIsSourceOpen(true);
              const wasPlaying = !!videoRef.current && !videoRef.current.paused;
              resumeAfterPopupRef.current = wasPlaying;
              if (wasPlaying) videoRef.current?.pause();
            }}
            ariaLabel="Show source"
          >
            <span style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>!</span>
          </PillBtn>
          {isSourceOpen && (
            <div
              style={{
                marginTop: 8,
                width: "min(86vw, 360px)",
                padding: "10px 12px",
                borderRadius: 12,
                background: "rgba(12,12,12,0.9)",
                border: "1px solid rgba(255,255,255,0.18)",
                  backdropFilter: "blur(8px)",
                  color: "#fff",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                  <div style={{ fontSize: 11, letterSpacing: 0.4, opacity: 0.75, textTransform: "uppercase" }}>Source</div>
                  <button
                    onClick={closeSourcePopup}
                    aria-label="Close source popup"
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "rgba(255,255,255,0.82)",
                      cursor: "pointer",
                      fontSize: 16,
                      lineHeight: 1,
                      padding: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.35, marginBottom: 6 }}>
                  {activeSource.name}
                </div>
              <a
                href={activeSource.url}
                target="_blank"
                rel="noreferrer noopener"
                style={{ color: "#A7D8FF", fontSize: 12, textDecoration: "underline" }}
              >
                See more
              </a>
            </div>
          )}
        </div>
      )}

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

// ── Comments modal ────────────────────────────────────────────────────
function CommentsModal({
  comments,
  onClose,
}: {
  comments: SocialComment[];
  onClose: () => void;
}) {
  return (
    <>
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
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] }}
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 90,
          background: "var(--surface)",
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          maxHeight: "72dvh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 -16px 48px rgba(0,0,0,0.22)",
        }}
      >
        <div
          style={{
            padding: "14px 16px 10px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              background: "var(--border-strong)",
            }}
          />
          <div
            style={{
              fontFamily: "var(--f-head)",
              fontSize: 15,
              fontWeight: 500,
              color: "var(--text)",
              letterSpacing: "-0.01em",
            }}
          >
            {comments.length} {comments.length === 1 ? "comment" : "comments"}
          </div>
        </div>
        <div
          className="no-scrollbar"
          style={{
            overflowY: "auto",
            padding: "8px 4px 24px",
            flex: 1,
          }}
        >
          {comments.length === 0 ? (
            <div
              style={{
                padding: "40px 24px",
                textAlign: "center",
                color: "var(--text-3)",
                fontSize: 13,
                fontFamily: "var(--f-body)",
              }}
            >
              No comments yet.
            </div>
          ) : (
            comments.map((c) => (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "12px 18px",
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    background: "var(--bg-tint)",
                    border: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text)",
                    fontFamily: "var(--f-body)",
                  }}
                >
                  {c.author.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 8,
                      marginBottom: 2,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--text)",
                        fontFamily: "var(--f-body)",
                      }}
                    >
                      {c.author}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--text-3)",
                        fontFamily: "var(--f-body)",
                      }}
                    >
                      {fmtRelTime(c.createdAt)}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      color: "var(--text-2)",
                      lineHeight: 1.5,
                      fontFamily: "var(--f-body)",
                    }}
                  >
                    {c.text}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </>
  );
}

// ── Social rail (right side, overlaid on video) ───────────────────────
function SocialRail({
  likes,
  shares,
  commentCount,
  liked,
  onLike,
  onComment,
  onShare,
}: {
  likes: number;
  shares: number;
  commentCount: number;
  liked: boolean;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        right: 12,
        bottom: 96,
        zIndex: 25,
        display: "flex",
        flexDirection: "column",
        gap: 18,
        alignItems: "center",
        pointerEvents: "auto",
      }}
    >
      <RailButton
        ariaLabel={liked ? "Unlike" : "Like"}
        onClick={onLike}
        count={fmtCount(likes)}
        active={liked}
      >
        <svg viewBox="0 0 24 24" width={26} height={26} aria-hidden>
          <path
            d="M12 20.7s-7.2-4.35-9.3-9A4.8 4.8 0 0 1 12 6.4a4.8 4.8 0 0 1 9.3 5.3c-2.1 4.65-9.3 9-9.3 9z"
            fill={liked ? "#ff4d6d" : "none"}
            stroke={liked ? "#ff4d6d" : "currentColor"}
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      </RailButton>
      <RailButton
        ariaLabel="Comments"
        onClick={onComment}
        count={fmtCount(commentCount)}
      >
        <svg viewBox="0 0 24 24" width={26} height={26} fill="none" aria-hidden>
          <path
            d="M4 5h16v10H8.5L4 19V5z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      </RailButton>
      <RailButton
        ariaLabel="Share"
        onClick={onShare}
        count={fmtCount(shares)}
      >
        <svg viewBox="0 0 24 24" width={24} height={24} fill="none" aria-hidden>
          <circle cx="18" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="18" cy="19" r="2.5" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M8.3 10.7l7.4-4.4M8.3 13.3l7.4 4.4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </RailButton>
    </div>
  );
}

function RailButton({
  onClick,
  ariaLabel,
  count,
  active,
  children,
}: {
  onClick: () => void;
  ariaLabel: string;
  count: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        background: "transparent",
        border: "none",
        padding: 0,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        color: "#fff",
        WebkitTapHighlightColor: "transparent",
        filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.45))",
      }}
    >
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: 23,
          background: "rgba(20,20,20,0.42)",
          backdropFilter: "blur(10px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: active ? "#ff4d6d" : "#fff",
        }}
      >
        {children}
      </div>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          fontFamily: "var(--f-body)",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: 0.2,
        }}
      >
        {count}
      </span>
    </button>
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
        pointerEvents: "auto",
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
  const re = /\$\$([\s\S]+?)\$\$|\*\*(.+?)\*\*|\*(.+?)\*|\[(\d+)\]/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      parts.push(
        <InlineMath
          key={key++}
          math={m[1].trim()}
          errorColor="var(--text-3)"
          renderError={(err) => <span style={{ color: "var(--text-3)" }}>{err.name}</span>}
        />
      );
    } else if (m[2] !== undefined)
      parts.push(<strong key={key++} style={{ fontWeight: 600 }}>{m[2]}</strong>);
    else if (m[3] !== undefined)
      parts.push(<em key={key++}>{m[3]}</em>);
    else if (m[4] !== undefined) {
      const n = parseInt(m[4], 10);
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
          {m[4]}
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
        if (block.kind === "math") {
          return (
            <div
              key={i}
              style={{
                padding: "14px 16px",
                marginBottom: 22,
                borderRadius: 12,
                background: "var(--bg-tint)",
                border: "1px solid var(--border)",
                overflowX: "auto",
                color: "var(--text)",
                textAlign: "center",
              }}
            >
              <BlockMath
                math={block.latex}
                errorColor="var(--text-3)"
                renderError={(err) => <span style={{ color: "var(--text-3)" }}>{err.name}</span>}
              />
            </div>
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
function ArticleContent({ course, onCreateCourse }: { course: ParsedCourse; onCreateCourse: () => void }) {
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
          onClick={onCreateCourse}
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

// ── End-of-feed card (shown over video when no more videos to scroll to) ──
function EndOfFeedCard({
  onCreate,
  onBack,
  onReset,
  canGoBack,
}: {
  onCreate: () => void;
  onBack: () => void;
  onReset: () => void;
  canGoBack: boolean;
}) {
  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] }}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 40,
        background: "linear-gradient(180deg, rgba(10,10,10,0.92), rgba(10,10,10,0.98))",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 28px",
        textAlign: "center",
        color: "#fff",
        gap: 16,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          background: "rgba(255,255,255,0.1)",
          border: "1px solid rgba(255,255,255,0.18)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 4,
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" width={24} height={24} aria-hidden>
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <div
        style={{
          fontFamily: "var(--f-head)",
          fontSize: 22,
          fontWeight: 500,
          letterSpacing: "-0.02em",
        }}
      >
        You&apos;re all caught up
      </div>
      <div
        style={{
          fontSize: 14,
          color: "rgba(255,255,255,0.7)",
          fontFamily: "var(--f-body)",
          lineHeight: 1.5,
          maxWidth: 260,
        }}
      >
        You&apos;ve watched every video in your feed. Create a new course to keep learning.
      </div>
      <button
        onClick={onCreate}
        style={{
          marginTop: 8,
          height: 50,
          padding: "0 22px",
          minWidth: 200,
          borderRadius: 25,
          border: "none",
          background: "#FAF7F0",
          color: "#0B0907",
          fontFamily: "var(--f-body)",
          fontWeight: 600,
          fontSize: 15,
          cursor: "pointer",
        }}
      >
        Create a new video
      </button>
      <button
        onClick={onReset}
        style={{
          height: 46,
          padding: "0 22px",
          minWidth: 200,
          borderRadius: 23,
          border: "1px solid rgba(255,255,255,0.28)",
          background: "transparent",
          color: "#FAF7F0",
          fontFamily: "var(--f-body)",
          fontWeight: 500,
          fontSize: 14,
          cursor: "pointer",
        }}
      >
        Reset watched videos
      </button>
      {canGoBack && (
        <button
          onClick={onBack}
          style={{
            marginTop: 4,
            background: "transparent",
            border: "none",
            color: "rgba(255,255,255,0.75)",
            fontFamily: "var(--f-body)",
            fontSize: 13,
            cursor: "pointer",
            padding: 8,
          }}
        >
          ↑ Swipe up to go back
        </button>
      )}
    </motion.div>
  );
}

type View = "video" | "reading";

const SEEN_VIDEOS_KEY = "gradium.seenVideos";
const FEED_DIRECTION_KEY = "gradium.feedDirection";

function readSeenVideos(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(SEEN_VIDEOS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeSeenVideos(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SEEN_VIDEOS_KEY, JSON.stringify(ids));
  } catch {
    // storage unavailable
  }
}

// ── Main component ────────────────────────────────────────────────────
export function CourseViewA({ course, courseId }: { course: ParsedCourse; courseId: string }) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [view, setView] = useState<View>("video");
  const [showShare, setShowShare] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [socials, setSocials] = useState<Socials>({ likes: 0, shares: 0, comments: [] });
  const [liked, setLiked] = useState(false);
  const [readProgress, setReadProgress] = useState(0);
  const [allCourseIds, setAllCourseIds] = useState<string[]>([]);
  const [seenIds] = useState<string[]>(() => {
    const current = readSeenVideos();
    return current.includes(courseId) ? current : [...current, courseId];
  });
  const [showEndCard, setShowEndCard] = useState(false);
  const [navDirection] = useState<"up" | "down" | null>(() => {
    if (typeof window === "undefined") return null;
    const d = window.sessionStorage.getItem(FEED_DIRECTION_KEY);
    if (d === "up" || d === "down") {
      window.sessionStorage.removeItem(FEED_DIRECTION_KEY);
      return d;
    }
    return null;
  });

  // Load list of available courses
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/courses`)
      .then((r) => r.json())
      .then((data: { ids?: unknown }) => {
        if (cancelled) return;
        const ids = Array.isArray(data.ids)
          ? data.ids.filter((x): x is string => typeof x === "string")
          : [];
        setAllCourseIds(ids);
      })
      .catch(() => {
        if (!cancelled) setAllCourseIds([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist seen videos to sessionStorage when the set changes
  useEffect(() => {
    writeSeenVideos(seenIds);
  }, [seenIds]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/course/${encodeURIComponent(courseId)}/socials`)
      .then((r) => r.json())
      .then((data: Partial<Socials>) => {
        if (cancelled) return;
        setSocials({
          likes: typeof data.likes === "number" ? data.likes : 0,
          shares: typeof data.shares === "number" ? data.shares : 0,
          comments: Array.isArray(data.comments) ? data.comments : [],
        });
      })
      .catch(() => {
        if (!cancelled) setSocials({ likes: 0, shares: 0, comments: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const handleLike = useCallback(() => {
    setLiked((prev) => {
      const next = !prev;
      setSocials((s) => ({ ...s, likes: Math.max(0, s.likes + (next ? 1 : -1)) }));
      return next;
    });
  }, []);

  const handleShare = useCallback(() => {
    setShowShare(true);
    setSocials((s) => ({ ...s, shares: s.shares + 1 }));
  }, []);

  const handleOpenComments = useCallback(() => setShowComments(true), []);
  const articleRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const videoPaneRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View>("video");
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const didSwipe = useRef(false);
  const wheelLockRef = useRef(false);
  const navigatingRef = useRef(false);
  const router = useRouter();

  // If we just arrived via a feed scroll, swallow the tail of that gesture
  // so it doesn't immediately trigger another navigation on the new page.
  useEffect(() => {
    if (navDirection === null) return;
    wheelLockRef.current = true;
    const id = window.setTimeout(() => {
      wheelLockRef.current = false;
    }, 500);
    return () => window.clearTimeout(id);
  }, [navDirection]);

  const seenIdsRef = useRef<string[]>([]);
  const allIdsRef = useRef<string[]>([]);
  useEffect(() => { seenIdsRef.current = seenIds; }, [seenIds]);
  useEffect(() => { allIdsRef.current = allCourseIds; }, [allCourseIds]);

  // Prefetch adjacent course routes + warm their lightweight metadata caches.
  useEffect(() => {
    if (allCourseIds.length === 0) return;
    const idx = seenIds.indexOf(courseId);
    const nextId =
      idx >= 0 && idx < seenIds.length - 1
        ? seenIds[idx + 1]
        : allCourseIds.find((id) => !seenIds.includes(id)) ?? null;
    const prevId = idx > 0 ? seenIds[idx - 1] : null;

    const warm = (id: string) => {
      router.prefetch(`/course/${encodeURIComponent(id)}`);
      fetch(`/api/course/${encodeURIComponent(id)}/sources`).catch(() => {});
      fetch(`/api/course/${encodeURIComponent(id)}/socials`).catch(() => {});
      fetch(`/api/course/${encodeURIComponent(id)}/subtitle`).catch(() => {});
    };
    if (nextId && nextId !== courseId) warm(nextId);
    if (prevId && prevId !== courseId) warm(prevId);
  }, [allCourseIds, seenIds, courseId, router]);

  const goToNextVideo = useCallback(() => {
    if (navigatingRef.current) return;
    const seen = seenIdsRef.current;
    const all = allIdsRef.current;
    const idx = seen.indexOf(courseId);
    let nextId: string | null = null;

    if (idx >= 0 && idx < seen.length - 1) {
      nextId = seen[idx + 1];
    } else {
      const unseen = all.find((id) => !seen.includes(id));
      if (unseen) nextId = unseen;
    }

    if (nextId) {
      navigatingRef.current = true;
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(FEED_DIRECTION_KEY, "down");
      }
      router.push(`/course/${encodeURIComponent(nextId)}`);
    } else {
      setShowEndCard(true);
    }
  }, [courseId, router]);

  const resetSeenVideos = useCallback(() => {
    if (navigatingRef.current) return;
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(SEEN_VIDEOS_KEY);
      } catch {
        // storage unavailable
      }
    }
    const all = allIdsRef.current;
    const nextId = all.find((id) => id !== courseId) ?? all[0] ?? null;
    if (nextId && nextId !== courseId) {
      navigatingRef.current = true;
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(FEED_DIRECTION_KEY, "down");
      }
      router.push(`/course/${encodeURIComponent(nextId)}`);
    } else {
      setShowEndCard(false);
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    }
  }, [courseId, router]);

  const goToPrevVideo = useCallback(() => {
    if (navigatingRef.current) return;
    if (showEndCard) {
      setShowEndCard(false);
      return;
    }
    const seen = seenIdsRef.current;
    const idx = seen.indexOf(courseId);
    if (idx > 0) {
      navigatingRef.current = true;
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(FEED_DIRECTION_KEY, "up");
      }
      router.push(`/course/${encodeURIComponent(seen[idx - 1])}`);
    }
  }, [courseId, router, showEndCard]);

  useEffect(() => { viewRef.current = view; }, [view]);

  // Horizontal touch navigation:
  // - swipe left on video => open reading panel
  // - swipe right on reading => return to video
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      didSwipe.current = false;
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
    }

    function onTouchMove(e: TouchEvent) {
      if (didSwipe.current) return;
      const dx = e.touches[0].clientX - touchStartX.current;
      const dy = e.touches[0].clientY - touchStartY.current;
      const isHorizontal = Math.abs(dx) > Math.abs(dy) + 8;
      const isVertical = Math.abs(dy) > Math.abs(dx) + 8;

      const cur = viewRef.current;

      if (isVertical && cur === "video" && Math.abs(dy) > 56) {
        e.preventDefault();
        didSwipe.current = true;
        if (dy < 0) goToNextVideo();
        else goToPrevVideo();
        return;
      }

      if (!isHorizontal || Math.abs(dx) < 36) return;

      if (cur === "video" && dx < 0) {
        e.preventDefault();
        didSwipe.current = true;
        setView("reading");
        return;
      }
      if (cur === "reading" && dx > 0) {
        e.preventDefault();
        didSwipe.current = true;
        setView("video");
      }
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
    };
  }, [goToNextVideo, goToPrevVideo]);

  // Wheel/trackpad scroll on the video pane → navigate between videos
  useEffect(() => {
    const el = videoPaneRef.current;
    if (!el) return;

    function onWheel(e: WheelEvent) {
      if (viewRef.current !== "video") return;
      // The video pane has no native scroll surface — swallow every wheel event
      // so trackpad horizontal-scroll / macOS swipe-back never leaks through.
      e.preventDefault();
      if (Math.abs(e.deltaY) < 50) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (wheelLockRef.current) return;
      wheelLockRef.current = true;
      if (e.deltaY > 0) goToNextVideo();
      else goToPrevVideo();
      window.setTimeout(() => { wheelLockRef.current = false; }, 350);
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
    };
  }, [goToNextVideo, goToPrevVideo]);

  // Article scroll — track reading progress (rAF-coalesced)
  const scrollRafRef = useRef<number | null>(null);
  const handleScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const scrollTop = el.scrollTop;
    const scrollHeight = el.scrollHeight;
    const clientHeight = el.clientHeight;
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const total = scrollHeight - clientHeight;
      if (scrollTop <= 1) setReadProgress(0);
      else if (total > 0) setReadProgress(scrollTop / total);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, []);

  const togglePlay = useCallback(() => setIsPlaying((p) => !p), []);
  const seek = useCallback((p: number) => setProgress(p), []);

  return (
    <div
      ref={outerRef}
      style={{
        height: "100dvh",
        overflow: "hidden",
        background: "var(--bg)",
        position: "relative",
        overscrollBehavior: "contain",
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
          justifyContent: "center",
          pointerEvents: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(255,255,255,0.88)",
            borderRadius: 999,
            padding: 4,
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.65)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.16)",
          }}
        >
          <button
            onClick={() => router.push("/chat")}
            style={{
              height: 30,
              padding: "0 12px",
              borderRadius: 999,
              border: "none",
              background: "transparent",
              color: "#2a2520",
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "var(--f-body)",
              cursor: "pointer",
            }}
          >
            Chat
          </button>
          <button
            onClick={() => router.push(`/course/${courseId}`)}
            style={{
              height: 30,
              padding: "0 12px",
              borderRadius: 999,
              border: "none",
              background: "#2a2520",
              color: "#fff",
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "var(--f-body)",
              cursor: "pointer",
            }}
          >
            Feed
          </button>
        </div>
      </div>

      {/* ── Horizontal view track */}
      <div
        style={{
          height: "100%",
          width: "200%",
          display: "flex",
          transform: view === "video" ? "translateX(0)" : "translateX(-50%)",
          transition: "transform 0.38s cubic-bezier(0.4,0,0.2,1)",
          willChange: "transform",
        }}
      >
        {/* Fullscreen video panel (first) */}
        <div
          ref={videoPaneRef}
          style={{
            width: "50%",
            height: "100%",
            position: "relative",
            overflow: "hidden",
            touchAction: "none",
            overscrollBehavior: "contain",
          }}
        >
          <motion.div
            key={courseId}
            initial={
              navDirection === "down"
                ? { y: "100%" }
                : navDirection === "up"
                  ? { y: "-100%" }
                  : { y: 0 }
            }
            animate={{ y: 0 }}
            transition={{ duration: 0.36, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] }}
            style={{ position: "absolute", inset: 0, willChange: "transform" }}
          >
            <VideoBlock
              courseId={courseId}
              isPlaying={isPlaying}
              progress={progress}
              onTogglePlay={togglePlay}
              onSeek={seek}
            />
            <SocialRail
              likes={socials.likes}
              shares={socials.shares}
              commentCount={socials.comments.length}
              liked={liked}
              onLike={handleLike}
              onComment={handleOpenComments}
              onShare={handleShare}
            />
          </motion.div>

          <AnimatePresence>
            {showEndCard && (
              <EndOfFeedCard
                onCreate={() => router.push("/chat")}
                onBack={goToPrevVideo}
                onReset={resetSeenVideos}
                canGoBack={seenIds.indexOf(courseId) > 0}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Reading panel (second) */}
        <div
          ref={articleRef}
          onScroll={handleScroll}
          className="no-scrollbar"
          style={{
            width: "50%",
            height: "100%",
            overflowY: "auto",
            overflowX: "hidden",
            scrollbarWidth: "none",
            background: "var(--surface)",
            paddingTop: 58,
            boxShadow: "0 -8px 24px rgba(0,0,0,0.05)",
            WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"],
          }}
        >
          <ArticleContent course={course} onCreateCourse={() => router.push("/chat")} />
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: 22,
          transform: "translateX(-50%)",
          zIndex: 35,
          display: "flex",
          gap: 8,
          alignItems: "center",
          borderRadius: 999,
          padding: "7px 10px",
          background: view === "reading" ? "rgba(0,0,0,0.86)" : "rgba(255,255,255,0.9)",
          border: view === "reading" ? "1px solid rgba(255,255,255,0.16)" : "1px solid rgba(0,0,0,0.12)",
          backdropFilter: "blur(6px)",
        }}
      >
        <button
          onClick={() => setView("video")}
          aria-label="Show video panel"
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            border: "none",
            padding: 0,
            cursor: "pointer",
            background: view === "reading" ? "#FFFFFF" : "#0E0E0E",
            opacity: view === "video" ? 1 : 0.45,
          }}
        />
        <button
          onClick={() => setView("reading")}
          aria-label="Show text panel"
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            border: "none",
            padding: 0,
            cursor: "pointer",
            background: view === "reading" ? "#FFFFFF" : "#0E0E0E",
            opacity: view === "reading" ? 1 : 0.45,
          }}
        />
      </div>

      {/* ── Share modal */}
      <AnimatePresence>
        {showShare && <ShareModal onClose={() => setShowShare(false)} />}
      </AnimatePresence>

      {/* ── Comments modal */}
      <AnimatePresence>
        {showComments && (
          <CommentsModal
            comments={socials.comments}
            onClose={() => setShowComments(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
