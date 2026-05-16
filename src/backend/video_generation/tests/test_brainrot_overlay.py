from __future__ import annotations

import random
import subprocess
from pathlib import Path

import pytest

from backend.video_generation.ffmpeg_utils import probe_duration
from backend.video_generation.tools import brainrot_overlay


def _make_video(path: Path, duration: float, w: int, h: int, color: str) -> None:
    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-f", "lavfi",
            "-i", f"color=c={color}:s={w}x{h}:d={duration}",
            "-r", "30", "-pix_fmt", "yuv420p",
            str(path),
        ],
        check=True,
    )


def test_spin_times_deterministic_with_seed() -> None:
    rng_a = random.Random(0)
    rng_b = random.Random(0)
    a = brainrot_overlay._spin_times(30.0, 5.0, 1.5, rng_a)
    b = brainrot_overlay._spin_times(30.0, 5.0, 1.5, rng_b)
    assert a == b
    assert all(0.5 < t < 30.0 for t in a)


def test_spin_times_intervals_have_minimum_gap() -> None:
    rng = random.Random(0)
    times = brainrot_overlay._spin_times(60.0, 5.0, 1.5, rng)
    for prev, curr in zip(times, times[1:]):
        assert curr - prev >= 2.0


def test_apply_brainrot_writes_canvas_sized_mp4(tmp_path: Path) -> None:
    fg = tmp_path / "fg.mp4"
    bg = tmp_path / "bg.mp4"
    _make_video(fg, duration=3.0, w=480, h=854, color="red")
    _make_video(bg, duration=2.0, w=300, h=600, color="blue")  # different aspect; gets stretched
    out = tmp_path / "out.mp4"

    result = brainrot_overlay.apply_brainrot(
        foreground_video=fg,
        out_path=out,
        background_video=bg,
        spin_interval_mean=1.0,
        spin_interval_std=0.1,
        seed=42,
    )

    assert out.is_file()
    assert result["duration"] == pytest.approx(3.0, abs=0.3)

    # Output dimensions match the foreground (lesson) canvas.
    proc = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "csv=p=0", str(out)],
        check=True, capture_output=True, text=True,
    )
    w, h = proc.stdout.strip().split(",")
    assert (int(w), int(h)) == (480, 854)
