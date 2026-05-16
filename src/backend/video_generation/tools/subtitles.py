"""Build subtitle cues from speech entries and serialize them to SRT.

The TTS step returns word-level timestamps for every narration line. We group
those into compact readable cues and emit a standard `.srt` file next to the
final MP4 so downstream players / app code can render subtitles however they
like (we no longer burn them into the video ourselves).
"""

from __future__ import annotations

from dataclasses import dataclass

from .validate_script import SpeechEntry

# Cue grouping limits. Tuned for 9:16 portrait at ~15-second narration density.
MAX_CUE_CHARS = 36
MAX_CUE_DURATION = 2.5  # seconds


@dataclass
class Cue:
    start: float  # absolute seconds in final video
    end: float
    text: str


def build_cues(speeches: list[SpeechEntry]) -> list[Cue]:
    """Group word-level timestamps into compact readable cues.

    Every speech entry must carry timestamps (validated upstream by
    `validate_script`). We do not synthesize a fake whole-line cue for entries
    without timestamps — that would silently mask an upstream bug.
    """
    cues: list[Cue] = []
    for s in speeches:
        if not s.timestamps:
            raise ValueError(
                f"speech entry has no timestamps: '{s.text}'. "
                f"Copy the `timestamps` array from gen_tts output into the script."
            )
        ts = sorted(s.timestamps, key=lambda t: t.start)
        cur_start: float | None = None
        cur_end: float | None = None
        cur_words: list[str] = []
        for t in ts:
            word = t.text.strip()
            if not word:
                continue
            tentative = " ".join([*cur_words, word])
            duration_so_far = (t.end - cur_start) if cur_start is not None else 0
            if cur_words and (len(tentative) > MAX_CUE_CHARS or duration_so_far > MAX_CUE_DURATION):
                cues.append(
                    Cue(
                        start=s.start + cur_start,
                        end=s.start + cur_end,
                        text=" ".join(cur_words),
                    )
                )
                cur_words = [word]
                cur_start = t.start
                cur_end = t.end
            else:
                if cur_start is None:
                    cur_start = t.start
                cur_words.append(word)
                cur_end = t.end
        if cur_words:
            cues.append(
                Cue(
                    start=s.start + (cur_start or 0.0),
                    end=s.start + (cur_end or 0.0),
                    text=" ".join(cur_words),
                )
            )
    return sorted(cues, key=lambda c: c.start)


def _format_srt_time(seconds: float) -> str:
    if seconds < 0:
        seconds = 0.0
    total_ms = int(round(seconds * 1000))
    ms = total_ms % 1000
    total_s = total_ms // 1000
    s = total_s % 60
    total_m = total_s // 60
    m = total_m % 60
    h = total_m // 60
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def build_srt(cues: list[Cue]) -> str:
    """Serialize cues into a SubRip (.srt) string.

    Returns "" if the input list is empty.
    """
    blocks: list[str] = []
    for i, c in enumerate(cues, start=1):
        blocks.append(
            f"{i}\n{_format_srt_time(c.start)} --> {_format_srt_time(c.end)}\n{c.text}\n"
        )
    return "\n".join(blocks)
