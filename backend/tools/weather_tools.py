"""OpenWeather API tool for race location weather forecasts."""

from typing import Any

import requests
from langchain_core.tools import tool

from config import OPENWEATHER_API_KEY


@tool
def get_race_weather(city: str, country_code: str) -> dict[str, Any]:
    """Get the weather forecast for a race location using the OpenWeather API.

    Args:
        city: City name where the race takes place.
        country_code: Two-letter ISO country code (e.g., 'MC', 'GB', 'IT').

    Returns:
        Dictionary with weather forecast data or an 'error' key on failure.
    """
    try:
        if not OPENWEATHER_API_KEY:
            return {"error": "OPENWEATHER_API_KEY not configured"}

        geo_response = requests.get(
            "https://api.openweathermap.org/geo/1.0/direct",
            params={"q": f"{city},{country_code}", "limit": 1, "appid": OPENWEATHER_API_KEY},
            timeout=10,
        )
        if geo_response.status_code != 200:
            return {"error": f"Geocoding request failed with status {geo_response.status_code}"}

        geo_results = geo_response.json()
        if not geo_results:
            return {"error": f"Could not find location for {city}, {country_code}"}

        location = geo_results[0]
        lat = location["lat"]
        lon = location["lon"]

        forecast_response = requests.get(
            "https://api.openweathermap.org/data/2.5/forecast",
            params={"lat": lat, "lon": lon, "appid": OPENWEATHER_API_KEY, "units": "metric"},
            timeout=10,
        )
        if forecast_response.status_code != 200:
            return {"error": "Failed to fetch weather forecast"}

        forecast_data = forecast_response.json()

        forecasts = [
            {
                "datetime": item["dt_txt"],
                "temperature_c": round(item["main"]["temp"], 1),
                "feels_like_c": round(item["main"]["feels_like"], 1),
                "humidity": item["main"]["humidity"],
                "weather": item["weather"][0]["main"],
                "description": item["weather"][0]["description"],
                "wind_speed_ms": round(item["wind"]["speed"], 1),
                "rain_probability": item.get("pop", 0) * 100,
            }
            for item in forecast_data.get("list", [])[:8]
        ]

        return {
            "location": f"{city}, {country_code}",
            "forecasts": forecasts,
            "summary": {
                "avg_temp": (
                    round(sum(f["temperature_c"] for f in forecasts) / len(forecasts), 1)
                    if forecasts
                    else None
                ),
                "max_rain_probability": (
                    max(f["rain_probability"] for f in forecasts) if forecasts else 0
                ),
                "conditions": [f["weather"] for f in forecasts[:3]],
            },
        }
    except Exception as exc:
        return {"error": f"Failed to get weather forecast: {exc}"}
