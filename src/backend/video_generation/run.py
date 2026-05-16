from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

from .config import REPO_ROOT, config
from .workspace import Workspace, create_workspace

INSTRUCTIONS_PATH = Path(__file__).parent / "instructions.md"
INSPECTION_GUIDE_PATH = Path(__file__).parent / "inspection_guide.md"
DEFAULT_CODEX_MODEL: str | None = None  # let codex use its config default


def _render_voice_catalog() -> str:
    lines = []
    for v in config.voices:
        lines.append(
            f"- **{v.name}** (`{v.id}`) — {v.description}. "
            f"Measured cadence: **{v.wps:.2f} words/s**."
        )
    return "\n".join(lines)


def _render_instructions(target_duration_seconds: int) -> str:
    template = INSTRUCTIONS_PATH.read_text()
    inspection_guide = INSPECTION_GUIDE_PATH.read_text().rstrip()
    real_video_percent = int(round(config.real_video_time_share * 100))
    real_video_seconds = max(0, int(round(config.real_video_time_share * target_duration_seconds)))
    return (
        template
        .replace("{{TARGET_DURATION_SECONDS}}", str(target_duration_seconds))
        .replace("{{INSPECTION_GUIDE}}", inspection_guide)
        .replace("{{REAL_VIDEO_PERCENT}}", str(real_video_percent))
        .replace("{{REAL_VIDEO_SECONDS}}", str(real_video_seconds))
        .replace("{{VOICE_CATALOG}}", _render_voice_catalog())
    )


def _prepare_workspace(lesson_md: str) -> Workspace:
    workspace = create_workspace()
    (workspace.inputs_dir / "lesson.md").write_text(lesson_md)
    return workspace


def _build_prompt(
    workspace: Workspace,
    target_duration_seconds: int,
    title: str | None = None,
) -> str:
    instructions = _render_instructions(target_duration_seconds)
    tools_src = REPO_ROOT / "src" / "backend" / "video_generation" / "tools"
    lesson_path = workspace.inputs_dir / "lesson.md"
    final_path = workspace.outputs_dir / "video.mp4"
    final_srt_path = workspace.outputs_dir / "subtitles.srt"
    final_sources_path = workspace.outputs_dir / "sources.json"
    venv_python = REPO_ROOT / ".venv" / "bin" / "python"
    title_line = (
        f"- Lesson title (use this verbatim for `title_sequence --title`): {title!r}\n"
        if title
        else ""
    )
    return (
        f"{instructions}\n\n"
        f"## This run\n\n"
        f"### Paths (all absolute)\n\n"
        f"- Workspace root: `{workspace.root}` — **your only write zone.**\n"
        f"- Lesson file: `{lesson_path}`\n"
        f"- Assets directory (refs/audio/video/image and `script.json`): `{workspace.assets_dir}`\n"
        f"- Final video: `{final_path}`\n"
        f"- Final subtitles: `{final_srt_path}`\n"
        f"- Final sources: `{final_sources_path}` (written by `stitch` from speech `sources`)\n"
        f"- Repository root: `{REPO_ROOT}` (source lives here; never modify it).\n"
        f"- Tool source: `{tools_src}` — note the `src/` prefix; do NOT look under "
        f"`{REPO_ROOT}/backend/...`.\n\n"
        f"### Run parameters\n\n"
        f"- Target total duration: ~{target_duration_seconds} seconds.\n"
        f"{title_line}"
        f"\n### Running tools\n\n"
        f"Invoke each tool with the project's venv python directly: "
        f"`{venv_python} -m backend.video_generation.tools.<name> ...`. "
        f"Do **not** use `uv run` — parallel `uv run` calls serialize on a shared project lock. "
        f"The venv at `{venv_python.parent.parent}` already has every dependency installed.\n\n"
        f"### Scope\n\n"
        f"Ignore every sibling directory under `{workspace.root.parent}` — even if a previous "
        f"run covered the same lesson, do not read or reuse anything from it. Start fresh "
        f"from `inputs/lesson.md`.\n\n"
        f"### Termination\n\n"
        f"When `{final_path}`, `{final_srt_path}`, and `{final_sources_path}` all exist, "
        f"print all three paths and stop.\n"
    )


def _codex_command(workspace: Workspace, model: str | None) -> list[str]:
    cmd = [
        "codex",
        "exec",
        "--skip-git-repo-check",
        "--full-auto",
        "-c", "sandbox_workspace_write.network_access=true",
        "--cd", str(workspace.root),
        "--add-dir", str(REPO_ROOT),
        "-o", str(workspace.root / "codex.last_message.txt"),
    ]
    if model:
        cmd += ["-m", model]
    return cmd


def generate_video(
    lesson_md: str,
    out_dir: Path | None = None,
    *,
    title: str | None = None,
    target_duration_seconds: int = config.target_duration_seconds,
    model: str | None = DEFAULT_CODEX_MODEL,
    extra_env: dict | None = None,
) -> Path:
    """Turn a lesson markdown into a narrated video + subtitle pair.

    Args:
        lesson_md: Lesson content as a markdown string.
        out_dir: Where to copy the finished `video.mp4` + `subtitles.srt` + `sources.json`. The
            directory is created if missing. If None, leave them under the
            workspace.
        target_duration_seconds: Target length of the finished video in seconds.
        model: Optional codex model override (e.g. "gpt-5-codex").
        extra_env: Extra env vars to pass to codex.

    Returns:
        Path to the directory containing `video.mp4`, `subtitles.srt`, and `sources.json`.
    """
    if shutil.which("codex") is None:
        raise RuntimeError("`codex` CLI not found on PATH")
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("`ffmpeg` not found on PATH")

    workspace = _prepare_workspace(lesson_md)
    prompt = _build_prompt(workspace, target_duration_seconds, title=title)

    env = os.environ.copy()
    if extra_env:
        env.update(extra_env)

    cmd = _codex_command(workspace, model)
    proc = subprocess.run(
        cmd,
        input=prompt,
        text=True,
        env=env,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"codex exec failed with code {proc.returncode}")

    produced = workspace.outputs_dir / "video.mp4"
    produced_srt = workspace.outputs_dir / "subtitles.srt"
    produced_sources = workspace.outputs_dir / "sources.json"
    for path, label in (
        (produced, "video"),
        (produced_srt, "subtitles"),
        (produced_sources, "sources"),
    ):
        if not path.is_file():
            raise RuntimeError(
                f"codex finished but no {label} at {path}. "
                f"See {workspace.root / 'codex.last_message.txt'} for the agent's last message."
            )

    if out_dir is not None:
        out_dir = Path(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(produced, out_dir / "video.mp4")
        shutil.copy2(produced_srt, out_dir / "subtitles.srt")
        shutil.copy2(produced_sources, out_dir / "sources.json")
        return out_dir
    return workspace.outputs_dir


def load_lesson(path: Path) -> tuple[str, str | None]:
    """Load a lesson from either a `.md`/`.txt` file or a `.json` payload.

    Returns ``(lesson_markdown, title_or_None)``. For JSON input, the schema
    expected is ``{"title": "...", "full_markdown": "...", "references": [{"title", "url"}, ...]}``;
    ``title`` and ``references`` are optional. References get appended as a
    ``## Sources`` markdown section so the agent can attach them as source
    citations to the relevant speech entries.
    """
    text = path.read_text()
    if path.suffix.lower() != ".json":
        return text, None
    data = json.loads(text)
    if not isinstance(data, dict) or "full_markdown" not in data:
        raise ValueError(
            f"{path}: JSON input must be an object with a 'full_markdown' field"
        )
    lesson = data["full_markdown"].rstrip()
    refs = data.get("references") or []
    if refs:
        lesson += "\n\n## Sources\n\n"
        for r in refs:
            title = r.get("title") or r.get("name") or r.get("url")
            url = r.get("url")
            if not url:
                continue
            lesson += f"- [{title}]({url})\n"
    json_title = data.get("title")
    if json_title is not None and not isinstance(json_title, str):
        raise ValueError(f"{path}: 'title' must be a string when present")
    return lesson, (json_title or None)


def _main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Generate a narrated video from a lesson markdown or JSON file."
    )
    parser.add_argument(
        "lesson",
        type=Path,
        help="Path to the lesson. Either a .md/.txt file, or a .json file with "
             "'full_markdown' (string) and optional 'references' "
             "([{title, url}]).",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help="Optional destination directory. Will contain video.mp4 + subtitles.srt + sources.json.",
    )
    parser.add_argument(
        "--model",
        type=str,
        default=DEFAULT_CODEX_MODEL,
        help="Codex model id (passed via `codex exec -m`).",
    )
    parser.add_argument(
        "--duration",
        type=int,
        default=config.target_duration_seconds,
        help="Target total video length in seconds.",
    )
    args = parser.parse_args(argv)

    if not args.lesson.is_file():
        print(f"lesson file not found: {args.lesson}", file=sys.stderr)
        return 1

    lesson_md, lesson_title = load_lesson(args.lesson)
    started = time.monotonic()
    final_dir = generate_video(
        lesson_md=lesson_md,
        out_dir=args.out_dir,
        title=lesson_title,
        target_duration_seconds=args.duration,
        model=args.model,
    )
    elapsed = time.monotonic() - started
    print(str(final_dir))
    minutes, seconds = divmod(elapsed, 60)
    print(f"Total time: {int(minutes)}m {seconds:.1f}s", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(_main())
