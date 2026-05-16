from typing import Any, AsyncIterator

from gradium.client import GradiumClient


async def speak(
    client: GradiumClient,
    text: str,
    *,
    model_name: str = "default",
    voice_id: str = "bvNlBZ3DWDoVy_Yc",
    output_format: str = "pcm",
) -> AsyncIterator[dict[str, Any]]:
    """Synthesize `text` and yield TTS events.

    First yield is `{"type": "ready", "sample_rate": int | None}` so the caller
    can configure playback at the rate the server is actually emitting.
    Subsequent yields are `{"type": "audio", "audio": bytes}`.
    """
    tts = client.tts_realtime(
        model_name=model_name,
        voice_id=voice_id,
        output_format=output_format,
        wait_for_ready_on_start=True,
    )
    async with tts:
        ready = tts.ready or {}
        yield {"type": "ready", "sample_rate": ready.get("sample_rate")}
        await tts.send_text(text)
        await tts.send_eos()
        async for msg in tts:
            if msg.get("type") == "audio":
                audio = msg.get("audio")
                if audio:
                    yield {"type": "audio", "audio": audio}
