"""Centralized application configuration loaded from environment variables."""

import logging
import os
import re
from pathlib import Path

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

# ── Key hygiene ──────────────────────────────────────────────────────────────

# env.example ships `your-…-here` for every key and `tvly-your-…` for Tavily's. No real key from
# any of the three providers has that shape, so the pattern is the whole of "placeholder".
_PLACEHOLDER_KEY = re.compile(r"(tvly-)?your-[a-z0-9-]*")


def is_configured(value: str) -> bool:
    """Whether an API key holds a real value: not empty, and not an env.example placeholder.

    The one test for every key, in validate_config and in the tools alike. A placeholder that
    passed a tool's own non-empty check went upstream and earned a 401 while the startup log
    said the feature was disabled — the log and the behaviour disagreed because they used two
    different tests.
    """
    candidate = value.strip().lower()
    return bool(candidate) and not _PLACEHOLDER_KEY.fullmatch(candidate)


# ── Optional integrations ────────────────────────────────────────────────────

TAVILY_API_KEY: str = os.getenv("TAVILY_API_KEY", "")
OPENWEATHER_API_KEY: str = os.getenv("OPENWEATHER_API_KEY", "")

# ── FastF1 ───────────────────────────────────────────────────────────────────

FASTF1_CACHE_DIR: str = os.getenv("FASTF1_CACHE_DIR", "cache/")

# ── Threading ────────────────────────────────────────────────────────────────

_raw_max_workers = os.getenv("EXECUTOR_MAX_WORKERS", "4")
try:
    EXECUTOR_MAX_WORKERS: int = int(_raw_max_workers)
except ValueError:
    logger.warning("Invalid EXECUTOR_MAX_WORKERS=%r — falling back to 4", _raw_max_workers)
    EXECUTOR_MAX_WORKERS = 4

# ── Standings cache ──────────────────────────────────────────────────────────

# How long the *running* season's standings are reused across requests. A completed season
# is cached for the life of the process whatever this says; 0 turns current-season caching
# off. See the cache note in tools/standings_tools.py.
_raw_standings_ttl = os.getenv("STANDINGS_TTL_SECONDS", "300")
try:
    STANDINGS_TTL_SECONDS: int = int(_raw_standings_ttl)
    if STANDINGS_TTL_SECONDS < 0:
        raise ValueError
except ValueError:
    logger.warning("Invalid STANDINGS_TTL_SECONDS=%r — falling back to 300", _raw_standings_ttl)
    STANDINGS_TTL_SECONDS = 300

# ── Circuit geometry ─────────────────────────────────────────────────────────

# The frontend's slugged-location → circuit-id map, which tools/circuit_winners.py matches FastF1
# schedule rows against. A path into this repo, not deployment config, so it is a constant rather
# than an env var. If the backend is ever deployed without the frontend tree beside it, the winners
# route answers 502 and nothing else is affected.
CIRCUIT_INDEX_PATH: Path = (
    Path(__file__).resolve().parent.parent / "frontend" / "data" / "circuits" / "index.json"
)

# ── API ──────────────────────────────────────────────────────────────────────

CORS_ORIGINS: list[str] = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:3001").split(
        ","
    )
    if origin.strip()
]


def validate_config() -> None:
    """Validate required environment variables; exit on fatal misconfiguration."""
    if not is_configured(GOOGLE_API_KEY):
        logger.critical(
            "GOOGLE_API_KEY not configured. "
            "Edit backend/.env and add your actual Google AI Studio API key. "
            "Get your key from: https://aistudio.google.com/apikey"
        )
        raise SystemExit(1)

    if not is_configured(TAVILY_API_KEY):
        logger.warning(
            "TAVILY_API_KEY not configured — news search will be disabled. "
            "Get your key from: https://tavily.com"
        )

    if not is_configured(OPENWEATHER_API_KEY):
        logger.warning(
            "OPENWEATHER_API_KEY not configured — weather features will be disabled. "
            "Get your key from: https://openweathermap.org/api"
        )
