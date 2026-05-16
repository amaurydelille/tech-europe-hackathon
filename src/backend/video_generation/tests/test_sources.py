from __future__ import annotations

import json
from pathlib import Path

from backend.video_generation.tools.sources import build_sources, write_sources
from backend.video_generation.tools.validate_script import (
    Script,
    SpeechEntry,
    VideoEntry,
    WordTimestamp,
    Source,
)


def _speech(start: float, duration: float, idx: int, sources: list[dict] | None = None) -> SpeechEntry:
    return SpeechEntry(
        kind="speech",
        start=start,
        duration=duration,
        text=f"line {idx}",
        audio_path=f"a{idx}.wav",
        timestamps=[WordTimestamp(text=f"l{idx}", start=0.0, end=duration)],
        sources=[Source(**s) for s in (sources or [])],
    )


def _video(start: float, end: float, idx: int) -> VideoEntry:
    return VideoEntry(
        kind="video", start=start, end=end, duration=end - start,
        prompt="x", anchors=[], video_path=f"v{idx}.mp4",
    )


def test_build_sources_empty_when_no_citations() -> None:
    script = Script(
        total_duration=5.0, resolution="480p", aspect="9:16",
        entries=[_speech(0.0, 4.0, 0), _video(0.0, 5.0, 0)],
    )
    assert build_sources(script).sources == []


def test_build_sources_deduplicates_repeats_by_url() -> None:
    """If the same URL is cited at multiple moments, keep only the earliest."""
    s1 = _speech(0.0, 2.0, 0, sources=[
        {"name": "Wiki - early", "url": "https://w.example/page"},
    ])
    s2 = _speech(4.0, 2.0, 1, sources=[
        {"name": "Wiki - reused later", "url": "https://w.example/page"},
        {"name": "Other", "url": "https://other.example/x"},
    ])
    script = Script(
        total_duration=6.0, resolution="480p", aspect="9:16",
        entries=[s1, s2, _video(0.0, 6.0, 0)],
    )
    out = build_sources(script).sources
    assert [c.url for c in out] == [
        "https://w.example/page",
        "https://other.example/x",
    ]
    assert out[0].name == "Wiki - early"
    assert out[0].timestamp == 0.0


def test_build_sources_one_per_url_ordered_by_first_citation() -> None:
    s1 = _speech(0.0, 2.0, 0, sources=[
        {"name": "A", "url": "https://a.example/x"},
    ])
    s2 = _speech(4.0, 2.0, 1, sources=[
        {"name": "B", "url": "https://b.example/y"},
        {"name": "C", "url": "https://c.example/z"},
    ])
    s3 = _speech(2.0, 2.0, 2, sources=[
        {"name": "D", "url": "https://d.example/w"},
    ])  # out of order on purpose
    script = Script(
        total_duration=6.0, resolution="480p", aspect="9:16",
        entries=[s1, s2, s3, _video(0.0, 6.0, 0)],
    )
    out = build_sources(script).sources
    assert [c.timestamp for c in out] == [0.0, 2.0, 4.0, 4.0]
    assert [c.url for c in out] == [
        "https://a.example/x",
        "https://d.example/w",
        "https://b.example/y",
        "https://c.example/z",
    ]


def test_write_sources_produces_well_formed_json(tmp_path: Path) -> None:
    script = Script(
        total_duration=4.0, resolution="480p", aspect="9:16",
        entries=[
            _speech(0.0, 2.0, 0, sources=[{"name": "Wiki", "url": "https://en.wikipedia.org/Caesar"}]),
            _video(0.0, 4.0, 0),
        ],
    )
    out = tmp_path / "final_sources.json"
    write_sources(script, out)
    data = json.loads(out.read_text())
    assert data["sources"][0] == {
        "name": "Wiki",
        "url": "https://en.wikipedia.org/Caesar",
        "timestamp": 0.0,
    }
