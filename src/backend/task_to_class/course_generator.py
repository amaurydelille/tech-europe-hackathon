import os
from openai import OpenAI
from .models import OnboardingData, ValidatedResult, CourseOutput
from dotenv import load_dotenv

load_dotenv()

_client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY", "placeholder"))

_SYSTEM_PROMPT = """You are an expert educational content writer.
You create personalized, engaging courses tailored to a student's level and goals.
You will produce TWO versions of the course in a single response, clearly separated."""

_USER_TEMPLATE = """## Student Profile
- Name: {name} (age {age})
- Subject: {subject}
- Prior knowledge: {prior_knowledge}
- Learning goal: {learning_goal}
- Content style: {content_style}

## Source Material
{sources}

---

Using the source material above, generate TWO versions of the course, adapted to the student's profile.

### Instructions:
**FULL COURSE** (for video narration):
- Comprehensive, flowing prose — no bullet overload
- Structured with clear sections: Introduction, main chapters, Conclusion
- Rich detail, examples, storytelling where appropriate
- Vocabulary and depth matched to prior knowledge and age
- Start with the exact marker: `===FULL_COURSE_START===`
- End with the exact marker: `===FULL_COURSE_END===`

**CONDENSED COURSE** (for frontend display):
- Digestible summary — key concepts, key dates, key figures
- Still detailed enough to be genuinely useful, not just a teaser
- Uses headers, bullet points, and short paragraphs for readability
- Start with the exact marker: `===CONDENSED_COURSE_START===`
- End with the exact marker: `===CONDENSED_COURSE_END===`

Both must be in Markdown format."""


def _format_sources(results: list[ValidatedResult]) -> str:
    parts = []
    for i, r in enumerate(results, 1):
        parts.append(f"### Source {i}: {r.title}\nURL: {r.url}\n\n{r.content[:3000]}")
    return "\n\n---\n\n".join(parts)


def _extract_section(text: str, start_marker: str, end_marker: str) -> str:
    try:
        start = text.index(start_marker) + len(start_marker)
        end = text.index(end_marker)
        return text[start:end].strip()
    except ValueError:
        return text.strip()


def generate_course(
    onboarding: OnboardingData,
    validated_results: list[ValidatedResult],
) -> CourseOutput:
    sources_text = _format_sources(validated_results)

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
                sources=sources_text,
            )},
        ],
        temperature=0.5,
        max_tokens=4096,
    )

    raw = response.choices[0].message.content

    return CourseOutput(
        full_markdown=_extract_section(raw, "===FULL_COURSE_START===", "===FULL_COURSE_END==="),
        condensed_markdown=_extract_section(raw, "===CONDENSED_COURSE_START===", "===CONDENSED_COURSE_END==="),
    )
