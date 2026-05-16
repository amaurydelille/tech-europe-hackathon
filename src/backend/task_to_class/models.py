from pydantic import BaseModel


class OnboardingData(BaseModel):
    name: str
    age: int
    subject: str
    prior_knowledge: str
    learning_goal: str
    content_style: str


class ScrapedResult(BaseModel):
    title: str
    url: str
    content: str
    score: float


class ValidatedResult(BaseModel):
    title: str
    url: str
    content: str
    entity_count: int
    relevance_score: float


class CourseOutput(BaseModel):
    full_markdown: str
    condensed_markdown: str
