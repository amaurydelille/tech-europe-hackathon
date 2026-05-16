import logging
from gliner import GLiNER
from .models import ScrapedResult, ValidatedResult

log = logging.getLogger(__name__)

_LABELS = ["person", "event", "date", "location", "organization", "concept", "battle", "country"]
_CHUNK_SIZE = 400  # words per chunk to stay within GLiNER token limits
_MIN_ENTITIES = 3
_TOP_K = 5

_model: GLiNER | None = None


def _get_model() -> GLiNER:
    global _model
    if _model is None:
        log.info("Loading GLINER model (first time only)...")
        _model = GLiNER.from_pretrained("urchade/gliner_mediumv2.1")
        log.info("GLINER model ready")
    return _model


def _chunk_text(text: str) -> list[str]:
    words = text.split()
    return [
        " ".join(words[i:i + _CHUNK_SIZE])
        for i in range(0, len(words), _CHUNK_SIZE)
    ]


def _extract_entities(text: str) -> list[dict]:
    model = _get_model()
    chunks = _chunk_text(text)
    all_entities = []
    for chunk in chunks:
        entities = model.predict_entities(chunk, _LABELS)
        all_entities.extend(entities)
    return all_entities


def validate_with_gliner(
    results: list[ScrapedResult],
    top_k: int = _TOP_K,
) -> list[ValidatedResult]:
    validated = []

    for result in results:
        if not result.content.strip():
            log.debug("Skipping empty result: %s", result.title)
            continue

        entities = _extract_entities(result.content)
        entity_count = len(entities)

        if entity_count < _MIN_ENTITIES:
            log.debug("Rejected (only %d entities): %s", entity_count, result.title)
            continue

        # score = tavily relevance + normalized entity density
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
