from __future__ import annotations

import argparse
import asyncio
import importlib
import json
import os
import random
import sys
from pathlib import Path
from typing import Callable

from ..config import config, gradium_api_key
from ..ffmpeg_utils import probe_duration

# Gradium caps the account at 3 concurrent WebSocket sessions and rejects extras
# with this exact substring. Multiple gen_tts calls in parallel hit this often
# enough that retrying inside the tool is much simpler than asking every caller
# to throttle themselves.
_CONCURRENCY_ERROR_MARKER = "Concurrency limit exceeded"
_CONCURRENCY_MAX_ATTEMPTS = 2
_CONCURRENCY_BASE_DELAY_S = 1.5

# Additional padding_bonus applied on top of config.tts_padding_bonus when
# brainrot_mode is on. More negative => faster speech.
BRAINROT_PADDING_DELTA = -0.5


def _default_client_factory():
    import gradium

    return gradium.client.GradiumClient(api_key=gradium_api_key())


def _resolve_factory(spec: str | None) -> Callable:
    if not spec:
        return _default_client_factory
    module_name, _, attr = spec.partition(":")
    if not module_name or not attr:
        raise ValueError(f"invalid client factory spec: {spec!r}")
    module = importlib.import_module(module_name)
    return getattr(module, attr)


async def _synthesize(text: str, voice_id: str, client, padding_bonus: float):
    return await client.tts(
        setup={
            "model_name": "default",
            "voice_id": voice_id,
            "output_format": "wav",
            "json_config": {"padding_bonus": padding_bonus},
        },
        text=text,
    )


async def _synthesize_with_retry(text: str, voice_id: str, client, padding_bonus: float):
    """Call Gradium TTS, retrying only on the 3-session concurrency cap.

    Other errors propagate immediately — we don't want to mask a bad voice id
    or an empty payload.
    """
    last_exc: Exception | None = None
    for attempt in range(_CONCURRENCY_MAX_ATTEMPTS):
        try:
            return await _synthesize(text, voice_id, client, padding_bonus)
        except Exception as e:
            if _CONCURRENCY_ERROR_MARKER not in str(e):
                raise
            last_exc = e
            if attempt == _CONCURRENCY_MAX_ATTEMPTS - 1:
                break
            delay = _CONCURRENCY_BASE_DELAY_S * (2 ** attempt) + random.uniform(0, 0.5)
            await asyncio.sleep(delay)
    raise RuntimeError(
        f"Gradium TTS still over the concurrency cap after "
        f"{_CONCURRENCY_MAX_ATTEMPTS} attempts: {last_exc}"
    )


def _extract_timestamps(result) -> list[dict]:
    """Pull `text_with_timestamps` off a Gradium TTSResult into plain dicts.

    Each entry has the segment's local start/end (relative to the speech audio).
    Raises if the SDK did not return any segments — the downstream stitcher
    requires per-word timestamps to render subtitles, so we fail loudly here
    instead of producing a silent video.
    """
    raw = getattr(result, "text_with_timestamps", None) or []
    out: list[dict] = []
    for seg in raw:
        text = getattr(seg, "text", None)
        start = getattr(seg, "start_s", None)
        stop = getattr(seg, "stop_s", None)
        if text is None or start is None or stop is None:
            continue
        out.append({"text": text, "start": float(start), "end": float(stop)})
    if not out:
        raise RuntimeError(
            "Gradium TTS returned no text_with_timestamps segments; "
            "cannot build subtitles for this line."
        )
    return out


def gen_tts(
    text: str,
    out: Path,
    voice_id: str,
    *,
    brainrot_mode: bool = False,
    client_factory: Callable | None = None,
) -> dict:
    if not text.strip():
        raise ValueError("text is empty")
    if not voice_id:
        raise ValueError("voice_id is required (pick one from the prompt's voice catalog)")
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    padding_bonus = config.tts_padding_bonus
    if brainrot_mode:
        padding_bonus += BRAINROT_PADDING_DELTA
    factory = client_factory or _default_client_factory
    client = factory()
    result = asyncio.run(_synthesize_with_retry(text, voice_id, client, padding_bonus))
    out.write_bytes(result.raw_data)
    duration = probe_duration(out)
    return {
        "path": str(out),
        "duration": duration,
        "sample_rate": result.sample_rate or 48000,
        "timestamps": _extract_timestamps(result),
    }


def _main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Gradium text-to-speech to WAV.")
    parser.add_argument("--text", required=True)
    parser.add_argument("--voice-id", required=True,
                        help="Voice id from the prompt's voice catalog. No default.")
    parser.add_argument("--brainrot-mode", action="store_true",
                        help=f"Speed up delivery (adds {BRAINROT_PADDING_DELTA} to padding_bonus).")
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args(argv)

    factory_spec = os.environ.get("VIDGEN_TTS_CLIENT_FACTORY")
    factory = _resolve_factory(factory_spec)

    result = gen_tts(
        text=args.text,
        out=args.out,
        voice_id=args.voice_id,
        brainrot_mode=args.brainrot_mode,
        client_factory=factory,
    )
    json.dump(result, sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(_main())
