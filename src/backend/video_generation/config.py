from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


REPO_ROOT = Path(__file__).resolve().parents[3]
TMP_ROOT = REPO_ROOT / "tmp" / "video_generation"
CONFIG_PATH = Path(__file__).parent / "config.json"

_config = json.loads(CONFIG_PATH.read_text())

DEFAULT_VOICE_ID: str = _config["voice_id"]
DEFAULT_RESOLUTION: str = _config["resolution"]
DEFAULT_ASPECT: str = _config["aspect"]
DEFAULT_TARGET_DURATION_SECONDS: int = _config["target_duration_seconds"]

SEEDANCE_MODEL_ID: str = _config["models"]["seedance"]
SEEDREAM_TEXT_TO_IMAGE_MODEL_ID: str = _config["models"]["seedream_text_to_image"]
SEEDREAM_EDIT_MODEL_ID: str = _config["models"]["seedream_edit"]


def gradium_api_key() -> str:
    key = os.environ.get("GRADIUM_API_KEY")
    if not key:
        raise RuntimeError("GRADIUM_API_KEY is not set in the environment")
    return key


def fal_api_key() -> str:
    key = os.environ.get("FAL_KEY") or os.environ.get("FAL_API_KEY")
    if not key:
        raise RuntimeError("FAL_KEY (or FAL_API_KEY) is not set in the environment")
    return key
