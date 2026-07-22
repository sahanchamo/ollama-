from dataclasses import dataclass

import httpx

from app.core.config import get_settings


@dataclass(frozen=True)
class WebSource:
    title: str
    url: str
    content: str


async def search_web(query: str) -> list[WebSource]:
    """Search through the configured provider; browser clients never receive the provider key."""
    settings = get_settings()
    if not settings.web_search_enabled:
        raise RuntimeError("Web search is disabled by the workspace administrator")
    if not settings.tavily_api_key:
        raise RuntimeError("Web search is not configured: set TAVILY_API_KEY on the server")
    async with httpx.AsyncClient(timeout=httpx.Timeout(20, connect=8)) as client:
        response = await client.post(
            "https://api.tavily.com/search",
            headers={"Authorization": f"Bearer {settings.tavily_api_key}"},
            json={
                "query": query,
                "search_depth": "basic",
                "max_results": settings.web_search_max_results,
                "include_answer": False,
                "include_raw_content": "text",
            },
        )
        response.raise_for_status()
    sources: list[WebSource] = []
    for item in response.json().get("results", []):
        url = str(item.get("url", "")).strip()
        title = str(item.get("title", "Untitled source")).strip()
        content = str(item.get("raw_content") or item.get("content") or "").strip()
        if url and content:
            sources.append(WebSource(title=title[:240], url=url[:2048], content=content[:4000]))
    return sources


def web_search_instruction(sources: list[WebSource]) -> str:
    if not sources:
        return "WEB RESEARCH: No useful sources were returned. Say this plainly; do not invent web findings."
    rendered = "\n\n".join(
        f"[{index}] {source.title}\nURL: {source.url}\n{source.content}"
        for index, source in enumerate(sources, start=1)
    )
    return (
        "WEB RESEARCH SOURCES (current external information):\n"
        f"{rendered}\n\n"
        "Use these sources only when relevant. Cite factual web claims with [number] and include a short Sources list with URLs at the end. "
        "If sources conflict or are insufficient, say so."
    )
