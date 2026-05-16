import os
from openai import OpenAI
from .models import OnboardingData

_client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY", "placeholder"))

_SYSTEM_PROMPT = """You are an expert educational research assistant.
Given a student's onboarding profile, generate a single optimized Tavily search query string.
The query must be rich, targeted, and capture the topic, relevant subtopics, key concepts,
and context needed to retrieve high-quality educational content.
Return ONLY the query string, no explanation, no quotes."""

_USER_TEMPLATE = """Student profile:
- Name: {name} (age {age})
- Subject: {subject}
- Prior knowledge: {prior_knowledge}
- Learning goal: {learning_goal}
- Content style: {content_style}

Generate the best Tavily search query to find comprehensive, level-appropriate content for this student."""


def build_tavily_query(onboarding: OnboardingData) -> str:
    response = _client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": _USER_TEMPLATE.format(
                name=onboarding.name,
                age=onboarding.age,
                subject=onboarding.subject,
                prior_knowledge=onboarding.prior_knowledge,
                learning_goal=onboarding.learning_goal,
                content_style=onboarding.content_style,
            )},
        ],
        temperature=0.3,
    )
    return response.choices[0].message.content.strip()
