"""Centralized application configuration loaded from environment variables."""

import logging
import os

logger = logging.getLogger(__name__)

# ── LLM ─────────────────────────────────────────────────────────────────────

ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
LLM_MODEL: str = "claude-sonnet-4-20250514"
LLM_TEMPERATURE: float = 0.7

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
    if not ANTHROPIC_API_KEY or ANTHROPIC_API_KEY.startswith("sk-ant-your"):
        logger.critical(
            "ANTHROPIC_API_KEY not configured. "
            "Edit backend/.env and add your actual Anthropic API key. "
            "Get your key from: https://console.anthropic.com"
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
