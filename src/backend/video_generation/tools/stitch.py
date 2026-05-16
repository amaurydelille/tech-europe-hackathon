from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from ..config import config
from .subtitles import build_cues, build_srt
from .validate_script import (
    ImageEntry,
    Script,
    SpeechEntry,
    VideoEntry,
    validate_script,
)

SHORT_SIDE = {"480p": 480, "720p": 720, "1080p": 1080}


def _canvas_dimensions(resolution: str, aspect: str) -> tuple[int, int]:
    short = SHORT_SIDE.get(resolution, SHORT_SIDE[config.resolution])
    num, _, den = aspect.partition(":")
    a, b = int(num), int(den)
    if a >= b:  # landscape or square
        height = short
        width = round(short * a / b)
    else:  # portrait
        width = short
        height = round(short * b / a)
    # ensure even dimensions for libx264
    width += width % 2
    height += height % 2
    return width, height


def _resolve_path(script_dir: Path, raw: str) -> Path:
    p = Path(raw)
    if not p.is_absolute():
        p = (script_dir / p).resolve()
    return p


def _build_video_segment_filter(idx: int, target_w: int, target_h: int, dur: float) -> str:
    return (
        f"[{idx}:v]scale={target_w}:{target_h}:force_original_aspect_ratio=decrease,"
        f"pad={target_w}:{target_h}:(ow-iw)/2:(oh-ih)/2:black,"
        f"setsar=1,fps=30,trim=duration={dur},setpts=PTS-STARTPTS[v{idx}]"
    )


def _build_image_segment_filter(idx: int, target_w: int, target_h: int, dur: float) -> str:
    return (
        f"[{idx}:v]scale={target_w}:{target_h}:force_original_aspect_ratio=decrease,"
        f"pad={target_w}:{target_h}:(ow-iw)/2:(oh-ih)/2:black,"
        f"setsar=1,fps=30,loop=loop=-1:size=1,trim=duration={dur},setpts=PTS-STARTPTS[v{idx}]"
    )


def stitch(script_path: Path, out_path: Path) -> dict:
    script_path = Path(script_path)
    script: Script = validate_script(script_path)
    script_dir = script_path.parent

    width, height = _canvas_dimensions(script.resolution, script.aspect)

    visuals = sorted(
        (e for e in script.entries if not isinstance(e, SpeechEntry)),
        key=lambda e: e.start,
    )
    speeches = sorted(
        (e for e in script.entries if isinstance(e, SpeechEntry)),
        key=lambda e: e.start,
    )

    inputs: list[str] = []
    filter_parts: list[str] = []

    for i, v in enumerate(visuals):
        dur = v.end - v.start
        if isinstance(v, VideoEntry):
            video_path = _resolve_path(script_dir, v.video_path)
            inputs += ["-i", str(video_path)]
            filter_parts.append(_build_video_segment_filter(i, width, height, dur))
        elif isinstance(v, ImageEntry):
            image_path = _resolve_path(script_dir, v.image_path)
            inputs += ["-loop", "1", "-t", str(dur), "-i", str(image_path)]
            filter_parts.append(_build_image_segment_filter(i, width, height, dur))

    concat_inputs = "".join(f"[v{i}]" for i in range(len(visuals)))
    filter_parts.append(f"{concat_inputs}concat=n={len(visuals)}:v=1:a=0[vout]")

    total = script.total_duration
    speech_offset = len(visuals)
    audio_labels: list[str] = []
    for j, s in enumerate(speeches):
        audio_path = _resolve_path(script_dir, s.audio_path)
        inputs += ["-i", str(audio_path)]
        delay_ms = int(round(s.start * 1000))
        in_idx = speech_offset + j
        filter_parts.append(
            f"[{in_idx}:a]adelay={delay_ms}|{delay_ms},apad[a{j}]"
        )
        audio_labels.append(f"[a{j}]")

    if audio_labels:
        mix = "".join(audio_labels)
        filter_parts.append(
            f"{mix}amix=inputs={len(audio_labels)}:dropout_transition=0:normalize=0,"
            f"atrim=duration={total}[aout]"
        )
    else:
        filter_parts.append(f"anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration={total}[aout]")

    filter_complex = ";".join(filter_parts)

    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        *inputs,
        "-filter_complex", filter_complex,
        "-map", "[vout]",
        "-map", "[aout]",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-shortest",
        str(out_path),
    ]
    subprocess.run(cmd, check=True)

    cues = build_cues(speeches)
    srt_path = out_path.with_suffix(".srt")
    srt_path.write_text(build_srt(cues), encoding="utf-8")

    from ..ffmpeg_utils import probe_duration

    return {
        "path": str(out_path),
        "srt_path": str(srt_path),
        "duration": probe_duration(out_path),
        "subtitle_cues": len(cues),
    }


def _main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Stitch script assets into final video.")
    parser.add_argument("--script", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args(argv)

    result = stitch(script_path=args.script, out_path=args.out)
    json.dump(result, sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(_main())
