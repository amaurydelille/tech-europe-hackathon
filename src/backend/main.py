import json
import asyncio
import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse

from task_to_class import run
from task_to_class.models import OnboardingData, CourseOutput
from video_generation.run import generate_video

log = logging.getLogger(__name__)

app = FastAPI(title="Course Generation API")

COURSE_OUTPUT_PATH = Path(__file__).parent / "output" / "course_output.json"


@app.post("/courses/generation", response_model=CourseOutput)
async def generate_course(onboarding: OnboardingData) -> CourseOutput:
    try:
        return run(onboarding.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/video/generation", status_code=202)
async def start_video_generation(background_tasks: BackgroundTasks) -> JSONResponse:
    if not COURSE_OUTPUT_PATH.is_file():
        raise HTTPException(
            status_code=404,
            detail="No course output found. Run /courses/generation first.",
        )

    data = json.loads(COURSE_OUTPUT_PATH.read_text())
    lesson_md = data.get("full_markdown", "")

    if not lesson_md.strip():
        raise HTTPException(status_code=422, detail="full_markdown is empty in course output.")

    background_tasks.add_task(_run_video_generation, lesson_md)
    return JSONResponse({"status": "started", "message": "Video generation is running in the background."})


def _run_video_generation(lesson_md: str) -> None:
    try:
        log.info("Video generation started...")
        out_dir = COURSE_OUTPUT_PATH.parent / "video"
        generate_video(lesson_md=lesson_md, out_dir=out_dir)
        log.info("Video generation complete. Output at %s", out_dir)
    except Exception as e:
        log.error("Video generation failed: %s", e)
