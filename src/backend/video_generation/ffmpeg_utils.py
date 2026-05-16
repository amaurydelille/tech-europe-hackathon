from __future__ import annotations

import json
import subprocess
from pathlib import Path


def probe_duration(path: Path) -> float:
    proc = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    info = json.loads(proc.stdout)
    return float(info["format"]["duration"])


DEFAULT_FRAME_SAMPLE_FPS = 2


def sample_frames(video_path: Path, out_dir: Path, fps: float = DEFAULT_FRAME_SAMPLE_FPS) -> list[Path]:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    pattern = out_dir / "frame_%03d.jpg"
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-i",
            str(video_path),
            "-vf",
            f"fps={fps}",
            "-q:v",
            "3",
            str(pattern),
        ],
        check=True,
    )
    return sorted(out_dir.glob("frame_*.jpg"))


# Backwards-compatible alias.
def sample_frames_1fps(video_path: Path, out_dir: Path) -> list[Path]:
    return sample_frames(video_path, out_dir, fps=1)
