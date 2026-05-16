from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel

load_dotenv()


REPO_ROOT = Path(__file__).resolve().parents[3]
TMP_ROOT = REPO_ROOT / "tmp" / "video_generation"
CONFIG_PATH = Path(__file__).parent / "config.json"


class Models(BaseModel):
    seedance: str
    seedream_text_to_image: str
    seedream_edit: str


class Config(BaseModel):
    voice_id: str
    resolution: str
    aspect: str
    target_duration_seconds: int
    seedance_time_share: float
    models: Models


config: Config = Config.model_validate(json.loads(CONFIG_PATH.read_text()))


def gradium_api_key() -> str:
    key = os.environ.get("GRADIUM_API_KEY")
    if not key:
        raise RuntimeError("GRADIUM_API_KEY is not set in the environment")
    return key


def fal_api_key() -> str:
    key = os.environ.get("FAL_KEY")
    if not key:
        raise RuntimeError("FAL_KEY is not set in the environment")
    return key
