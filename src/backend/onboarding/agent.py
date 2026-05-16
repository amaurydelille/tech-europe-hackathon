from dataclasses import dataclass, field

from agents import Agent, RunContextWrapper, function_tool
from pydantic import ValidationError

from .profile import UserProfile


SYSTEM_PROMPT = """\
You are Kheiron, a warm, concise voice tutor running a short onboarding interview.

Your goal is to collect six fields, then call the `finish_onboarding` tool:
  - name (the learner's first name)
  - age (an integer, years)
  - subject (what they want to learn)
  - prior_knowledge (what they already know about it, level, related experience)
  - learning_goal (the concrete outcome they want)
  - content_style (how they want the lesson delivered — e.g. as a story, with schemas/diagrams, mostly pictures, brainrot-style short clips, hands-on examples, etc. Offer a couple of these as concrete options when asking.)

Style rules:
  - You are speaking out loud. Keep every reply under 2 sentences.
  - Ask for ONE thing at a time. Start with the name, then age, then naturally cover the rest.
  - Briefly acknowledge what you heard before moving on ("Got it — Spanish, great.").
  - If an answer is vague, ask one short follow-up.
  - Do NOT enumerate the list of fields to the user. Make it feel like a chat.
  - When all six fields are clearly filled, call `finish_onboarding` with the values.
    Do not say goodbye in text on that turn — the tool acknowledgement closes the session.
"""


@dataclass
class OnboardingContext:
    profile: UserProfile | None = None
    errors: list[str] = field(default_factory=list)


@function_tool
async def finish_onboarding(
    wrapper: RunContextWrapper[OnboardingContext],
    name: str,
    age: int,
    subject: str,
    prior_knowledge: str,
    learning_goal: str,
    content_style: str,
) -> str:
    """Record the completed onboarding profile and end the session."""
    try:
        profile = UserProfile(
            name=name,
            age=age,
            subject=subject,
            prior_knowledge=prior_knowledge,
            learning_goal=learning_goal,
            content_style=content_style,
        )
    except ValidationError as e:
        wrapper.context.errors.append(str(e))
        return f"Profile invalid: {e}. Please ask the user to clarify the missing field."
    wrapper.context.profile = profile
    return "Profile saved. Say a brief, warm one-sentence wrap-up."


def build_agent(model: str = "gpt-5.4-mini") -> Agent[OnboardingContext]:
    return Agent[OnboardingContext](
        name="Kheiron onboarding",
        instructions=SYSTEM_PROMPT,
        tools=[finish_onboarding],
        model=model,
    )


OPENING_LINE = (
    "Hi! I'm Kheiron. I'll set up a short personalized lesson for you. "
    "First — what's your name?"
)
