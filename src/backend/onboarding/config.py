import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    gradium_api_key: str
    openai_api_key: str
    stt_model: str = "default"
    tts_model: str = "default"
    tts_voice_id: str = "bvNlBZ3DWDoVy_Yc"
    sample_rate: int = 24000
    frame_samples: int = 1920
    inactivity_threshold: float = 0.7
    inactivity_sustained_steps: int = 6
    max_user_turns: int = 15


def load_settings() -> Settings:
    gradium_key = os.environ.get("GRADIUM_API_KEY") or os.environ.get("GRADIUM_KEY")
    if not gradium_key:
        raise RuntimeError("Set GRADIUM_API_KEY (or GRADIUM_KEY) in environment.")
    openai_key = os.environ.get("OPENAI_API_KEY")
    if not openai_key:
        raise RuntimeError("Set OPENAI_API_KEY in environment.")
    os.environ["GRADIUM_API_KEY"] = gradium_key
    return Settings(gradium_api_key=gradium_key, openai_api_key=openai_key)
