from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path
from typing import Protocol

from ..config import config, fal_api_key


class FalLike(Protocol):
    def subscribe(self, application: str, arguments: dict, **kwargs): ...
    def upload_file(self, path) -> str: ...
    def download(self, url: str, out) -> None: ...


class _DefaultFal:
    def __init__(self) -> None:
        fal_api_key()  # raise if missing
        import fal_client

        self._client = fal_client

    def subscribe(self, application, arguments, **kwargs):
        return self._client.subscribe(application, arguments=arguments, **kwargs)

    def upload_file(self, path):
        return self._client.upload_file(str(path))

    def download(self, url, out):
        with urllib.request.urlopen(url) as resp:
            Path(out).write_bytes(resp.read())


def gen_image(
    prompt: str,
    out: Path,
    refs: list[Path] | None = None,
    aspect: str = "9:16",
    *,
    fal: FalLike | None = None,
) -> dict:
    if not prompt.strip():
        raise ValueError("prompt is empty")
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    refs = refs or []
    fal_impl = fal or _DefaultFal()

    if refs:
        image_urls = [fal_impl.upload_file(r) for r in refs]
        model = config.models.seedream_edit
        arguments = {
            "prompt": prompt,
            "image_urls": image_urls,
            "aspect_ratio": aspect,
        }
    else:
        model = config.models.seedream_text_to_image
        arguments = {
            "prompt": prompt,
            "aspect_ratio": aspect,
        }

    result = fal_impl.subscribe(model, arguments)
    if not isinstance(result, dict) or not result.get("images"):
        raise RuntimeError(f"fal returned no images: {result!r}")
    image = result["images"][0]
    url = image["url"]
    fal_impl.download(url, out)

    return {
        "path": str(out),
        "width": int(image.get("width", 0)) or None,
        "height": int(image.get("height", 0)) or None,
        "model": model,
        "seed": result.get("seed"),
    }


def _main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate an image with fal Seedream.")
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--ref", action="append", default=[], type=Path,
                        help="Optional reference image path (repeatable).")
    parser.add_argument("--aspect", default="9:16")
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args(argv)

    result = gen_image(
        prompt=args.prompt,
        out=args.out,
        refs=args.ref,
        aspect=args.aspect,
    )
    json.dump(result, sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(_main())
