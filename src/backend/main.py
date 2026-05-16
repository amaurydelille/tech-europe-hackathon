from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from task_to_class import run
from task_to_class.models import OnboardingData, CourseOutput

app = FastAPI(title="Course Generation API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/courses/generation", response_model=CourseOutput)
async def generate_course(onboarding: OnboardingData) -> CourseOutput:
    try:
        return run(onboarding.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
