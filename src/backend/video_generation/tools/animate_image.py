"""Animate a still image with a slow Ken-Burns-style zoom.

Fast and free alternative to Seedance for shots that do not require true motion.
The output is a regular mp4 that drops straight into a `video` entry in
`script.json`.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from ..config import config
from ..ffmpeg_utils import probe_duration

ALLOWED_RESOLUTIONS = {"480p", "720p", "1080p"}
ALLOWED_ASPECTS = {"16:9", "9:16", "1:1"}
FPS = 30


def _canvas(resolution: str, aspect: str) -> tuple[int, int]:
    short = {"480p": 480, "720p": 720, "1080p": 1080}[resolution]
    num, _, den = aspect.partition(":")
    a, b = int(num), int(den)
    if a >= b:
        height = short
        width = round(short * a / b)
    else:
        width = short
        height = round(short * b / a)
    width += width % 2
    height += height % 2
    return width, height


def animate_image(
    image: Path,
    out: Path,
    duration: float,
    zoom_from: float = 1.0,
    zoom_to: float = 1.12,
    resolution: str | None = None,
    aspect: str | None = None,
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
    resolution = resolution or config.resolution
    aspect = aspect or config.aspect
    if resolution not in ALLOWED_RESOLUTIONS:
        raise ValueError(f"resolution must be one of {sorted(ALLOWED_RESOLUTIONS)}")
    if aspect not in ALLOWED_ASPECTS:
        raise ValueError(f"aspect must be one of {sorted(ALLOWED_ASPECTS)}")

    width, height = _canvas(resolution, aspect)
    total_frames = int(round(duration * FPS))
    # Oversample the still so zoompan has resolution to spare and the zoom stays sharp.
    upscale_w = width * 4
    upscale_h = height * 4
    z_expr = f"{zoom_from}+({zoom_to}-{zoom_from})*on/{max(total_frames-1, 1)}"
    filter_complex = (
        f"[0:v]scale={upscale_w}:{upscale_h}:force_original_aspect_ratio=increase,"
        f"crop={upscale_w}:{upscale_h},"
        f"zoompan=z='{z_expr}'"
        f":x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2'"
        f":d={total_frames}:s={width}x{height}:fps={FPS}"
    )
    out.parent.mkdir(parents=True, exist_ok=True)

    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-loop", "1", "-i", str(image),
            "-filter_complex", filter_complex,
            "-t", f"{duration:.3f}",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", str(FPS),
            str(out),
        ],
        check=True,
    )

    return {
        "path": str(out),
        "duration": probe_duration(out),
    }


def _main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Make a short zoom-in clip from a still image (Ken Burns)."
    )
    parser.add_argument("--image", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--duration", required=True, type=float)
    parser.add_argument("--zoom-from", dest="zoom_from", type=float, default=1.0)
    parser.add_argument("--zoom-to", dest="zoom_to", type=float, default=1.12)
    parser.add_argument("--resolution", default=None, choices=sorted(ALLOWED_RESOLUTIONS))
    parser.add_argument("--aspect", default=None, choices=sorted(ALLOWED_ASPECTS))
    args = parser.parse_args(argv)

    result = animate_image(
        image=args.image,
        out=args.out,
        duration=args.duration,
        zoom_from=args.zoom_from,
        zoom_to=args.zoom_to,
        resolution=args.resolution,
        aspect=args.aspect,
    )
    json.dump(result, sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(_main())
