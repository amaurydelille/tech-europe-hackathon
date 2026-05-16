from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from .config import TMP_ROOT


@dataclass(frozen=True)
class Workspace:
    root: Path

    @property
    def inputs_dir(self) -> Path:
        return self.root / "inputs"

    @property
    def assets_dir(self) -> Path:
        return self.root / "assets"

    @property
    def refs_dir(self) -> Path:
        return self.assets_dir / "refs"

    @property
    def audio_dir(self) -> Path:
        return self.assets_dir / "audio"

    @property
    def video_dir(self) -> Path:
        return self.assets_dir / "video"

    @property
    def image_dir(self) -> Path:
        return self.assets_dir / "image"

    @property
    def outputs_dir(self) -> Path:
        return self.root / "outputs"

    @property
    def script_path(self) -> Path:
        return self.assets_dir / "script.json"

    @property
    def anchors_path(self) -> Path:
        return self.assets_dir / "anchors.json"


def create_workspace(parent: Path = TMP_ROOT) -> Workspace:
    parent.mkdir(parents=True, exist_ok=True)
    run_id = f"{datetime.now(timezone.utc):%Y%m%d-%H%M%S}-{uuid.uuid4().hex[:6]}"
    root = parent / run_id
    workspace = Workspace(root=root)
    for d in [
        workspace.inputs_dir,
        workspace.assets_dir,
        workspace.refs_dir,
        workspace.audio_dir,
        workspace.video_dir,
        workspace.image_dir,
        workspace.outputs_dir,
    ]:
        d.mkdir(parents=True, exist_ok=True)
    return workspace
