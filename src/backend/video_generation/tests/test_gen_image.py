from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.video_generation.tools import gen_image


class _FakeFal:
    def __init__(self, image_bytes: bytes, *, width: int | None = 1280, height: int | None = 720) -> None:
        self.image_bytes = image_bytes
        self.width = width
        self.height = height
        self.subscribe_calls: list[tuple] = []
        self.upload_calls: list[Path] = []
        self._url_counter = 0

    def subscribe(self, application, arguments, **kwargs):
        self.subscribe_calls.append((application, arguments))
        return {
            "images": [
                {"url": "https://fake.fal/img.png", "width": self.width, "height": self.height}
            ],
            "seed": 42,
        }

    def upload_file(self, path):
        self.upload_calls.append(Path(path))
        self._url_counter += 1
        return f"https://fake.fal/uploaded-{self._url_counter}.png"

    def download(self, url, out):
        Path(out).write_bytes(self.image_bytes)


@pytest.fixture
def fake_fal() -> _FakeFal:
    return _FakeFal(image_bytes=b"\x89PNG\r\n\x1a\n" + b"\x00" * 32)


def test_gen_image_text_to_image_no_refs(tmp_path: Path, fake_fal: _FakeFal) -> None:
    out = tmp_path / "img.png"
    result = gen_image.gen_image(
        prompt="A Roman consul",
        out=out,
        refs=[],
        aspect="16:9",
        fal=fake_fal,
    )

    assert out.is_file()
    assert result["path"] == str(out)
    assert result["width"] == 1280
    assert result["height"] == 720
    assert "text-to-image" in result["model"]

    assert len(fake_fal.subscribe_calls) == 1
    app, args = fake_fal.subscribe_calls[0]
    assert "text-to-image" in app
    assert args["prompt"] == "A Roman consul"
    assert args["aspect_ratio"] == "16:9"
    assert args["image_size"]["width"] > args["image_size"]["height"]
    assert fake_fal.upload_calls == []


def test_gen_image_with_refs_uses_edit_endpoint(tmp_path: Path, fake_fal: _FakeFal) -> None:
    ref1 = tmp_path / "ref1.png"
    ref1.write_bytes(b"ref1")
    ref2 = tmp_path / "ref2.png"
    ref2.write_bytes(b"ref2")
    out = tmp_path / "img.png"

    gen_image.gen_image(
        prompt="A Roman senate",
        out=out,
        refs=[ref1, ref2],
        aspect="9:16",
        fal=fake_fal,
    )

    assert len(fake_fal.upload_calls) == 2
    app, args = fake_fal.subscribe_calls[0]
    assert "edit" in app
    assert args["image_urls"] == [
        "https://fake.fal/uploaded-1.png",
        "https://fake.fal/uploaded-2.png",
    ]
    assert args["image_size"]["height"] > args["image_size"]["width"]


def test_gen_image_empty_prompt_rejected(tmp_path: Path, fake_fal: _FakeFal) -> None:
    with pytest.raises(ValueError):
        gen_image.gen_image(
            prompt="   ",
            out=tmp_path / "x.png",
            refs=[],
            aspect="16:9",
            fal=fake_fal,
        )


def test_gen_image_allows_missing_dimensions(tmp_path: Path) -> None:
    fake_fal = _FakeFal(
        image_bytes=b"\x89PNG\r\n\x1a\n" + b"\x00" * 32,
        width=None,
        height=None,
    )
    out = tmp_path / "img.png"

    result = gen_image.gen_image(
        prompt="A Roman river",
        out=out,
        refs=[],
        aspect="9:16",
        fal=fake_fal,
    )

    assert out.is_file()
    assert result["width"] is None
    assert result["height"] is None
