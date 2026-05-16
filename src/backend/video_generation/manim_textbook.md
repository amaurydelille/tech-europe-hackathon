# Manim for animated math & CS diagrams

This is the textbook for using **Manim Community Edition (`manim==0.20.x`)** as one of the visual sources in this video pipeline. It is opinionated — only the subset of Manim you need is documented here. Read this end-to-end the first time you author a Manim shot in a run; consult sections by header after that.

## When to use Manim (vs the other visual tools)

| Use Manim for | Use `gen_image` + `animate_image` for | Use `gen_video` for |
|---|---|---|
| Equations being derived step by step | Establishing shots, portraits, atmospheric stills | Real motion an animated still can't fake |
| Vectors / matrices / softmax / dot products with explicit numbers | Maps, diagrams that are essentially static | Cinema-worthy beats with continuous motion |
| Boxes, arrows, graphs whose **structure** is the point | Anything where photorealism matters | Crowds, water, gestures |
| Showing how a value flows through a computation | Lesson topics where the imagery is the world | When the "punch" is movement |

Rule of thumb: **if the visual is essentially a labeled diagram that animates**, use Manim. If it's pictorial, use the other two.

A typical math/CS run uses **2–4 Manim shots** interleaved with `animate_image` establishing shots and one or two `gen_video` cinematic beats. Don't try to do an entire lesson in Manim — pure diagram videos feel like a slideshow.

## Hard format requirements

**Every Manim scene file in this project must start with this block** (vertical 9:16, matching the rest of the pipeline):

```python
from manim import config

config.background_color = "#0e0e10"
config.pixel_width = 1080
config.pixel_height = 1920
config.frame_width = 9.0
config.frame_height = 16.0
```

If you forget this, you get a landscape 1920×1080 default and the shot is unusable in our portrait pipeline.

The `frame_width`/`frame_height` values set the scene's **logical coordinate system**, independent of pixel size. With 9×16, the scene runs from `(-4.5, -8)` at bottom-left to `(+4.5, +8)` at top-right. Use this when positioning:

- `UP * 7` → near the top
- `DOWN * 7` → near the bottom
- `LEFT * 4` / `RIGHT * 4` → near the side edges
- `ORIGIN` → dead center
- Stay inside ±7 vertical and ±4 horizontal so nothing clips.

## No LaTeX — use `Text` with Unicode

This project does not ship a LaTeX install. **`Tex` and `MathTex` will fail.** Use plain `Text(...)` and write math with Unicode characters. The Fraunces / default font renders all the symbols you need:

| Concept | Use |
|---|---|
| Subscript | Unicode: `xᵢ`, `xⱼ`, `x₁`, `x₂` (or fall back to `x_i`) |
| Superscript / transpose | `Kᵀ`, `x²`, `x³`, `eˣ` |
| Multiplication | `·` (middot, U+00B7) |
| Division | `/` or `÷` |
| Square root | `√` |
| Sum / product | `Σ`, `Π` |
| Greek | `α β γ δ ε ζ η θ λ μ π σ φ ω` |
| Arrows | `→`, `⇒`, `↦` |
| Set | `∈`, `∉`, `⊂`, `∪`, `∩` |
| Compare | `≤`, `≥`, `≠`, `≈` |
| Misc | `∞`, `∇`, `∂`, `∀`, `∃` |

Examples:

```python
Text("softmax(Q · Kᵀ / √d)", font_size=28)
Text("L = -Σᵢ yᵢ log ŷᵢ", font_size=28)
Text("∂L/∂w = 0", font_size=32)
```

If you really need a stacked fraction or integral that Unicode can't fake, render the formula in a single line with `/` and parentheses — don't try to draw a fraction bar.

## The primitives you'll use

You only need a handful of mobjects. Avoid reaching for fancier ones.

| Class | Purpose | Key kwargs |
|---|---|---|
| `Text` | All text and math | `font_size`, `color`, `weight` (`"NORMAL"` / `"BOLD"`) |
| `Rectangle` | Box around a token, matrix cell, label | `width`, `height`, `color`, `stroke_width`, `fill_opacity` |
| `Circle` | Nodes (graphs, neurons) | `radius`, `color`, `stroke_width` |
| `Line` | Connections, arrows | `color`, `stroke_width` — *prefer this over `Arrow`* (the arrowhead looks weird at thin strokes) |
| `Arrow` | When you genuinely need a head | `buff`, `stroke_width` |
| `VGroup` | Collection of mobjects you treat as one | — |
| `MathTable` / `Table` | **Avoid** — bug-prone; build tables with `VGroup`s of `Rectangle`+`Text` |

`VGroup` is the workhorse. Build a row of token boxes by grouping `Rectangle`+`Text` pairs and calling `.arrange(RIGHT, buff=0.15)` on the outer group:

```python
def token_box(text: str, color=WHITE):
    box = Rectangle(width=1.3, height=0.9, color=color, stroke_width=2)
    label = Text(text, font_size=28, color=color).move_to(box.get_center())
    return VGroup(box, label)

tokens = VGroup(*[token_box(t) for t in ["The", "cat", "sat"]])
tokens.arrange(RIGHT, buff=0.15).move_to(UP * 5)
```

## Layout: `arrange` → `next_to` → `move_to`

Three positioning tools, used in this order:

1. **`.arrange(direction, buff=...)`** — lay siblings out in a line. `direction` is `RIGHT`, `DOWN`, etc; `buff` is the gap in scene units.
2. **`.next_to(target, direction, buff=...)`** — pin one mobject relative to another (a label above a box, weights below a key, etc).
3. **`.move_to(point)`** — absolute placement of the *whole group*, last. `point` is e.g. `UP * 5.5` or `np.array([0, 5.5, 0])`.

Order matters: arrange the inner structure, then place the assembled group. If you `move_to` first and then `arrange`, the arrange will re-center the group at origin.

`.next_to` happens at call time, not at animation time. If you later move a target with `.animate`, labels do not follow. Either re-position them in a follow-up animation, or build the label as part of the same `VGroup` so they move together.

## Animation verbs

Use these and only these — they cover everything.

| Verb | What it does |
|---|---|
| `FadeIn(m, shift=DOWN*0.3)` | Fade in, optionally drifting from a direction |
| `FadeOut(m, shift=UP*0.5)` | Reverse |
| `Write(m)` | Hand-draw text/strokes letter-by-letter — use for titles, formulas |
| `Create(m)` | Draw shapes/lines from one end to the other |
| `Transform(a, b)` | Morph `a` into `b` (mutates `a`; `b` is discarded). Use when a formula evolves: `Transform(formula, new_formula)` |
| `ReplacementTransform(a, b)` | Like `Transform` but keeps `b`. Use this when you'll reference `b` later. |
| `Indicate(m)` | Brief scale + color pulse — emphasis |
| `m.animate.set_color(BLUE).set_stroke(width=4)` | Animate property changes. Chain methods. |
| `self.wait(t)` | Hold for `t` seconds. Use 0.4–1.0 between beats. |

**Parallel animations**: pass multiple verbs to one `self.play`:

```python
self.play(
    *[FadeIn(b, shift=DOWN * 0.3) for b in boxes],
    Write(title),
    run_time=1.0,
)
```

The whole call takes `run_time` seconds. Without `run_time`, defaults to 1s.

**`self.play(verb1)` followed by `self.play(verb2)` is sequential**, so they don't overlap. Two beats are usually clearer than one busy one.

## Each animation costs real wall-clock time

Manim renders frame-by-frame in software. Empirically on this machine:

- **Low quality** (`-ql`, 15 fps): ≈ 0.5 s wall-clock per animation, ≈ 0.5 s per second of finished video.
- **Medium quality** (`-qm`, 30 fps): ≈ 0.7 s wall-clock per animation, ≈ 0.8 s per second of finished video.

So a scene with 22 animations and ~20 s of footage costs ~10 s at `-ql` and ~16 s at `-qm`. A scene with 60 animations costs ~30 s at `-ql` — that adds up fast across regenerations.

Two implications:

1. **Be sparing with animations.** Combine related moves into one `self.play(*[...])` call rather than chaining many. A single parallel play of 10 `FadeIn`s costs roughly the same as one animation; 10 separate plays cost 10×.
2. **Iterate at `-ql`, render the final at `-qm`.** Don't waste seconds on quality you'll discard. Only switch to `-qm` once the scene plays correctly end-to-end.

## Phase structure

A clear Manim shot is built out of phases. Between phases, **fade the previous phase out** before introducing the next, or things crowd the frame:

```python
# Phase 1: title
self.play(Write(title), FadeIn(subtitle))
self.wait(1.0)
self.play(FadeOut(VGroup(title, subtitle)))

# Phase 2: token row appears
self.play(*[FadeIn(b, shift=DOWN * 0.3) for b in boxes])
self.wait(0.4)

# Phase 3: derivation
# ...
```

Concrete phase template for a "compute X from Y" explainer:

1. **Title card** (1.0s) — what the shot is about.
2. **Setup** (1–2s) — show the inputs (tokens, vectors, a matrix).
3. **Operation** (3–5s) — draw the lines/arrows that perform the computation. Animate connections appearing with `Create`.
4. **Result** (1–2s) — the numbers/output, with `Write` or `FadeIn`.
5. **Punchline equation** (2–3s) — single-line formula at the bottom summarizing what just happened.

Aim for **15–25 seconds total** per Manim shot. Longer than that and the diagram is doing too much; split it into two shots with a quick `animate_image` cut between.

## Worked example (the one we ship)

A self-attention "query attends to keys" shot, ~20s total:

```python
from manim import (
    Scene, VGroup, Rectangle, Text, Line, Write, FadeIn, FadeOut, Create, Transform,
    UP, DOWN, LEFT, RIGHT, ORIGIN, BLUE, GREEN, YELLOW, RED, WHITE, GREY, config,
)

config.background_color = "#0e0e10"
config.pixel_width = 1080
config.pixel_height = 1920
config.frame_width = 9.0
config.frame_height = 16.0

TOKENS = ["The", "cat", "sat", "on", "the", "mat"]
QUERY_IDX = 1
WEIGHTS = [0.05, 0.15, 0.35, 0.08, 0.07, 0.30]


def token_box(text, color=WHITE, w=1.3, h=0.9):
    box = Rectangle(width=w, height=h, color=color, stroke_width=2)
    label = Text(text, font_size=28, color=color).move_to(box.get_center())
    return VGroup(box, label)


class AttentionScene(Scene):
    def construct(self):
        # Phase 1: title
        title = Text("Self-Attention", font_size=64, weight="BOLD")
        subtitle = Text("how a token decides what to look at", font_size=28, color=GREY)
        subtitle.next_to(title, DOWN, buff=0.3)
        group = VGroup(title, subtitle).move_to(ORIGIN)
        self.play(Write(title), FadeIn(subtitle))
        self.wait(1.0)
        self.play(FadeOut(group))

        # Phase 2: token row
        boxes = VGroup(*[token_box(t) for t in TOKENS]).arrange(RIGHT, buff=0.15).move_to(UP * 5.5)
        self.play(*[FadeIn(b, shift=DOWN * 0.3) for b in boxes])

        # Phase 3: pick the query
        q_label = Text("query", font_size=24, color=BLUE).next_to(boxes[QUERY_IDX], UP, buff=0.25)
        self.play(
            boxes[QUERY_IDX][0].animate.set_color(BLUE).set_stroke(width=4),
            boxes[QUERY_IDX][1].animate.set_color(BLUE),
            Write(q_label),
        )

        # Phase 4: keys row
        keys = VGroup(*[token_box(t, color=GREEN) for t in TOKENS]).arrange(RIGHT, buff=0.15).move_to(UP * 1.5)
        self.play(*[FadeIn(k, shift=UP * 0.3) for k in keys])

        # Phase 5: dot-product arrows (thickness ∝ weight)
        for i, w in enumerate(WEIGHTS):
            stroke = 1 + 10 * w
            arr = Line(
                boxes[QUERY_IDX][0].get_bottom(),
                keys[i][0].get_top(),
                color=YELLOW, stroke_width=stroke,
            ).set_opacity(0.25 + 0.7 * w / max(WEIGHTS))
            self.add(arr)
        self.wait(0.4)

        # Phase 6: softmax weights below each key
        formula = Text("weights = softmax(Q · Kᵀ / √d)", font_size=28, color=YELLOW).move_to(DOWN * 0.5)
        self.play(Write(formula))
        wlabels = VGroup(*[
            Text(f"{w:.2f}", font_size=22, color=YELLOW).next_to(keys[i], DOWN, buff=0.2)
            for i, w in enumerate(WEIGHTS)
        ])
        self.play(*[FadeIn(t, shift=DOWN * 0.1) for t in wlabels])

        # Phase 7: punchline
        eq = Text("Attention(Q,K,V) = softmax(QKᵀ/√d) · V", font_size=26).move_to(DOWN * 7)
        self.play(Write(eq))
        self.wait(2.0)
```

Renders in ~30 s at low quality. Tweak `WEIGHTS` and `TOKENS` to match the actual content of the narration line that plays over this shot.

## Rendering

Use the wrapper tool:

```
uv run python -m backend.video_generation.tools.gen_manim \
    --scene-file assets/manim/attention.py \
    --scene-class AttentionScene \
    --quality low \
    --out assets/video/vNNN.mp4
```

The tool runs Manim, finds the output, copies it to `--out`, and prints `{path, duration}` JSON like the other generators.

- `--quality low` (`-ql`, 15 fps) renders in seconds — use during iteration.
- `--quality medium` (`-qm`, 30 fps) for the final pass.
- Don't go higher than medium; the bottleneck for our format is the 1080×1920 portrait, not framerate.

The scene file lives under `assets/manim/<name>.py` (the directory exists in the workspace). Each scene file should contain exactly one `Scene` subclass.

After the tool returns, treat the output `.mp4` like any other video shot — add a `video` entry to `script.json` with the returned duration.

## Pitfalls

1. **Forgot the portrait config block.** Output is landscape; the shot is unusable. Always start every scene file with the block.
2. **Used `Tex` or `MathTex`.** Will crash because LaTeX isn't installed. Use `Text` with Unicode.
3. **No `FadeOut` between phases.** The frame fills up with overlapping content. Always clear the previous phase (or part of it) before adding the next.
4. **`.next_to` after `.animate.move_to`.** The label doesn't follow. Either re-pin it or group the label with the target.
5. **Used `Arrow` for thin connections.** The arrowhead is enormous relative to a `stroke_width=2` line. Use `Line` for connections; reserve `Arrow` for genuinely arrow-shaped diagrams.
6. **`run_time` is per `play` call, not per animation.** Multiple animations inside one `play` finish together at `run_time`. To stagger, use multiple `play` calls with `wait`s between.
7. **Pacing too fast.** Default 1s `run_time` is fine for a single animation; a sequence of 6 animations without `wait`s between them reads as a blur. Add `self.wait(0.3)`–`self.wait(0.6)` between phases.
8. **Tried to render at high quality during iteration.** 4K renders are minutes. Use `-ql` until the scene is right, then bump to `-qm` for the final pass.
9. **Placed content past ±7 vertical or ±4 horizontal.** It clips on the portrait frame. Stay inside the safe area.

## Outside this textbook

If you genuinely need something not covered here — 3D scenes, plots from data, ValueTrackers, complex graph layouts — read the Manim CE docs at `docs.manim.community`. But 95% of math/CS explainer shots are covered by the primitives above; reach for advanced features only when the diagram demands them.
