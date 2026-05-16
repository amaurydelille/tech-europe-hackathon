import os
from tavily import TavilyClient
from .models import ScrapedResult

_client = TavilyClient(api_key=os.environ.get("TAVILY_API_KEY", "placeholder"))


def search_tavily(query: str, max_results: int = 10) -> list[ScrapedResult]:
    response = _client.search(
        query=query,
        search_depth="advanced",
        max_results=max_results,
        include_raw_content=True,
    )

    results = []
    for item in response.get("results", []):
        content = item.get("raw_content") or item.get("content", "")
        results.append(ScrapedResult(
            title=item.get("title", ""),
            url=item.get("url", ""),
            content=content,
            score=item.get("score", 0.0),
        ))

    return results
