"""Brainrot post-processing: split-screen the lesson with Subway-Surfers.

The canvas is the lesson video's own dimensions. Layout:

- The Subway-Surfers clip is scaled to the canvas's **full width** with its
  native aspect preserved and bottom-aligned to the bottom of the frame
  (any overflow at the top is clipped off-canvas).
- The lesson is drawn **on top** of the subway, inset by a few pixels and
  framed with a 2 px black border, centered in the top ``top_ratio`` of the
  canvas. The inset exposes the subway around the lesson, and during a spin
  the lesson's rotation canvas is transparent — so subway shows through both
  the inset margin and the corners that the rotated box no longer covers.

A random schedule of "spins" rotates the lesson box by 360° over ~0.6 s.
Spin times are sampled as a sum of independent Normal(mean=3 s, std=1 s)
intervals (with a 2 s floor between spins), seeded for reproducibility.
"""
from __future__ import annotations

import argparse
import json
import random
import subprocess
import sys
from pathlib import Path

from ..config import REPO_ROOT
from ..ffmpeg_utils import probe_duration

SUBWAY_PATH = REPO_ROOT / "assets" / "video" / "subway_surfer.mp4"
SOUNDTRACK_PATH = REPO_ROOT / "assets" / "audio" / "tung_tung_sahur.mp3"
FPS = 30


def _probe_dims(path: Path) -> tuple[int, int]:
    proc = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "csv=p=0", str(path)],
        check=True, capture_output=True, text=True,
    )
    w, h = proc.stdout.strip().split(",")
    return int(w), int(h)


def _spin_times(total: float, mean: float, std: float, rng: random.Random) -> list[float]:
    """Sample spin start times across ``[0, total)``."""
    times: list[float] = []
    t = rng.gauss(mean, std)
    while t < total - 1.5:
        if t > 0.5:
            times.append(t)
        t += max(2.0, rng.gauss(mean, std))
    return times


def _rotate_expr(spin_times: list[float], spin_duration: float) -> str:
    """ffmpeg expression that ramps the rotation angle from 0 to 2π during each spin window
    and stays 0 elsewhere. Multiple non-overlapping windows are summed.
    """
    if not spin_times:
        return "0"
    terms = []
    for t0 in spin_times:
        t1 = t0 + spin_duration
        # 2π·(t−t0)/D, gated by between(t,t0,t1)
        terms.append(
            f"if(between(t\\,{t0:.3f}\\,{t1:.3f})\\,2*PI*(t-{t0:.3f})/{spin_duration:.3f}\\,0)"
        )
    return "+".join(terms)


def apply_brainrot(
    foreground_video: Path,
    out_path: Path,
    background_video: Path = SUBWAY_PATH,
    soundtrack_volume: float = 1.0 / 3.0,
    top_ratio: float = 0.6,
    lesson_inset: int = 16,
    lesson_border: int = 2,
    spin_duration: float = 0.6,
    spin_interval_mean: float = 3.0,
    spin_interval_std: float = 1.0,
    seed: int | None = 0,
) -> dict:
    foreground_video = Path(foreground_video)
    out_path = Path(out_path)
    background_video = Path(background_video)
    if not foreground_video.is_file():
        raise FileNotFoundError(f"foreground video not found: {foreground_video}")
    if not background_video.is_file():
        raise FileNotFoundError(f"background video not found: {background_video}")
    if not SOUNDTRACK_PATH.is_file():
        raise FileNotFoundError(f"soundtrack not found: {SOUNDTRACK_PATH}")
    if not 0.3 <= top_ratio <= 0.9:
        raise ValueError("top_ratio must be in [0.3, 0.9]")
    if not 0.0 <= soundtrack_volume <= 1.0:
        raise ValueError("soundtrack_volume must be in [0.0, 1.0]")
    if lesson_inset < 0 or lesson_border < 0:
        raise ValueError("lesson_inset and lesson_border must be non-negative")

    duration = probe_duration(foreground_video)
    width, height = _probe_dims(foreground_video)

    top_h = int(round(height * top_ratio))
    top_h += top_h % 2
    bot_h = height - top_h
    bot_h += bot_h % 2
    # Re-derive top_h so the two regions exactly sum to the canvas height.
    top_h = height - bot_h

    # Lesson box (with border) sits inset inside the top region; inner video
    # sits inside the border. Force all dims to even ints for yuv420p.
    lesson_w = max(2, width - 2 * lesson_inset)
    lesson_h = max(2, top_h - 2 * lesson_inset)
    lesson_w -= lesson_w % 2
    lesson_h -= lesson_h % 2
    inner_w = max(2, lesson_w - 2 * lesson_border)
    inner_h = max(2, lesson_h - 2 * lesson_border)
    inner_w -= inner_w % 2
    inner_h -= inner_h % 2

    rng = random.Random(seed) if seed is not None else random.Random()
    spin_times = _spin_times(duration, spin_interval_mean, spin_interval_std, rng)
    rot_expr = _rotate_expr(spin_times, spin_duration)

    # Rotation canvas large enough that the bordered lesson box survives a 360° spin.
    rot_side = int(((lesson_w ** 2 + lesson_h ** 2) ** 0.5) + 4)
    rot_side += rot_side % 2

    video_filter = (
        # Solid black base at canvas dims.
        f"color=c=black:s={width}x{height}:r={FPS}[base];"
        # Lesson: cover-crop into (inner_w, inner_h), pad with 2px black border to
        # (lesson_w, lesson_h), then transparent-pad to rot_side square and rotate.
        f"[0:v]scale={inner_w}:{inner_h}:force_original_aspect_ratio=increase,"
        f"crop={inner_w}:{inner_h},setsar=1,fps={FPS},"
        f"pad={lesson_w}:{lesson_h}:{lesson_border}:{lesson_border}:color=black,"
        f"pad={rot_side}:{rot_side}:({rot_side}-iw)/2:({rot_side}-ih)/2:color=black@0,"
        f"format=rgba,"
        f"rotate=a='{rot_expr}':c=none:ow={rot_side}:oh={rot_side}[fg];"
        # Subway: full canvas width, native aspect preserved (no crop), even height.
        f"[1:v]scale={width}:-2,setsar=1,fps={FPS},format=yuv420p[sub];"
        # Z-order: black base ← subway (bottom-aligned, top spills off-canvas and
        # is clipped) ← lesson rotation canvas centered in the top region. The
        # inset around the lesson exposes the subway underneath.
        f"[base][sub]overlay=0:H-h[bg];"
        f"[bg][fg]overlay=({width}-{rot_side})/2:({top_h}-{rot_side})/2:format=auto[v]"
    )

    audio_filter = (
        f"[0:a]aresample=async=1[narr];"
        f"[2:a]volume={soundtrack_volume:.3f},aresample=async=1[music];"
        f"[narr][music]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]"
    )
    filter_complex = video_filter + ";" + audio_filter

    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", str(foreground_video),
        "-stream_loop", "-1", "-i", str(background_video),
        "-stream_loop", "-1", "-i", str(SOUNDTRACK_PATH),
        "-filter_complex", filter_complex,
        "-map", "[v]",
        "-map", "[aout]",
        "-t", f"{duration:.3f}",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", str(FPS),
        "-c:a", "aac",
        str(out_path),
    ]
    subprocess.run(cmd, check=True)

    return {
        "path": str(out_path),
        "duration": probe_duration(out_path),
        "spin_times": spin_times,
    }


def _main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Composite the lesson video onto a Subway-Surfers background with spins."
    )
    parser.add_argument("--video", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--background", default=str(SUBWAY_PATH), type=Path)
    parser.add_argument("--soundtrack-volume", dest="soundtrack_volume", type=float,
                        default=1.0 / 3.0,
                        help="Linear gain for the bundled brainrot soundtrack (default 0.333).")
    parser.add_argument("--top-ratio", dest="top_ratio", type=float, default=0.6,
                        help="Fraction of canvas height for the lesson; subway gets the rest.")
    parser.add_argument("--lesson-inset", dest="lesson_inset", type=int, default=16,
                        help="Pixels of margin around the lesson box (subway shows through).")
    parser.add_argument("--lesson-border", dest="lesson_border", type=int, default=2,
                        help="Black border thickness around the lesson box, in pixels.")
    parser.add_argument("--spin-duration", dest="spin_duration", type=float, default=0.6)
    parser.add_argument("--spin-mean", dest="spin_mean", type=float, default=3.0)
    parser.add_argument("--spin-std", dest="spin_std", type=float, default=1.0)
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args(argv)

    result = apply_brainrot(
        foreground_video=args.video,
        out_path=args.out,
        background_video=args.background,
        soundtrack_volume=args.soundtrack_volume,
        top_ratio=args.top_ratio,
        lesson_inset=args.lesson_inset,
        lesson_border=args.lesson_border,
        spin_duration=args.spin_duration,
        spin_interval_mean=args.spin_mean,
        spin_interval_std=args.spin_std,
        seed=args.seed,
    )
    json.dump(result, sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(_main())
