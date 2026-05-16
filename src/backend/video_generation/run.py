from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

from .config import REPO_ROOT, config
from .workspace import Workspace, create_workspace

INSTRUCTIONS_PATH = Path(__file__).parent / "instructions.md"
INSPECTION_GUIDE_PATH = Path(__file__).parent / "inspection_guide.md"
DEFAULT_CODEX_MODEL: str | None = None  # let codex use its config default


def _render_instructions(target_duration_seconds: int) -> str:
    template = INSTRUCTIONS_PATH.read_text()
    inspection_guide = INSPECTION_GUIDE_PATH.read_text().rstrip()
    seedance_percent = int(round(config.seedance_time_share * 100))
    seedance_seconds = max(0, int(round(config.seedance_time_share * target_duration_seconds)))
    return (
        template
        .replace("{{TARGET_DURATION_SECONDS}}", str(target_duration_seconds))
        .replace("{{INSPECTION_GUIDE}}", inspection_guide)
        .replace("{{SEEDANCE_PERCENT}}", str(seedance_percent))
        .replace("{{SEEDANCE_SECONDS}}", str(seedance_seconds))
    )


def _prepare_workspace(lesson_md: str) -> Workspace:
    workspace = create_workspace()
    (workspace.inputs_dir / "lesson.md").write_text(lesson_md)
    return workspace


def _build_prompt(workspace: Workspace, target_duration_seconds: int) -> str:
    instructions = _render_instructions(target_duration_seconds)
    tools_src = REPO_ROOT / "src" / "backend" / "video_generation" / "tools"
    lesson_path = workspace.inputs_dir / "lesson.md"
    final_path = workspace.outputs_dir / "final.mp4"
    venv_python = REPO_ROOT / ".venv" / "bin" / "python"
    return (
        f"{instructions}\n\n"
        f"## This run\n\n"
        f"All paths below are absolute. Use them as-is in every tool call — "
        f"do not assume a particular working directory.\n\n"
        f"- Workspace root: `{workspace.root}`\n"
        f"- Lesson file: `{lesson_path}`\n"
        f"- Final output: `{final_path}`\n"
        f"- Assets directory (refs/audio/video/image and `script.json` go here): "
        f"`{workspace.assets_dir}`\n"
        f"- Target total duration: ~{target_duration_seconds} seconds.\n"
        f"- Repository root: `{REPO_ROOT}`.\n"
        f"- Tool source code lives at `{tools_src}` (note the `src/` prefix). "
        f"Do NOT look under `{REPO_ROOT}/backend/...` — it does not exist.\n"
        f"- Invoke tools by calling the project's venv python **directly**: "
        f"`{venv_python} -m backend.video_generation.tools.<name> ...`. "
        f"Do NOT use `uv run` — multiple `uv run` calls in parallel serialize on a "
        f"shared project lock. The venv at `{venv_python.parent.parent}` already has every "
        f"dependency installed.\n"
        f"- When done, print `{final_path}` and stop.\n"
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
    out_path: Path | None = None,
    *,
    target_duration_seconds: int = config.target_duration_seconds,
    model: str | None = DEFAULT_CODEX_MODEL,
    extra_env: dict | None = None,
) -> Path:
    """Turn a lesson markdown into a narrated video MP4.

    Args:
        lesson_md: Lesson content as a markdown string.
        out_path: Where to copy the final MP4. If None, leave it under the workspace.
        target_duration_seconds: Target length of the finished video in seconds.
        model: Optional codex model override (e.g. "gpt-5-codex").
        extra_env: Extra env vars to pass to codex.

    Returns:
        Path to the final MP4.
    """
    if shutil.which("codex") is None:
        raise RuntimeError("`codex` CLI not found on PATH")
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("`ffmpeg` not found on PATH")

    workspace = _prepare_workspace(lesson_md)
    prompt = _build_prompt(workspace, target_duration_seconds)

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

    produced = workspace.outputs_dir / "final.mp4"
    if not produced.is_file():
        raise RuntimeError(
            f"codex finished but no final video at {produced}. "
            f"See {workspace.root / 'codex.last_message.txt'} for the agent's last message."
        )

    if out_path is not None:
        out_path = Path(out_path)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(produced, out_path)
        return out_path
    return produced


def _main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Generate a narrated video from a lesson markdown file."
    )
    parser.add_argument(
        "lesson",
        type=Path,
        help="Path to the lesson markdown file.",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Optional destination path for the final MP4.",
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

    final = generate_video(
        lesson_md=args.lesson.read_text(),
        out_path=args.out,
        target_duration_seconds=args.duration,
        model=args.model,
    )
    print(str(final))
    return 0


if __name__ == "__main__":
    sys.exit(_main())
