"""Tavily web search tool for F1 news and race coverage."""

from typing import Any

from langchain_core.tools import tool
from tavily import TavilyClient

from config import TAVILY_API_KEY


@tool
def search_f1_news(query: str, max_results: int = 5) -> dict[str, Any]:
    """Search for recent F1 news articles using the Tavily API.

    Args:
        query: Search query for F1 news (e.g., 'Monaco Grand Prix 2025').
        max_results: Maximum number of results to return (default: 5).

    Returns:
        Dictionary with 'articles' list and 'count', or an 'error' key on failure.
    """
    try:
        if not TAVILY_API_KEY:
            return {"error": "TAVILY_API_KEY not configured"}

        client = TavilyClient(api_key=TAVILY_API_KEY)

        response = client.search(
            query=f"F1 Formula 1 {query} latest news",
            search_depth="basic",
            max_results=max_results,
        )

        articles = [
            {
                "title": result.get("title", ""),
                "url": result.get("url", ""),
                "content": result.get("content", ""),
                "published_date": result.get("published_date", ""),
                "score": result.get("score", 0),
            }
            for result in response.get("results", [])
        ]

        return {"query": query, "articles": articles, "count": len(articles)}
    except Exception as exc:
        return {"error": f"Failed to search F1 news: {exc}"}
