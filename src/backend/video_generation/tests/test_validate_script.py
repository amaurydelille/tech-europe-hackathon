from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.video_generation.tools.validate_script import (
    ValidationError,
    validate_script,
)


def _base_speech(start: float, duration: float, idx: int) -> dict:
    return {
        "kind": "speech",
        "start": start,
        "duration": duration,
        "text": f"line {idx}",
        "audio_path": f"assets/audio/s{idx:03d}.wav",
        "timestamps": [{"text": f"line{idx}", "start": 0.0, "end": duration}],
    }


def _base_video(start: float, end: float, idx: int) -> dict:
    return {
        "kind": "video",
        "start": start,
        "end": end,
        "duration": end - start,
        "prompt": f"video {idx}",
        "anchors": ["anchor_a"],
        "video_path": f"assets/video/v{idx:03d}.mp4",
    }


def _base_image(start: float, end: float, idx: int) -> dict:
    return {
        "kind": "image",
        "start": start,
        "end": end,
        "prompt": f"image {idx}",
        "anchors": [],
        "image_path": f"assets/image/i{idx:03d}.png",
    }


def test_valid_script_passes() -> None:
    script = {
        "total_duration": 10.0,
        "resolution": "480p",
        "aspect": "16:9",
        "entries": [
            _base_speech(0.0, 4.0, 0),
            _base_speech(5.0, 3.0, 1),
            _base_video(0.0, 5.0, 0),
            _base_image(5.0, 10.0, 0),
        ],
    }
    validate_script(script)


def test_overlapping_speech_rejected() -> None:
    script = {
        "total_duration": 10.0,
        "resolution": "480p",
        "aspect": "16:9",
        "entries": [
            _base_speech(0.0, 4.0, 0),
            _base_speech(3.0, 3.0, 1),
            _base_video(0.0, 10.0, 0),
        ],
    }
    with pytest.raises(ValidationError, match="speech.*overlap"):
        validate_script(script)


def test_visual_gap_rejected() -> None:
    script = {
        "total_duration": 10.0,
        "resolution": "480p",
        "aspect": "16:9",
        "entries": [
            _base_speech(0.0, 4.0, 0),
            _base_video(0.0, 4.0, 0),
            _base_image(5.0, 10.0, 0),
        ],
    }
    with pytest.raises(ValidationError, match="gap"):
        validate_script(script)


def test_visual_overlap_rejected() -> None:
    script = {
        "total_duration": 10.0,
        "resolution": "480p",
        "aspect": "16:9",
        "entries": [
            _base_video(0.0, 6.0, 0),
            _base_image(5.0, 10.0, 0),
        ],
    }
    with pytest.raises(ValidationError, match="overlap"):
        validate_script(script)


def test_visuals_must_reach_total_duration() -> None:
    script = {
        "total_duration": 12.0,
        "resolution": "480p",
        "aspect": "16:9",
        "entries": [
            _base_video(0.0, 5.0, 0),
            _base_image(5.0, 10.0, 0),
        ],
    }
    with pytest.raises(ValidationError, match="cover"):
        validate_script(script)


def test_video_duration_must_match_end_minus_start() -> None:
    entry = _base_video(0.0, 5.0, 0)
    entry["duration"] = 4.0
    script = {
        "total_duration": 5.0,
        "resolution": "480p",
        "aspect": "16:9",
        "entries": [_base_speech(0.0, 5.0, 0), entry],
    }
    with pytest.raises(ValidationError, match="duration"):
        validate_script(script)


def test_speech_must_fit_within_total_duration() -> None:
    script = {
        "total_duration": 5.0,
        "resolution": "480p",
        "aspect": "16:9",
        "entries": [
            _base_speech(3.0, 5.0, 0),
            _base_video(0.0, 5.0, 0),
        ],
    }
    with pytest.raises(ValidationError, match="total_duration"):
        validate_script(script)


def test_missing_timestamps_field_rejected() -> None:
    speech = _base_speech(0.0, 4.0, 0)
    del speech["timestamps"]
    script = {
        "total_duration": 5.0,
        "resolution": "480p",
        "aspect": "16:9",
        "entries": [speech, _base_video(0.0, 5.0, 0)],
    }
    # Pydantic raises its own ValidationError; we just want the load to fail.
    with pytest.raises(Exception):
        validate_script(script)


def test_empty_timestamps_rejected() -> None:
    speech = _base_speech(0.0, 4.0, 0)
    speech["timestamps"] = []
    script = {
        "total_duration": 5.0,
        "resolution": "480p",
        "aspect": "16:9",
        "entries": [speech, _base_video(0.0, 5.0, 0)],
    }
    with pytest.raises(ValidationError, match="no timestamps"):
        validate_script(script)


def test_timestamps_within_speech_window_pass() -> None:
    speech = _base_speech(0.0, 4.0, 0)
    speech["timestamps"] = [
        {"text": "Hello", "start": 0.0, "end": 0.5},
        {"text": "world", "start": 0.6, "end": 1.2},
    ]
    script = {
        "total_duration": 5.0,
        "resolution": "480p",
        "aspect": "16:9",
        "entries": [speech, _base_video(0.0, 5.0, 0)],
    }
    validate_script(script)


def test_timestamps_out_of_window_rejected() -> None:
    speech = _base_speech(0.0, 2.0, 0)
    speech["timestamps"] = [
        {"text": "late", "start": 0.0, "end": 3.0},  # past duration
    ]
    script = {
        "total_duration": 5.0,
        "resolution": "480p",
        "aspect": "16:9",
        "entries": [speech, _base_video(0.0, 5.0, 0)],
    }
    with pytest.raises(ValidationError, match="out of bounds"):
        validate_script(script)


def test_timestamps_end_before_start_rejected() -> None:
    speech = _base_speech(0.0, 2.0, 0)
    speech["timestamps"] = [
        {"text": "oops", "start": 1.0, "end": 0.5},
    ]
    script = {
        "total_duration": 5.0,
        "resolution": "480p",
        "aspect": "16:9",
        "entries": [speech, _base_video(0.0, 5.0, 0)],
    }
    with pytest.raises(ValidationError, match="end before start"):
        validate_script(script)


def test_speech_sources_default_to_empty() -> None:
    speech = _base_speech(0.0, 4.0, 0)
    assert "sources" not in speech
    script = {
        "total_duration": 5.0,
        "resolution": "480p",
        "aspect": "16:9",
        "entries": [speech, _base_video(0.0, 5.0, 0)],
    }
    result = validate_script(script)
    assert result.entries[0].sources == []


def test_speech_sources_parsed() -> None:
    speech = _base_speech(0.0, 4.0, 0)
    speech["sources"] = [
        {"name": "Wikipedia — Crossing the Rubicon",
         "url": "https://en.wikipedia.org/wiki/Crossing_the_Rubicon"},
    ]
    script = {
        "total_duration": 5.0,
        "resolution": "480p",
        "aspect": "16:9",
        "entries": [speech, _base_video(0.0, 5.0, 0)],
    }
    result = validate_script(script)
    assert result.entries[0].sources[0].url.startswith("https://")
    assert "Wikipedia" in result.entries[0].sources[0].name


def test_validates_from_file(tmp_path: Path) -> None:
    script = {
        "total_duration": 5.0,
        "resolution": "480p",
        "aspect": "16:9",
        "entries": [
            _base_speech(0.0, 4.0, 0),
            _base_video(0.0, 5.0, 0),
        ],
    }
    path = tmp_path / "script.json"
    path.write_text(json.dumps(script))
    validate_script(path)
