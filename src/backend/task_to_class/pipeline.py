import json
import logging
import os
from pathlib import Path
import httpx
from .models import OnboardingData, CourseOutput
from .query_builder import build_tavily_query
from .scraper import search_tavily
from .validator import validate_with_gliner
from .course_generator import generate_course

OUTPUT_PATH = Path(__file__).parent.parent / "output" / "course_output.json"

_VIDEO_SERVICE_URL = "http://localhost:8000"
_VIDEO_SERVICE_ENDPOINT = "/video/generation"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


def run(onboarding_data: dict) -> CourseOutput:
    onboarding = OnboardingData(**onboarding_data)
    log.info("Starting pipeline for '%s' (subject: %s)", onboarding.name, onboarding.subject)

    log.info("Step 1/4 — Building Tavily query via GPT-4o...")
    query = build_tavily_query(onboarding)
    log.info("Query: %s", query)

    log.info("Step 2/4 — Scraping Tavily...")
    raw_results = search_tavily(query)
    log.info("Retrieved %d raw results", len(raw_results))

    log.info("Step 3/4 — Validating with GLINER...")
    validated_results = validate_with_gliner(raw_results)
    log.info("Kept %d results after validation", len(validated_results))
    for r in validated_results:
        log.info("  ✓ [score=%.3f, entities=%d] %s", r.relevance_score, r.entity_count, r.title)

    log.info("Step 4/4 — Generating course via GPT-5.5...")
    course = generate_course(onboarding, validated_results)
    log.info("Course generated — full: %d chars, condensed: %d chars",
             len(course.full_markdown), len(course.condensed_markdown))

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(course.model_dump(), indent=2, ensure_ascii=False))
    log.info("Saved course output to %s", OUTPUT_PATH)

    _trigger_video_service()

    return course


def _trigger_video_service() -> None:
    url = f"{_VIDEO_SERVICE_URL}{_VIDEO_SERVICE_ENDPOINT}"
    try:
        response = httpx.post(url, timeout=5)
        response.raise_for_status()
        log.info("Video generation service triggered successfully (%s)", url)
    except httpx.ConnectError:
        log.warning("Could not reach video generation service at %s — is it running?", url)
    except httpx.HTTPStatusError as e:
        log.warning("Video generation service returned an error: %s", e.response.status_code)
    except Exception as e:
        log.warning("Failed to trigger video generation service: %s", e)


def run_from_file(path: str | Path) -> CourseOutput:
    with open(path) as f:
        data = json.load(f)
    return run(data)
