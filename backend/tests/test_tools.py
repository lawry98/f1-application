"""Tests for the two network-backed optional-integration tools.

Both tools exist to degrade rather than fail: the agent is built to continue on
partial data, so every failure mode here must produce ``{"error": ...}`` and never
raise. That invariant is the thing worth protecting — the response-shaping is
secondary but cheap to pin alongside it.

The five FastF1-backed tools live in ``test_fastf1_tools.py``.
"""

import json
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from freezegun import freeze_time

from agent.prompts import SYNTHESIZER_PROMPT
from config import CIRCUIT_COORDINATES_PATH, CIRCUIT_INDEX_PATH
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


# The weather tests run at the moment this was measured live: 21:32 UTC on 2026-09-30, when
# OpenWeather's 40 slots ran from 2026-10-01 00:00 to 2026-10-05 21:00 UTC. The race in the
# window was the 2026 Bahrain Grand Prix — run at Kuala Lumpur (Sepang), UTC+8, on 2026-10-04.
NOW = "2026-09-30 21:32:00"
FIRST_SLOT = datetime(2026, 10, 1, tzinfo=UTC)
KUALA_LUMPUR = {"location": "Kuala Lumpur", "race_date": "2026-10-04"}
UTC_PLUS_8 = 8 * 3600


def forecast_payload(
    count: int = 40, start: datetime = FIRST_SLOT, utc_offset: int = UTC_PLUS_8
) -> dict[str, Any]:
    """An OpenWeather 5-day/3-hour payload: ``count`` slots from ``start``, 3 hours apart."""
    return {
        "city": {"timezone": utc_offset},
        "list": [
            {
                "dt": int((start + timedelta(hours=3 * index)).timestamp()),
                "main": {"temp": 30.44, "feels_like": 36.55, "humidity": 70},
                "weather": [{"main": "Rain", "description": "light rain"}],
                "wind": {"speed": 3.77},
                "pop": 0.29,
            }
            for index in range(count)
        ],
    }


def serve(payload: Any, status_code: int = 200):
    """A ``requests.get`` stand-in that serves one payload and records every call."""

    def fake_get(url: str, **kwargs: Any) -> FakeResponse:
        fake_get.calls.append({"url": url, **kwargs})
        return FakeResponse(payload, status_code)

    fake_get.calls = []
    return fake_get


def refuse(*args: Any, **kwargs: Any) -> None:
    raise AssertionError("the weather tool made a request it had no reason to make")


@pytest.fixture
def openweather_key(monkeypatch):
    """Provide an OpenWeather key for the tests that need past the guard clause.

    The tool binds the constant at import (``from config import OPENWEATHER_API_KEY``),
    so the patch goes on the tool module's copy — env vars are read once, in config.py.
    """
    monkeypatch.setattr(weather_tools, "OPENWEATHER_API_KEY", "test-openweather-key")


@pytest.fixture
def tavily_key(monkeypatch):
    """Provide a Tavily key. Same import-time binding caveat as ``openweather_key``."""
    monkeypatch.setattr(search_tools, "TAVILY_API_KEY", "test-tavily-key")


# ── Weather ──────────────────────────────────────────────────────────────────


def test_weather_without_a_key_reports_it_and_does_not_call_out(monkeypatch):
    """The missing-key branch must short-circuit before any network attempt.

    conftest removes OPENWEATHER_API_KEY from the environment for the whole suite, so
    this is the default state rather than something this test arranges.
    """
    monkeypatch.setattr(weather_tools.requests, "get", refuse)
    result = get_race_weather.invoke(KUALA_LUMPUR)
    assert result == {"error": "OPENWEATHER_API_KEY not configured"}


@freeze_time(NOW)
def test_weather_returns_only_race_day_in_the_circuits_local_time(monkeypatch, openweather_key):
    """The defect this replaced: the first 8 slots — the next 24 hours, whatever the race date.

    Slots fall on UTC's three-hour marks, which are 02:00, 05:00 … 23:00 at a UTC+8 circuit,
    so race day's first slot is 18:00 UTC the day before. Bucketing by UTC date would instead
    return 08:00 on the 4th to 05:00 on the 5th.
    """
    monkeypatch.setattr(weather_tools.requests, "get", serve(forecast_payload()))
    result = get_race_weather.invoke(KUALA_LUMPUR)

    assert result["forecast_available"] is True
    assert result["race_date"] == "2026-10-04"
    times = [slot["local_time"] for slot in result["forecasts"]]
    assert times == [f"2026-10-04 {hour:02d}:00" for hour in range(2, 24, 3)]


@freeze_time(NOW)
def test_weather_asks_for_the_circuit_by_coordinates_and_never_geocodes(
    monkeypatch, openweather_key
):
    """Geocoding FastF1's Location missed four real circuits, measured live on 2026-09-30:
    "Kuala Lumpur,BH" (the event's country, not the venue's), Sakhir, Yas Marina and
    Spa-Francorchamps all came back empty. The circuit's own coordinates cannot miss.
    """
    fake_get = serve(forecast_payload())
    monkeypatch.setattr(weather_tools.requests, "get", fake_get)
    get_race_weather.invoke(KUALA_LUMPUR)

    assert [call["url"] for call in fake_get.calls] == [
        "https://api.openweathermap.org/data/2.5/forecast"
    ]
    params = fake_get.calls[0]["params"]
    # Sepang International Circuit, ~50km south of Kuala Lumpur's city centre.
    assert params["lat"] == pytest.approx(2.76, abs=0.05)
    assert params["lon"] == pytest.approx(101.74, abs=0.05)


@freeze_time(NOW)
def test_weather_shapes_each_slot(monkeypatch, openweather_key):
    monkeypatch.setattr(weather_tools.requests, "get", serve(forecast_payload()))
    slot = get_race_weather.invoke(KUALA_LUMPUR)["forecasts"][0]

    assert slot == {
        "local_time": "2026-10-04 02:00",
        "temperature_c": 30.4,
        "feels_like_c": 36.5,
        "humidity": 70,
        "weather": "Rain",
        "description": "light rain",
        "wind_speed_ms": 3.8,
        "rain_probability": 29,  # pop is a fraction; 0.29 * 100 is 28.999999999999996
    }


@freeze_time(NOW)
def test_weather_for_a_race_beyond_the_window_says_so_without_calling_out(
    monkeypatch, openweather_key
):
    """A briefing three weeks out used to present today's weather as the race forecast."""
    monkeypatch.setattr(weather_tools.requests, "get", refuse)
    result = get_race_weather.invoke({"location": "Austin", "race_date": "2026-10-25"})

    assert result == {
        "location": "Austin",
        "race_date": "2026-10-25",
        "forecast_available": False,
        "reason": "beyond_forecast_window",
        "forecast_opens": "2026-10-20",
    }


@freeze_time(NOW)
def test_weather_for_a_race_already_run_says_so_without_calling_out(monkeypatch, openweather_key):
    monkeypatch.setattr(weather_tools.requests, "get", refuse)
    result = get_race_weather.invoke({"location": "Baku", "race_date": "2026-09-27"})

    assert result == {
        "location": "Baku",
        "race_date": "2026-09-27",
        "forecast_available": False,
        "reason": "race_day_passed",
    }


@freeze_time(NOW)
def test_the_synthesizer_prompt_steers_on_keys_the_tool_really_emits(monkeypatch, openweather_key):
    """Weather Watch is told what to write from these two keys. Renaming either here would
    leave the model looking for a key that is never there, and it would fill the gap itself."""
    monkeypatch.setattr(weather_tools.requests, "get", refuse)
    result = get_race_weather.invoke({"location": "Austin", "race_date": "2026-10-25"})
    for key in ("forecast_available", "forecast_opens"):
        assert key in SYNTHESIZER_PROMPT
        assert key in result


@freeze_time(NOW)
def test_weather_trusts_the_forecast_when_race_day_is_past_its_last_slot(
    monkeypatch, openweather_key
):
    """Near the window's edge only the payload knows whether race day is covered."""
    monkeypatch.setattr(weather_tools.requests, "get", serve(forecast_payload(count=8)))
    result = get_race_weather.invoke(KUALA_LUMPUR)

    assert result["forecast_available"] is False
    assert result["reason"] == "beyond_forecast_window"
    assert "forecasts" not in result


@freeze_time(NOW)
def test_weather_trusts_the_forecast_when_race_day_ended_before_its_first_slot(
    monkeypatch, openweather_key
):
    """It is already 05:32 on 1 October in Kuala Lumpur, so a 30 September race day is over."""
    monkeypatch.setattr(weather_tools.requests, "get", serve(forecast_payload()))
    result = get_race_weather.invoke({"location": "Kuala Lumpur", "race_date": "2026-09-30"})

    assert result["forecast_available"] is False
    assert result["reason"] == "race_day_passed"


@freeze_time(NOW)
def test_weather_reports_a_location_with_no_circuit_coordinates(monkeypatch, openweather_key):
    """No fallback to geocoding by name: that is how "Silverstone,US" became North Carolina."""
    monkeypatch.setattr(weather_tools.requests, "get", refuse)
    result = get_race_weather.invoke({"location": "Atlantis", "race_date": "2026-10-04"})
    assert result == {"error": "No circuit coordinates for Atlantis"}


@freeze_time(NOW)
def test_weather_reports_a_failed_forecast_fetch(monkeypatch, openweather_key):
    monkeypatch.setattr(weather_tools.requests, "get", serve({}, status_code=500))
    result = get_race_weather.invoke(KUALA_LUMPUR)
    assert result == {"error": "Failed to fetch weather forecast"}


@freeze_time(NOW)
def test_weather_converts_an_unexpected_exception_into_an_error(monkeypatch, openweather_key):
    """A tool must never raise — the agent is built to continue on partial data."""

    def boom(*args, **kwargs):
        raise ConnectionError("network down")

    monkeypatch.setattr(weather_tools.requests, "get", boom)
    result = get_race_weather.invoke(KUALA_LUMPUR)
    assert "error" in result
    assert "network down" in result["error"]


def test_every_circuit_in_the_index_has_coordinates():
    """A circuit added to the index without a centre would lose its weather silently."""
    index = json.loads(CIRCUIT_INDEX_PATH.read_text(encoding="utf-8"))
    coordinates = json.loads(CIRCUIT_COORDINATES_PATH.read_text(encoding="utf-8"))
    assert set(index.values()) <= set(coordinates)


@pytest.mark.parametrize(
    ("circuit_id", "town_lat", "town_lon"),
    [
        # Where OpenWeather's geocoder puts each circuit's town, measured live on 2026-09-30.
        ("gb-1948", 52.09, -1.02),  # Silverstone
        ("it-1922", 45.58, 9.27),  # Monza
        ("jp-1962", 34.88, 136.58),  # Suzuka
    ],
)
def test_circuit_coordinates_are_latitude_then_longitude(circuit_id, town_lat, town_lon):
    """GeoJSON is lon/lat; a swapped pair would put Silverstone in the Indian Ocean."""
    centre = json.loads(CIRCUIT_COORDINATES_PATH.read_text(encoding="utf-8"))[circuit_id]
    assert centre["lat"] == pytest.approx(town_lat, abs=0.1)
    assert centre["lon"] == pytest.approx(town_lon, abs=0.1)


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
