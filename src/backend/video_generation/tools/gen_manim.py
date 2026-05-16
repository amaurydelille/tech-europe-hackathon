"""Render a Manim scene to an mp4.

Thin wrapper around the Manim CE CLI that hides the cryptic
`media/videos/<scene_stem>/<resolution>/<class>.mp4` output path, copies the
finished video to `--out`, and prints `{path, duration}` matching the contract
of the other video-pipeline tools.

The scene file must define a single `Scene` subclass and start with the
portrait 9:16 config block — see `manim_textbook.md` for details.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from ..ffmpeg_utils import probe_duration

QUALITY_FLAGS: dict[str, str] = {
    "low": "-ql",
    "medium": "-qm",
    "high": "-qh",
}


def gen_manim(
    scene_file: Path,
    scene_class: str,
    out: Path,
    quality: str = "low",
) -> dict:
    if quality not in QUALITY_FLAGS:
        raise ValueError(f"quality must be one of {sorted(QUALITY_FLAGS)}")
    scene_file = Path(scene_file).resolve()
    if not scene_file.is_file():
        raise FileNotFoundError(f"scene file not found: {scene_file}")
    out = Path(out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="manim_") as tmp:
        media_dir = Path(tmp)
        subprocess.run(
            [
                sys.executable, "-m", "manim",
                QUALITY_FLAGS[quality],
                "--media_dir", str(media_dir),
                str(scene_file),
                scene_class,
            ],
            check=True,
        )
        # Manim writes to <media_dir>/videos/<scene_stem>/<resolution_subdir>/<class>.mp4.
        # The resolution subdir name depends on pixel_height × fps (which the scene
        # file overrides). Glob is more robust than trying to predict it.
        produced = list((media_dir / "videos").rglob(f"{scene_class}.mp4"))
        if not produced:
            raise RuntimeError(
                f"manim finished but no mp4 named {scene_class}.mp4 under {media_dir}"
            )
        if len(produced) > 1:
            raise RuntimeError(
                f"expected one {scene_class}.mp4, found {len(produced)}: {produced}"
            )
        shutil.copy2(produced[0], out)

    return {
        "path": str(out),
        "duration": probe_duration(out),
        "scene_class": scene_class,
        "quality": quality,
    }


def _main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Render a Manim scene to an mp4 and return {path, duration}.",
    )
    parser.add_argument("--scene-file", dest="scene_file", required=True, type=Path,
                        help="Path to a .py file containing exactly one Scene subclass.")
    parser.add_argument("--scene-class", dest="scene_class", required=True,
                        help="Name of the Scene subclass to render.")
    parser.add_argument("--quality", default="low", choices=sorted(QUALITY_FLAGS),
                        help="Render quality. 'low' (15 fps) for iteration, 'medium' (30 fps) for final.")
    parser.add_argument("--out", required=True, type=Path,
                        help="Where to write the rendered mp4.")
    args = parser.parse_args(argv)

    result = gen_manim(
        scene_file=args.scene_file,
        scene_class=args.scene_class,
        out=args.out,
        quality=args.quality,
    )
    json.dump(result, sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(_main())
