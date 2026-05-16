"""Render an animated globe MP4 with highlighted countries, an optional arrow,
optional country blink, and optional city markers.

Pipeline:
  1. Rasterize a Natural-Earth equirectangular texture (and optional blink
     variant) with the requested country highlights baked in (Pillow).
  2. Drive `window.setT(t)` in a headless Three.js page (Chromium via
     Playwright), screenshotting one JPEG per frame at the requested fps.
  3. Stitch the JPEGs into an H.264 MP4 with ffmpeg.

Defaults match the video_generation pipeline canvas (9:16 720p — scales
down cleanly to the 480p stitch target). The textured globe uses a real
PBR sphere with normal-mapped relief, sun-aligned lighting, and a soft
specular sheen on the oceans.

Tool contract — see the `_main` CLI parser for the authoritative flag set.
"""
from __future__ import annotations

import argparse
import colorsys
import functools
import http.server
import json
import shutil
import socketserver
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
from contextlib import contextmanager
from pathlib import Path

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

from ..config import REPO_ROOT

# ---------------------------------------------------------------------------
# Asset layout — bundled, repo-relative.
# ---------------------------------------------------------------------------
ASSETS_DIR = REPO_ROOT / "assets" / "gen_map"
GEOJSON_PATH = ASSETS_DIR / "ne_110m.geojson"
NORMAL_MAP_PATH = ASSETS_DIR / "earth_normal.jpg"
EARTH_HTML_PATH = ASSETS_DIR / "earth.html"

# ---------------------------------------------------------------------------
# Texture build
# ---------------------------------------------------------------------------
TEX_W, TEX_H = 2048, 1024
OCEAN = "#3a3a3a"
LAND = "#1f1f1f"
DEFAULT_BORDER = "#2a2a2a"   # near-invisible; pass --border-color to enable
OCEAN_ROUGH = 170             # 0=mirror, 255=matte (multiplied with material.roughness)
LAND_ROUGH = 255

# Pure-saturated hex codes look cartoonish on a dark globe. We drop S by
# 35 % in HSV (hue/value preserved) before any color hits the renderer.
SATURATION_FACTOR = 0.65


def _desaturate_hex(hex_color: str, factor: float = SATURATION_FACTOR) -> str:
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    r = int(h[0:2], 16) / 255
    g = int(h[2:4], 16) / 255
    b = int(h[4:6], 16) / 255
    hue, sat, val = colorsys.rgb_to_hsv(r, g, b)
    sat *= factor
    r2, g2, b2 = colorsys.hsv_to_rgb(hue, sat, val)
    return f"#{int(round(r2 * 255)):02x}{int(round(g2 * 255)):02x}{int(round(b2 * 255)):02x}"


def _lonlat_to_xy(lon: float, lat: float) -> tuple[float, float]:
    return ((lon + 180.0) / 360.0 * TEX_W, (90.0 - lat) / 180.0 * TEX_H)


def _split_antimeridian(ring: list[list[float]]) -> list[list[tuple[float, float]]]:
    """Split a ring that crosses the antimeridian into per-side sub-rings.

    Without this, polygons like Russia / Fiji draw a horizontal stripe across
    the whole texture.
    """
    if not ring:
        return []
    out: list[list[tuple[float, float]]] = [[]]
    for i, (lon, lat) in enumerate(ring):
        if i == 0:
            out[-1].append((lon, lat))
            continue
        prev_lon = ring[i - 1][0]
        if abs(lon - prev_lon) > 180:
            out.append([])
        out[-1].append((lon, lat))
    return [r for r in out if len(r) >= 3]


def _build_textures(
    country_colors: dict[str, str],
    out_dir: Path,
    *,
    color_name: str = "earth_texture.png",
    rough_name: str = "earth_roughness.png",
    write_roughness: bool = True,
    border_color: str = DEFAULT_BORDER,
    border_width: int = 1,
) -> None:
    """Rasterize the diffuse + (optional) roughness equirectangular textures.

    We rasterize manually with Pillow (rather than relying on matplotlib /
    cartopy / plotly) so the projection is pixel-perfect equirectangular with
    no framing margin slop — required for the texture to UV-map cleanly onto
    a Three.js sphere.
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    data = json.loads(GEOJSON_PATH.read_text())

    color_img = Image.new("RGB", (TEX_W, TEX_H), OCEAN)
    color_draw = ImageDraw.Draw(color_img)
    rough_img = Image.new("L", (TEX_W, TEX_H), OCEAN_ROUGH) if write_roughness else None
    rough_draw = ImageDraw.Draw(rough_img) if rough_img is not None else None

    desat = {iso: _desaturate_hex(hx) for iso, hx in country_colors.items()}

    for feat in data["features"]:
        iso = (
            feat["properties"].get("ADM0_A3")
            or feat["properties"].get("ISO_A3")
            or feat["properties"].get("ADM0_A3_US")
        )
        color = desat.get(iso, LAND)
        geom = feat["geometry"]
        if not geom:
            continue
        if geom["type"] == "Polygon":
            polygons = [geom["coordinates"]]
        elif geom["type"] == "MultiPolygon":
            polygons = geom["coordinates"]
        else:
            continue
        for poly in polygons:
            for sub in _split_antimeridian(poly[0]):
                pts = [_lonlat_to_xy(lon, lat) for lon, lat in sub]
                color_draw.polygon(pts, fill=color, outline=border_color, width=border_width)
                if rough_draw is not None:
                    rough_draw.polygon(pts, fill=LAND_ROUGH)
            for hole in poly[1:]:
                for sub in _split_antimeridian(hole):
                    pts = [_lonlat_to_xy(lon, lat) for lon, lat in sub]
                    color_draw.polygon(pts, fill=OCEAN)
                    if rough_draw is not None:
                        rough_draw.polygon(pts, fill=OCEAN_ROUGH)

    color_img.save(out_dir / color_name)
    if rough_img is not None:
        rough_img.save(out_dir / rough_name)


# ---------------------------------------------------------------------------
# Local HTTP server (file:// origins can't load companion assets via CORS)
# ---------------------------------------------------------------------------
class _SilentHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args, **_kwargs):
        return


@contextmanager
def _serve(directory: Path):
    handler = functools.partial(_SilentHandler, directory=str(directory))
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    port = httpd.server_address[1]
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        httpd.shutdown()
        httpd.server_close()


# ---------------------------------------------------------------------------
# CLI parsing helpers
# ---------------------------------------------------------------------------
def _parse_country(spec: str) -> tuple[str, str]:
    iso, _, hex_color = spec.partition(":")
    if not iso or not hex_color:
        raise ValueError(f"--country must be ISO:#HEX, got {spec!r}")
    if not hex_color.startswith("#") or len(hex_color) not in (4, 7):
        raise ValueError(f"--country hex must look like #rgb or #rrggbb, got {hex_color!r}")
    return iso.upper(), hex_color


def _parse_marker(spec: str) -> dict:
    """Parse `lat,lon,#hex,t_on[,t_off]` into a marker dict."""
    parts = [p.strip() for p in spec.split(",")]
    if len(parts) not in (4, 5):
        raise ValueError(f"--marker must be lat,lon,#hex,t_on[,t_off] — got {spec!r}")
    lat = float(parts[0])
    lon = float(parts[1])
    color = parts[2]
    if not color.startswith("#") or len(color) not in (4, 7):
        raise ValueError(f"marker hex must be #rgb or #rrggbb, got {color!r}")
    t_on = float(parts[3])
    t_off = float(parts[4]) if len(parts) == 5 else None
    return {"lat": lat, "lon": lon, "color": color, "t_on": t_on, "t_off": t_off}


# ---------------------------------------------------------------------------
# Main render
# ---------------------------------------------------------------------------
def render_map_video(
    countries: dict[str, str],
    out: Path,
    *,
    duration: float = 5.0,
    spin_speed: float = 1.0,
    fps: int = 30,
    lon: float = -78.0,
    lat: float = 22.0,
    zoom: float = 4.2,
    width: int = 720,
    height: int = 1280,
    arrow_from_lat: float | None = None,
    arrow_from_lon: float | None = None,
    arrow_to_lat: float | None = None,
    arrow_to_lon: float | None = None,
    arrow_color: str = "#ffaa44",
    blink_country: str | None = None,
    blink_color: str | None = None,
    blink_time: float | None = None,
    markers: list[dict] | None = None,
    border_color: str | None = None,
) -> Path:
    if not countries:
        raise ValueError("countries dict is empty; pass at least one ISO:#HEX")

    arrow_set = [arrow_from_lat, arrow_from_lon, arrow_to_lat, arrow_to_lon]
    arrow_given = [v is not None for v in arrow_set]
    if any(arrow_given) and not all(arrow_given):
        raise ValueError(
            "arrow needs all four of from_lat / from_lon / to_lat / to_lon, or none of them."
        )

    blink_given = [v is not None for v in (blink_country, blink_color)]
    if any(blink_given) and not all(blink_given):
        raise ValueError("blink needs both --blink-country and --blink-color, or neither.")
    has_blink = all(blink_given)

    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)

    border_kwargs: dict = {}
    if border_color:
        border_kwargs["border_color"] = border_color
        border_kwargs["border_width"] = 2  # 1px barely visible at 2048×1024

    t_total = time.perf_counter()
    with tempfile.TemporaryDirectory() as tmpdir_str, sync_playwright() as p:
        serve_dir = Path(tmpdir_str)
        # Copy fixed assets into the serve dir so earth.html can load them.
        shutil.copy(EARTH_HTML_PATH, serve_dir / "earth.html")
        shutil.copy(NORMAL_MAP_PATH, serve_dir / "earth_normal.jpg")
        # Build dynamic textures into the same dir.
        _build_textures(countries, serve_dir, **border_kwargs)
        if has_blink:
            blink_palette = dict(countries)
            blink_palette[blink_country.upper()] = blink_color
            _build_textures(
                blink_palette, serve_dir,
                color_name="earth_texture_blink.png",
                write_roughness=False,
                **border_kwargs,
            )

        # ---- 2. Render frames ----
        n_frames = int(round(duration * fps))
        query: dict = {
            "lon": lon, "lat": lat, "zoom": zoom,
            "w": width, "h": height,
            "spin": spin_speed, "dur": duration,
        }
        if all(arrow_given):
            query.update({
                "arrowFromLat": arrow_from_lat,
                "arrowFromLon": arrow_from_lon,
                "arrowToLat": arrow_to_lat,
                "arrowToLon": arrow_to_lon,
                "arrowColor": arrow_color,
            })
        if has_blink:
            query["blink"] = 1
            if blink_time is not None:
                query["blinkTime"] = blink_time
        if markers:
            query["markers"] = json.dumps(markers)
        qs = urllib.parse.urlencode(query)

        with _serve(serve_dir) as base_url:
            url = f"{base_url}/earth.html?{qs}"
            t0 = time.perf_counter()
            # Headless Chromium defaults to swiftshader (CPU WebGL) — ~4 s/frame
            # for this scene. ANGLE-on-Metal + --enable-gpu drops that to ~50 ms.
            browser = p.chromium.launch(args=[
                "--use-angle=metal",
                "--enable-gpu",
                "--ignore-gpu-blocklist",
                "--enable-unsafe-webgpu",
            ])
            print(f"[profile] browser launch: {time.perf_counter() - t0:.2f}s", file=sys.stderr)
            ctx = browser.new_context(
                viewport={"width": width, "height": height},
                device_scale_factor=1,
            )
            page = ctx.new_page()
            page.on("pageerror", lambda err: print(f"[pageerror] {err}", file=sys.stderr))
            t0 = time.perf_counter()
            page.goto(url)
            page.wait_for_function("window.__READY === true", timeout=30_000)
            print(f"[profile] page ready: {time.perf_counter() - t0:.2f}s", file=sys.stderr)

            frames_dir = serve_dir / "frames"
            frames_dir.mkdir(parents=True, exist_ok=True)
            t0 = time.perf_counter()
            per_frame: list[float] = []
            for i in range(n_frames):
                ts = time.perf_counter()
                page.evaluate(f"window.setT({i / fps})")
                page.screenshot(
                    path=str(frames_dir / f"f_{i:05d}.jpg"),
                    type="jpeg",
                    quality=88,
                )
                per_frame.append(time.perf_counter() - ts)
            print(
                f"[profile] {n_frames} frames in {time.perf_counter() - t0:.2f}s "
                f"(avg {1000 * sum(per_frame) / max(1, len(per_frame)):.0f}ms/frame)",
                file=sys.stderr,
            )
            browser.close()

            # ---- 3. ffmpeg stitch ----
            t0 = time.perf_counter()
            subprocess.run(
                [
                    "ffmpeg", "-y", "-loglevel", "error",
                    "-framerate", str(fps),
                    "-i", str(frames_dir / "f_%05d.jpg"),
                    "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    "-crf", "20",
                    "-movflags", "+faststart",
                    str(out),
                ],
                check=True,
            )
            print(f"[profile] ffmpeg stitch: {time.perf_counter() - t0:.2f}s", file=sys.stderr)

    print(f"[profile] TOTAL: {time.perf_counter() - t_total:.2f}s", file=sys.stderr)
    return out


def _main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Render an animated globe MP4.")
    ap.add_argument("--country", action="append", required=True,
                    help="Repeatable. ISO3:#hex (e.g. USA:#3b82f6)")
    ap.add_argument("--out", type=Path, required=True, help="Output MP4 path.")
    ap.add_argument("--duration", type=float, default=5.0, help="Clip length (seconds).")
    ap.add_argument("--spin", type=float, default=1.0,
                    help="Globe spin speed in degrees/second. 0 = static.")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--lon", type=float, default=-78.0, help="Camera longitude.")
    ap.add_argument("--lat", type=float, default=22.0, help="Camera latitude.")
    ap.add_argument("--zoom", type=float, default=4.2,
                    help="Camera distance from globe centre. Smaller = closer. "
                         "Defaults to 4.2 (whole disk visible). ~2.8 = regional shot.")
    ap.add_argument("--width", type=int, default=720,
                    help="Output width (default 720; 9:16 portrait, 1.5× pipeline 480p).")
    ap.add_argument("--height", type=int, default=1280,
                    help="Output height (default 1280; 9:16 portrait).")
    # Arrow (all four required together).
    ap.add_argument("--arrow-from-lat", type=float)
    ap.add_argument("--arrow-from-lon", type=float)
    ap.add_argument("--arrow-to-lat", type=float)
    ap.add_argument("--arrow-to-lon", type=float)
    ap.add_argument("--arrow-color", type=str, default="#ffaa44")
    # Blink — fade a country to a different color around blink-time.
    ap.add_argument("--blink-country", type=str,
                    help="ISO3 code of the country to fade-blink.")
    ap.add_argument("--blink-color", type=str,
                    help="Hex color to fade-blink the country in (e.g. #ffeb3b).")
    ap.add_argument("--blink-time", type=float, default=None,
                    help="Seconds (from clip start) where the blink peaks. Default: midclip.")
    # Point markers — light up domes on the surface at scheduled times.
    ap.add_argument("--marker", action="append", default=[],
                    help="Repeatable. lat,lon,#hex,t_on[,t_off] — e.g. "
                         "40.7,-74.0,#ffeb3b,1.2 to light a marker at NY at t=1.2s.")
    ap.add_argument("--border-color", type=str, default=None,
                    help="If set, draws country borders in this hex (e.g. #525252). Off by default.")
    args = ap.parse_args(argv)

    countries = dict(_parse_country(spec) for spec in args.country)
    markers = [_parse_marker(spec) for spec in args.marker]
    out = render_map_video(
        countries=countries,
        out=args.out,
        duration=args.duration,
        spin_speed=args.spin,
        fps=args.fps,
        lon=args.lon, lat=args.lat, zoom=args.zoom,
        width=args.width, height=args.height,
        arrow_from_lat=args.arrow_from_lat,
        arrow_from_lon=args.arrow_from_lon,
        arrow_to_lat=args.arrow_to_lat,
        arrow_to_lon=args.arrow_to_lon,
        arrow_color=args.arrow_color,
        blink_country=args.blink_country,
        blink_color=args.blink_color,
        blink_time=args.blink_time,
        markers=markers,
        border_color=args.border_color,
    )
    print(out)
    return 0


if __name__ == "__main__":
    sys.exit(_main())
