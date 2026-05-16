import asyncio
import json
import logging

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from .config import load_settings
from .session import OnboardingSession

log = logging.getLogger(__name__)

app = FastAPI(title="Onboarding voice backend")


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.websocket("/ws/onboarding")
async def ws_onboarding(ws: WebSocket) -> None:
    await ws.accept()
    try:
        settings = load_settings()
        session = OnboardingSession(settings)
        await session.start()
    except Exception as e:
        log.exception("Failed to start session")
        try:
            await ws.send_text(json.dumps({"type": "error", "message": str(e)}))
        except Exception:
            pass
        await ws.close()
        return

    receive_task = asyncio.create_task(_pump_client_to_session(ws, session))
    send_task = asyncio.create_task(_pump_session_to_client(ws, session))

    done, pending = await asyncio.wait(
        {receive_task, send_task}, return_when=asyncio.FIRST_COMPLETED
    )
    for t in pending:
        t.cancel()
    for t in pending:
        try:
            await t
        except (asyncio.CancelledError, Exception):
            pass

    await session.aclose()
    try:
        await ws.close()
    except Exception:
        pass


async def _pump_client_to_session(ws: WebSocket, session: OnboardingSession) -> None:
    try:
        while True:
            msg = await ws.receive()
            if msg["type"] == "websocket.disconnect":
                return
            if "bytes" in msg and msg["bytes"] is not None:
                await session.push_audio(msg["bytes"])
            elif "text" in msg and msg["text"] is not None:
                try:
                    payload = json.loads(msg["text"])
                except json.JSONDecodeError:
                    continue
                if payload.get("type") == "stop":
                    return
    except WebSocketDisconnect:
        return


async def _pump_session_to_client(ws: WebSocket, session: OnboardingSession) -> None:
    try:
        async for evt in session.events():
            if evt.kind == "audio":
                await ws.send_bytes(evt.payload)
            else:
                payload = {"type": evt.kind}
                if isinstance(evt.payload, dict):
                    payload.update(evt.payload)
                await ws.send_text(json.dumps(payload))
                if evt.kind == "done":
                    return
    except WebSocketDisconnect:
        return
