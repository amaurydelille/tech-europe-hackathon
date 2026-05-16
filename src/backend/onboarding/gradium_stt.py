from dataclasses import dataclass
from typing import AsyncIterator

from gradium.client import GradiumClient


@dataclass
class PartialTranscript:
    text: str


@dataclass
class TurnEnd:
    text: str


@dataclass
class End:
    pass


SttEvent = PartialTranscript | TurnEnd | End


class SttSession:
    """Wraps gradium's streaming STT with VAD-based turn detection.

    On each VAD `step` message we check the 2-second-horizon inactivity probability.
    When it crosses `inactivity_threshold` we emit a `TurnEnd` carrying the text
    accumulated since the previous turn end.
    """

    def __init__(
        self,
        client: GradiumClient,
        *,
        model_name: str = "default",
        inactivity_threshold: float = 0.7,
        sustained_steps: int = 5,
    ):
        self._client = client
        self._model_name = model_name
        self._inactivity_threshold = inactivity_threshold
        self._sustained_steps = max(1, sustained_steps)
        self._stt = None
        self._buffer: list[str] = []
        self._in_turn: bool = False
        self._above_streak: int = 0

    async def __aenter__(self) -> "SttSession":
        self._stt = self._client.stt_realtime(
            model_name=self._model_name,
            input_format="pcm",
        )
        await self._stt.__aenter__()
        return self

    async def __aexit__(self, exc_type, exc, tb):
        if self._stt is not None:
            await self._stt.__aexit__(exc_type, exc, tb)
            self._stt = None

    async def send_audio(self, audio: bytes) -> None:
        if self._stt is None:
            raise RuntimeError("SttSession not started")
        await self._stt.send_audio(audio)

    async def send_eos(self) -> None:
        if self._stt is None:
            raise RuntimeError("SttSession not started")
        await self._stt.send_eos()

    async def events(self) -> AsyncIterator[SttEvent]:
        if self._stt is None:
            raise RuntimeError("SttSession not started")
        async for msg in self._stt:
            kind = msg.get("type")
            if kind == "text":
                text = msg.get("text", "")
                if not text:
                    continue
                self._buffer.append(text)
                self._in_turn = True
                self._above_streak = 0
                yield PartialTranscript(text=text)
            elif kind == "step":
                vad = msg.get("vad") or []
                if len(vad) < 3:
                    continue
                inactivity = vad[2].get("inactivity_prob", 0.0)
                if inactivity > self._inactivity_threshold:
                    self._above_streak += 1
                else:
                    self._above_streak = 0
                if (
                    self._in_turn
                    and self._above_streak >= self._sustained_steps
                    and self._buffer
                ):
                    turn_text = " ".join(self._buffer).strip()
                    self._buffer.clear()
                    self._in_turn = False
                    self._above_streak = 0
                    if turn_text:
                        yield TurnEnd(text=turn_text)
            elif kind == "end_of_stream":
                if self._buffer:
                    turn_text = " ".join(self._buffer).strip()
                    self._buffer.clear()
                    if turn_text:
                        yield TurnEnd(text=turn_text)
                yield End()
                return
