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
_FONT_DIR = Path(__file__).resolve().parents[1] / "assets" / "fonts"
FRAUNCES_VF = _FONT_DIR / "Fraunces-VF.ttf"

FONT_CANDIDATES = [
    str(FRAUNCES_VF),
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


def _load_font(font_path: str | None, font_size: int) -> ImageFont.ImageFont:
    """Load the subtitle font. If it's the bundled Fraunces variable font,
    lock the weight axis to Bold (700) so it doesn't default to Black.
    """
    if not font_path:
        return ImageFont.load_default()
    font = ImageFont.truetype(font_path, font_size)
    if font_path.endswith("Fraunces-VF.ttf"):
        # Axes order in this VF: Optical Size, Weight, Softness, Wonky.
        # opsz≈font_size matches the font's optical-size design grid.
        opsz = max(9, min(font_size, 144))
        try:
            font.set_variation_by_axes([opsz, 700, 0, 0])
        except Exception:
            pass
    return font


def render_cue_png(cue: Cue, out_path: Path, video_w: int, video_h: int) -> tuple[int, int]:
    """Render one cue as a transparent RGBA PNG sized to fit the text.

    The cartridge is sized to the *actual* rendered glyph bbox so the text is
    visually centred — relying on font line metrics alone leaves an uneven gap
    between glyph caps and the top of the box.

    Returns (png_width, png_height).
    """
    font_path = _find_font_path()
    font_size = max(24, int(round(video_h * 0.052)))
    font = _load_font(font_path, font_size)

    pad_x = max(16, int(font_size * 0.55))
    pad_y = max(10, int(font_size * 0.32))
    line_spacing = max(2, font_size // 6)
    stroke = max(1, font_size // 14)
    max_text_width = max(100, video_w - 2 * pad_x - 40)

    lines = _wrap_text(cue.text, font, max_text_width)
    line_widths = [font.getbbox(line)[2] - font.getbbox(line)[0] for line in lines]

    # 1) render text onto an oversized transparent canvas.
    margin = stroke + max(font_size, 8)
    canvas_w = max(line_widths) + 2 * margin
    canvas_h = len(lines) * font_size + (len(lines) - 1) * line_spacing + 2 * margin
    text_canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    tdraw = ImageDraw.Draw(text_canvas)
    y = margin
    for line, w in zip(lines, line_widths):
        x = (canvas_w - w) // 2
        tdraw.text(
            (x, y),
            line,
            font=font,
            fill=(255, 255, 255, 255),
            stroke_width=stroke,
            stroke_fill=(0, 0, 0, 255),
        )
        y += font_size + line_spacing

    # 2) crop to the actual ink so the cartridge wraps the glyphs evenly.
    ink_bbox = text_canvas.getbbox()
    if ink_bbox is None:
        ink_bbox = (0, 0, canvas_w, canvas_h)
    text_img = text_canvas.crop(ink_bbox)
    text_w, text_h = text_img.size

    # 3) build the cartridge with uniform padding around the cropped glyphs.
    box_w = text_w + 2 * pad_x
    box_h = text_h + 2 * pad_y
    img = Image.new("RGBA", (box_w, box_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle(
        (0, 0, box_w - 1, box_h - 1),
        radius=max(6, font_size // 4),
        fill=(0, 0, 0, 160),
    )
    img.alpha_composite(text_img, (pad_x, pad_y))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path)
    return box_w, box_h
