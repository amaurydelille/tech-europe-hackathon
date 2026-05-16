from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from backend.video_generation.ffmpeg_utils import probe_duration
from backend.video_generation.tools import animate_image


def _make_image(path: Path, w: int = 600, h: int = 800, color: str = "red") -> None:
    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-f", "lavfi",
            "-i", f"color=c={color}:s={w}x{h}:d=0.1",
            "-frames:v", "1",
            str(path),
        ],
        check=True,
    )


def _probe_dims(path: Path) -> tuple[int, int]:
    proc = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "csv=p=0", str(path)],
        check=True, capture_output=True, text=True,
    )
    w, h = proc.stdout.strip().split(",")
    return int(w), int(h)


def test_animate_image_output_matches_input_dimensions(tmp_path: Path) -> None:
    img = tmp_path / "ref.png"
    _make_image(img, w=600, h=800)
    out = tmp_path / "anim.mp4"

    result = animate_image.animate_image(image=img, out=out, duration=3.0)

    assert out.is_file()
    assert result["path"] == str(out)
    assert result["duration"] == pytest.approx(3.0, abs=0.3)

    w, h = _probe_dims(out)
    assert (w, h) == (600, 800)


def test_animate_image_rejects_invalid_zoom(tmp_path: Path) -> None:
    img = tmp_path / "ref.png"
    _make_image(img)
    with pytest.raises(ValueError):
        animate_image.animate_image(
            image=img,
            out=tmp_path / "out.mp4",
            duration=2.0,
            zoom_from=1.5,
            zoom_to=1.0,  # zoom must increase
        )


def test_animate_image_with_title_overlay(tmp_path: Path) -> None:
    img = tmp_path / "ref.png"
    _make_image(img, w=600, h=800)
    out = tmp_path / "anim.mp4"

    result = animate_image.animate_image(
        image=img, out=out, duration=2.0,
        title="Crossing the Rubicon",
        title_color_hex="#F5E9C8",
    )
    assert out.is_file()
    assert result["duration"] == pytest.approx(2.0, abs=0.3)
    w, h = _probe_dims(out)
    assert (w, h) == (600, 800)


def test_animate_image_landscape_input_kept(tmp_path: Path) -> None:
    img = tmp_path / "ref.png"
    _make_image(img, w=800, h=600)
    out = tmp_path / "anim.mp4"

    animate_image.animate_image(image=img, out=out, duration=2.0)
    w, h = _probe_dims(out)
    assert (w, h) == (800, 600)
