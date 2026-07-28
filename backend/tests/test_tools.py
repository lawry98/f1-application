"""Tests for the two network-backed optional-integration tools.

Both tools exist to degrade rather than fail: the agent is built to continue on
partial data, so every failure mode here must produce ``{"error": ...}`` and never
raise. That invariant is the thing worth protecting — the response-shaping is
secondary but cheap to pin alongside it.

Not covered: the five FastF1 session-backed tools (``get_track_info``,
``get_recent_race_results``, ``get_driver_form``, ``get_season_standings``,
``get_circuit_winners``). They need a Session double with a results frame; a
deliberate, documented gap.
"""

from typing import Any

import pytest

from tools import search_tools, weather_tools
from tools.search_tools import search_f1_news
from tools.weather_tools import get_race_weather


class FakeResponse:
    """Stand-in for a ``requests.Response`` — only status_code and json() are consumed."""

    def __init__(self, payload: Any, status_code: int = 200) -> None:
        self.status_code = status_code
        self._payload = payload

    def json(self) -> Any:
        return self._payload


GEO_HIT = [{"lat": 43.73, "lon": 7.42, "name": "Monaco"}]


def forecast_payload(count: int = 3) -> dict[str, Any]:
    """Build an OpenWeather 5-day/3-hour forecast payload with ``count`` entries."""
    return {
        "list": [
            {
                "dt_txt": f"2025-05-{20 + index:02d} 12:00:00",
                "main": {"temp": 21.44 + index, "feels_like": 20.55, "humidity": 60 + index},
                "weather": [{"main": "Rain" if index == 1 else "Clear", "description": "light"}],
                "wind": {"speed": 3.77},
                "pop": 0.25 * index,
            }
            for index in range(count)
        ]
    }


@pytest.fixture
def openweather_key(monkeypatch):
    """Provide an OpenWeather key for the tests that need past the guard clause.

    Note this sets an *environment variable* rather than patching config. weather_tools
    reads ``os.getenv`` directly, which contradicts CLAUDE.md's stated rule that env
    vars are read in config.py only. These tests pin the code as it actually behaves;
    if the read moves into config.py, this fixture is what needs to change.
    """
    monkeypatch.setenv("OPENWEATHER_API_KEY", "test-openweather-key")


@pytest.fixture
def tavily_key(monkeypatch):
    """Provide a Tavily key. Same os.getenv caveat as ``openweather_key``."""
    monkeypatch.setenv("TAVILY_API_KEY", "test-tavily-key")


# ── Weather ──────────────────────────────────────────────────────────────────


def test_weather_without_a_key_reports_it_and_does_not_call_out():
    """The missing-key branch must short-circuit before any network attempt.

    conftest removes OPENWEATHER_API_KEY from the environment for the whole suite, so
    this is the default state rather than something this test arranges.
    """
    result = get_race_weather.invoke({"city": "Monaco", "country_code": "MC"})
    assert result == {"error": "OPENWEATHER_API_KEY not configured"}


def test_weather_reports_a_failed_geocode_status(monkeypatch, openweather_key):
    monkeypatch.setattr(weather_tools.requests, "get", lambda *a, **kw: FakeResponse([], 401))
    result = get_race_weather.invoke({"city": "Monaco", "country_code": "MC"})
    assert result == {"error": "Could not find location for Monaco, MC"}


def test_weather_reports_an_empty_geocode_result(monkeypatch, openweather_key):
    """A 200 with an empty list means the city was not found — same user-facing outcome."""
    monkeypatch.setattr(weather_tools.requests, "get", lambda *a, **kw: FakeResponse([], 200))
    result = get_race_weather.invoke({"city": "Nowhere", "country_code": "ZZ"})
    assert result == {"error": "Could not find location for Nowhere, ZZ"}


def test_weather_reports_a_failed_forecast_fetch(monkeypatch, openweather_key):
    def fake_get(url, **kwargs):
        return FakeResponse(GEO_HIT, 200) if "geo" in url else FakeResponse({}, 500)

    monkeypatch.setattr(weather_tools.requests, "get", fake_get)
    result = get_race_weather.invoke({"city": "Monaco", "country_code": "MC"})
    assert result == {"error": "Failed to fetch weather forecast"}


def test_weather_shapes_a_successful_forecast(monkeypatch, openweather_key):
    def fake_get(url, **kwargs):
        return FakeResponse(GEO_HIT, 200) if "geo" in url else FakeResponse(forecast_payload(3))

    monkeypatch.setattr(weather_tools.requests, "get", fake_get)
    result = get_race_weather.invoke({"city": "Monaco", "country_code": "MC"})

    assert result["location"] == "Monaco, MC"
    assert len(result["forecasts"]) == 3

    first = result["forecasts"][0]
    assert first["temperature_c"] == 21.4  # rounded to 1dp
    assert first["rain_probability"] == 0.0  # pop is a fraction, surfaced as a percentage
    assert first["weather"] == "Clear"
    assert first["wind_speed_ms"] == 3.8

    assert result["forecasts"][1]["rain_probability"] == 25.0
    assert result["summary"]["max_rain_probability"] == 50.0
    assert result["summary"]["conditions"] == ["Clear", "Rain", "Clear"]
    assert result["summary"]["avg_temp"] == 22.4


def test_weather_truncates_to_eight_forecast_windows(monkeypatch, openweather_key):
    """OpenWeather returns 40 entries; the tool keeps 24 hours' worth to bound prompt size."""

    def fake_get(url, **kwargs):
        return FakeResponse(GEO_HIT, 200) if "geo" in url else FakeResponse(forecast_payload(40))

    monkeypatch.setattr(weather_tools.requests, "get", fake_get)
    result = get_race_weather.invoke({"city": "Monaco", "country_code": "MC"})
    assert len(result["forecasts"]) == 8
    assert len(result["summary"]["conditions"]) == 3


def test_weather_summarises_an_empty_forecast_without_dividing_by_zero(
    monkeypatch, openweather_key
):
    def fake_get(url, **kwargs):
        return FakeResponse(GEO_HIT, 200) if "geo" in url else FakeResponse({"list": []})

    monkeypatch.setattr(weather_tools.requests, "get", fake_get)
    result = get_race_weather.invoke({"city": "Monaco", "country_code": "MC"})
    assert result["forecasts"] == []
    assert result["summary"]["avg_temp"] is None
    assert result["summary"]["max_rain_probability"] == 0


def test_weather_converts_an_unexpected_exception_into_an_error(monkeypatch, openweather_key):
    """A tool must never raise — the agent is built to continue on partial data."""

    def boom(*args, **kwargs):
        raise ConnectionError("network down")

    monkeypatch.setattr(weather_tools.requests, "get", boom)
    result = get_race_weather.invoke({"city": "Monaco", "country_code": "MC"})
    assert "error" in result
    assert "network down" in result["error"]


# ── News search ──────────────────────────────────────────────────────────────


def make_tavily_client(response: dict[str, Any] | None = None, raises: Exception | None = None):
    """Build a TavilyClient replacement that records how it was constructed and called."""
    calls: list[dict[str, Any]] = []

    class _FakeTavilyClient:
        def __init__(self, api_key: str) -> None:
            self.api_key = api_key

        def search(self, **kwargs: Any) -> dict[str, Any]:
            calls.append(kwargs)
            if raises is not None:
                raise raises
            return response or {"results": []}

    _FakeTavilyClient.calls = calls
    return _FakeTavilyClient


def test_search_without_a_key_reports_it():
    result = search_f1_news.invoke({"query": "Monaco Grand Prix 2025"})
    assert result == {"error": "TAVILY_API_KEY not configured"}


def test_search_shapes_articles(monkeypatch, tavily_key):
    payload = {
        "results": [
            {
                "title": "Monaco preview",
                "url": "https://example.test/monaco",
                "content": "Tight streets.",
                "published_date": "2025-05-20",
                "score": 0.92,
            }
        ]
    }
    monkeypatch.setattr(search_tools, "TavilyClient", make_tavily_client(payload))

    result = search_f1_news.invoke({"query": "Monaco Grand Prix 2025"})
    assert result["query"] == "Monaco Grand Prix 2025"
    assert result["count"] == 1
    assert result["articles"][0]["title"] == "Monaco preview"
    assert result["articles"][0]["score"] == 0.92


def test_search_defaults_missing_article_fields(monkeypatch, tavily_key):
    """Tavily results are not guaranteed to carry every field; absent ones become empty."""
    monkeypatch.setattr(
        search_tools, "TavilyClient", make_tavily_client({"results": [{"title": "Bare"}]})
    )
    article = search_f1_news.invoke({"query": "monaco"})["articles"][0]
    assert article == {
        "title": "Bare",
        "url": "",
        "content": "",
        "published_date": "",
        "score": 0,
    }


def test_search_widens_the_query_and_honours_max_results(monkeypatch, tavily_key):
    """The raw query is wrapped with F1 context before it reaches Tavily."""
    client = make_tavily_client()
    monkeypatch.setattr(search_tools, "TavilyClient", client)

    search_f1_news.invoke({"query": "Monaco Grand Prix 2025", "max_results": 2})

    assert client.calls[0]["query"] == "F1 Formula 1 Monaco Grand Prix 2025 latest news"
    assert client.calls[0]["max_results"] == 2
    assert client.calls[0]["search_depth"] == "basic"


def test_search_defaults_to_five_results(monkeypatch, tavily_key):
    client = make_tavily_client()
    monkeypatch.setattr(search_tools, "TavilyClient", client)
    search_f1_news.invoke({"query": "monaco"})
    assert client.calls[0]["max_results"] == 5


def test_search_converts_an_unexpected_exception_into_an_error(monkeypatch, tavily_key):
    monkeypatch.setattr(
        search_tools, "TavilyClient", make_tavily_client(raises=RuntimeError("rate limited"))
    )
    result = search_f1_news.invoke({"query": "monaco"})
    assert "error" in result
    assert "rate limited" in result["error"]


def test_search_returns_no_articles_rather_than_erroring_on_an_empty_response(
    monkeypatch, tavily_key
):
    monkeypatch.setattr(search_tools, "TavilyClient", make_tavily_client({"results": []}))
    result = search_f1_news.invoke({"query": "monaco"})
    assert result["count"] == 0
    assert result["articles"] == []
