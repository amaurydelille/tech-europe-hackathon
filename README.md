# Kheiron — the most tailored tutor ever


> Speak to an AI tutor, get a personalized video lesson.

Kheiron is an end-to-end AI tutor. A user has a short voice conversation with a tutor agent, which collects who they are and what they want to learn. From that profile, the system builds a research-grounded course, then turns it into a narrated, vertical (9:16) video with synchronized subtitles — ready to watch in-app like a TikTok-style lesson.

Three pipelines power the experience:

1. **Voice onboarding** — real-time STT → LLM agent → TTS loop over a WebSocket.
2. **Course generation** — LLM-built search query → Tavily web search → GLiNER2 entity-density filter → GPT-5.5 narrative + condensed scripts with inline citations.
3. **Video generation** — a Codex-driven director agent writes a timestamped script, generates anchor images (Seedream), animates them or shoots real motion (Seedance), narrates with Gradium TTS, and stitches the final MP4 + SRT with ffmpeg.

<img width="1710" height="900" alt="image" src="https://github.com/user-attachments/assets/f6ab68b3-5c6f-40e8-b0ed-0f080cab217d" />

---

## Repository layout

```
.
├── pyproject.toml                # Python (uv) project
├── src/
│   ├── backend/
│   │   ├── main.py               # FastAPI app: REST + WebSocket entry points
│   │   ├── onboarding/           # Voice onboarding agent (STT/TTS/agent loop)
│   │   ├── task_to_class/        # Profile → course pipeline (Tavily + GLiNER2 + GPT)
│   │   └── video_generation/     # Codex-driven director, tools, ffmpeg stitcher
│   └── frontend/                 # Next.js 16 app (App Router, React 19, Tailwind 4)
└── EXAMPLE_LESSON.md             # Sample lesson markdown
```

---

## Stack at a glance

### Backend (Python ≥ 3.12, managed with `uv`)

| Capability | Tool / API |
|---|---|
| HTTP + WebSocket server | **FastAPI** + **uvicorn** |
| LLM agent runtime (voice tutor) | **`openai-agents`** SDK |
| Course writer / query builder | **OpenAI Chat Completions** (`gpt-4o`, `gpt-5.5-2026-04-23`) |
| Real-time voice (STT + TTS + agent voice) | **Gradium** (`gradium` SDK) |
| Web search for course sources | **Tavily** (`tavily-python`) |
| Source relevance filter (entity density) | **GLiNER2** (`gliner2[local]`, MPS) |
| Image generation (anchors + per-shot stills) | **FAL.ai** — Seedream 4 (text-to-image & edit) |
| Video generation (real motion shots) | **FAL.ai** — Seedance 2.0 (image-to-video) |
| Director agent (orchestrates the video) | **Codex CLI** (`codex exec`) |
| Final mux, audio mix, subtitles, Ken-Burns animation | **ffmpeg** |

### Frontend (`src/frontend`)

| Capability | Tool |
|---|---|
| Framework | **Next.js 16** (App Router, Turbopack) |
| UI | **React 19**, **Tailwind CSS v4**, **Framer Motion** |
| Math rendering (LaTeX in lessons) | **KaTeX** + `react-katex` |
| QR codes (handoff to mobile) | `qrcode.react` |
| Voice capture | Web Audio API + `AudioWorklet` (`public/pcm-worklet.js`) at 24 kHz PCM |

> ⚠️ The frontend uses **Next.js 16** — APIs and conventions may differ from older versions. See `src/frontend/AGENTS.md`.

---

## Prerequisites

Install the following before bootstrapping:

- **Python ≥ 3.12** and **[uv](https://docs.astral.sh/uv/)**
- **Node.js ≥ 20** and **npm**
- **ffmpeg** (must be on `PATH` — `ffmpeg -version`)
- **[Codex CLI](https://github.com/openai/codex)** (`codex` must be on `PATH` — used by the video director)
- **macOS with Apple Silicon recommended** — GLiNER2 is loaded on the `mps` device for source validation. On other platforms, edit `src/backend/task_to_class/validator.py` to use `cpu` or `cuda`.

### API keys

Create a `.env` at the repository root:

```bash
OPENAI_API_KEY=sk-...        # OpenAI (course writing + onboarding agent)
GRADIUM_API_KEY=...          # Gradium (STT + TTS, voice onboarding & narration)
TAVILY_API_KEY=...           # Tavily (web search for course sources)
FAL_KEY=...                  # fal.ai (Seedream images + Seedance video)
```

`GRADIUM_KEY` is accepted as a fallback for `GRADIUM_API_KEY`.

---

## Setup & installation

```bash
# 1. Backend deps (creates .venv automatically)
uv sync

# 2. Frontend deps
cd src/frontend && npm install && cd -

# 3. Sanity-check external tools
ffmpeg -version
codex --version
```

---

## Running the app

You need **two** processes: the FastAPI backend (port 8000) and the Next.js frontend (port 3000).

### 1. Start the backend

```bash
uv run uvicorn backend.main:app --reload --port 8000
```

Exposes:

- `POST /courses/generation` — JSON body matching the onboarding profile. Returns the generated course (full + condensed markdown, references, suggested next chapter). Triggers video generation in the background.
- `POST /video/generation` — kicks off video generation from the last course output stored in `src/backend/output/course_output.json`. Returns `202 Accepted`.
- `WebSocket /ws/onboarding` — real-time voice onboarding (see protocol below).

### 2. Start the frontend

```bash
cd src/frontend
npm run dev
```

Open <http://localhost:3000>. Root (`/`) redirects to `/onboarding`.

Frontend reads two env vars (both optional, defaults shown):

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_ONBOARDING_WS=ws://localhost:8000/ws/onboarding
```

### 3. (Optional) Direct CLI video generation

```bash
uv run python -m backend.video_generation.run path/to/lesson.md \
    --out-dir ./out --duration 30
```

This bypasses the API and runs the Codex director directly against any markdown lesson (e.g. `EXAMPLE_LESSON.md`).

---

## End-to-end flow

```
┌────────────────────┐    voice    ┌──────────────────────┐
│  Next.js frontend  │ ──────────► │  /ws/onboarding (WS) │
│  /onboarding       │ ◄────────── │  Gradium STT/TTS     │
└─────────┬──────────┘   profile   │  OpenAI Agents SDK   │
          │                        └──────────────────────┘
          │ POST /courses/generation { profile }
          ▼
┌────────────────────────────────────────────────────────────┐
│  task_to_class pipeline                                     │
│  GPT-4o → Tavily search → GLiNER2 filter → GPT-5.5 writer   │
│  → course_output.json (full_md, condensed_md, refs, next)   │
└─────────┬──────────────────────────────────────────────────┘
          │ background_task → POST /video/generation
          ▼
┌────────────────────────────────────────────────────────────┐
│  video_generation                                           │
│  codex exec (director agent)                                │
│   ├─ tools/gen_image.py    (Seedream — anchors + stills)    │
│   ├─ tools/animate_image.py(ffmpeg Ken-Burns)               │
│   ├─ tools/gen_video.py    (Seedance — real motion clips)   │
│   ├─ tools/gen_tts.py      (Gradium TTS + timestamps)       │
│   └─ tools/stitch.py       (ffmpeg mux → final.mp4 + .srt)  │
└────────────────────────────────────────────────────────────┘
```

---

## API reference

### `POST /courses/generation`

Generates a course from an onboarding profile. Side-effect: writes `src/backend/output/course_output.json` and triggers video generation in the background.

**Request** (`application/json`):

```json
{
  "name": "Sofia",
  "age": 16,
  "subject": "Crossing the Rubicon",
  "prior_knowledge": "knows Caesar existed, not much else",
  "learning_goal": "understand why it was a turning point",
  "content_style": "narrative storytelling with key dates"
}
```

**Response** (`200 OK`):

```json
{
  "course_title": "Caesar and the Rubicon Crossing",
  "full_markdown": "## Introduction\n…",
  "condensed_markdown": "## …\n### Key Insight\n…",
  "references": [{"id": 1, "title": "…", "url": "https://…"}],
  "next_chapter": "Pompey's Flight and the Civil War"
}
```

### `POST /video/generation`

Starts video generation from the last `course_output.json` (`full_markdown`). Returns `202 Accepted` immediately; the heavy lifting runs in a FastAPI `BackgroundTask`. The finished `final.mp4` + `final.srt` land under `src/backend/output/video/`.

### `WebSocket /ws/onboarding`

Realtime voice interview with the **Kheiron** onboarding agent.

| Direction | Frame type | Meaning |
|---|---|---|
| client → server | binary | 16-bit PCM mono @ 24 kHz mic audio chunks |
| client → server | text JSON `{"type":"stop"}` | terminate session |
| server → client | binary | 16-bit PCM TTS audio chunks (agent voice) |
| server → client | text JSON `{"type":"audio_format","sample_rate":N}` | sent before audio stream starts |
| server → client | text JSON `{"type":"partial_transcript","text":...}` | live STT preview |
| server → client | text JSON `{"type":"user_turn","text":...}` | finalized user turn |
| server → client | text JSON `{"type":"assistant_text","text":...}` | what the agent is about to say |
| server → client | text JSON `{"type":"speech_start" \| "speech_end" \| "speech_interrupted"}` | TTS lifecycle |
| server → client | text JSON `{"type":"done","profile":{...}}` | onboarding complete — `profile` matches the `/courses/generation` request body |
| server → client | text JSON `{"type":"error","message":...}` | unrecoverable error |

Barge-in is supported: when the user starts speaking mid-TTS, the server cancels the in-flight speech and emits `speech_interrupted`.

### Frontend mock routes (Next.js API routes)

`src/frontend/src/app/api/`:

- `GET /api/courses` — lists available mock course IDs (folders under `src/frontend/src/mock/`).
- `GET /api/course/[id]/video` — streams `video.mp4` for a mock course.
- `GET /api/course/[id]/subtitle` — returns `subtitle.srt`.
- `GET /api/course/[id]/sources` — returns `sources.json`.
- `GET /api/course/[id]/socials` — returns `socials.json` (likes/shares/comments mock data).

These exist so the UI can be demoed without running the full generation backend.

---

## Voice onboarding (`src/backend/onboarding/`)

| File | Role |
|---|---|
| `app.py` | FastAPI `WebSocket /ws/onboarding` — bridges client audio ↔ session |
| `session.py` | Orchestrates STT → Agent → TTS loop; handles barge-in, turn timeouts, history |
| `agent.py` | Defines the `Kheiron` agent prompt + `finish_onboarding` tool (`openai-agents` SDK) |
| `gradium_stt.py` | Streaming STT wrapper around `gradium.client.GradiumClient` |
| `gradium_tts.py` | Streaming TTS wrapper |
| `profile.py` | `UserProfile` pydantic model — the 6 onboarding fields |
| `config.py` | Loads env keys, model IDs, VAD thresholds |

The agent must collect `name`, `age`, `subject`, `prior_knowledge`, `learning_goal`, `content_style` and then call `finish_onboarding`. Session caps at 15 user turns; barge-in cancels in-flight TTS so the user never has to talk over the agent.

---

## Course generation (`src/backend/task_to_class/`)

Linear 4-step pipeline (`pipeline.py → run()`):

1. **`query_builder.py`** — `gpt-4o` rewrites the onboarding profile into one optimized Tavily query.
2. **`scraper.py`** — `tavily.search(..., search_depth="advanced", include_raw_content=True)` returns up to 10 raw pages.
3. **`validator.py`** — Each page is chunked (~200 words), passed through **GLiNER2** (labels: `person, event, date, location, organization, concept, battle, country`). Pages with fewer than 3 entities are dropped. Remaining pages are scored as `tavily_score + 0.1 × entity_density` and top-5 kept.
4. **`course_generator.py`** — `gpt-5.5-2026-04-23` produces, in one call, four sections wrapped in sentinel markers:
   - `===COURSE_TITLE_*===`
   - `===FULL_COURSE_*===` — narrative markdown with `[N]` inline citations and (for scientific topics) LaTeX `$$…$$`
   - `===CONDENSED_COURSE_*===` — ~500-word display version with `### Key Insight` callouts
   - `===NEXT_CHAPTER_*===` — suggested follow-up course

Output (`CourseOutput` pydantic model) is saved to `src/backend/output/course_output.json` and POSTed to `/video/generation`.

---

## Video generation (`src/backend/video_generation/`)

The video pipeline is **agent-driven**: a Codex CLI subprocess receives the lesson markdown plus a detailed `instructions.md` and orchestrates the tools below until `final.mp4` and `final.srt` exist.

### Entry point

`run.py:generate_video(lesson_md, out_dir)`:

1. Creates a unique workspace under `tmp/video_generation/<uuid>/` with `inputs/`, `assets/`, `outputs/`.
2. Renders `instructions.md` with the target duration, voice catalog, and inspection guide.
3. Spawns `codex exec --full-auto --add-dir <repo> --cd <workspace>` with the rendered prompt on stdin and `sandbox_workspace_write.network_access=true`.
4. Validates that `outputs/final.mp4` + `outputs/final.srt` exist; copies them to `out_dir` if given.

### Tools the director can invoke (`video_generation/tools/`)

| Tool | Purpose | Backend |
|---|---|---|
| `gen_image.py` | Text-to-image (anchors) or edit (per-shot stills) | FAL.ai — `fal-ai/bytedance/seedream/v4/{text-to-image, edit}` |
| `gen_video.py` | Image-to-video (real motion, 5 s or 10 s, silent) | FAL.ai — `bytedance/seedance-2.0/image-to-video` |
| `animate_image.py` | Ken-Burns animation on a still | ffmpeg only (fast fallback to `gen_video`) |
| `gen_tts.py` | Narration line synthesis + segment-level timestamps | Gradium TTS, with concurrency-error retry |
| `stitch.py` | Validate `script.json`, mux audio/video, write `.srt` | ffmpeg + `subtitles.py` cue builder |
| `validate_script.py` | Pydantic models + invariants for the timestamped script | — |

### Director's contract (excerpt from `instructions.md`)

- One narrator voice for the whole video, picked from `config.json:voices`.
- ≤ 3 anchor references generated up front; every later shot references one.
- Default to `animate_image` on stills; reserve `gen_video` for shots where motion matters (target ~50 % of total duration as configured by `real_video_time_share`).
- Output 9:16, 480 p by default (configurable in `config.json`).
- Every speech entry must carry the verbatim `timestamps` array from `gen_tts` — the SRT subtitle file is built from them.

`config.json` controls voices (`wps` cadence per voice), target duration, real-video share, TTS speed multipliers, and the FAL model IDs.

### Workspace conventions (`workspace.py`)

Each run gets an isolated directory:

```
tmp/video_generation/<uuid>/
├── inputs/lesson.md
├── assets/
│   ├── anchors.json
│   ├── refs/<anchor>.png
│   ├── image/iNNN.png
│   ├── video/vNNN.mp4
│   ├── audio/sNNN.wav
│   └── script.json          # the timestamped storyboard
├── outputs/
│   ├── final.mp4
│   └── final.srt
└── codex.last_message.txt    # agent's terminal log for debugging
```

---

## Frontend (`src/frontend/`)

### Routes

- `/onboarding` — voice onboarding UI; opens the WebSocket, streams mic audio, plays TTS, animates the waveform from amplitude data.
- `/chat` — chat-style entry flow (text fallback).
- `/generate` — progress UI while the pipeline runs.
- `/draft` — full-course markdown preview with KaTeX math, references, "next chapter" CTA.
- `/course/[id]` — vertical TikTok-style video player with synchronized SRT subtitles, scrollable transcript, sources panel, and mock social feed.

### Key modules

| Path | Purpose |
|---|---|
| `src/hooks/useOnboardingVoice.ts` | WebSocket + Web Audio orchestration, amplitude tracking, barge-in handling |
| `src/hooks/useVoiceRecording.ts` | Generic mic capture via `AudioWorklet` (`public/pcm-worklet.js`) |
| `src/hooks/useCourse.ts` | Course data fetching |
| `src/lib/parseCourse.ts` | Parses the LLM-generated markdown into typed blocks (headings, paragraphs, lists, math, citations) |
| `src/lib/courseDraftStore.ts` | Client-side store for the in-progress course |
| `src/services/course.service.ts` | Typed wrapper around the backend HTTP API |
| `src/components/features/course/CourseViewA.tsx` | Vertical video player with SRT-driven captions, KaTeX rendering, scroll progress |

### Mock data

`src/frontend/src/mock/<uuid>/` directories ship with a `video.mp4`, `subtitle.srt`, `data.json`, `sources.json`, and `socials.json` so the course UI can be demoed without running the backend.

---

## Configuration reference

| Variable | Used by | Notes |
|---|---|---|
| `OPENAI_API_KEY` | onboarding agent, query builder, course writer | Required |
| `GRADIUM_API_KEY` (or `GRADIUM_KEY`) | STT, TTS (onboarding + narration) | Required |
| `TAVILY_API_KEY` | course source search | Required for `/courses/generation` |
| `FAL_KEY` | Seedream image gen, Seedance video gen | Required for `/video/generation` |
| `NEXT_PUBLIC_API_URL` | frontend → backend REST | Default `http://localhost:8000` |
| `NEXT_PUBLIC_ONBOARDING_WS` | frontend → backend WebSocket | Default `ws://localhost:8000/ws/onboarding` |

Video & voice tuning live in `src/backend/video_generation/config.json` (resolution, aspect, target duration, real-video share, TTS speed, model IDs, voice catalog with measured words-per-second).

---

## Tests

```bash
uv run pytest                       # excludes tests marked `costly`
uv run pytest -m costly             # tests that hit paid APIs (Seedance, Seedream, Gradium TTS)
```

Tests live under `src/backend/video_generation/tests/`. They cover the script validator, the stitcher's invariants, the ffmpeg helpers, and (when `-m costly`) end-to-end smoke calls against the real video/audio APIs.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `RuntimeError: codex CLI not found on PATH` | Install Codex CLI and ensure `codex --version` works. |
| `RuntimeError: ffmpeg not found on PATH` | Install ffmpeg (`brew install ffmpeg`). |
| GLiNER2 model errors on first call | Initial load downloads `fastino/gliner2-base-v1`. Requires network; on non-Mac change `device="mps"` in `validator.py`. |
| `Concurrency limit exceeded` during TTS | Gradium caps at 3 concurrent WebSocket sessions; `gen_tts.py` already retries — reduce parallelism in the director if it persists. |
| Frontend can't reach backend | Check `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_ONBOARDING_WS` and the FastAPI CORS allowlist (`src/backend/main.py`). |
| `Video generation service triggered` warnings | The course pipeline tries to ping `POST /video/generation` after generation; harmless if the backend isn't yet running. |

---

## Credits

Built at the Tech Europe hackathon. Heavy lifting by:
**OpenAI Agents SDK · OpenAI GPT-4o / GPT-5.5 · Codex CLI · Gradium · Tavily · GLiNER2 (Fastino) · FAL.ai (Seedream + Seedance) · ffmpeg · Next.js · React · Tailwind · Framer Motion · KaTeX**.
