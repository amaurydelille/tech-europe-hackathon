from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.video_generation.run import load_lesson


def test_load_md_passthrough(tmp_path: Path) -> None:
    md = tmp_path / "lesson.md"
    md.write_text("# Title\n\nBody.\n")
    assert load_lesson(md) == "# Title\n\nBody.\n"


def test_load_json_extracts_full_markdown_and_appends_sources(tmp_path: Path) -> None:
    payload = {
        "full_markdown": "# Lesson\n\nContent.",
        "references": [
            {"id": 1, "title": "Wiki — Caesar", "url": "https://en.wikipedia.org/Caesar"},
            {"id": 2, "title": "YouTube clip", "url": "https://youtu.be/abc"},
        ],
    }
    p = tmp_path / "input.json"
    p.write_text(json.dumps(payload))
    text = load_lesson(p)
    assert text.startswith("# Lesson")
    assert "## Sources" in text
    assert "[Wiki — Caesar](https://en.wikipedia.org/Caesar)" in text
    assert "[YouTube clip](https://youtu.be/abc)" in text


def test_load_json_without_references_just_returns_markdown(tmp_path: Path) -> None:
    p = tmp_path / "input.json"
    p.write_text(json.dumps({"full_markdown": "# Just text"}))
    assert load_lesson(p).strip() == "# Just text"


def test_load_json_skips_refs_without_url(tmp_path: Path) -> None:
    p = tmp_path / "input.json"
    p.write_text(json.dumps({
        "full_markdown": "# X",
        "references": [
            {"title": "no url"},
            {"title": "good", "url": "https://ok.example"},
        ],
    }))
    text = load_lesson(p)
    assert "(https://ok.example)" in text
    assert "no url" not in text


def test_load_json_without_full_markdown_field_rejected(tmp_path: Path) -> None:
    p = tmp_path / "input.json"
    p.write_text(json.dumps({"references": []}))
    with pytest.raises(ValueError, match="full_markdown"):
        load_lesson(p)
