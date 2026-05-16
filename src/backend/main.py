from fastapi import FastAPI, HTTPException
from task_to_class import run
from task_to_class.models import OnboardingData, CourseOutput

app = FastAPI(title="Course Generation API")


@app.post("/courses/generation", response_model=CourseOutput)
async def generate_course(onboarding: OnboardingData) -> CourseOutput:
    try:
        return run(onboarding.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
