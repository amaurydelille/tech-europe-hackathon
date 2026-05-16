"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/constants";
import { setPendingProfile } from "@/lib/courseDraftStore";
import type { OnboardingProfile } from "@/types";

type GlyphKind = "topic" | "goal" | "level" | "length" | "format";

interface SummaryItem {
  kind: GlyphKind;
  label: string;
  field: keyof OnboardingProfile | "learner";
}

const ITEMS: SummaryItem[] = [
  { kind: "topic",  label: "Subject",    field: "subject" },
  { kind: "goal",   label: "Goal",       field: "learning_goal" },
  { kind: "level",  label: "Background", field: "prior_knowledge" },
  { kind: "length", label: "Learner",    field: "learner" },
  { kind: "format", label: "Style",      field: "content_style" },
];

function Glyph({ kind }: { kind: GlyphKind }) {
  const paths: Record<GlyphKind, React.ReactNode> = {
    topic: (
      <path d="M5 5h10v14H7a2 2 0 01-2-2V5z M5 17a2 2 0 012-2h10"
        fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    ),
    goal: (
      <g fill="none" stroke="currentColor" strokeWidth="1.4">
        <circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="3" />
        <circle cx="12" cy="12" r="0.5" fill="currentColor" />
      </g>
    ),
    level: (
      <g fill="currentColor">
        <rect x="4" y="14" width="3" height="6" rx="1" />
        <rect x="10" y="10" width="3" height="10" rx="1" />
        <rect x="16" y="6" width="3" height="14" rx="1" />
      </g>
    ),
    length: (
      <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <circle cx="12" cy="12" r="7" /><path d="M12 8v4l3 2" />
      </g>
    ),
    format: (
      <g fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="4" y="5" width="16" height="10" rx="1.5" />
        <path d="M10 10l4-2v4z" fill="currentColor" />
        <path d="M7 19h10" strokeLinecap="round" />
      </g>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} style={{ color: "var(--text)" }}>
      {paths[kind]}
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={16} height={16} aria-hidden>
      <path d="M4 20l4-1 11-11-3-3L5 16l-1 4z"
        stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  background: "none",
  border: "none",
  outline: "none",
  fontSize: 15,
  color: "var(--text)",
  fontWeight: 500,
  lineHeight: 1.3,
  fontFamily: "var(--f-body)",
  padding: 0,
  resize: "none",
};

interface CardProps {
  kind: GlyphKind;
  label: string;
  value: string;
  isEditing: boolean;
  index: number;
  // for regular fields
  onEdit: () => void;
  onSave: (value: string) => void;
  // for the compound learner field
  isLearner?: boolean;
  nameValue?: string;
  ageValue?: string;
  onSaveLearner?: (name: string, age: string) => void;
}

function SummaryCard({ kind, label, value, isEditing, index, onEdit, onSave, isLearner, nameValue, ageValue, onSaveLearner }: CardProps) {
  const [draft, setDraft] = useState(value);
  const [draftName, setDraftName] = useState(nameValue ?? "");
  const [draftAge, setDraftAge] = useState(ageValue ?? "");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      setDraft(value);
      setDraftName(nameValue ?? "");
      setDraftAge(ageValue ?? "");
      setTimeout(() => (isLearner ? nameRef : inputRef).current?.focus(), 30);
    }
  }, [isEditing]);

  function commit() {
    if (isLearner) {
      onSaveLearner?.(draftName.trim() || (nameValue ?? ""), draftAge.trim() || (ageValue ?? ""));
    } else {
      onSave(draft.trim() || value);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commit(); }
    if (e.key === "Escape") { onSave(value); }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.07, ease: [0.4, 0, 0.2, 1] }}
      style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "14px 16px", borderRadius: 18,
        background: isEditing ? "var(--surface-active, var(--surface))" : "var(--surface)",
        border: `1px solid ${isEditing ? "var(--border-strong)" : "var(--border)"}`,
        boxShadow: "var(--shadow-sm)",
        transition: "border-color .2s, background .2s",
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 12, background: "var(--bg-tint)",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <Glyph kind={kind} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 10, color: "var(--text-3)", fontWeight: 500, letterSpacing: "0.10em",
          textTransform: "uppercase", marginBottom: 3, fontFamily: "var(--f-body)",
        }}>
          {label}
        </div>

        {isEditing ? (
          isLearner ? (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                ref={nameRef}
                value={draftName}
                onChange={e => setDraftName(e.target.value)}
                onBlur={commit}
                onKeyDown={onKeyDown}
                placeholder="Name"
                style={{ ...INPUT_STYLE, flex: 2 }}
              />
              <input
                value={draftAge}
                onChange={e => setDraftAge(e.target.value)}
                onBlur={commit}
                onKeyDown={onKeyDown}
                placeholder="Age"
                style={{ ...INPUT_STYLE, flex: 1 }}
              />
            </div>
          ) : (
            <textarea
              ref={inputRef}
              value={draft}
              rows={1}
              onChange={e => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={onKeyDown}
              style={{ ...INPUT_STYLE, display: "block" }}
            />
          )
        ) : (
          <div style={{
            fontSize: 15, color: "var(--text)", fontWeight: 500,
            lineHeight: 1.3, fontFamily: "var(--f-body)",
          }}>
            {value}
          </div>
        )}
      </div>

      <button
        onClick={isEditing ? commit : onEdit}
        aria-label={isEditing ? `Save ${label}` : `Edit ${label}`}
        style={{
          background: "none", border: "none", cursor: "pointer", padding: 4,
          display: "flex", alignItems: "center",
          color: isEditing ? "var(--gold-deep, var(--text))" : "var(--text-3)",
        }}
      >
        {isEditing ? (
          <svg viewBox="0 0 24 24" fill="none" width={16} height={16} aria-hidden>
            <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <EditIcon />
        )}
      </button>
    </motion.div>
  );
}

interface SummaryViewProps {
  onReset: () => void;
  profile?: OnboardingProfile | null;
}

export function SummaryView({ onReset, profile }: SummaryViewProps) {
  const router = useRouter();
  const canBegin = Boolean(profile);

  const [edited, setEdited] = useState<OnboardingProfile | null>(profile ?? null);
  const [editingField, setEditingField] = useState<SummaryItem["field"] | null>(null);

  useEffect(() => { setEdited(profile ?? null); }, [profile]);

  function getValue(field: SummaryItem["field"]): string {
    if (!edited) return "";
    if (field === "learner") return `${edited.name} · age ${edited.age}`;
    return String(edited[field]);
  }

  function handleSave(field: keyof OnboardingProfile, value: string) {
    setEdited(prev => prev ? { ...prev, [field]: value } : prev);
    setEditingField(null);
  }

  function handleSaveLearner(name: string, age: string) {
    const parsedAge = parseInt(age, 10);
    setEdited(prev => prev ? { ...prev, name, age: isNaN(parsedAge) ? prev.age : parsedAge } : prev);
    setEditingField(null);
  }

  function handleBegin() {
    if (!edited) return;
    setPendingProfile(edited);
    router.push(ROUTES.GENERATE);
  }

  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", flexDirection: "column",
      padding: "24px 20px 28px", overflowY: "auto", background: "var(--bg)",
    }}>
      {/* blob bg */}
      <div style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", opacity: 0.35, zIndex: 0 }}>
        {[
          { c: "#EFEBE1", x: -40, y: -20, s: 220, d: 0 },
          { c: "#E8DFC8", x: 240, y: 320, s: 220, d: 1.2 },
          { c: "#DCD3BD", x: 280, y: -40, s: 160, d: 0.6 },
        ].map((b, i) => (
          <div key={i} style={{
            position: "absolute", left: b.x, top: b.y, width: b.s, height: b.s,
            borderRadius: "60% 40% 50% 50% / 50% 60% 40% 50%",
            background: b.c, filter: "blur(24px)",
            animation: `tt-blob 12s ease-in-out ${b.d}s infinite`,
          }} />
        ))}
      </div>

      {/* header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{ position: "relative", zIndex: 2, textAlign: "center", paddingBottom: 22 }}
      >
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "5px 12px", borderRadius: 999,
          background: "var(--surface)", border: "1px solid var(--border)",
          color: "var(--text-2)", fontSize: 11, fontWeight: 500,
          marginBottom: 14, letterSpacing: "0.10em", textTransform: "uppercase",
          fontFamily: "var(--f-body)",
        }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--gold)" }} />
          Understood
        </div>
        <h1 style={{
          fontFamily: "var(--f-head)", fontSize: 28, fontWeight: 500,
          color: "var(--text)", lineHeight: 1.15, marginBottom: 8, letterSpacing: "-0.025em",
        }}>
          Here&apos;s what I&apos;ll prepare
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.5, fontFamily: "var(--f-body)" }}>
          Tap the pencil to tweak anything before we start.
        </p>
      </motion.div>

      {/* cards */}
      <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        {ITEMS.map((item, i) => (
          <SummaryCard
            key={item.field}
            kind={item.kind}
            label={item.label}
            value={getValue(item.field)}
            isEditing={editingField === item.field}
            index={i}
            onEdit={() => setEditingField(item.field)}
            onSave={v => item.field !== "learner" && handleSave(item.field, v)}
            isLearner={item.field === "learner"}
            nameValue={edited?.name}
            ageValue={String(edited?.age ?? "")}
            onSaveLearner={handleSaveLearner}
          />
        ))}
      </div>

      {/* CTA row */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}
        style={{ position: "relative", zIndex: 2, display: "flex", gap: 10, marginTop: 18 }}
      >
        <button
          onClick={onReset}
          style={{
            flex: 1, height: 56, borderRadius: 28,
            border: "1px solid var(--border-strong)", background: "transparent",
            color: "var(--text)", fontFamily: "var(--f-body)", fontWeight: 500,
            fontSize: 15, cursor: "pointer",
          }}
        >
          Re-record
        </button>
        <button
          onClick={handleBegin}
          disabled={!canBegin}
          style={{
            flex: 1, height: 56, borderRadius: 28, border: "none",
            background: "linear-gradient(180deg,#1F1B14 0%,#0B0907 100%)",
            color: "#FAF7F0", fontFamily: "var(--f-body)", fontWeight: 600,
            fontSize: 16, cursor: canBegin ? "pointer" : "not-allowed",
            opacity: canBegin ? 1 : 0.48,
            boxShadow: canBegin ? "0 8px 24px rgba(20,17,13,.18)" : "none",
          }}
        >
          Begin
        </button>
      </motion.div>
    </div>
  );
}
