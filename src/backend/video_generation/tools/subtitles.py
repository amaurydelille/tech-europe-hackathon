"""Build and render subtitle cues from speech entries.

The Gradium TTS endpoint returns text segments with timestamps (typically
word-level). We turn those into compact readable cues and render each as a
transparent PNG that `stitch` overlays onto the video at the right time.

We render PNGs ourselves rather than relying on ffmpeg's `subtitles=` / `ass`
filter because the system ffmpeg here is not built with libass / libfreetype.
A single `overlay` filter (which is always available) plus a small Pillow
render covers the same ground.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from .validate_script import SpeechEntry

# Cue grouping limits. Tuned for 9:16 portrait at ~15-second narration density.
MAX_CUE_CHARS = 36
MAX_CUE_DURATION = 2.5  # seconds

# Visual style.
FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/Library/Fonts/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]


@dataclass
class Cue:
    start: float  # absolute seconds in final video
    end: float
    text: str


def build_cues(speeches: list[SpeechEntry]) -> list[Cue]:
    """Group word-level timestamps into compact readable cues.

    Every speech entry must carry timestamps (validated upstream by
    `validate_script`). We do not synthesize a fake whole-line cue for entries
    without timestamps — that would silently mask an upstream bug.
    """
    cues: list[Cue] = []
    for s in speeches:
        if not s.timestamps:
            raise ValueError(
                f"speech entry has no timestamps: '{s.text}'. "
                f"Copy the `timestamps` array from gen_tts output into the script."
            )
        ts = sorted(s.timestamps, key=lambda t: t.start)
        cur_start: float | None = None
        cur_end: float | None = None
        cur_words: list[str] = []
        for t in ts:
            word = t.text.strip()
            if not word:
                continue
            tentative = " ".join([*cur_words, word])
            duration_so_far = (t.end - cur_start) if cur_start is not None else 0
            if cur_words and (len(tentative) > MAX_CUE_CHARS or duration_so_far > MAX_CUE_DURATION):
                cues.append(
                    Cue(
                        start=s.start + cur_start,
                        end=s.start + cur_end,
                        text=" ".join(cur_words),
                    )
                )
                cur_words = [word]
                cur_start = t.start
                cur_end = t.end
            else:
                if cur_start is None:
                    cur_start = t.start
                cur_words.append(word)
                cur_end = t.end
        if cur_words:
            cues.append(
                Cue(
                    start=s.start + (cur_start or 0.0),
                    end=s.start + (cur_end or 0.0),
                    text=" ".join(cur_words),
                )
            )
    return sorted(cues, key=lambda c: c.start)


def _find_font_path() -> str | None:
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            return p
    return None


def _wrap_text(text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    words = text.split()
    if not words:
        return [""]
    lines: list[str] = []
    cur: list[str] = []
    for w in words:
        trial = " ".join([*cur, w])
        if font.getlength(trial) <= max_width or not cur:
            cur.append(w)
        else:
            lines.append(" ".join(cur))
            cur = [w]
    if cur:
        lines.append(" ".join(cur))
    return lines


def render_cue_png(cue: Cue, out_path: Path, video_w: int, video_h: int) -> tuple[int, int]:
    """Render one cue as a transparent RGBA PNG sized to fit the text.

    Returns (png_width, png_height).
    """
    font_path = _find_font_path()
    font_size = max(20, int(round(video_h * 0.04)))
    font = (
        ImageFont.truetype(font_path, font_size)
        if font_path
        else ImageFont.load_default()
    )

    pad_x = max(12, font_size // 2)
    pad_y = max(8, font_size // 3)
    line_spacing = max(4, font_size // 4)
    max_text_width = max(100, video_w - 2 * pad_x - 40)

    lines = _wrap_text(cue.text, font, max_text_width)
    line_metrics = [font.getbbox(line) for line in lines]
    line_widths = [m[2] - m[0] for m in line_metrics]
    line_height = font.getbbox("Mg")[3] - font.getbbox("Mg")[1]

    box_w = max(line_widths) + 2 * pad_x
    box_h = len(lines) * line_height + (len(lines) - 1) * line_spacing + 2 * pad_y

    img = Image.new("RGBA", (box_w, box_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # Semi-transparent backdrop for readability.
    draw.rounded_rectangle(
        (0, 0, box_w - 1, box_h - 1),
        radius=max(6, font_size // 4),
        fill=(0, 0, 0, 160),
    )
    y = pad_y
    for line, w in zip(lines, line_widths):
        x = (box_w - w) // 2
        draw.text(
            (x, y),
            line,
            font=font,
            fill=(255, 255, 255, 255),
            stroke_width=max(1, font_size // 14),
            stroke_fill=(0, 0, 0, 255),
        )
        y += line_height + line_spacing

    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path)
    return box_w, box_h
