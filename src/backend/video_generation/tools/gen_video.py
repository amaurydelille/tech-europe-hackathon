from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path
from typing import Protocol

from ..config import config, fal_api_key
from ..ffmpeg_utils import probe_duration, sample_frames_1fps

ALLOWED_DURATIONS = {5, 10}
ALLOWED_RESOLUTIONS = {"480p", "720p", "1080p"}
ALLOWED_ASPECTS = {"16:9", "9:16", "1:1"}


class FalLike(Protocol):
    def subscribe(self, application: str, arguments: dict, **kwargs): ...
    def upload_file(self, path) -> str: ...
    def download(self, url: str, out) -> None: ...


class _DefaultFal:
    def __init__(self) -> None:
        fal_api_key()
        import fal_client

        self._client = fal_client

    def subscribe(self, application, arguments, **kwargs):
        return self._client.subscribe(application, arguments=arguments, **kwargs)

    def upload_file(self, path):
        return self._client.upload_file(str(path))

    def download(self, url, out):
        with urllib.request.urlopen(url) as resp:
            Path(out).write_bytes(resp.read())


def gen_video(
    prompt: str,
    image: Path,
    duration: int,
    resolution: str,
    aspect: str,
    out: Path,
    seed: int | None = None,
    *,
    fal: FalLike | None = None,
) -> dict:
    if not prompt.strip():
        raise ValueError("prompt is empty")
    if duration not in ALLOWED_DURATIONS:
        raise ValueError(f"duration must be one of {sorted(ALLOWED_DURATIONS)}")
    if resolution not in ALLOWED_RESOLUTIONS:
        raise ValueError(f"resolution must be one of {sorted(ALLOWED_RESOLUTIONS)}")
    if aspect not in ALLOWED_ASPECTS:
        raise ValueError(f"aspect must be one of {sorted(ALLOWED_ASPECTS)}")

    image = Path(image)
    if not image.is_file():
        raise FileNotFoundError(f"reference image not found: {image}")
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)

    fal_impl = fal or _DefaultFal()
    image_url = fal_impl.upload_file(image)

    arguments: dict = {
        "prompt": prompt,
        "image_url": image_url,
        "duration": str(duration),
        "resolution": resolution,
        "aspect_ratio": aspect,
        "generate_audio": False,
    }
    if seed is not None:
        arguments["seed"] = seed

    result = fal_impl.subscribe(config.models.seedance, arguments)
    if not isinstance(result, dict):
        raise RuntimeError(f"unexpected fal result type: {type(result)}")
    video = result.get("video")
    if not isinstance(video, dict) or "url" not in video:
        raise RuntimeError(f"fal returned no video: {result!r}")

    fal_impl.download(video["url"], out)

    actual_duration = probe_duration(out)
    frames_dir = out.parent / f"{out.stem}.frames"
    frame_paths = sample_frames_1fps(out, frames_dir)

    return {
        "path": str(out),
        "duration": actual_duration,
        "frame_paths": [str(p) for p in frame_paths],
        "model": config.models.seedance,
        "seed": result.get("seed"),
    }


def _main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate a video with Seedance 2.")
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--image", required=True, type=Path)
    parser.add_argument("--duration", required=True, type=int, choices=sorted(ALLOWED_DURATIONS))
    parser.add_argument("--resolution", default="480p", choices=sorted(ALLOWED_RESOLUTIONS))
    parser.add_argument("--aspect", default="9:16", choices=sorted(ALLOWED_ASPECTS))
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args(argv)

    result = gen_video(
        prompt=args.prompt,
        image=args.image,
        duration=args.duration,
        resolution=args.resolution,
        aspect=args.aspect,
        seed=args.seed,
        out=args.out,
    )
    json.dump(result, sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(_main())
