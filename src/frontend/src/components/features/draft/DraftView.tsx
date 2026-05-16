"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/constants";
import { getDraft } from "@/lib/courseDraftStore";
import type { CourseOutput } from "@/types";

function BlobBg() {
  const blobs = [
    { c: "#EFEBE1", x: -70, y: -40, s: 260, d: 0 },
    { c: "#E8DFC8", x: 260, y: 260, s: 240, d: 1.2 },
    { c: "#DCD3BD", x: 70, y: 620, s: 180, d: 0.6 },
  ];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        opacity: 0.35,
        zIndex: 0,
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

function MarkdownBlock({ children }: { children: string }) {
  return (
    <pre
      style={{
        margin: 0,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 13,
        lineHeight: 1.65,
        color: "var(--text)",
      }}
    >
      {children}
    </pre>
  );
}

export function DraftView() {
  const [draft] = useState<CourseOutput | null>(() => getDraft());
  const router = useRouter();

  useEffect(() => {
    if (!draft) {
      router.replace(ROUTES.CHAT);
    }
  }, [draft, router]);

  if (!draft) {
    return (
      <div style={{ minHeight: "100dvh", background: "var(--bg)" }}>
        <BlobBg />
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--bg)",
        color: "var(--text)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <BlobBg />

      <main
        style={{
          position: "relative",
          zIndex: 1,
          width: "min(980px, calc(100% - 32px))",
          margin: "0 auto",
          padding: "32px 0 42px",
        }}
      >
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 18,
            marginBottom: 22,
          }}
        >
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 12px",
                borderRadius: 999,
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--text-2)",
                fontSize: 11,
                fontWeight: 500,
                marginBottom: 14,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                fontFamily: "var(--f-body)",
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--gold)" }} />
              Generated
            </div>
            <h1
              style={{
                fontFamily: "var(--f-head)",
                fontSize: 34,
                fontWeight: 500,
                color: "var(--text)",
                lineHeight: 1.1,
                marginBottom: 8,
                letterSpacing: "-0.025em",
              }}
            >
              Course draft
            </h1>
            <p
              style={{
                fontSize: 15,
                color: "var(--text-2)",
                lineHeight: 1.5,
                fontFamily: "var(--f-body)",
              }}
            >
              Intermediate output from task_to_class.
            </p>
          </div>

          <button
            onClick={() => router.push(ROUTES.CHAT)}
            style={{
              flexShrink: 0,
              height: 42,
              padding: "0 18px",
              borderRadius: 21,
              border: "1px solid var(--border-strong)",
              background: "var(--surface)",
              color: "var(--text)",
              fontFamily: "var(--f-body)",
              fontWeight: 500,
              fontSize: 14,
              cursor: "pointer",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            Back
          </button>
        </motion.header>

        <section
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 18,
            padding: 20,
            boxShadow: "var(--shadow-md)",
            marginBottom: 14,
          }}
        >
          <h2
            style={{
              fontFamily: "var(--f-body)",
              fontSize: 12,
              color: "var(--text-3)",
              fontWeight: 600,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              marginBottom: 14,
            }}
          >
            Condensed markdown
          </h2>
          <MarkdownBlock>{draft.condensed_markdown}</MarkdownBlock>
        </section>

        <details
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 18,
            padding: 20,
            boxShadow: "var(--shadow-sm)",
            marginBottom: 14,
          }}
        >
          <summary
            style={{
              cursor: "pointer",
              fontFamily: "var(--f-body)",
              fontSize: 12,
              color: "var(--text-3)",
              fontWeight: 600,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
            }}
          >
            Full markdown
          </summary>
          <div style={{ marginTop: 16 }}>
            <MarkdownBlock>{draft.full_markdown}</MarkdownBlock>
          </div>
        </details>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))",
            gap: 14,
          }}
        >
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 18,
              padding: 20,
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <h2
              style={{
                fontFamily: "var(--f-body)",
                fontSize: 12,
                color: "var(--text-3)",
                fontWeight: 600,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                marginBottom: 14,
              }}
            >
              References
            </h2>
            <ol style={{ margin: 0, paddingLeft: 22, fontFamily: "var(--f-body)" }}>
              {draft.references.map((ref) => (
                <li
                  key={`${ref.id}-${ref.url}`}
                  value={ref.id}
                  style={{ marginBottom: 10, color: "var(--text-2)", lineHeight: 1.45 }}
                >
                  <a
                    href={ref.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      color: "var(--text)",
                      textDecorationColor: "var(--gold)",
                      textUnderlineOffset: 3,
                    }}
                  >
                    {ref.title}
                  </a>
                </li>
              ))}
            </ol>
          </div>

          <aside
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 18,
              padding: 20,
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <h2
              style={{
                fontFamily: "var(--f-body)",
                fontSize: 12,
                color: "var(--text-3)",
                fontWeight: 600,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                marginBottom: 14,
              }}
            >
              Next chapter
            </h2>
            <p
              style={{
                margin: 0,
                color: "var(--text)",
                fontFamily: "var(--f-head)",
                fontSize: 21,
                lineHeight: 1.3,
              }}
            >
              {draft.next_chapter}
            </p>
          </aside>
        </section>
      </main>
    </div>
  );
}
