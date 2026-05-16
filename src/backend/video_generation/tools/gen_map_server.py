"""HTTP wrapper around `render_map_video`.

The codex sandbox on macOS denies Mach port registration, which means
Chromium-via-Playwright cannot launch from inside it (`bootstrap_check_in`
fails with `Permission denied`). To keep `gen_map` available to the agent,
we run the actual render in the parent process (outside the sandbox) and let
the sandboxed `gen_map` CLI client delegate over loopback HTTP.

Lifecycle:
  - The launcher (`run.py`) spawns this server before `codex exec`.
  - On startup we bind 127.0.0.1 on an OS-assigned port and print a single
    JSON line `{"url": "http://127.0.0.1:<port>"}` to stdout. The launcher
    reads it and exposes it as `GEN_MAP_SERVER_URL` in the codex env.
  - The launcher terminates this process after `codex exec` returns.

The `/render` endpoint accepts a JSON body matching `render_map_video`'s
kwargs (with `markers` as a list and `out` as an absolute path string), and
returns `{"path": "<written mp4>"}` on success or `{"error": "..."}` on
failure.
"""
from __future__ import annotations

import json
import sys
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from .gen_map import render_map_video


class _Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args, **_kwargs):
        return

    def do_POST(self):
        if self.path != "/render":
            self.send_error(404, "unknown endpoint")
            return
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length))
        out = Path(body.pop("out"))
        countries = body.pop("countries")
        markers = body.pop("markers", None)
        try:
            path = render_map_video(
                countries=countries,
                out=out,
                markers=markers,
                **body,
            )
        except Exception as exc:
            tb = traceback.format_exc()
            print(tb, file=sys.stderr, flush=True)
            payload = json.dumps({"error": str(exc), "traceback": tb}).encode()
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        payload = json.dumps({"path": str(path)}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def main() -> int:
    server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    port = server.server_address[1]
    print(json.dumps({"url": f"http://127.0.0.1:{port}"}), flush=True)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())
