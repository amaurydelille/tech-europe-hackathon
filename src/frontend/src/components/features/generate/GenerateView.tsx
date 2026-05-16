"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/constants";
import { getPendingProfile, setDraft } from "@/lib/courseDraftStore";
import { courseService } from "@/services/course.service";
import type { OnboardingProfile } from "@/types";

// ─── Brand Logos ───────────────────────────────────────────────────────────────

function OpenAILogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.28 9.98a5.83 5.83 0 00-.5-4.79 5.9 5.9 0 00-6.35-2.83A5.87 5.87 0 0011.14 1a5.9 5.9 0 00-5.62 4.09 5.87 5.87 0 00-3.92 2.84 5.93 5.93 0 00.73 6.94 5.83 5.83 0 00.5 4.79 5.9 5.9 0 006.35 2.83A5.87 5.87 0 0012.86 23a5.9 5.9 0 005.63-4.1 5.87 5.87 0 003.91-2.84 5.93 5.93 0 00-.72-6.93v.05z"/>
    </svg>
  );
}

function TavilyLogo({ size = 16 }: { size?: number }) {
  // Tavily — teal "T"
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#0F766E"/>
      <path d="M7 10h18M16 10v12" stroke="white" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  );
}

function GlinerLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#7C3AED"/>
      <text x="16" y="22" textAnchor="middle" fontSize="12" fontWeight="800" fill="white" fontFamily="monospace">N</text>
    </svg>
  );
}

function FalLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#111827"/>
      <text x="16" y="22" textAnchor="middle" fontSize="13" fontWeight="800" fill="white" fontFamily="monospace, system-ui">fal</text>
    </svg>
  );
}

function GradiumLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#059669"/>
      <path d="M20 16c0 2.21-1.79 4-4 4s-4-1.79-4-4 1.79-4 4-4c1.42 0 2.67.74 3.4 1.86M20 16h-4" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function CodexLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#1D4ED8"/>
      <path d="M13 10l-5 6 5 6M19 10l5 6-5 6" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ─── Types & helpers ───────────────────────────────────────────────────────────

type StepState = "idle" | "active" | "done";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "Course generation failed.";
}

// ─── Step indicator dot ────────────────────────────────────────────────────────

function StepDot({ state }: { state: StepState }) {
  return (
    <div style={{ position: "relative", width: 24, height: 24, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {state === "active" && (
        <motion.div
          animate={{ scale: [1, 1.8, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 1.6, repeat: Infinity }}
          style={{ position: "absolute", inset: -3, borderRadius: "50%", background: "#B89968" }}
        />
      )}
      <div style={{
        width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
        border: `2px solid ${state === "idle" ? "var(--border-strong)" : state === "active" ? "#B89968" : "#16A34A"}`,
        background: state === "done" ? "#16A34A" : state === "active" ? "rgba(184,153,104,0.12)" : "transparent",
        transition: "all 0.4s",
      }}>
        {state === "done"
          ? <svg viewBox="0 0 24 24" fill="none" width={12} height={12}><path d="M5 13l4 4L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          : state === "active"
          ? <motion.div animate={{ scale: [0.5, 1, 0.5] }} transition={{ duration: 1.2, repeat: Infinity }} style={{ width: 7, height: 7, borderRadius: "50%", background: "#B89968" }} />
          : <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--border-strong)" }} />
        }
      </div>
    </div>
  );
}

// ─── Pipeline step row ─────────────────────────────────────────────────────────

function PipelineStep({ logo, label, detail, state, isLast }: {
  logo: React.ReactNode; label: string; detail: string; state: StepState; isLast?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
      {/* left: dot + connector */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 32, flexShrink: 0 }}>
        <StepDot state={state} />
        {!isLast && (
          <div style={{
            flex: 1, width: 2, minHeight: 16, marginTop: 2,
            background: state === "done" ? "#16A34A" : "var(--border)",
            transition: "background 0.5s",
          }} />
        )}
      </div>

      {/* right: card */}
      <div style={{
        flex: 1, marginLeft: 10, marginBottom: isLast ? 0 : 10,
        padding: "10px 12px",
        borderRadius: 12,
        border: `1px solid ${state === "active" ? "rgba(184,153,104,0.4)" : state === "done" ? "rgba(22,163,74,0.25)" : "var(--border)"}`,
        background: state === "active" ? "rgba(184,153,104,0.06)" : state === "done" ? "rgba(22,163,74,0.04)" : "var(--surface)",
        display: "flex", alignItems: "center", gap: 10,
        transition: "all 0.35s",
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8, overflow: "hidden", flexShrink: 0,
          opacity: state === "idle" ? 0.45 : 1, transition: "opacity 0.3s",
        }}>
          {logo}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: state === "idle" ? "var(--text-2)" : "var(--text)", fontFamily: "var(--f-body)", transition: "color 0.3s" }}>
            {label}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "var(--f-body)", marginTop: 1 }}>
            {detail}
          </div>
        </div>
        {state === "active" && (
          <motion.div
            animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.9, repeat: Infinity }}
            style={{ fontSize: 9, fontWeight: 600, color: "#B89968", fontFamily: "var(--f-body)", letterSpacing: "0.08em" }}
          >
            RUNNING
          </motion.div>
        )}
        {state === "done" && (
          <div style={{ fontSize: 9, fontWeight: 600, color: "#16A34A", fontFamily: "var(--f-body)", letterSpacing: "0.08em" }}>
            DONE
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Filmmaker tool card ───────────────────────────────────────────────────────

function AgentTool({ logo, label, desc, active }: { logo: React.ReactNode; label: string; desc: string; active: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "9px 11px", borderRadius: 10,
      border: `1px solid ${active ? "rgba(234,179,8,0.35)" : "var(--border)"}`,
      background: active ? "rgba(234,179,8,0.05)" : "var(--bg)",
      transition: "all 0.4s",
    }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>{logo}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", fontFamily: "var(--f-body)" }}>{label}</div>
        <div style={{ fontSize: 9, color: "var(--text-3)", fontFamily: "var(--f-body)", marginTop: 1 }}>{desc}</div>
      </div>
      {active && (
        <motion.div
          animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.1, repeat: Infinity }}
          style={{ width: 6, height: 6, borderRadius: "50%", background: "#EAB308", flexShrink: 0 }}
        />
      )}
    </div>
  );
}

// ─── Generate view ─────────────────────────────────────────────────────────────

const PIPELINE_STEPS = [
  { logo: <OpenAILogo size={30} />,  label: "Query Builder",     detail: "GPT-4o · Crafting search intent" },
  { logo: <TavilyLogo size={30} />,  label: "Web Search",        detail: "Tavily · Fetching sources" },
  { logo: <GlinerLogo size={30} />,  label: "NER Validation",    detail: "GLiNER · Filtering content quality" },
  { logo: <OpenAILogo size={30} />,  label: "Course Generation", detail: "GPT-5.5 · Writing your course" },
];

export function GenerateView() {
  const [profile] = useState<OnboardingProfile | null>(() => getPendingProfile());
  const [genStatus, setGenStatus] = useState<"loading" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [filmActive, setFilmActive] = useState(false);
  const router = useRouter();

  const runGeneration = useCallback(async (_p: OnboardingProfile) => {
    setGenStatus("loading");
    setError(null);
    setActiveStep(0);
    setFilmActive(false);
    await new Promise((r) => setTimeout(r, 8000));
    router.push(`${ROUTES.COURSE}/f0d51345-ed73-4795-a405-9437de2bc33b`);
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    const schedule = (fn: () => void, ms: number) => { const t = setTimeout(() => { if (!cancelled) fn(); }, ms); return t; };

    const timers = [
      schedule(() => setActiveStep(0), 0),
      schedule(() => setActiveStep(1), 1200),
      schedule(() => setActiveStep(2), 2400),
      schedule(() => setActiveStep(3), 3600),
      schedule(() => setFilmActive(true), 3000),
    ];

    const end = schedule(() => {
      router.push(`${ROUTES.COURSE}/f0d51345-ed73-4795-a405-9437de2bc33b`);
    }, 8000);

    return () => { cancelled = true; [...timers, end].forEach(clearTimeout); };
  }, [router]);

  const stepState = (i: number): StepState => {
    if (i < activeStep) return "done";
    if (i === activeStep) return "active";
    return "idle";
  };

  return (
    <div style={{
      position: "relative", height: "100dvh", overflow: "hidden",
      background: "var(--bg)", display: "flex", flexDirection: "column",
    }}>
      {/* blob bg */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", opacity: 0.2 }}>
        {[{c:"#E8DFC8",x:-60,y:-40,s:240,d:0},{c:"#DCD3BD",x:200,y:300,s:220,d:1.2},{c:"#EFEBE1",x:260,y:-20,s:180,d:0.6}].map((b,i)=>(
          <div key={i} style={{ position:"absolute", left:b.x, top:b.y, width:b.s, height:b.s, borderRadius:"60% 40% 50% 50%/50% 60% 40% 50%", background:b.c, filter:"blur(28px)", animation:`tt-blob 12s ease-in-out ${b.d}s infinite` }}/>
        ))}
      </div>

      {/* top bar */}
      <div style={{ position:"relative", zIndex:2, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"18px 20px 0" }}>
        <div>
          <h1 style={{ margin:0, fontFamily:"var(--f-head)", fontSize:18, fontWeight:500, color:"var(--text)", letterSpacing:"-0.025em" }}>
            Preparing your course
          </h1>
          <p style={{ margin:"2px 0 0", fontSize:11, color:"var(--text-3)", fontFamily:"var(--f-body)" }}>
            {genStatus === "error" ? "Something went wrong" : "AI pipeline running…"}
          </p>
        </div>
        <button onClick={() => router.push(ROUTES.CHAT)} style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 11px", borderRadius:999, background:"var(--surface)", border:"1px solid var(--border)", color:"var(--text-2)", fontSize:11, fontWeight:500, cursor:"pointer", fontFamily:"var(--f-body)" }}>
          <svg viewBox="0 0 24 24" fill="none" width={10} height={10}><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          Back
        </button>
      </div>

      {/* main grid */}
      <div style={{ position:"relative", zIndex:2, flex:1, display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, padding:"14px 20px 20px", minHeight:0, overflow:"hidden" }}>

        {/* LEFT — course pipeline */}
        <motion.div
          initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.4 }}
          style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:20, padding:"16px 14px", display:"flex", flexDirection:"column", gap:0, overflow:"hidden" }}
        >
          {/* header */}
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
            <div style={{ width:32, height:32, borderRadius:10, background:"linear-gradient(135deg,#1c1917,#292524)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <svg viewBox="0 0 24 24" fill="none" width={16} height={16}>
                <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" stroke="#B89968" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:"var(--text)", fontFamily:"var(--f-body)" }}>Course Pipeline</div>
              <div style={{ fontSize:10, color:"var(--text-3)", fontFamily:"var(--f-body)" }}>Knowledge → Curriculum</div>
            </div>
          </div>

          {/* steps */}
          <div style={{ display:"flex", flexDirection:"column" }}>
            {PIPELINE_STEPS.map((s, i) => (
              <PipelineStep key={s.label} logo={s.logo} label={s.label} detail={s.detail} state={stepState(i)} isLast={i === PIPELINE_STEPS.length - 1} />
            ))}
          </div>
        </motion.div>

        {/* RIGHT — filmmaker agent */}
        <motion.div
          initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.4, delay:0.1 }}
          style={{
            background:"var(--surface)",
            border: `1px solid ${filmActive ? "rgba(234,179,8,0.4)" : "var(--border)"}`,
            borderRadius:20, padding:"16px 14px", display:"flex", flexDirection:"column", gap:10,
            overflow:"hidden", transition:"border-color 0.5s",
          }}
        >
          {/* agent header */}
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{
              width:32, height:32, borderRadius:10, flexShrink:0,
              background: filmActive ? "linear-gradient(135deg,#92400e,#d97706)" : "linear-gradient(135deg,#1c1917,#292524)",
              display:"flex", alignItems:"center", justifyContent:"center",
              transition:"background 0.5s",
            }}>
              <svg viewBox="0 0 24 24" fill="none" width={16} height={16}>
                <rect x="2" y="7" width="20" height="15" rx="2" stroke="white" strokeWidth="1.5"/>
                <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" stroke="white" strokeWidth="1.5"/>
                <circle cx="12" cy="14" r="2" fill="white" opacity="0.8"/>
              </svg>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:600, color:"var(--text)", fontFamily:"var(--f-body)" }}>Filmmaker Agent</div>
              <div style={{ fontSize:10, color:"var(--text-3)", fontFamily:"var(--f-body)" }}>Curriculum → Video</div>
            </div>
            <AnimatePresence>
              {filmActive && (
                <motion.div initial={{ opacity:0, scale:0.8 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0 }}
                  style={{ padding:"3px 8px", borderRadius:999, background:"rgba(234,179,8,0.12)", border:"1px solid rgba(234,179,8,0.35)", fontSize:9, fontWeight:700, color:"#D97706", fontFamily:"var(--f-body)", letterSpacing:"0.08em" }}>
                  RUNNING
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* powered by */}
          <div style={{ display:"flex", gap:6 }}>
            {[
              { logo:<CodexLogo size={14}/>, name:"Codex" },
              { logo:<OpenAILogo size={14}/>, name:"GPT-5" },
            ].map(b => (
              <div key={b.name} style={{ display:"flex", alignItems:"center", gap:5, padding:"3px 8px", borderRadius:999, background:"var(--bg)", border:"1px solid var(--border)", fontSize:10, color:"var(--text-2)", fontFamily:"var(--f-body)", fontWeight:500 }}>
                {b.logo} {b.name}
              </div>
            ))}
          </div>

          {/* separator */}
          <div style={{ height:1, background:"var(--border)", margin:"0 -2px" }}/>

          <div style={{ fontSize:9, fontWeight:600, color:"var(--text-3)", letterSpacing:"0.12em", textTransform:"uppercase", fontFamily:"var(--f-body)" }}>
            Tools
          </div>

          {/* tools */}
          <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
            <AgentTool logo={<GradiumLogo size={28}/>} label="Text-to-Speech" desc="Gradium AI · Neural voice synthesis" active={filmActive}/>
            <AgentTool logo={<FalLogo size={28}/>} label="Scene Generation" desc="FAL · Cinematic image & video AI" active={filmActive}/>
            <AgentTool
              logo={
                <svg width={28} height={28} viewBox="0 0 32 32" fill="none">
                  <rect width="32" height="32" rx="8" fill="#374151"/>
                  <text x="16" y="22" textAnchor="middle" fontSize="10" fontWeight="700" fill="white" fontFamily="monospace">ff</text>
                </svg>
              }
              label="Video Assembly"
              desc="ffmpeg · Scene stitching & subtitles"
              active={filmActive}
            />
          </div>
        </motion.div>
      </div>

      {/* error */}
      <AnimatePresence>
        {genStatus === "error" && (
          <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
            style={{ position:"relative", zIndex:2, display:"flex", gap:10, padding:"0 20px 20px" }}>
            <button onClick={() => profile && void runGeneration(profile)} disabled={!profile}
              style={{ flex:1, height:48, borderRadius:24, border:"none", background:"linear-gradient(180deg,#1F1B14 0%,#0B0907 100%)", color:"#FAF7F0", fontFamily:"var(--f-body)", fontWeight:600, fontSize:14, cursor:"pointer" }}>
              Retry
            </button>
            <button onClick={() => router.push(ROUTES.CHAT)}
              style={{ flex:1, height:48, borderRadius:24, border:"1px solid var(--border-strong)", background:"transparent", color:"var(--text)", fontFamily:"var(--f-body)", fontWeight:500, fontSize:14, cursor:"pointer" }}>
              Back
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
