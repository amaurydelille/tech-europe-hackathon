import json
import logging
from pathlib import Path
from .models import OnboardingData, CourseOutput
from .query_builder import build_tavily_query
from .scraper import search_tavily
from .validator import validate_with_gliner
from .course_generator import generate_course

OUTPUT_PATH = Path(__file__).parent.parent / "output" / "course_output.json"

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

    return course


def run_from_file(path: str | Path) -> CourseOutput:
    with open(path) as f:
        data = json.load(f)
    return run(data)
