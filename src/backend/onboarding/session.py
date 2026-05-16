import asyncio
import logging
from dataclasses import dataclass
from typing import Any, AsyncIterator

from agents import Runner
from gradium.client import GradiumClient

from .agent import OPENING_LINE, OnboardingContext, build_agent
from .config import Settings
from .gradium_stt import End, PartialTranscript, SttSession, TurnEnd
from .gradium_tts import speak
from .profile import UserProfile

log = logging.getLogger(__name__)


@dataclass
class Event:
    kind: str
    payload: Any = None


class OnboardingSession:
    """Orchestrates the STT → Agent → TTS loop for one user.

    The FastAPI layer feeds audio in via `push_audio()` and consumes events via
    `events()`. The session ends when the agent calls `finish_onboarding` (emits
    `done` with the profile) or the max-turn cap is hit.
    """

    def __init__(self, settings: Settings):
        self._settings = settings
        self._client = GradiumClient(api_key=settings.gradium_api_key)
        self._stt: SttSession | None = None
        self._stt_cm = None
        self._agent = build_agent()
        self._context = OnboardingContext()
        self._history: list[Any] = []
        self._out: asyncio.Queue[Event | None] = asyncio.Queue()
        self._stt_task: asyncio.Task | None = None
        self._speak_task: asyncio.Task | None = None
        self._user_turns: int = 0
        self._done: bool = False

    async def start(self) -> None:
        self._stt = SttSession(
            self._client,
            model_name=self._settings.stt_model,
            inactivity_threshold=self._settings.inactivity_threshold,
            sustained_steps=self._settings.inactivity_sustained_steps,
        )
        await self._stt.__aenter__()
        self._stt_task = asyncio.create_task(self._consume_stt())
        self._start_speak(OPENING_LINE, record=True)

    async def push_audio(self, audio: bytes) -> None:
        if self._stt is None or self._done:
            return
        await self._stt.send_audio(audio)

    async def aclose(self) -> None:
        self._done = True
        await self._cancel_speech()
        if self._stt_task is not None:
            self._stt_task.cancel()
            try:
                await self._stt_task
            except (asyncio.CancelledError, Exception):
                pass
        if self._stt is not None:
            try:
                await self._stt.__aexit__(None, None, None)
            except Exception:
                pass
            self._stt = None
        await self._out.put(None)

    async def events(self) -> AsyncIterator[Event]:
        while True:
            evt = await self._out.get()
            if evt is None:
                return
            yield evt

    async def _consume_stt(self) -> None:
        assert self._stt is not None
        try:
            async for stt_event in self._stt.events():
                if isinstance(stt_event, PartialTranscript):
                    # Barge-in: user is speaking, cut off any in-flight TTS so
                    # they don't have to talk over the agent.
                    await self._cancel_speech()
                    await self._out.put(
                        Event("partial_transcript", {"text": stt_event.text})
                    )
                elif isinstance(stt_event, TurnEnd):
                    await self._handle_user_turn(stt_event.text)
                    if self._done:
                        return
                elif isinstance(stt_event, End):
                    return
        except asyncio.CancelledError:
            raise
        except Exception as e:
            log.exception("STT consumer crashed")
            await self._out.put(Event("error", {"message": str(e)}))
            await self._out.put(None)

    async def _handle_user_turn(self, text: str) -> None:
        # User finished a turn — make sure any prior speech is fully stopped
        # before we respond. (PartialTranscript usually cancels first, but
        # turn-end without partials is possible.)
        await self._cancel_speech()

        self._user_turns += 1
        await self._out.put(Event("user_turn", {"text": text}))
        self._history.append({"role": "user", "content": text})

        if self._user_turns >= self._settings.max_user_turns and self._context.profile is None:
            self._start_speak(
                "Thanks — I have enough to get started. I'll set things up now.",
                record=False,
            )
            await self._wait_for_speech()
            await self._finish(profile=None)
            return

        try:
            result = await Runner.run(
                self._agent,
                input=self._history,
                context=self._context,
                max_turns=4,
            )
        except Exception as e:
            log.exception("Agent run failed")
            await self._out.put(Event("error", {"message": str(e)}))
            await self._finish(profile=None)
            return

        self._history = result.to_input_list()
        assistant_text = (result.final_output or "").strip()

        if assistant_text:
            self._start_speak(assistant_text, record=False)

        if self._context.profile is not None:
            await self._wait_for_speech()
            await self._finish(profile=self._context.profile)

    def _start_speak(self, text: str, *, record: bool) -> None:
        """Kick off TTS as a background task so the STT loop can interrupt it."""
        self._speak_task = asyncio.create_task(self._say(text, record=record))

    async def _wait_for_speech(self) -> None:
        task = self._speak_task
        if task is None:
            return
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass

    async def _cancel_speech(self) -> None:
        task = self._speak_task
        if task is None or task.done():
            return
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass

    async def _say(self, text: str, *, record: bool) -> None:
        if record:
            self._history.append({"role": "assistant", "content": text})
        await self._out.put(Event("assistant_text", {"text": text}))
        await self._out.put(Event("speech_start"))
        interrupted = False
        try:
            async for evt in speak(
                self._client,
                text,
                model_name=self._settings.tts_model,
                voice_id=self._settings.tts_voice_id,
                output_format="pcm",
            ):
                if evt["type"] == "ready":
                    await self._out.put(
                        Event("audio_format", {"sample_rate": evt.get("sample_rate")})
                    )
                elif evt["type"] == "audio":
                    await self._out.put(Event("audio", evt["audio"]))
        except asyncio.CancelledError:
            interrupted = True
            raise
        except Exception as e:
            log.exception("TTS failed")
            # put_nowait so we don't risk awaiting during teardown
            self._out.put_nowait(Event("error", {"message": f"tts: {e}"}))
        finally:
            self._out.put_nowait(
                Event("speech_interrupted" if interrupted else "speech_end")
            )

    async def _finish(self, *, profile: UserProfile | None) -> None:
        payload = {"profile": profile.model_dump() if profile else None}
        await self._out.put(Event("done", payload))
        self._done = True
        await self._out.put(None)
