from pathlib import Path

from backend.video_generation.workspace import create_workspace


def test_create_workspace_makes_expected_directories(tmp_path: Path) -> None:
    ws = create_workspace(parent=tmp_path)

    assert ws.root.parent == tmp_path
    for d in (
        ws.inputs_dir,
        ws.assets_dir,
        ws.refs_dir,
        ws.audio_dir,
        ws.video_dir,
        ws.image_dir,
        ws.outputs_dir,
    ):
        assert d.is_dir(), f"{d} should exist"

    assert ws.script_path == ws.assets_dir / "script.json"
    assert ws.anchors_path == ws.assets_dir / "anchors.json"


def test_create_workspace_makes_unique_run_ids(tmp_path: Path) -> None:
    a = create_workspace(parent=tmp_path)
    b = create_workspace(parent=tmp_path)
    assert a.root != b.root
