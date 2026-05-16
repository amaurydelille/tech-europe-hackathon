from __future__ import annotations

import argparse
import asyncio
import importlib
import json
import os
import sys
from pathlib import Path
from typing import Callable

from ..config import config, gradium_api_key
from ..ffmpeg_utils import probe_duration


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


async def _synthesize(text: str, voice_id: str, client):
    return await client.tts(
        setup={
            "model_name": "default",
            "voice_id": voice_id,
            "output_format": "wav",
        },
        text=text,
    )


def gen_tts(
    text: str,
    out: Path,
    voice_id: str | None = None,
    *,
    client_factory: Callable | None = None,
) -> dict:
    if not text.strip():
        raise ValueError("text is empty")
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    voice_id = voice_id or config.voice_id
    factory = client_factory or _default_client_factory
    client = factory()
    result = asyncio.run(_synthesize(text, voice_id, client))
    out.write_bytes(result.raw_data)
    duration = probe_duration(out)
    return {
        "path": str(out),
        "duration": duration,
        "sample_rate": result.sample_rate or 48000,
    }


def _main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Gradium text-to-speech to WAV.")
    parser.add_argument("--text", required=True)
    parser.add_argument("--voice-id", default=None)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args(argv)

    factory_spec = os.environ.get("VIDGEN_TTS_CLIENT_FACTORY")
    factory = _resolve_factory(factory_spec)

    result = gen_tts(
        text=args.text,
        out=args.out,
        voice_id=args.voice_id,
        client_factory=factory,
    )
    json.dump(result, sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(_main())
