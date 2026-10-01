"""OpenWeather forecast for a race weekend's sessions, at the circuit's own coordinates.

Two things this used to get wrong, and why it looks the way it does:

- **Where.** It geocoded ``"{Location},{country code}"`` from a hand-kept country map, so the
  2026 Bahrain Grand Prix at Sepang asked for "Kuala Lumpur,BH" and any country missing from
  the map silently became "US". The circuit's centre from ``frontend/data/circuits/
  coordinates.json`` is passed in instead, and no coordinates is an error rather than a guess.
- **When.** It took the first eight 3-hour slots — the next 24 hours — and the briefing
  presented them as the race weekend. Only slots from the first session minus three hours to
  the race plus three hours are read now, and each session gets the slot nearest its start.
  A weekend beyond the forecast's end is ``outside_forecast_range`` with the date it will be
  in range, and one already over is ``weekend_over`` — never a forecast for other days, and
  no request when the answer is plain from the session times alone.

Weather is never cached (agent/graph.py): a stale forecast is worse than a refetch.
"""

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import requests
from langchain_core.tools import tool

from config import OPENWEATHER_API_KEY, is_configured
from tools.cutoff import parse_utc, to_iso

logger = logging.getLogger(__name__)

FORECAST_URL = "https://api.openweathermap.org/data/2.5/forecast"

# The free 5-day / 3-hour forecast: 40 slots, three hours apart.
FORECAST_HORIZON = timedelta(days=5)

# How far either side of the weekend the window reaches. A session's weather is the slot nearest
# its start, and slots are three hours apart, so this is the furthest a relevant slot can be.
WINDOW_MARGIN = timedelta(hours=3)

# The nearest slot to a covered session is at most half a slot away; anything further means the
# forecast does not reach that session (it has already started, or is beyond the last slot).
NEAREST_SLOT = timedelta(hours=1, minutes=30)


def _slot_forecast(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "temperature_c": round(item["main"]["temp"], 1),
        "rain_probability": round(item.get("pop", 0) * 100, 1),
        "wind_speed_ms": round(item["wind"]["speed"], 1),
        "conditions": item["weather"][0]["main"],
        "description": item["weather"][0]["description"],
    }


def _nearest(slots: list[tuple[datetime, dict[str, Any]]], start: datetime):
    """The slot nearest ``start`` — the earlier on a tie — or None when none is close enough."""
    if not slots:
        return None
    moment, item = min(slots, key=lambda slot: (abs(slot[0] - start), slot[0]))
    return item if abs(moment - start) <= NEAREST_SLOT else None


@tool
def get_race_weather(
    lat: float | None, lon: float | None, sessions: list[dict[str, str]]
) -> dict[str, Any]:
    """Get the forecast for each session of a race weekend, at the circuit's coordinates.

    Args:
        lat: The circuit's latitude (WGS84), or None when it has no circuit data.
        lon: The circuit's longitude.
        sessions: The weekend's sessions, ``{"name", "start"}`` with ISO-8601 UTC starts.

    Returns:
        ``status`` "ok" or "partial" (some session is beyond the forecast), the ``window``
        read, ``forecast_generated_at``, and ``sessions`` each with a ``forecast`` of
        temperature, rain probability, wind and conditions, or None. A weekend beyond the
        forecast's reach is ``status: "outside_forecast_range"`` with ``available_from``.
        An 'error' key on failure.
    """
    try:
        if not is_configured(OPENWEATHER_API_KEY):
            return {"error": "OPENWEATHER_API_KEY not configured"}
        if lat is None or lon is None:
            return {"error": "No circuit coordinates for this race"}
        if not sessions:
            return {"error": "No session times for this race weekend"}

        starts = [(session["name"], parse_utc(session["start"])) for session in sessions]
        first = min(start for _, start in starts)
        race = next((start for name, start in starts if name == "Race"), max(s for _, s in starts))
        window_from, window_to = first - WINDOW_MARGIN, race + WINDOW_MARGIN
        now = datetime.now(UTC)
        generated_at = to_iso(now)
        available_from = (window_from - FORECAST_HORIZON).date().isoformat()

        # Two answers need no request: a weekend that is over, and one too far out for any
        # forecast to reach. A day of slack on the horizon leaves the borderline case to the
        # forecast's own last slot, below.
        if window_to < now:
            return {"status": "weekend_over", "weekend_ended": to_iso(window_to)}
        if window_from > now + FORECAST_HORIZON + timedelta(days=1):
            return {
                "status": "outside_forecast_range",
                "weekend_starts": to_iso(first),
                "available_from": available_from,
            }

        response = requests.get(
            FORECAST_URL,
            params={"lat": lat, "lon": lon, "appid": OPENWEATHER_API_KEY, "units": "metric"},
            timeout=10,
        )
        if response.status_code != 200:
            return {"error": f"Forecast request failed with status {response.status_code}"}

        slots = [
            (datetime.fromtimestamp(item["dt"], UTC), item)
            for item in response.json().get("list", [])
        ]
        if not slots:
            return {"error": "Forecast returned no entries"}

        if window_from > max(moment for moment, _ in slots):
            return {
                "status": "outside_forecast_range",
                "weekend_starts": to_iso(first),
                "available_from": available_from,
                "forecast_generated_at": generated_at,
            }

        in_window = [slot for slot in slots if window_from <= slot[0] <= window_to]
        per_session = []
        for name, start in starts:
            item = _nearest(in_window, start)
            per_session.append(
                {
                    "name": name,
                    "start": to_iso(start),
                    "forecast": _slot_forecast(item) if item is not None else None,
                }
            )

        return {
            "status": "ok" if all(s["forecast"] for s in per_session) else "partial",
            "window": {"from": to_iso(window_from), "to": to_iso(window_to)},
            "forecast_generated_at": generated_at,
            "sessions": per_session,
        }
    except Exception as exc:
        # A requests exception quotes the URL it failed on, query string and all — which carries
        # the key. Its text reaches the log and the synthesizer's prompt, so the key is cut out.
        detail = str(exc).replace(OPENWEATHER_API_KEY, "[redacted]") if OPENWEATHER_API_KEY else exc
        logger.warning("Weather forecast failed (%s: %s)", type(exc).__name__, detail)
        return {"error": f"Failed to get weather forecast: {detail}"}
