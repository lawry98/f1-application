import os
import requests
from langchain_core.tools import tool
from typing import Dict, Any
from datetime import datetime

@tool
def get_race_weather(city: str, country_code: str) -> Dict[str, Any]:
    """Get weather forecast for race location using OpenWeather API.
    
    Args:
        city: City name where the race takes place
        country_code: Two-letter country code (e.g., 'MC', 'GB', 'IT')
    
    Returns:
        Dictionary with weather forecast or error message
    """
    try:
        api_key = os.getenv('OPENWEATHER_API_KEY')
        if not api_key:
            return {"error": "OPENWEATHER_API_KEY not configured"}
        
        geocoding_url = f"http://api.openweathermap.org/geo/1.0/direct"
        geo_params = {
            "q": f"{city},{country_code}",
            "limit": 1,
            "appid": api_key
        }
        
        geo_response = requests.get(geocoding_url, params=geo_params, timeout=10)
        if geo_response.status_code != 200 or not geo_response.json():
            return {"error": f"Could not find location for {city}, {country_code}"}
        
        location = geo_response.json()[0]
        lat = location['lat']
        lon = location['lon']
        
        forecast_url = "http://api.openweathermap.org/data/2.5/forecast"
        forecast_params = {
            "lat": lat,
            "lon": lon,
            "appid": api_key,
            "units": "metric"
        }
        
        forecast_response = requests.get(forecast_url, params=forecast_params, timeout=10)
        if forecast_response.status_code != 200:
            return {"error": "Failed to fetch weather forecast"}
        
        forecast_data = forecast_response.json()
        
        forecasts = []
        for item in forecast_data.get('list', [])[:8]:
            forecasts.append({
                "datetime": item['dt_txt'],
                "temperature_c": round(item['main']['temp'], 1),
                "feels_like_c": round(item['main']['feels_like'], 1),
                "humidity": item['main']['humidity'],
                "weather": item['weather'][0]['main'],
                "description": item['weather'][0]['description'],
                "wind_speed_ms": round(item['wind']['speed'], 1),
                "rain_probability": item.get('pop', 0) * 100
            })
        
        return {
            "location": f"{city}, {country_code}",
            "forecasts": forecasts,
            "summary": {
                "avg_temp": round(sum(f['temperature_c'] for f in forecasts) / len(forecasts), 1) if forecasts else None,
                "max_rain_probability": max(f['rain_probability'] for f in forecasts) if forecasts else 0,
                "conditions": [f['weather'] for f in forecasts[:3]]
            }
        }
    except Exception as e:
        return {"error": f"Failed to get weather forecast: {str(e)}"}
