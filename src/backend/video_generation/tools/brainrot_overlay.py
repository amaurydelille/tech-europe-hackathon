"""Brainrot post-processing: composite the finished narration video onto a
Subway-Surfers background, with periodic spins applied to the foreground.

The Subway-Surfers clip is the standard mobile "split-screen brainrot"
background. We loop it under the lesson video, stretch it horizontally to
match the 9:16 canvas (no cropping — content preserved at the cost of mild
horizontal distortion), then overlay the shrunk lesson video centered on top.

A random schedule of "spins" rotates the inner (lesson) video by 360° over
~0.6 s. Spin times are sampled as a sum of independent Normal(mean, std)
intervals, seeded for reproducibility.
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

SUBWAY_PATH = (
    REPO_ROOT / "src" / "backend" / "video_generation"
    / "assets" / "video" / "subway_surfer.mp4"
)
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
    fg_scale: float = 0.8,
    spin_duration: float = 0.6,
    spin_interval_mean: float = 5.0,
    spin_interval_std: float = 1.5,
    seed: int | None = 0,
) -> dict:
    foreground_video = Path(foreground_video)
    out_path = Path(out_path)
    background_video = Path(background_video)
    if not foreground_video.is_file():
        raise FileNotFoundError(f"foreground video not found: {foreground_video}")
    if not background_video.is_file():
        raise FileNotFoundError(f"background video not found: {background_video}")
    if not 0.2 <= fg_scale <= 1.0:
        raise ValueError("fg_scale must be in [0.2, 1.0]")

    duration = probe_duration(foreground_video)
    width, height = _probe_dims(foreground_video)

    rng = random.Random(seed) if seed is not None else random.Random()
    spin_times = _spin_times(duration, spin_interval_mean, spin_interval_std, rng)
    rot_expr = _rotate_expr(spin_times, spin_duration)

    fg_w = int(width * fg_scale)
    fg_w += fg_w % 2
    fg_h = int(height * fg_scale)
    fg_h += fg_h % 2
    # Rotate canvas needs to be large enough that corners of the fg don't
    # clip during the spin. Side length ≈ diagonal of the fg rectangle.
    rot_side = int(((fg_w ** 2 + fg_h ** 2) ** 0.5) + 4)
    rot_side += rot_side % 2

    filter_complex = (
        # Background: stretch the subway clip to canvas dims (no preserve, no crop).
        f"[1:v]scale={width}:{height},setsar=1,fps={FPS},format=yuv420p[bg];"
        # Foreground: scale, pad to a square rotate canvas so corners survive spins.
        f"[0:v]scale={fg_w}:{fg_h},setsar=1,fps={FPS},"
        f"pad={rot_side}:{rot_side}:({rot_side}-iw)/2:({rot_side}-ih)/2:color=black@0,"
        f"format=rgba,"
        f"rotate=a='{rot_expr}':c=none:ow={rot_side}:oh={rot_side}[fg];"
        f"[bg][fg]overlay=({width}-{rot_side})/2:({height}-{rot_side})/2:format=auto[v]"
    )

    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", str(foreground_video),
        "-stream_loop", "-1", "-i", str(background_video),
        "-filter_complex", filter_complex,
        "-map", "[v]",
        "-map", "0:a?",
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
    parser.add_argument("--fg-scale", dest="fg_scale", type=float, default=0.8)
    parser.add_argument("--spin-duration", dest="spin_duration", type=float, default=0.6)
    parser.add_argument("--spin-mean", dest="spin_mean", type=float, default=5.0)
    parser.add_argument("--spin-std", dest="spin_std", type=float, default=1.5)
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args(argv)

    result = apply_brainrot(
        foreground_video=args.video,
        out_path=args.out,
        background_video=args.background,
        fg_scale=args.fg_scale,
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
