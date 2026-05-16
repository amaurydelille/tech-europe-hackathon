from pydantic import BaseModel, Field


class UserProfile(BaseModel):
    name: str = Field(..., min_length=1)
    age: int = Field(..., ge=5, le=120)
    subject: str = Field(..., min_length=1)
    prior_knowledge: str = Field(..., min_length=1)
    learning_goal: str = Field(..., min_length=1)
    content_style: str = Field(..., min_length=1)
