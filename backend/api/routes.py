"""FastAPI router — REST and SSE streaming endpoints for briefing generation."""

import asyncio
import json
import logging
from datetime import date
from typing import Any

import fastf1
from fastapi import APIRouter, HTTPException, Path
from sse_starlette.sse import EventSourceResponse

from agent.graph import agent
from agent.state import AgentState
from api.errors import (
    GENERIC_BRIEFING_ERROR,
    GENERIC_CIRCUIT_WINNERS_ERROR,
    GENERIC_SCHEDULE_ERROR,
    GENERIC_STANDINGS_ERROR,
)
from api.models import BriefingRequest
from tools.circuit_winners import UNKNOWN_CIRCUIT, get_recent_circuit_winners
from tools.openf1_client import OPENF1_FIRST_YEAR
from tools.openf1_client import clear as clear_openf1_cache
from tools.schedule_cache import clear as clear_schedule_cache
from tools.standings_tools import SEASON_NOT_STARTED, get_championship_standings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


def initial_state(query: str) -> AgentState:
    return {
        "race_query": query,
        "race_info": None,
        "tasks": [],
        "tool_results": [],
        "briefing": None,
        "briefing_truncated": False,
        "current_step": "resolving",
    }


@router.post("/briefing/stream")
async def generate_briefing_stream(request: BriefingRequest) -> EventSourceResponse:
    """Stream briefing generation via Server-Sent Events, one event per completed node."""

    async def event_generator():
        try:
            logger.info("Starting briefing generation for: %s", request.query)

            yield {
                "event": "status",
                "data": json.dumps({"step": "resolving", "message": "Resolving race..."}),
            }

            stream = agent.astream(initial_state(request.query), stream_mode=["updates", "custom"])

            async for mode, payload in stream:
                if mode == "custom":
                    # Node-to-transport writes, discriminated by `kind`.
                    if payload.get("kind") == "briefing_delta":
                        yield {
                            "event": "briefing_delta",
                            "data": json.dumps({"content": payload["content"]}),
                        }
                    elif payload.get("kind") == "tool_result":
                        yield {
                            "event": "tool_result",
                            "data": json.dumps(
                                {
                                    "tool": payload["tool"],
                                    "success": payload["success"],
                                    "cached": payload["cached"],
                                }
                            ),
                        }
                    continue

                step_result = payload
                current_step = next(iter(step_result), "unknown")
                step_data = step_result.get(current_step, {})

                logger.debug("Node completed: %s", current_step)

                if current_step == "resolver":
                    race_info = step_data.get("race_info")
                    if race_info:
                        yield {"event": "race_info", "data": json.dumps(race_info)}
                        yield {
                            "event": "status",
                            "data": json.dumps(
                                {"step": "planning", "message": "Planning data gathering..."}
                            ),
                        }
                    else:
                        error_msg = step_data.get("briefing", "Failed to resolve race")
                        yield {"event": "error", "data": json.dumps({"message": error_msg})}
                        return

                elif current_step == "planner":
                    # Announced before "gathering" so the frontend knows the full set of
                    # tools it is waiting on, rather than discovering them one arrival at
                    # a time.
                    yield {
                        "event": "tool_plan",
                        "data": json.dumps({"tools": step_data.get("tasks", [])}),
                    }
                    yield {
                        "event": "status",
                        "data": json.dumps(
                            {"step": "gathering", "message": "Gathering race data..."}
                        ),
                    }

                elif current_step == "tool_executor":
                    # Results themselves already crossed the wire from the `custom` branch
                    # above, one per completion — this node's update carries nothing new to
                    # emit, only the status transition.
                    yield {
                        "event": "status",
                        "data": json.dumps(
                            {"step": "synthesizing", "message": "Generating briefing..."}
                        ),
                    }

                elif current_step == "synthesizer":
                    briefing = step_data.get("briefing")
                    if briefing:
                        yield {
                            "event": "briefing",
                            "data": json.dumps(
                                {
                                    "content": briefing,
                                    "truncated": bool(step_data.get("briefing_truncated")),
                                }
                            ),
                        }
                        yield {
                            "event": "complete",
                            "data": json.dumps({"message": "Briefing complete"}),
                        }

        except Exception as exc:
            logger.exception("Error during briefing stream generation: %s", exc)
            yield {"event": "error", "data": json.dumps({"message": GENERIC_BRIEFING_ERROR})}
        finally:
            # Both caches exist to dedupe fetches *within* one request's tool fan-out.
            # Clearing them here is what buys freshness *across* requests — a range query
            # cached before a race's results are published would otherwise report the
            # wrong championship leader until the process restarts.
            clear_schedule_cache()
            clear_openf1_cache()

    return EventSourceResponse(event_generator())


def _race_row(event: Any) -> dict[str, Any]:
    """One calendar row. ``event_format`` and ``official_name`` are the two fields
    ``get_track_info`` adds over this row, served here so /circuits needs no per-circuit call.
    """
    official = event.get("OfficialEventName")
    return {
        "name": event["EventName"],
        "location": event["Location"],
        "country": event["Country"],
        "date": str(event["EventDate"]),
        "round": int(event["RoundNumber"]) if "RoundNumber" in event else None,
        "event_format": str(event.get("EventFormat", "conventional")),
        # A blank or NaN official name falls back to the event name rather than printing nothing.
        "official_name": official if isinstance(official, str) and official else event["EventName"],
    }


@router.get("/races/{year}")
async def get_races(year: int = Path(ge=1950, le=date.today().year + 1)) -> dict[str, Any]:
    """Get the F1 calendar for a specific year."""
    try:
        schedule = await asyncio.to_thread(fastf1.get_event_schedule, year)

        races = [_race_row(event) for _, event in schedule.iterrows()]

        return {"year": year, "races": races}
    except Exception as exc:
        logger.exception("Error loading the %d season schedule: %s", year, exc)
        raise HTTPException(status_code=500, detail=GENERIC_SCHEDULE_ERROR) from exc


@router.get("/standings/{year}")
async def get_standings(year: int = Path(ge=OPENF1_FIRST_YEAR)) -> dict[str, Any]:
    """Get the driver and constructor championship tables for a season.

    The lower bound is ``OPENF1_FIRST_YEAR`` rather than a literal, so the route and the
    tool cannot disagree about where coverage starts.
    """
    # The upper bound is checked per request, not as `Path(le=date.today().year)`: a default
    # argument is evaluated once, at import, so a process still running after New Year would
    # answer 422 for the new season — the page's default — and the page would open on its
    # error state until someone restarted the backend.
    if year > date.today().year:
        raise HTTPException(
            status_code=422, detail="Standings are only available up to the current season."
        )

    try:
        result = await asyncio.to_thread(get_championship_standings.invoke, {"year": year})

        if result.get("reason") == SEASON_NOT_STARTED:
            # Not a failure: no scoring session has results yet — the season has not started, or
            # its first results are not yet published, which a later load does change — so the
            # table is empty, and that is an answer, not an outage. Folded into the 502 below it
            # told the page to "try again" every day from January to the first race; the page
            # states it instead of offering a retry.
            logger.info("Standings for %d: season not started", year)
            return {"year": year, "races_completed": 0, "drivers": [], "constructors": []}

        if "error" in result:
            # The tool's error text can carry upstream exception detail, which is neither
            # actionable nor safe to show. Log it, serve the fixed copy.
            logger.warning("Standings for %d unavailable: %s", year, result["error"])
            raise HTTPException(status_code=502, detail=GENERIC_STANDINGS_ERROR)

        return result
    finally:
        # A range query cached here before a race's results are published would serve a
        # stale table to every standings request until the process restarts — clearing
        # per request trades the within-request dedupe for cross-request freshness, same
        # reasoning as the briefing routes above. Repeat views are cheap anyway: the tool
        # caches the finished table per year, above this cache, with its own freshness
        # policy (see tools/standings_tools.py).
        clear_openf1_cache()


@router.get("/circuits/{circuit_id}/winners")
async def get_circuit_winners_route(
    circuit_id: str = Path(pattern=r"^[a-z]{2}-\d{4}$"),
) -> dict[str, Any]:
    """Recent winners at one circuit, for the /circuits detail page.

    Slow when cold — one FastF1 session load per hosted year, ~4.6s for three — and instant
    after, because the helper caches finished seasons for the life of the process. Only FastF1
    is touched, so unlike the routes above there is no OpenF1 cache to clear.
    """
    result = await asyncio.to_thread(get_recent_circuit_winners, circuit_id)

    if result.get("reason") == UNKNOWN_CIRCUIT:
        # Actionable — the id names no circuit this app draws — so not masked.
        raise HTTPException(status_code=404, detail="Unknown circuit.")

    if "error" in result:
        logger.warning("Winners for %s unavailable: %s", circuit_id, result["error"])
        raise HTTPException(status_code=502, detail=GENERIC_CIRCUIT_WINNERS_ERROR)

    return result


@router.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok", "service": "f1-briefing-agent"}
