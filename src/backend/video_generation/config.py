from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


REPO_ROOT = Path(__file__).resolve().parents[3]
TMP_ROOT = REPO_ROOT / "tmp" / "video_generation"

SEEDANCE_MODEL_ID = "bytedance/seedance-2.0/image-to-video"
SEEDREAM_TEXT_TO_IMAGE_MODEL_ID = "fal-ai/bytedance/seedream/v4/text-to-image"
SEEDREAM_EDIT_MODEL_ID = "fal-ai/bytedance/seedream/v4/edit"

DEFAULT_VOICE_ID = "YTpq7expH9539ERJ"
DEFAULT_RESOLUTION = "480p"
DEFAULT_ASPECT = "9:16"


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
