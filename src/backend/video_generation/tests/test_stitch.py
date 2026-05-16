from __future__ import annotations

import io
import json
import subprocess
import wave
from pathlib import Path

import pytest

from backend.video_generation.ffmpeg_utils import probe_duration
from backend.video_generation.tools import stitch


def _make_wav(path: Path, duration_s: float, sample_rate: int = 48000) -> None:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(b"\x00\x00" * int(duration_s * sample_rate))


def _make_video(path: Path, duration_s: float, color: str = "red") -> None:
    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-f", "lavfi",
            "-i", f"color=c={color}:s=320x180:d={duration_s}",
            "-r", "24", "-pix_fmt", "yuv420p",
            str(path),
        ],
        check=True,
    )


def _make_image(path: Path, color: str = "green") -> None:
    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-f", "lavfi",
            "-i", f"color=c={color}:s=320x180:d=0.1",
            "-frames:v", "1",
            str(path),
        ],
        check=True,
    )


def test_stitch_video_with_speech_overlay(tmp_path: Path) -> None:
    audio = tmp_path / "s000.wav"
    _make_wav(audio, duration_s=3.0)
    vid = tmp_path / "v000.mp4"
    _make_video(vid, duration_s=5.0, color="red")
    img = tmp_path / "i000.png"
    _make_image(img, color="green")

    script = {
        "total_duration": 8.0,
        "resolution": "480p",
        "aspect": "16:9",
        "entries": [
            {
                "kind": "speech",
                "start": 1.0,
                "duration": 3.0,
                "text": "hello",
                "audio_path": str(audio),
                "timestamps": [{"text": "hello", "start": 0.0, "end": 2.5}],
            },
            {
                "kind": "video",
                "start": 0.0,
                "end": 5.0,
                "duration": 5.0,
                "prompt": "red scene",
                "anchors": [],
                "video_path": str(vid),
            },
            {
                "kind": "image",
                "start": 5.0,
                "end": 8.0,
                "prompt": "green frame",
                "anchors": [],
                "image_path": str(img),
            },
        ],
    }
    script_path = tmp_path / "script.json"
    script_path.write_text(json.dumps(script))

    out_dir = tmp_path / "out"
    result = stitch.stitch(script_path=script_path, out_dir=out_dir)

    out = out_dir / "video.mp4"
    srt = out_dir / "subtitles.srt"
    sources = out_dir / "sources.json"
    assert out.is_file()
    assert srt.is_file()
    assert sources.is_file()
    assert result["video_path"] == str(out)
    assert result["srt_path"] == str(srt)
    assert result["sources_path"] == str(sources)
    assert result["subtitle_cues"] == 1
    assert "hello" in srt.read_text().lower()
    assert probe_duration(out) == pytest.approx(8.0, abs=0.5)


def test_stitch_writes_srt_with_grouped_cues(tmp_path: Path) -> None:
    audio = tmp_path / "s000.wav"
    _make_wav(audio, duration_s=3.0)
    vid = tmp_path / "v000.mp4"
    _make_video(vid, duration_s=5.0, color="red")
    img = tmp_path / "i000.png"
    _make_image(img, color="green")

    script = {
        "total_duration": 8.0,
        "resolution": "480p",
        "aspect": "9:16",
        "entries": [
            {
                "kind": "speech",
                "start": 1.0,
                "duration": 3.0,
                "text": "Hello brave new world",
                "audio_path": str(audio),
                "timestamps": [
                    {"text": "Hello", "start": 0.0, "end": 0.6},
                    {"text": "brave", "start": 0.7, "end": 1.2},
                    {"text": "new", "start": 1.3, "end": 1.7},
                    {"text": "world", "start": 1.8, "end": 2.5},
                ],
            },
            {
                "kind": "video",
                "start": 0.0,
                "end": 5.0,
                "duration": 5.0,
                "prompt": "red scene",
                "anchors": [],
                "video_path": str(vid),
            },
            {
                "kind": "image",
                "start": 5.0,
                "end": 8.0,
                "prompt": "green frame",
                "anchors": [],
                "image_path": str(img),
            },
        ],
    }
    script_path = tmp_path / "script.json"
    script_path.write_text(json.dumps(script))

    out_dir = tmp_path / "out"
    result = stitch.stitch(script_path=script_path, out_dir=out_dir)
    out = out_dir / "video.mp4"
    srt = out_dir / "subtitles.srt"

    assert out.is_file()
    assert result["subtitle_cues"] >= 1
    assert srt.is_file()
    srt_text = srt.read_text()
    # SubRip format: numbered blocks separated by blank lines, timing line with `-->`.
    assert "1\n" in srt_text
    assert " --> " in srt_text
    assert "Hello" in srt_text and "world" in srt_text
    assert probe_duration(out) == pytest.approx(8.0, abs=0.5)


def test_stitch_rejects_invalid_script(tmp_path: Path) -> None:
    bad = {
        "total_duration": 5.0,
        "resolution": "480p",
        "aspect": "16:9",
        "entries": [
            {"kind": "video", "start": 0.0, "end": 4.0, "duration": 4.0,
             "prompt": "x", "anchors": [], "video_path": "nope.mp4"},
        ],
    }
    script_path = tmp_path / "script.json"
    script_path.write_text(json.dumps(bad))
    with pytest.raises(Exception):
        stitch.stitch(script_path=script_path, out_dir=tmp_path / "out")
