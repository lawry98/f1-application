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


FORECAST_FROM = datetime(2026, 9, 30, tzinfo=UTC)


def forecast_payload(count: int = 40, start: datetime = FORECAST_FROM) -> dict[str, Any]:
    """An OpenWeather 5-day/3-hour payload: ``count`` entries three hours apart from ``start``.

    Entry ``i`` is 20 + i degrees, so a test can tell exactly which slot a session was given.
    """
    entries = []
    for index in range(count):
        moment = start + timedelta(hours=3 * index)
        entries.append(
            {
                "dt": int(moment.timestamp()),
                "dt_txt": moment.strftime("%Y-%m-%d %H:%M:%S"),
                "main": {"temp": 20.04 + index, "feels_like": 20.55, "humidity": 60},
                "weather": [
                    {
                        "main": "Rain" if index % 2 else "Clear",
                        "description": "light rain" if index % 2 else "clear sky",
                    }
                ],
                "wind": {"speed": 3.77},
                "pop": 0.25 if index % 2 else 0.0,
            }
        )
    return {"cod": "200", "cnt": count, "list": entries}


# A Sepang weekend whose FP1 and race fall on forecast slots 18 (2 Oct 06:00) and 34 (4 Oct 06:00).
SEPANG = {"lat": 2.76075, "lon": 101.73696}
WEEKEND = [
    {"name": "Practice 1", "start": "2026-10-02T06:00:00+00:00"},
    {"name": "Qualifying", "start": "2026-10-03T09:00:00+00:00"},
    {"name": "Race", "start": "2026-10-04T06:00:00+00:00"},
]


def _weather(sessions=WEEKEND, **coords):
    return get_race_weather.invoke({**SEPANG, **coords, "sessions": sessions})


class RecordingGet:
    """A ``requests.get`` stand-in that serves one response and records every call."""

    def __init__(self, response: FakeResponse) -> None:
        self.response = response
        self.calls: list[dict[str, Any]] = []

    def __call__(self, url: str, params: dict | None = None, **kwargs):
        self.calls.append({"url": url, "params": params or {}})
        return self.response


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


def test_weather_without_a_key_reports_it_and_does_not_call_out():
    """The missing-key branch must short-circuit before any network attempt.

    conftest removes OPENWEATHER_API_KEY from the environment for the whole suite, so
    this is the default state rather than something this test arranges.
    """
    assert _weather() == {"error": "OPENWEATHER_API_KEY not configured"}


def _refuse_network(*args, **kwargs):
    raise AssertionError("a tool with no usable key must not reach the network")


@pytest.mark.parametrize("key", ["", "your-openweather-api-key-here", "  your-openweather-key "])
def test_weather_with_an_unusable_key_is_not_configured_and_makes_no_request(monkeypatch, key):
    """An env.example placeholder used to reach OpenWeather and earn a 401 while the startup
    log claimed weather was disabled. It must be treated exactly like no key at all.
    """
    monkeypatch.setattr(weather_tools, "OPENWEATHER_API_KEY", key)
    monkeypatch.setattr(weather_tools.requests, "get", _refuse_network)

    assert _weather() == {"error": "OPENWEATHER_API_KEY not configured"}


def test_weather_without_circuit_coordinates_is_an_error_and_makes_no_request(
    monkeypatch, openweather_key
):
    """No track, no centroid, no forecast. The geocoding this replaced guessed instead — Sepang
    became "Kuala Lumpur,BH", and a country missing from its map silently became "US"."""
    monkeypatch.setattr(weather_tools.requests, "get", _refuse_network)

    assert _weather(lat=None, lon=None) == {"error": "No circuit coordinates for this race"}


def test_weather_without_session_times_is_an_error_and_makes_no_request(
    monkeypatch, openweather_key
):
    monkeypatch.setattr(weather_tools.requests, "get", _refuse_network)

    assert _weather(sessions=[]) == {"error": "No session times for this race weekend"}


def test_weather_asks_only_the_forecast_endpoint_for_the_circuit_coordinates(
    monkeypatch, openweather_key
):
    fake = RecordingGet(FakeResponse(forecast_payload()))
    monkeypatch.setattr(weather_tools.requests, "get", fake)

    _weather()

    assert [call["url"] for call in fake.calls] == [
        "https://api.openweathermap.org/data/2.5/forecast"
    ]
    assert fake.calls[0]["params"] == {
        "lat": 2.76075,
        "lon": 101.73696,
        "appid": "test-openweather-key",
        "units": "metric",
    }


def test_weather_reports_a_failed_forecast_fetch(monkeypatch, openweather_key):
    monkeypatch.setattr(weather_tools.requests, "get", RecordingGet(FakeResponse({}, 500)))

    assert _weather() == {"error": "Forecast request failed with status 500"}


@freeze_time("2026-09-30T00:05:00")
def test_weather_gives_each_session_its_own_forecast(monkeypatch, openweather_key):
    monkeypatch.setattr(
        weather_tools.requests, "get", RecordingGet(FakeResponse(forecast_payload()))
    )

    result = _weather()

    assert result["status"] == "ok"
    assert result["forecast_generated_at"] == "2026-09-30T00:05:00+00:00"
    assert result["sessions"] == [
        {
            "name": "Practice 1",
            "start": "2026-10-02T06:00:00+00:00",
            "forecast": {
                "temperature_c": 38.0,
                "rain_probability": 0.0,
                "wind_speed_ms": 3.8,
                "conditions": "Clear",
                "description": "clear sky",
            },
        },
        {
            "name": "Qualifying",
            "start": "2026-10-03T09:00:00+00:00",
            "forecast": {
                "temperature_c": 47.0,
                "rain_probability": 25.0,
                "wind_speed_ms": 3.8,
                "conditions": "Rain",
                "description": "light rain",
            },
        },
        {
            "name": "Race",
            "start": "2026-10-04T06:00:00+00:00",
            "forecast": {
                "temperature_c": 54.0,
                "rain_probability": 0.0,
                "wind_speed_ms": 3.8,
                "conditions": "Clear",
                "description": "clear sky",
            },
        },
    ]


def test_weather_is_the_race_weekend_not_the_next_24_hours(monkeypatch, openweather_key):
    """The defect: the first eight 3-hour slots, i.e. the next day, presented as the weekend —
    a Singapore briefing quoted 30 Sep rain odds for an 11 Oct race. The window is FP1 - 3h to
    race + 3h, and nothing outside it reaches the result."""
    monkeypatch.setattr(
        weather_tools.requests, "get", RecordingGet(FakeResponse(forecast_payload()))
    )

    result = _weather()

    assert result["window"] == {
        "from": "2026-10-02T03:00:00+00:00",
        "to": "2026-10-04T09:00:00+00:00",
    }
    temperatures = {s["forecast"]["temperature_c"] for s in result["sessions"]}
    assert temperatures.isdisjoint({20.0 + index for index in range(8)})


@freeze_time("2026-09-30T00:05:00")
def test_a_weekend_just_past_the_last_slot_is_outside_the_range(monkeypatch, openweather_key):
    """Inside the day of slack the session times alone cannot settle it, so the forecast is
    fetched and its own last slot decides: here it ends on 4 Oct, and FP1 is on the 5th.
    That is an answer — not yet forecast — never a forecast for some other days."""
    monkeypatch.setattr(
        weather_tools.requests, "get", RecordingGet(FakeResponse(forecast_payload()))
    )

    result = _weather(
        sessions=[
            {"name": "Practice 1", "start": "2026-10-05T06:00:00+00:00"},
            {"name": "Race", "start": "2026-10-07T12:00:00+00:00"},
        ]
    )

    assert result == {
        "status": "outside_forecast_range",
        "weekend_starts": "2026-10-05T06:00:00+00:00",
        "available_from": "2026-09-30",
        "forecast_generated_at": "2026-09-30T00:05:00+00:00",
    }


def test_a_weekend_that_runs_past_the_forecast_is_partial(monkeypatch, openweather_key):
    """FP1 is in range and the race is not: the race says so rather than borrowing FP1's."""
    monkeypatch.setattr(
        weather_tools.requests, "get", RecordingGet(FakeResponse(forecast_payload(count=30)))
    )

    result = _weather()

    assert result["status"] == "partial"
    by_name = {s["name"]: s["forecast"] for s in result["sessions"]}
    assert by_name["Practice 1"]["temperature_c"] == 38.0
    assert by_name["Race"] is None


def test_sessions_already_under_way_get_no_forecast(monkeypatch, openweather_key):
    """Late on race day the forecast starts after the window closes: every session says it has
    no forecast rather than borrowing tomorrow's."""
    monkeypatch.setattr(
        weather_tools.requests,
        "get",
        RecordingGet(FakeResponse(forecast_payload(start=datetime(2026, 10, 4, 12, tzinfo=UTC)))),
    )

    result = _weather()

    assert result["status"] == "partial"
    assert [s["forecast"] for s in result["sessions"]] == [None, None, None]


def test_an_empty_forecast_is_an_error_not_a_dry_weekend(monkeypatch, openweather_key):
    monkeypatch.setattr(
        weather_tools.requests, "get", RecordingGet(FakeResponse({"cod": "200", "list": []}))
    )

    assert _weather() == {"error": "Forecast returned no entries"}


def test_weather_converts_an_unexpected_exception_into_an_error(monkeypatch, openweather_key):
    """A tool must never raise — the agent is built to continue on partial data."""

    def boom(*args, **kwargs):
        raise ConnectionError("network down")

    monkeypatch.setattr(weather_tools.requests, "get", boom)
    result = _weather()
    assert "error" in result
    assert "network down" in result["error"]


def test_a_transport_error_never_carries_the_key_into_the_result_or_the_log(
    monkeypatch, openweather_key, caplog
):
    """requests quotes the failing URL, and the key is in its query string."""

    def boom(*args, **kwargs):
        raise ConnectionError(
            "Max retries exceeded with url: /data/2.5/forecast?lat=2.7&appid=test-openweather-key"
        )

    monkeypatch.setattr(weather_tools.requests, "get", boom)

    with caplog.at_level("WARNING", logger="tools.weather_tools"):
        result = _weather()

    assert "test-openweather-key" not in result["error"]
    assert "[redacted]" in result["error"]
    assert "test-openweather-key" not in caplog.text


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


@pytest.mark.parametrize("key", ["", "tvly-your-tavily-api-key-here", "TVLY-YOUR-KEY-HERE"])
def test_search_with_an_unusable_key_is_not_configured_and_makes_no_request(monkeypatch, key):
    """Same trap as the weather key: a placeholder is a missing key, not a credential to try."""

    class _RefusingClient:
        def __init__(self, *args, **kwargs):
            _refuse_network()

    monkeypatch.setattr(search_tools, "TAVILY_API_KEY", key)
    monkeypatch.setattr(search_tools, "TavilyClient", _RefusingClient)

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
