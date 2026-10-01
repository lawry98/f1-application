"""OpenWeather API tool for the race-day forecast at a circuit."""

import functools
import json
from datetime import UTC, date, datetime, timedelta, timezone
from typing import Any

import requests
from langchain_core.tools import tool

from config import CIRCUIT_COORDINATES_PATH, OPENWEATHER_API_KEY
from tools.circuit_winners import circuit_id_for_location

FORECAST_URL = "https://api.openweathermap.org/data/2.5/forecast"

# The free endpoint returns 40 three-hour slots starting from the request time, so a race day
# more than about five days out has no forecast yet.
FORECAST_HORIZON_DAYS = 5

# `reason` values for a race day the forecast does not reach. Both are answers, not failures,
# so they carry no `error` key: the synthesizer says there is no forecast instead of dropping
# the section, and the loading panel does not show the tool as failed.
BEYOND_FORECAST_WINDOW = "beyond_forecast_window"
RACE_DAY_PASSED = "race_day_passed"


@functools.cache
def _coordinates() -> dict[str, dict[str, float]]:
    with open(CIRCUIT_COORDINATES_PATH, encoding="utf-8") as handle:
        return json.load(handle)


def _no_forecast(location: str, race_day: date, reason: str) -> dict[str, Any]:
    result: dict[str, Any] = {
        "location": location,
        "race_date": race_day.isoformat(),
        "forecast_available": False,
        "reason": reason,
    }
    if reason == BEYOND_FORECAST_WINDOW:
        # The first day on which any of race day can appear in the forecast.
        result["forecast_opens"] = (race_day - timedelta(days=FORECAST_HORIZON_DAYS)).isoformat()
    return result


def _slot(local_time: datetime, item: dict[str, Any]) -> dict[str, Any]:
    return {
        "local_time": local_time.strftime("%Y-%m-%d %H:%M"),
        "temperature_c": round(item["main"]["temp"], 1),
        "feels_like_c": round(item["main"]["feels_like"], 1),
        "humidity": item["main"]["humidity"],
        "weather": item["weather"][0]["main"],
        "description": item["weather"][0]["description"],
        "wind_speed_ms": round(item["wind"]["speed"], 1),
        "rain_probability": round(item.get("pop", 0) * 100),
    }


@tool
def get_race_weather(location: str, race_date: str) -> dict[str, Any]:
    """Get the race-day weather forecast at a circuit using the OpenWeather API.

    Args:
        location: FastF1 schedule ``Location`` of the event (e.g. 'Monza', 'Kuala Lumpur').
        race_date: Race day as an ISO date (YYYY-MM-DD), local to the circuit.

    Returns:
        The race day's three-hourly forecast in circuit-local time, a result with
        ``forecast_available: False`` and a ``reason`` when the forecast does not reach race
        day, or an 'error' key on failure.
    """
    try:
        if not OPENWEATHER_API_KEY:
            return {"error": "OPENWEATHER_API_KEY not configured"}

        race_day = date.fromisoformat(race_date)

        # Race day is the circuit's date and today is UTC's. A circuit's clock is within a day
        # of UTC, so outside this range no slot can land on race day and there is nothing to ask.
        days_out = (race_day - datetime.now(UTC).date()).days
        if days_out < -1:
            return _no_forecast(location, race_day, RACE_DAY_PASSED)
        if days_out > FORECAST_HORIZON_DAYS + 1:
            return _no_forecast(location, race_day, BEYOND_FORECAST_WINDOW)

        # By circuit, never by geocoding the name — see the header of
        # frontend/scripts/fetch-circuit-geometry.mjs for the four circuits that missed.
        circuit_id = circuit_id_for_location(location)
        coordinates = _coordinates().get(circuit_id) if circuit_id else None
        if coordinates is None:
            return {"error": f"No circuit coordinates for {location}"}

        response = requests.get(
            FORECAST_URL,
            params={
                "lat": coordinates["lat"],
                "lon": coordinates["lon"],
                "appid": OPENWEATHER_API_KEY,
                "units": "metric",
            },
            timeout=10,
        )
        if response.status_code != 200:
            return {"error": "Failed to fetch weather forecast"}

        payload = response.json()
        # The circuit's UTC offset today; a clock change inside the window shifts slots an hour.
        circuit_tz = timezone(timedelta(seconds=payload["city"]["timezone"]))
        slots = [(datetime.fromtimestamp(item["dt"], circuit_tz), item) for item in payload["list"]]

        race_day_slots = [_slot(when, item) for when, item in slots if when.date() == race_day]
        if not race_day_slots:
            passed = bool(slots) and race_day < slots[0][0].date()
            return _no_forecast(
                location, race_day, RACE_DAY_PASSED if passed else BEYOND_FORECAST_WINDOW
            )

        return {
            "location": location,
            "race_date": race_day.isoformat(),
            "forecast_available": True,
            "forecasts": race_day_slots,
        }
    except Exception as exc:
        return {"error": f"Failed to get weather forecast: {exc}"}
