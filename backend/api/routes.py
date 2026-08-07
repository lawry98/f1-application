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
    FAILED_TOOL_SUMMARY,
    GENERIC_BRIEFING_ERROR,
    GENERIC_SCHEDULE_ERROR,
    GENERIC_STANDINGS_ERROR,
)
from api.models import BriefingRequest, BriefingResponse, ToolTraceSummary
from tools.openf1_client import OPENF1_FIRST_YEAR
from tools.openf1_client import clear as clear_openf1_cache
from tools.schedule_cache import clear as clear_schedule_cache
from tools.standings_tools import get_championship_standings

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


def _tool_trace_summary(tool_result: dict[str, Any]) -> str:
    """Build the UI-facing trace summary for one tool result.

    A failed tool's payload is ``{"error": ...}`` and may carry upstream exception text,
    so it is replaced rather than truncated. Successful payloads are public F1 data and
    are only clipped to keep the trace readable.
    """
    if not tool_result["success"]:
        return FAILED_TOOL_SUMMARY

    data = str(tool_result["data"])
    return data[:200] + "..." if len(data) > 200 else data


@router.post("/briefing", response_model=BriefingResponse)
async def generate_briefing(request: BriefingRequest) -> BriefingResponse:
    """Generate a complete race briefing in a single response."""
    try:
        result: dict[str, Any] = await agent.ainvoke(initial_state(request.query))

        if result.get("current_step") == "error":
            raise HTTPException(
                status_code=404,
                detail=result.get("briefing") or "Could not resolve race",
            )
        if not result.get("briefing"):
            raise HTTPException(status_code=500, detail=GENERIC_BRIEFING_ERROR)

        race_name: str = result.get("race_info", {}).get("name", "Unknown Race")

        tool_trace = [
            ToolTraceSummary(
                tool=tr["tool_name"],
                success=tr["success"],
                summary=_tool_trace_summary(tr),
            )
            for tr in result.get("tool_results", [])
        ]

        return BriefingResponse(
            race=race_name,
            briefing=result["briefing"],
            tool_trace=tool_trace,
            truncated=bool(result.get("briefing_truncated")),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error generating briefing for '%s': %s", request.query, exc)
        raise HTTPException(status_code=500, detail=GENERIC_BRIEFING_ERROR) from exc
    finally:
        # Both caches exist to dedupe fetches *within* one request's tool fan-out.
        # Clearing them here is what buys freshness *across* requests — a range query
        # cached before a race's results are published would otherwise report the
        # wrong championship leader until the process restarts.
        clear_schedule_cache()
        clear_openf1_cache()


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
                                {"tool": payload["tool"], "success": payload["success"]}
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
            # Same trade-off as the non-streaming route above: dedupe within the request,
            # clear afterwards so the next request cannot serve a stale cached result.
            clear_schedule_cache()
            clear_openf1_cache()

    return EventSourceResponse(event_generator())


@router.get("/races/{year}")
async def get_races(year: int = Path(ge=1950, le=date.today().year + 1)) -> dict[str, Any]:
    """Get the F1 calendar for a specific year."""
    try:
        schedule = await asyncio.to_thread(fastf1.get_event_schedule, year)

        races = [
            {
                "name": event["EventName"],
                "location": event["Location"],
                "country": event["Country"],
                "date": str(event["EventDate"]),
                "round": int(event["RoundNumber"]) if "RoundNumber" in event else None,
            }
            for _, event in schedule.iterrows()
        ]

        return {"year": year, "races": races}
    except Exception as exc:
        logger.exception("Error loading the %d season schedule: %s", year, exc)
        raise HTTPException(status_code=500, detail=GENERIC_SCHEDULE_ERROR) from exc


@router.get("/standings/{year}")
async def get_standings(
    year: int = Path(ge=OPENF1_FIRST_YEAR, le=date.today().year),
) -> dict[str, Any]:
    """Get the driver and constructor championship tables for a season.

    The lower bound is ``OPENF1_FIRST_YEAR`` rather than a literal, so the route and the
    tool cannot disagree about where coverage starts.
    """
    try:
        result = await asyncio.to_thread(get_championship_standings.invoke, {"year": year})

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
        # reasoning as the briefing routes above.
        clear_openf1_cache()


@router.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok", "service": "f1-briefing-agent"}
