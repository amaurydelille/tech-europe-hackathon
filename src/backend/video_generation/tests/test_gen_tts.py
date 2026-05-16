from __future__ import annotations

import asyncio
import io
import json
import subprocess
import sys
import wave
from dataclasses import dataclass
from pathlib import Path

import pytest

from backend.video_generation.tools import gen_tts


def _make_wav_bytes(duration_s: float, sample_rate: int = 48000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(b"\x00\x00" * int(duration_s * sample_rate))
    return buf.getvalue()


@dataclass
class _FakeResult:
    raw_data: bytes
    sample_rate: int = 48000
    output_format: str = "wav"
    request_id: str = "fake"
    text_with_timestamps: list = None  # type: ignore[assignment]


class _FakeClient:
    def __init__(self, wav_bytes: bytes) -> None:
        self._wav = wav_bytes
        self.calls: list[dict] = []

    async def tts(self, setup, text):  # noqa: ANN001 - matches sdk
        self.calls.append({"setup": dict(setup), "text": text})
        return _FakeResult(raw_data=self._wav, text_with_timestamps=[])


def test_gen_tts_writes_wav_and_returns_duration(tmp_path: Path) -> None:
    wav = _make_wav_bytes(duration_s=2.5)
    client = _FakeClient(wav)
    out = tmp_path / "speech.wav"

    result = gen_tts.gen_tts(
        text="Hello world",
        out=out,
        voice_id="voice-xyz",
        client_factory=lambda: client,
    )

    assert out.is_file()
    assert out.read_bytes() == wav
    assert result["path"] == str(out)
    assert result["sample_rate"] == 48000
    assert abs(result["duration"] - 2.5) < 0.01

    assert len(client.calls) == 1
    assert client.calls[0]["text"] == "Hello world"
    assert client.calls[0]["setup"]["voice_id"] == "voice-xyz"
    assert client.calls[0]["setup"]["output_format"] == "wav"


def test_gen_tts_uses_default_voice_id_when_missing(tmp_path: Path) -> None:
    from backend.video_generation.config import config as cfg

    wav = _make_wav_bytes(duration_s=1.0)
    client = _FakeClient(wav)
    out = tmp_path / "speech.wav"

    gen_tts.gen_tts(
        text="hi",
        out=out,
        client_factory=lambda: client,
    )
    assert client.calls[0]["setup"]["voice_id"] == cfg.voice_id


def test_gen_tts_cli_prints_json(tmp_path: Path, monkeypatch) -> None:
    """Run the CLI as a subprocess, with the gradium client patched via PYTHONPATH-injected fake."""
    wav = _make_wav_bytes(duration_s=0.5)
    # Pre-write a "fake server" module that the CLI imports through env hook
    fake_module = tmp_path / "fake_client_factory.py"
    fake_module.write_text(
        """
import asyncio, wave, io
from dataclasses import dataclass

WAV = bytes.fromhex(%r)

@dataclass
class R:
    raw_data: bytes = WAV
    sample_rate: int = 48000
    output_format: str = "wav"
    request_id: str = "fake"
    text_with_timestamps: list = None

class C:
    async def tts(self, setup, text):
        return R()

def factory():
    return C()
"""
        % wav.hex()
    )
    env = {
        **__import__("os").environ,
        "VIDGEN_TTS_CLIENT_FACTORY": f"fake_client_factory:factory",
        "PYTHONPATH": f"{tmp_path}:{__import__('os').environ.get('PYTHONPATH','')}",
    }
    out = tmp_path / "out.wav"
    proc = subprocess.run(
        [sys.executable, "-m", "backend.video_generation.tools.gen_tts",
         "--text", "hello", "--out", str(out)],
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )
    data = json.loads(proc.stdout.strip())
    assert data["path"] == str(out)
    assert abs(data["duration"] - 0.5) < 0.01
    assert out.is_file()
