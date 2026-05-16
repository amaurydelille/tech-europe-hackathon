import os
from openai import OpenAI
from .models import OnboardingData, ValidatedResult, CourseOutput, Reference
from dotenv import load_dotenv

load_dotenv()

_client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY", "placeholder"))

_SYSTEM_PROMPT = """You are an expert educational content writer.
You create personalized, engaging courses tailored to a student's level and goals.
You will produce TWO versions of the course in a single response, each enclosed in its markers.
You MUST follow the exact markdown structure specified — a parser will process your output programmatically."""

_FULL_COURSE_SCHEMA = """
# {{Course Title}}

## Introduction
{{Vivid opening paragraph — set the scene, hook the student}}

## Chapter 1: {{Title}}
{{Narrative prose — cinematic language, sensory details, character depth}}

## Chapter 2: {{Title}}
{{Narrative prose}}

## Chapter 3: {{Title}}
{{Narrative prose}}

## Conclusion
{{Closing paragraph — what it all means, why it matters}}
""".strip()

_CONDENSED_COURSE_SCHEMA = """
# {{Course Title}}

## Overview
{{2-3 sentences summarising the subject and why it matters}}

## Key Concepts
- **{{Concept}}**: {{clear explanation with context}}
- **{{Concept}}**: {{clear explanation with context}}

## Key Figures
- **{{Name}}**: {{who they were, what they did, why they matter}}

## Key Dates
- **{{Date}}**: {{what happened and its significance}}

## Causes & Context
{{2-4 sentences on what led to this subject / historical background}}

## Consequences & Legacy
{{2-4 sentences on what changed as a result, long-term impact}}

## Key Takeaways
- {{Concise but substantive point}}
- {{Concise but substantive point}}
- {{Concise but substantive point}}
""".strip()

_USER_TEMPLATE = """## Student Profile
- Name: {name} (age {age})
- Subject: {subject}
- Prior knowledge: {prior_knowledge}
- Learning goal: {learning_goal}
- Content style: {content_style}

## Source Material
{sources}

---

Using the source material above, generate TWO versions of the course adapted to the student's profile.

### Citation rules (critical):
- Each source is numbered (Source 1, Source 2, ...).
- Place an inline citation marker `[N]` immediately after every sentence or fact drawn from that source.
- Every factual claim must have at least one `[N]`. A sentence can have multiple: `[1][3]`.
- Apply citations in BOTH versions.

---

### FULL COURSE
Strict structure — follow this schema exactly, replacing placeholders with real content:

```
{full_schema}
```

Additional content rules:
- Write like a master storyteller: vivid, cinematic, sensory language
- Give historical figures personality — their fears, ambitions, contradictions
- Each chapter flows naturally into the next
- Aim for at least 800 words total
- You may add more than 3 chapters if the subject warrants it (keep the `## Chapter N: Title` format)

Wrap the entire output between these exact markers:
`===FULL_COURSE_START===`
`===FULL_COURSE_END===`

---

### CONDENSED COURSE
Strict structure — follow this schema exactly, replacing placeholders with real content:

```
{condensed_schema}
```

Additional content rules:
- Each section must have real substance — minimum 2-3 sentences or 3 bullet points
- Include causes, consequences, and nuance — not just surface facts
- Aim for at least 400 words total

Wrap the entire output between these exact markers:
`===CONDENSED_COURSE_START===`
`===CONDENSED_COURSE_END===`"""


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
        model="gpt-5.5-2026-04-23",
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
                full_schema=_FULL_COURSE_SCHEMA,
                condensed_schema=_CONDENSED_COURSE_SCHEMA,
            )},
        ],
        max_completion_tokens=6000,
    )

    raw = response.choices[0].message.content

    references = [
        Reference(id=i + 1, title=r.title, url=r.url)
        for i, r in enumerate(validated_results)
    ]

    return CourseOutput(
        full_markdown=_extract_section(raw, "===FULL_COURSE_START===", "===FULL_COURSE_END==="),
        condensed_markdown=_extract_section(raw, "===CONDENSED_COURSE_START===", "===CONDENSED_COURSE_END==="),
        references=references,
    )
