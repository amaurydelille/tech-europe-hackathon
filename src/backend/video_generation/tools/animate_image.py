"""Animate a still image with a slow Ken-Burns-style zoom.

Fast and free alternative to Seedance for shots that do not require true motion.
Output is a regular mp4 that drops straight into a `video` entry in `script.json`.

Optional title overlay: pass `--title "..."` (and an optional `--title-color` hex)
to burn a centered title (Fraunces with a soft drop shadow + dark vignette) on
top of the zoom-animated background. Use this for opening title cards — the
title stays fixed while the image drifts behind it.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from ..config import REPO_ROOT
from ..ffmpeg_utils import probe_duration

FPS = 30

FONT_PATH = REPO_ROOT / "assets" / "fonts" / "Fraunces-VF.ttf"
_HEX_RE = re.compile(r"^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


def _parse_hex(h: str) -> tuple[int, int, int]:
    m = _HEX_RE.match(h.strip())
    if not m:
        raise ValueError(f"invalid hex color: {h!r}")
    s = m.group(1)
    if len(s) == 3:
        s = "".join(c * 2 for c in s)
    return int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16)


def _image_dims(path: Path) -> tuple[int, int]:
    with Image.open(path) as im:
        w, h = im.size
    return w + w % 2, h + h % 2


def _render_title_overlay(
    title: str, out_png: Path, width: int, height: int,
    title_color: tuple[int, int, int], fontsize: int | None,
) -> None:
    """Transparent PNG with a soft dark vignette + centered Fraunces title (with shadow)."""
    fontsize = fontsize or max(min(width, height) // 12, 24)

    # Radial dark vignette as the base alpha.
    cx, cy = width / 2, height / 2
    max_dist = math.hypot(cx, cy)
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    dist = np.clip(np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / max(max_dist, 1.0), 0, 1)
    alpha = ((1.0 - dist) * 0.45 * 255).astype(np.uint8)
    zeros = np.zeros_like(alpha)
    overlay = Image.fromarray(np.dstack([zeros, zeros, zeros, alpha]), mode="RGBA")

    # Wrap title to ~80% of the canvas width.
    font = ImageFont.truetype(str(FONT_PATH), size=fontsize)
    measure = ImageDraw.Draw(overlay)
    max_width = int(width * 0.8)
    lines: list[str] = []
    for paragraph in title.split("\n"):
        current = ""
        for word in paragraph.split():
            cand = f"{current} {word}".strip()
            if measure.textbbox((0, 0), cand, font=font)[2] > max_width and current:
                lines.append(current)
                current = word
            else:
                current = cand
        lines.append(current)

    # Layout: center the block vertically.
    line_spacing = fontsize // 4
    bboxes = [measure.textbbox((0, 0), line, font=font) for line in lines]
    heights = [b[3] - b[1] for b in bboxes]
    widths = [b[2] - b[0] for b in bboxes]
    total_h = sum(heights) + line_spacing * (len(lines) - 1)
    y0 = (height - total_h) // 2

    # Drop shadow: draw offset, then blur.
    shadow_offset = max(fontsize // 14, 2)
    shadow = Image.new("RGBA", overlay.size, (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow)
    y = y0
    for line, lw, lh in zip(lines, widths, heights):
        sdraw.text(
            ((width - lw) // 2 + shadow_offset, y + shadow_offset),
            line, font=font, fill=(0, 0, 0, 200),
        )
        y += lh + line_spacing
    shadow = shadow.filter(ImageFilter.GaussianBlur(max(fontsize // 18, 2)))
    overlay = Image.alpha_composite(overlay, shadow)

    # Foreground title.
    fdraw = ImageDraw.Draw(overlay)
    y = y0
    for line, lw, lh in zip(lines, widths, heights):
        fdraw.text(((width - lw) // 2, y), line, font=font, fill=(*title_color, 255))
        y += lh + line_spacing

    overlay.save(out_png, "PNG")


def animate_image(
    image: Path,
    out: Path,
    duration: float,
    zoom_from: float = 1.0,
    zoom_to: float = 1.2,
    title: str | None = None,
    title_color_hex: str = "#FFFFFF",
    title_fontsize: int | None = None,
) -> dict:
    image = Path(image)
    out = Path(out)
    if not image.is_file():
        raise FileNotFoundError(f"image not found: {image}")
    if duration <= 0:
        raise ValueError("duration must be positive")
    if zoom_to <= zoom_from:
        raise ValueError("zoom_to must be greater than zoom_from")
    if zoom_from < 1.0:
        raise ValueError("zoom_from must be >= 1.0 (cannot zoom out beyond original)")

    width, height = _image_dims(image)
    out.parent.mkdir(parents=True, exist_ok=True)
    total_frames = int(round(duration * FPS))
    z_expr = f"{zoom_from}+({zoom_to}-{zoom_from})*on/{max(total_frames-1, 1)}"
    filter_complex = (
        f"[0:v]zoompan=z='{z_expr}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2'"
        f":d={total_frames}:s={width}x{height}:fps={FPS}"
    )

    has_title = title is not None and title.strip()
    bg_target = out if not has_title else None

    with tempfile.TemporaryDirectory() as tmpdir:
        if has_title:
            bg_target = Path(tmpdir) / "bg.mp4"
        subprocess.run(
            [
                "ffmpeg", "-y", "-loglevel", "error",
                "-loop", "1", "-i", str(image),
                "-filter_complex", filter_complex,
                "-t", f"{duration:.3f}",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", str(FPS),
                str(bg_target),
            ],
            check=True,
        )
        if has_title:
            overlay_png = Path(tmpdir) / "title.png"
            _render_title_overlay(
                title, overlay_png, width, height,
                title_color=_parse_hex(title_color_hex),
                fontsize=title_fontsize,
            )
            subprocess.run(
                [
                    "ffmpeg", "-y", "-loglevel", "error",
                    "-i", str(bg_target), "-i", str(overlay_png),
                    "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    str(out),
                ],
                check=True,
            )

    return {"path": str(out), "duration": probe_duration(out)}


def _main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Animate a still image with a Ken-Burns zoom; optionally overlay a title.",
    )
    parser.add_argument("--image", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--duration", required=True, type=float)
    parser.add_argument("--zoom-from", dest="zoom_from", type=float, default=1.0)
    parser.add_argument("--zoom-to", dest="zoom_to", type=float, default=1.2)
    parser.add_argument("--title", default=None,
                        help="Optional title text to burn on top (use \\n for line breaks).")
    parser.add_argument("--title-color", dest="title_color", default="#FFFFFF",
                        help="Title text color (hex). Default: #FFFFFF.")
    parser.add_argument("--title-fontsize", dest="title_fontsize", type=int, default=None,
                        help="Title font size in pixels (auto if omitted).")
    args = parser.parse_args(argv)

    title = args.title.replace("\\n", "\n") if args.title else None
    result = animate_image(
        image=args.image, out=args.out, duration=args.duration,
        zoom_from=args.zoom_from, zoom_to=args.zoom_to,
        title=title, title_color_hex=args.title_color,
        title_fontsize=args.title_fontsize,
    )
    json.dump(result, sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(_main())
