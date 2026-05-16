from __future__ import annotations

from pathlib import Path

import pytest

from backend.video_generation.tools.subtitles import build_cues, render_cue_png, Cue
from backend.video_generation.tools.validate_script import SpeechEntry, WordTimestamp


def _speech(start: float, duration: float, text: str, ts: list[tuple[str, float, float]]) -> SpeechEntry:
    return SpeechEntry(
        kind="speech",
        start=start,
        duration=duration,
        text=text,
        audio_path="x.wav",
        timestamps=[WordTimestamp(text=t, start=a, end=b) for t, a, b in ts],
    )


def test_build_cues_raises_when_speech_has_no_timestamps() -> None:
    s = SpeechEntry(
        kind="speech",
        start=2.0,
        duration=3.5,
        text="A single line of narration.",
        audio_path="x.wav",
        timestamps=[],
    )
    with pytest.raises(ValueError, match="no timestamps"):
        build_cues([s])


def test_build_cues_groups_word_level_timestamps_by_character_limit() -> None:
    words = [
        ("The", 0.00, 0.20),
        ("quick", 0.21, 0.45),
        ("brown", 0.46, 0.70),
        ("fox", 0.71, 0.85),
        ("jumps", 0.86, 1.15),
        ("over", 1.16, 1.35),
        ("the", 1.36, 1.50),
        ("lazy", 1.51, 1.80),
        ("dog", 1.81, 2.05),
    ]
    s = _speech(start=10.0, duration=2.2, text="The quick brown fox jumps over the lazy dog", ts=words)
    cues = build_cues([s])
    assert len(cues) >= 2
    for c in cues:
        assert c.start >= 10.0
        assert c.end <= 10.0 + 2.2 + 0.01
        assert len(c.text) <= 36
    joined = " ".join(c.text for c in cues)
    assert joined == "The quick brown fox jumps over the lazy dog"


def test_build_cues_offsets_into_absolute_timeline() -> None:
    s = _speech(
        start=5.0,
        duration=1.0,
        text="hi there",
        ts=[("hi", 0.0, 0.3), ("there", 0.4, 0.9)],
    )
    cues = build_cues([s])
    assert len(cues) == 1
    assert cues[0].start == 5.0
    assert abs(cues[0].end - 5.9) < 0.01


def test_render_cue_png_writes_transparent_image(tmp_path: Path) -> None:
    cue = Cue(start=0.0, end=2.0, text="Hello, world.")
    out = tmp_path / "cue.png"
    w, h = render_cue_png(cue, out, video_w=480, video_h=854)

    assert out.is_file()
    assert w > 0 and h > 0
    # Sanity-check it is RGBA with at least one transparent pixel.
    from PIL import Image

    img = Image.open(out)
    assert img.mode == "RGBA"
    alpha = img.getchannel("A")
    assert alpha.getextrema()[0] == 0  # has transparent regions
