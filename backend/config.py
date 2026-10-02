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

# Constants rather than env vars for the same reason LLM_MODEL is: they are sized against the
# briefing deadline below, so changing one means redoing this arithmetic in a diff.
#
# What the two knobs really do, read from langchain-google-genai 4.3.2 and google-genai
# 2.25.0-2.27.0 (backend/.venv/lib/python3.12/site-packages/):
#   - `timeout` (seconds) becomes HttpOptions.timeout in ms (langchain_google_genai/
#     chat_models.py, `_prepare_request` and `_build_request_config`), and google-genai turns it
#     into two deadlines (google/genai/_api_client.py):
#       - Client side, an httpx per-request timeout (`_request_once`), applied to connect and to
#         *each read*: for the planner's `.invoke()` it bounds the whole reply, for the
#         synthesizer's `.stream()` the wait for the first chunk and every gap between chunks.
#       - Server side, `X-Server-Timeout: ceil(timeout)` (`_build_request`, streams included),
#         which Gemini enforces on the *whole* request: with only `timeout=15`, every synthesis
#         ended in `504 DEADLINE_EXCEEDED` exactly 15.0s after it started and was served
#         truncated (measured 2026-10-01 and 02). The SDK sends its own only when the request
#         has none, so agent/graph.py sends BRIEFING_DEADLINE_SECONDS: no single request
#         outlives the run it serves, and that leaves the per-read timeout as the only short one.
#     The cancel event (see agent/budget.py) is what ends a stream that is still producing.
#   - `max_retries` is an *attempt* count, first request included: it becomes
#     HttpRetryOptions(attempts=max_retries), which tenacity stops after (`retry_args` in
#     _api_client.py). 2 means one retry. It covers opening the stream but not a stream that
#     dies partway — that is ADR-0002's truncation path. The library default is 6.
#   - The backoff between attempts is tenacity's wait_exponential_jitter with the SDK defaults
#     (initial 1s, base 2, jitter up to 1s): at most 2s before the second attempt.
#
# Worst case, every attempt of both calls timing out:
#   planner             15 + 2 + 15                        = 32s, then DEFAULT_TOOLS
#   tool fan-out        TOOL_FANOUT_TIMEOUT_SECONDS        = 25s, stragglers "timed out"
#   synthesizer         15 + 2 + 15 to the first chunk     = 32s
#                                                          = 89s <= the 90s default deadline
# The server deadline adds no term: it is the run's whole deadline, so the run ends first.
# A normal run is ~25s end to end. tests/test_config.py re-does this sum from the constants.
LLM_TIMEOUT_SECONDS: float = 15.0
LLM_MAX_ATTEMPTS: int = 2
LLM_RETRY_BACKOFF_MAX_SECONDS: float = 2.0

# gemini-3.6-flash thinks before it sends its first byte, and that wait runs into the per-read
# timeout above: the planner's first attempt once timed out at 15.04s, where its retry answered
# in ~4.5s (measured 2026-10-02). The planner only picks tool names off a list, so low thinking
# is enough. Passed per call, so it reaches the planner alone: the synthesizer writes the prose
# and keeps the model's default.
PLANNER_THINKING_LEVEL: str = "low"

# How long the tool fan-out waits for its slowest tool before reporting it as timed out. FastF1
# and Tavily set no network timeout of their own, so without this one hung tool held the whole
# briefing. A normal fan-out finishes in ~10-15s.
TOOL_FANOUT_TIMEOUT_SECONDS: float = 25.0
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

# ── Briefing cost guard ──────────────────────────────────────────────────────


def _limit_from_env(name: str, default: int, minimum: int) -> int:
    """Read a whole-number limit, warning and falling back to ``default`` below ``minimum``."""
    raw = os.getenv(name, str(default))
    try:
        value = int(raw)
        if value < minimum:
            raise ValueError
    except ValueError:
        logger.warning("Invalid %s=%r — falling back to %d", name, raw, default)
        return default
    return value


# Every limit is held in this process's memory (api/guard.py), so it is per worker: run exactly
# one. Only the daily cap gives 0 a meaning (no cap); a 0 anywhere else would refuse or kill
# every briefing, which is a typo far more often than a policy, so it warns like a bad value.
BRIEFING_PER_IP_PER_HOUR: int = _limit_from_env("BRIEFING_PER_IP_PER_HOUR", 5, minimum=1)
BRIEFING_DAILY_CAP: int = _limit_from_env("BRIEFING_DAILY_CAP", 100, minimum=0)
BRIEFING_MAX_CONCURRENT: int = _limit_from_env("BRIEFING_MAX_CONCURRENT", 2, minimum=1)
BRIEFING_DEADLINE_SECONDS: int = _limit_from_env("BRIEFING_DEADLINE_SECONDS", 90, minimum=1)

# ── Circuit geometry ─────────────────────────────────────────────────────────

# The frontend's slugged-location → circuit-id map, which tools/circuit_winners.py matches FastF1
# schedule rows against. A path into this repo, not deployment config, so it is a constant rather
# than an env var. If the backend is ever deployed without the frontend tree beside it, the winners
# route answers 502 and nothing else is affected.
CIRCUIT_INDEX_PATH: Path = (
    Path(__file__).resolve().parent.parent / "frontend" / "data" / "circuits" / "index.json"
)

# Circuit id → the centre of its outline in WGS84, which tools/weather_tools.py forecasts at. Same
# directory and writer (scripts/fetch-circuit-geometry.mjs); without it the weather tool errors.
CIRCUIT_COORDINATES_PATH: Path = CIRCUIT_INDEX_PATH.with_name("coordinates.json")

# ── API ──────────────────────────────────────────────────────────────────────


def _flag_from_env(name: str) -> bool:
    """Read an on/off switch: ``1`` is on, unset, empty or ``0`` is off.

    Anything else warns and is off, so a typo fails closed rather than switching something on.
    """
    raw = os.getenv(name, "").strip()
    if raw == "1":
        return True
    if raw not in ("", "0"):
        logger.warning("Invalid %s=%r — expected 1 or 0, falling back to 0", name, raw)
    return False


# Swagger UI, ReDoc and the OpenAPI schema they render. Off unless asked for: the schema maps every
# route for anyone who looks, and nothing the site serves needs it. `make dev` turns it on.
EXPOSE_API_DOCS: bool = _flag_from_env("EXPOSE_API_DOCS")

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
