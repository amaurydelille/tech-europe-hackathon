import re
import logging
from gliner2 import GLiNER2
from .models import ScrapedResult, ValidatedResult

log = logging.getLogger(__name__)

_LABELS = ["person", "event", "date", "location", "organization", "concept", "battle", "country"]
_CHUNK_MAX_WORDS = 200
_GLINER_MAX_CHARS = 1500  # only validate the first N chars — enough to judge relevance, avoids slow full-doc inference
_MIN_ENTITIES = 3
_TOP_K = 5

_model: GLiNER2 | None = None


def _get_model() -> GLiNER2:
    global _model
    if _model is None:
        log.info("Loading GLiNER2 model on MPS...")
        _model = GLiNER2.from_pretrained("fastino/gliner2-base-v1", device="mps")
        log.info("GLiNER2 model ready (MPS)")
    return _model


def _chunk_text(text: str) -> list[str]:
    sentences = re.split(r'(?<=[.!?])\s+', text)
    chunks, current, current_words = [], [], 0

    for sentence in sentences:
        word_count = len(sentence.split())
        if current_words + word_count > _CHUNK_MAX_WORDS and current:
            chunks.append(" ".join(current))
            current, current_words = [], 0
        current.append(sentence)
        current_words += word_count

    if current:
        chunks.append(" ".join(current))

    return chunks


def _extract_entity_count(text: str) -> int:
    model = _get_model()
    chunks = _chunk_text(text)
    total = 0
    for chunk in chunks:
        result = model.extract_entities(chunk, _LABELS)
        # result = {'entities': {'person': [...], 'location': [...], ...}}
        total += sum(len(v) for v in result.get("entities", {}).values())
    return total


def validate_with_gliner(
    results: list[ScrapedResult],
    top_k: int = _TOP_K,
) -> list[ValidatedResult]:
    validated = []

    for result in results:
        if not result.content.strip():
            log.debug("Skipping empty result: %s", result.title)
            continue

        entity_count = _extract_entity_count(result.content[:_GLINER_MAX_CHARS])

        if entity_count < _MIN_ENTITIES:
            log.debug("Rejected (only %d entities): %s", entity_count, result.title)
            continue

        word_count = max(len(result.content.split()), 1)
        entity_density = entity_count / (word_count / 100)
        relevance_score = result.score + (entity_density * 0.1)

        validated.append(ValidatedResult(
            title=result.title,
            url=result.url,
            content=result.content,
            entity_count=entity_count,
            relevance_score=relevance_score,
        ))

    validated.sort(key=lambda r: r.relevance_score, reverse=True)
    return validated[:top_k]
