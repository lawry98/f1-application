"""Centralized application configuration loaded from environment variables."""

import logging
import os

logger = logging.getLogger(__name__)

# ── LLM ─────────────────────────────────────────────────────────────────────

GOOGLE_API_KEY: str = os.getenv("GOOGLE_API_KEY", "")
LLM_MODEL: str = "gemini-3.6-flash"

# There is deliberately no LLM_TEMPERATURE here. gemini-3.6-flash uses fixed sampling
# defaults and *ignores* a temperature argument entirely — passing one changes nothing and
# makes the client log a UserWarning on every construction. Gemini 3 is optimised for its
# default sampling in any case, and Google warns that lowering temperature risks looping or
# degraded reasoning, so there is nothing to tune here even where the knob is honoured.
# Do not reintroduce one for the synthesizer's prose.

# ── Optional integrations ────────────────────────────────────────────────────

TAVILY_API_KEY: str = os.getenv("TAVILY_API_KEY", "")
OPENWEATHER_API_KEY: str = os.getenv("OPENWEATHER_API_KEY", "")

# ── FastF1 ───────────────────────────────────────────────────────────────────

FASTF1_CACHE_DIR: str = os.getenv("FASTF1_CACHE_DIR", "cache/")

# ── Threading ────────────────────────────────────────────────────────────────

EXECUTOR_MAX_WORKERS: int = int(os.getenv("EXECUTOR_MAX_WORKERS", "4"))

# ── Country codes for weather lookup ─────────────────────────────────────────

COUNTRY_CODE_MAP: dict[str, str] = {
    "Monaco": "MC",
    "United Kingdom": "GB",
    "Italy": "IT",
    "Belgium": "BE",
    "Japan": "JP",
    "Singapore": "SG",
    "United States": "US",
    "Bahrain": "BH",
    "Saudi Arabia": "SA",
    "Australia": "AU",
    "Spain": "ES",
    "Canada": "CA",
    "Austria": "AT",
    "Hungary": "HU",
    "Netherlands": "NL",
    "Mexico": "MX",
    "Brazil": "BR",
    "UAE": "AE",
    "Qatar": "QA",
    "China": "CN",
    "Azerbaijan": "AZ",
}


def validate_config() -> None:
    """Validate required environment variables; exit on fatal misconfiguration."""
    if not GOOGLE_API_KEY or GOOGLE_API_KEY.startswith("your-google"):
        logger.critical(
            "GOOGLE_API_KEY not configured. "
            "Edit backend/.env and add your actual Google AI Studio API key. "
            "Get your key from: https://aistudio.google.com/apikey"
        )
        raise SystemExit(1)

    if not TAVILY_API_KEY or TAVILY_API_KEY.startswith("tvly-your"):
        logger.warning(
            "TAVILY_API_KEY not configured — news search will be disabled. "
            "Get your key from: https://tavily.com"
        )

    if not OPENWEATHER_API_KEY or OPENWEATHER_API_KEY == "your-openweather-api-key-here":
        logger.warning(
            "OPENWEATHER_API_KEY not configured — weather features will be disabled. "
            "Get your key from: https://openweathermap.org/api"
        )
