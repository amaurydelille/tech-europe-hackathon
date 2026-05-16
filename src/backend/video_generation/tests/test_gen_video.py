from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from backend.video_generation.tools import gen_video


def _make_tiny_video(path: Path, seconds: int = 3) -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            f"color=c=blue:s=128x72:d={seconds}",
            "-r",
            "10",
            "-pix_fmt",
            "yuv420p",
            str(path),
        ],
        check=True,
    )


class _FakeFal:
    def __init__(self, video_path: Path) -> None:
        self.video_path = video_path
        self.subscribe_calls: list[tuple] = []
        self.upload_calls: list[Path] = []

    def subscribe(self, application, arguments, **kwargs):
        self.subscribe_calls.append((application, arguments))
        return {"video": {"url": "https://fake.fal/video.mp4"}, "seed": 7}

    def upload_file(self, path):
        self.upload_calls.append(Path(path))
        return "https://fake.fal/ref.png"

    def download(self, url, out):
        Path(out).write_bytes(self.video_path.read_bytes())


@pytest.fixture
def fake_video(tmp_path: Path) -> Path:
    p = tmp_path / "src.mp4"
    _make_tiny_video(p, seconds=3)
    return p


def test_gen_video_uploads_ref_and_subscribes(tmp_path: Path, fake_video: Path) -> None:
    ref = tmp_path / "ref.png"
    ref.write_bytes(b"png")
    out = tmp_path / "out.mp4"
    fal = _FakeFal(video_path=fake_video)

    result = gen_video.gen_video(
        prompt="A blue scene",
        image=ref,
        duration=5,
        resolution="480p",
        aspect="16:9",
        out=out,
        fal=fal,
    )

    assert out.is_file()
    assert fal.upload_calls == [ref]
    app, args = fal.subscribe_calls[0]
    assert app == "bytedance/seedance-2.0/image-to-video"
    assert args["prompt"] == "A blue scene"
    assert args["image_url"] == "https://fake.fal/ref.png"
    assert args["duration"] == "5"
    assert args["resolution"] == "480p"

    assert result["path"] == str(out)
    assert result["duration"] == pytest.approx(3.0, abs=0.5)
    assert len(result["frame_paths"]) >= 1
    for fp in result["frame_paths"]:
        assert Path(fp).is_file()


def test_gen_video_passes_seed(tmp_path: Path, fake_video: Path) -> None:
    ref = tmp_path / "ref.png"
    ref.write_bytes(b"png")
    fal = _FakeFal(video_path=fake_video)
    gen_video.gen_video(
        prompt="x",
        image=ref,
        duration=5,
        resolution="480p",
        aspect="16:9",
        seed=123,
        out=tmp_path / "out.mp4",
        fal=fal,
    )
    _, args = fal.subscribe_calls[0]
    assert args["seed"] == 123


def test_gen_video_invalid_duration_rejected(tmp_path: Path, fake_video: Path) -> None:
    ref = tmp_path / "ref.png"
    ref.write_bytes(b"png")
    fal = _FakeFal(video_path=fake_video)
    with pytest.raises(ValueError, match="duration"):
        gen_video.gen_video(
            prompt="x",
            image=ref,
            duration=7,
            resolution="480p",
            aspect="16:9",
            out=tmp_path / "out.mp4",
            fal=fal,
        )


def test_gen_video_invalid_resolution_rejected(tmp_path: Path, fake_video: Path) -> None:
    ref = tmp_path / "ref.png"
    ref.write_bytes(b"png")
    fal = _FakeFal(video_path=fake_video)
    with pytest.raises(ValueError, match="resolution"):
        gen_video.gen_video(
            prompt="x",
            image=ref,
            duration=5,
            resolution="240p",
            aspect="16:9",
            out=tmp_path / "out.mp4",
            fal=fal,
        )
