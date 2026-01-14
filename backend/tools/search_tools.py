import os
from langchain_core.tools import tool
from typing import Dict, Any
from tavily import TavilyClient

@tool
def search_f1_news(query: str, max_results: int = 5) -> Dict[str, Any]:
    """Search for recent F1 news articles using Tavily API.
    
    Args:
        query: Search query for F1 news
        max_results: Maximum number of results to return (default: 5)
    
    Returns:
        Dictionary with news articles or error message
    """
    try:
        api_key = os.getenv('TAVILY_API_KEY')
        if not api_key:
            return {"error": "TAVILY_API_KEY not configured"}
        
        client = TavilyClient(api_key=api_key)
        
        search_query = f"F1 Formula 1 {query} latest news"
        response = client.search(
            query=search_query,
            search_depth="basic",
            max_results=max_results
        )
        
        articles = []
        for result in response.get('results', []):
            articles.append({
                "title": result.get('title', ''),
                "url": result.get('url', ''),
                "content": result.get('content', ''),
                "published_date": result.get('published_date', ''),
                "score": result.get('score', 0)
            })
        
        return {
            "query": query,
            "articles": articles,
            "count": len(articles)
        }
    except Exception as e:
        return {"error": f"Failed to search F1 news: {str(e)}"}
