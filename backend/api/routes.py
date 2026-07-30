"""FastAPI router — REST and SSE streaming endpoints for briefing generation."""

import asyncio
import json
import logging
from typing import Any

import fastf1
from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from agent.graph import agent
from agent.state import AgentState
from api.models import BriefingRequest, BriefingResponse, ToolTraceSummary
from tools.schedule_cache import clear as clear_schedule_cache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


@router.post("/briefing", response_model=BriefingResponse)
async def generate_briefing(request: BriefingRequest) -> BriefingResponse:
    """Generate a complete race briefing synchronously.

    Args:
        request: BriefingRequest with the user's race query.

    Returns:
        BriefingResponse containing the briefing text and tool trace.
    """
    try:
        initial_state: AgentState = {
            "messages": [],
            "race_query": request.query,
            "race_info": None,
            "tasks": [],
            "tool_results": [],
            "briefing": None,
            "current_step": "resolving",
        }

        result: dict[str, Any] = agent.invoke(initial_state)

        if result.get("current_step") == "error" or not result.get("briefing"):
            error_msg = result.get("briefing", "Failed to generate briefing")
            raise HTTPException(status_code=500, detail=error_msg)

        race_name: str = result.get("race_info", {}).get("name", "Unknown Race")

        tool_trace = [
            ToolTraceSummary(
                tool=tr["tool_name"],
                success=tr["success"],
                summary=(
                    str(tr["data"])[:200] + "..." if len(str(tr["data"])) > 200 else str(tr["data"])
                ),
            )
            for tr in result.get("tool_results", [])
        ]

        return BriefingResponse(
            race=race_name,
            briefing=result["briefing"],
            tool_trace=tool_trace,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        clear_schedule_cache()


@router.post("/briefing/stream")
async def generate_briefing_stream(request: BriefingRequest) -> EventSourceResponse:
    """Stream briefing generation via Server-Sent Events.

    Args:
        request: BriefingRequest with the user's race query.

    Returns:
        EventSourceResponse that yields typed SSE events as the agent executes.
    """

    async def event_generator():
        try:
            logger.info("Starting briefing generation for: %s", request.query)

            initial_state: AgentState = {
                "messages": [],
                "race_query": request.query,
                "race_info": None,
                "tasks": [],
                "tool_results": [],
                "briefing": None,
                "current_step": "resolving",
            }

            yield {
                "event": "status",
                "data": json.dumps({"step": "resolving", "message": "Resolving race..."}),
            }

            await asyncio.sleep(0.1)

            async for step_result in agent.astream(initial_state):
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
                    yield {
                        "event": "status",
                        "data": json.dumps(
                            {"step": "gathering", "message": "Gathering race data..."}
                        ),
                    }

                elif current_step == "tool_executor":
                    for tr in step_data.get("tool_results", []):
                        yield {
                            "event": "tool_result",
                            "data": json.dumps({"tool": tr["tool_name"], "success": tr["success"]}),
                        }
                    yield {
                        "event": "status",
                        "data": json.dumps(
                            {"step": "synthesizing", "message": "Generating briefing..."}
                        ),
                    }

                elif current_step == "synthesizer":
                    briefing = step_data.get("briefing")
                    if briefing:
                        yield {"event": "briefing", "data": json.dumps({"content": briefing})}
                        yield {
                            "event": "complete",
                            "data": json.dumps({"message": "Briefing complete"}),
                        }

        except Exception as exc:
            logger.exception("Error during briefing stream generation: %s", exc)
            yield {"event": "error", "data": json.dumps({"message": str(exc)})}
        finally:
            clear_schedule_cache()

    return EventSourceResponse(event_generator())


@router.get("/races/{year}")
async def get_races(year: int) -> dict[str, Any]:
    """Get the F1 calendar for a specific year.

    Args:
        year: Championship year (e.g., 2025).

    Returns:
        Dict with 'year' and 'races' list.
    """
    try:
        schedule = fastf1.get_event_schedule(year)

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
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok", "service": "f1-briefing-agent"}
