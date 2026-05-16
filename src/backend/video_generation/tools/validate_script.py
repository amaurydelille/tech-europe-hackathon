from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field, TypeAdapter

DURATION_TOLERANCE = 0.05  # seconds


class ValidationError(Exception):
    pass


class WordTimestamp(BaseModel):
    text: str
    start: float  # seconds relative to the speech audio start
    end: float  # seconds relative to the speech audio start


class Source(BaseModel):
    """A citation attached to a speech entry.

    `name` is a short human-readable label (e.g. page title or "Wikipedia").
    `url` is the canonical URL the frontend will link to.
    """
    name: str
    url: str


class SpeechEntry(BaseModel):
    kind: Literal["speech"]
    start: float
    duration: float
    text: str
    audio_path: str
    timestamps: list[WordTimestamp]
    sources: list[Source] = Field(default_factory=list)


class VideoEntry(BaseModel):
    kind: Literal["video"]
    start: float
    end: float
    duration: float
    prompt: str
    anchors: list[str] = Field(default_factory=list)
    video_path: str


class ImageEntry(BaseModel):
    kind: Literal["image"]
    start: float
    end: float
    prompt: str
    anchors: list[str] = Field(default_factory=list)
    image_path: str


Entry = Annotated[
    Union[SpeechEntry, VideoEntry, ImageEntry],
    Field(discriminator="kind"),
]


class Script(BaseModel):
    total_duration: float
    resolution: str
    aspect: str
    entries: list[Entry]


_script_adapter = TypeAdapter(Script)


def _load(source: Script | dict | str | Path) -> Script:
    if isinstance(source, Script):
        return source
    if isinstance(source, (str, Path)):
        path = Path(source)
        if path.exists():
            source = json.loads(path.read_text())
    return _script_adapter.validate_python(source)


def validate_script(source: Script | dict | str | Path) -> Script:
    script = _load(source)

    speech = sorted(
        (e for e in script.entries if isinstance(e, SpeechEntry)),
        key=lambda e: e.start,
    )
    for prev, curr in zip(speech, speech[1:]):
        if curr.start < prev.start + prev.duration - DURATION_TOLERANCE:
            raise ValidationError(
                f"speech entries overlap: '{prev.text}' and '{curr.text}'"
            )

    for s in speech:
        if s.start + s.duration > script.total_duration + DURATION_TOLERANCE:
            raise ValidationError(
                f"speech extends past total_duration: '{s.text}'"
            )
        if not s.timestamps:
            raise ValidationError(
                f"speech entry has no timestamps: '{s.text}'. "
                f"Copy the `timestamps` array from gen_tts output into this entry."
            )
        for ts in s.timestamps:
            if ts.end < ts.start - DURATION_TOLERANCE:
                raise ValidationError(
                    f"timestamp end before start in speech '{s.text}': "
                    f"{ts.text!r} {ts.start}->{ts.end}"
                )
            if ts.start < -DURATION_TOLERANCE or ts.end > s.duration + DURATION_TOLERANCE:
                raise ValidationError(
                    f"timestamp out of bounds in speech '{s.text}': "
                    f"{ts.text!r} {ts.start}->{ts.end} (duration {s.duration})"
                )

    visuals = sorted(
        (e for e in script.entries if not isinstance(e, SpeechEntry)),
        key=lambda e: e.start,
    )
    if not visuals:
        raise ValidationError("script has no visual entries")

    if visuals[0].start > DURATION_TOLERANCE:
        raise ValidationError(
            f"visuals must start at 0, first visual starts at {visuals[0].start}"
        )

    for prev, curr in zip(visuals, visuals[1:]):
        if curr.start > prev.end + DURATION_TOLERANCE:
            raise ValidationError(
                f"gap between visuals: ends at {prev.end}, next starts at {curr.start}"
            )
        if curr.start < prev.end - DURATION_TOLERANCE:
            raise ValidationError(
                f"visuals overlap: ends at {prev.end}, next starts at {curr.start}"
            )

    last_end = visuals[-1].end
    if abs(last_end - script.total_duration) > DURATION_TOLERANCE:
        raise ValidationError(
            f"visuals must cover [0, {script.total_duration}], reach {last_end}"
        )

    for v in visuals:
        if isinstance(v, VideoEntry):
            expected = v.end - v.start
            if abs(v.duration - expected) > DURATION_TOLERANCE:
                raise ValidationError(
                    f"video duration mismatch: declared {v.duration}, end-start {expected}"
                )
        if v.end <= v.start:
            raise ValidationError(f"visual has non-positive length at {v.start}")

    return script
