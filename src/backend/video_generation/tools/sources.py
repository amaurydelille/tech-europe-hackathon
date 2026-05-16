"""Emit a `final_sources.json` listing every cited source with its absolute timestamp.

The frontend reads this file to display source links that surface in sync with
the narration. One entry is emitted per (speech entry × source) pair so the
same URL cited at multiple moments produces multiple, time-ordered entries.
"""
from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel

from .validate_script import Script, SpeechEntry


class SourceCite(BaseModel):
    name: str
    url: str
    timestamp: float  # absolute seconds in the final video


class SourcesFile(BaseModel):
    sources: list[SourceCite]


def build_sources(script: Script) -> SourcesFile:
    """Collect each cited source once, keyed by URL.

    If the same URL is attached to several speech entries, only the **first**
    occurrence (lowest absolute timestamp) is kept — the frontend wants one
    link per source, not a duplicate per mention.
    """
    speeches = sorted(
        (e for e in script.entries if isinstance(e, SpeechEntry)),
        key=lambda e: e.start,
    )
    seen: set[str] = set()
    cites: list[SourceCite] = []
    for s in speeches:
        for src in s.sources:
            if src.url in seen:
                continue
            seen.add(src.url)
            cites.append(SourceCite(name=src.name, url=src.url, timestamp=s.start))
    return SourcesFile(sources=cites)


def write_sources(script: Script, out_path: Path) -> Path:
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    sources_file = build_sources(script)
    out_path.write_text(sources_file.model_dump_json(indent=2))
    return out_path
