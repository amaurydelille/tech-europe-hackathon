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

## {{Section title — freely chosen to fit the content}}
{{2-4 sentences of substantive content for this section}}

### Key Insight
{{One sharp sentence capturing the single most important fact, date, or idea from the section above}}

## {{Next section title}}
{{2-4 sentences}}

### Key Insight
{{One sharp sentence}}

{{...repeat for as many sections as needed to cover the subject thoroughly}}
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
- Choose section titles freely — whatever best fits the content, no imposed labels
- Every `##` section must be immediately followed by a `### Key Insight` with one sharp sentence
- The Key Insight distills the single most important fact, date, or idea from the section above it
- Each section must have 2-4 sentences of real substance before the Key Insight
- Include causes, consequences, and nuance — not just surface facts
- Aim for at least 400 words total (excluding Key Insights)

Wrap the entire output between these exact markers:
`===CONDENSED_COURSE_START===`
`===CONDENSED_COURSE_END===`

---

### NEXT CHAPTER
Based on the current course, suggest the single most logical next course the student should take.
- It must be a natural continuation — the next step in the learning journey
- Return ONLY the course title, 5 words maximum, no explanation, no punctuation at the end
- Examples: "Napoleon's Fall and Exile", "The French Revolution Origins", "Waterloo and the Aftermath"

Wrap it between these exact markers:
`===NEXT_CHAPTER_START===`
`===NEXT_CHAPTER_END===`"""


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
        next_chapter=_extract_section(raw, "===NEXT_CHAPTER_START===", "===NEXT_CHAPTER_END==="),
        references=references,
    )
