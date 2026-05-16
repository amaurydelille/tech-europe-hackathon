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
class _FakeSegment:
    text: str
    start_s: float
    stop_s: float


@dataclass
class _FakeResult:
    raw_data: bytes
    sample_rate: int = 48000
    output_format: str = "wav"
    request_id: str = "fake"
    text_with_timestamps: list = None  # type: ignore[assignment]


_DEFAULT_SEGMENTS = [_FakeSegment(text="stub", start_s=0.0, stop_s=0.1)]


class _FakeClient:
    def __init__(self, wav_bytes: bytes, segments: list[_FakeSegment] | None = None) -> None:
        self._wav = wav_bytes
        # Default to a non-empty list so happy-path tests pass through
        # gen_tts's no-segments guard. Pass `segments=[]` to exercise the guard.
        self._segments = _DEFAULT_SEGMENTS if segments is None else segments
        self.calls: list[dict] = []

    async def tts(self, setup, text):  # noqa: ANN001 - matches sdk
        self.calls.append({"setup": dict(setup), "text": text})
        return _FakeResult(
            raw_data=self._wav,
            text_with_timestamps=list(self._segments),
        )


def test_gen_tts_writes_wav_and_returns_duration(tmp_path: Path) -> None:
    from backend.video_generation.config import config as cfg

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
    assert result["path"] == str(out)
    assert result["sample_rate"] == 48000
    # Audio is sped up by config.tts_speed after Gradium returns.
    assert result["duration"] == pytest.approx(2.5 / cfg.tts_speed, abs=0.1)

    assert len(client.calls) == 1
    assert client.calls[0]["text"] == "Hello world"
    assert client.calls[0]["setup"]["voice_id"] == "voice-xyz"
    assert client.calls[0]["setup"]["output_format"] == "wav"


def test_gen_tts_emits_timestamps(tmp_path: Path) -> None:
    from backend.video_generation.config import config as cfg

    wav = _make_wav_bytes(duration_s=1.5)
    segments = [
        _FakeSegment(text="Hello", start_s=0.0, stop_s=0.5),
        _FakeSegment(text="world", start_s=0.6, stop_s=1.2),
    ]
    client = _FakeClient(wav, segments=segments)
    out = tmp_path / "speech.wav"

    result = gen_tts.gen_tts(
        text="Hello world",
        out=out,
        voice_id="voice-xyz",
        client_factory=lambda: client,
    )

    s = cfg.tts_speed
    assert result["timestamps"] == [
        {"text": "Hello", "start": 0.0, "end": pytest.approx(0.5 / s)},
        {"text": "world", "start": pytest.approx(0.6 / s), "end": pytest.approx(1.2 / s)},
    ]


class _ConcurrencyThenSuccessClient:
    """Raises the Gradium concurrency error N times, then succeeds."""

    def __init__(self, wav: bytes, fail_n: int, segments: list[_FakeSegment]) -> None:
        self._wav = wav
        self._remaining_failures = fail_n
        self._segments = segments
        self.attempts = 0

    async def tts(self, setup, text):
        self.attempts += 1
        if self._remaining_failures > 0:
            self._remaining_failures -= 1
            raise Exception(
                "Websocket connection error: Concurrency limit exceeded: "
                "3 active sessions (1008)"
            )
        return _FakeResult(raw_data=self._wav, text_with_timestamps=list(self._segments))


def test_gen_tts_retries_on_concurrency_error(tmp_path: Path, monkeypatch) -> None:
    # Make sleeps instant so the test stays fast.
    monkeypatch.setattr(gen_tts.asyncio, "sleep", lambda *_args, **_kwargs: _noop_awaitable())

    wav = _make_wav_bytes(duration_s=0.5)
    segments = [_FakeSegment(text="hi", start_s=0.0, stop_s=0.5)]
    client = _ConcurrencyThenSuccessClient(wav, fail_n=1, segments=segments)
    out = tmp_path / "speech.wav"

    result = gen_tts.gen_tts(text="hi", out=out, voice_id="v", client_factory=lambda: client)

    assert client.attempts == 2
    assert result["timestamps"][0]["text"] == "hi"


def test_gen_tts_does_not_retry_other_errors(tmp_path: Path) -> None:
    class _AlwaysBadClient:
        async def tts(self, setup, text):
            raise RuntimeError("voice_id is unknown")

    out = tmp_path / "speech.wav"
    with pytest.raises(RuntimeError, match="voice_id is unknown"):
        gen_tts.gen_tts(text="hi", out=out, voice_id="v",
                        client_factory=lambda: _AlwaysBadClient())


async def _noop_awaitable():
    return None


def test_gen_tts_raises_when_sdk_returns_no_timestamps(tmp_path: Path) -> None:
    wav = _make_wav_bytes(duration_s=1.0)
    client = _FakeClient(wav, segments=[])
    out = tmp_path / "speech.wav"

    with pytest.raises(RuntimeError, match="no text_with_timestamps"):
        gen_tts.gen_tts(
            text="hi",
            out=out,
            voice_id="v",
            client_factory=lambda: client,
        )


def test_gen_tts_brainrot_mode_speeds_up_audio_and_timestamps(tmp_path: Path) -> None:
    from backend.video_generation.config import config as cfg

    wav = _make_wav_bytes(duration_s=4.0)
    segments = [
        _FakeSegment(text="word", start_s=0.0, stop_s=2.0),
        _FakeSegment(text="two", start_s=2.0, stop_s=4.0),
    ]
    client = _FakeClient(wav, segments=segments)
    out = tmp_path / "speech.wav"

    result = gen_tts.gen_tts(
        text="word two", out=out, voice_id="v",
        brainrot_mode=True,
        client_factory=lambda: client,
    )

    # ffmpeg atempo is exact on tone-free silence; brainrot is config.brainrot_speed.
    expected_duration = 4.0 / cfg.brainrot_speed
    assert result["duration"] == pytest.approx(expected_duration, abs=0.1)
    # Timestamps must be rescaled by the same factor.
    assert result["timestamps"][1]["end"] == pytest.approx(4.0 / cfg.brainrot_speed, abs=0.01)


def test_gen_tts_normal_mode_speeds_up_audio_and_timestamps(tmp_path: Path) -> None:
    from backend.video_generation.config import config as cfg

    wav = _make_wav_bytes(duration_s=2.2)
    segments = [_FakeSegment(text="hi", start_s=0.0, stop_s=2.2)]
    client = _FakeClient(wav, segments=segments)
    out = tmp_path / "speech.wav"

    result = gen_tts.gen_tts(
        text="hi", out=out, voice_id="v", client_factory=lambda: client,
    )

    expected_duration = 2.2 / cfg.tts_speed
    assert result["duration"] == pytest.approx(expected_duration, abs=0.1)
    assert result["timestamps"][0]["end"] == pytest.approx(2.2 / cfg.tts_speed, abs=0.01)


def test_gen_tts_requires_voice_id(tmp_path: Path) -> None:
    wav = _make_wav_bytes(duration_s=1.0)
    client = _FakeClient(wav)
    out = tmp_path / "speech.wav"
    with pytest.raises(ValueError, match="voice_id is required"):
        gen_tts.gen_tts(text="hi", out=out, voice_id="", client_factory=lambda: client)


def test_gen_tts_uses_ffprobe_duration(tmp_path: Path, monkeypatch) -> None:
    wav = _make_wav_bytes(duration_s=1.0)
    client = _FakeClient(wav)
    out = tmp_path / "speech.wav"

    monkeypatch.setattr(gen_tts, "probe_duration", lambda path: 3.25)

    result = gen_tts.gen_tts(
        text="hello",
        out=out,
        voice_id="v",
        client_factory=lambda: client,
    )

    assert result["duration"] == 3.25


def test_gen_tts_cli_prints_json(tmp_path: Path, monkeypatch) -> None:
    """Run the CLI as a subprocess, with the gradium client patched via PYTHONPATH-injected fake."""
    wav = _make_wav_bytes(duration_s=0.5)
    # Pre-write a "fake server" module that the CLI imports through env hook
    fake_module = tmp_path / "fake_client_factory.py"
    fake_module.write_text(
        """
import asyncio, wave, io
from dataclasses import dataclass, field

WAV = bytes.fromhex(%r)

@dataclass
class Seg:
    text: str = "stub"
    start_s: float = 0.0
    stop_s: float = 0.1

@dataclass
class R:
    raw_data: bytes = WAV
    sample_rate: int = 48000
    output_format: str = "wav"
    request_id: str = "fake"
    text_with_timestamps: list = field(default_factory=lambda: [Seg()])

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
         "--text", "hello", "--voice-id", "test-voice", "--out", str(out)],
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )
    from backend.video_generation.config import config as cfg

    data = json.loads(proc.stdout.strip())
    assert data["path"] == str(out)
    assert data["duration"] == pytest.approx(0.5 / cfg.tts_speed, abs=0.1)
    assert out.is_file()
