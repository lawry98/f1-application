"""FastAPI router — REST and SSE streaming endpoints for briefing generation."""

import asyncio
import json
import logging
import threading
import time
from collections.abc import AsyncIterator, Callable
from datetime import date
from typing import Any

import fastf1
from fastapi import APIRouter, HTTPException, Path, Request
from fastapi.responses import JSONResponse
from langchain_core.runnables import RunnableConfig
from sse_starlette.sse import EventSourceResponse
from starlette.types import Receive, Scope, Send

from agent.budget import RunBudget
from agent.graph import agent
from agent.state import AgentState
from api.errors import (
    BRIEFING_DEADLINE_ERROR,
    GENERIC_BRIEFING_ERROR,
    GENERIC_CIRCUIT_WINNERS_ERROR,
    GENERIC_SCHEDULE_ERROR,
    GENERIC_STANDINGS_ERROR,
)
from api.guard import AdmissionGuard, Lease, Rejection
from api.models import BriefingRequest
from config import (
    BRIEFING_DAILY_CAP,
    BRIEFING_DEADLINE_SECONDS,
    BRIEFING_MAX_CONCURRENT,
    BRIEFING_PER_IP_PER_HOUR,
)
from tools.circuit_winners import UNKNOWN_CIRCUIT, get_recent_circuit_winners
from tools.openf1_client import OPENF1_FIRST_YEAR
from tools.openf1_client import clear as clear_openf1_cache
from tools.schedule_cache import clear as clear_schedule_cache
from tools.standings_tools import SEASON_NOT_STARTED, get_championship_standings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

# How long past the deadline a slot may stay held before the guard's backstop frees it. Only a
# teardown path that never ran is ever that late; the margin is there so the backstop cannot
# free a slot out from under a run that is merely finishing.
LEASE_MARGIN_SECONDS = 60

# How long past the deadline the route waits for the graph to notice its cancelled budget
# before it stops waiting and ends the response itself. The fan-out notices within a poll and
# the synthesizer at its next chunk; only a Gemini stream stalled mid-reply takes longer, and
# that is bounded by SYNTHESIZER_TIMEOUT_SECONDS on the worker thread, not on the response.
DEADLINE_GRACE_SECONDS = 5


def new_briefing_guard() -> AdmissionGuard:
    return AdmissionGuard(
        per_ip_per_hour=BRIEFING_PER_IP_PER_HOUR,
        daily_cap=BRIEFING_DAILY_CAP,
        max_concurrent=BRIEFING_MAX_CONCURRENT,
        lease_seconds=BRIEFING_DEADLINE_SECONDS + LEASE_MARGIN_SECONDS,
    )


# One per process — the limits are per worker, so run exactly one. See api/guard.py.
briefing_guard = new_briefing_guard()


def _admit(http_request: Request) -> Lease | JSONResponse:
    """Take a briefing slot for this caller, or build the plain HTTP rejection.

    ``client.host`` is the TCP peer. Behind a proxy it is the visitor only when uvicorn runs
    with ``--proxy-headers`` and ``FORWARDED_ALLOW_IPS`` naming that proxy; X-Forwarded-For is
    never read here, because anyone can send one.
    """
    ip = _client_ip(http_request)
    outcome = briefing_guard.admit(ip)
    if isinstance(outcome, Lease):
        return outcome

    logger.info(
        "Briefing rejected: ip=%s code=%s retry_after=%ds",
        ip,
        outcome.code,
        outcome.retry_after_seconds,
    )
    return _rejection_response(outcome)


def _client_ip(http_request: Request) -> str:
    return http_request.client.host if http_request.client else "unknown"


class _BriefingRun:
    """One admitted briefing: its slot, its budget, and the one log line it ends with.

    The budget goes to the graph through its config (see agent/budget.py). Its cancel event is
    set by a timer at the deadline and by :meth:`finish` — so a hang-up, a crash and a normal end
    all tell anything still running on a worker thread to stop at its next check.
    """

    def __init__(self, lease: Lease, ip: str) -> None:
        loop = asyncio.get_running_loop()
        self._lease = lease
        self._ip = ip
        self._started = time.monotonic()
        self.budget = RunBudget(
            cancel=threading.Event(), deadline=self._started + BRIEFING_DEADLINE_SECONDS
        )
        self._deadline_timer = loop.call_later(BRIEFING_DEADLINE_SECONDS, self.budget.cancel.set)
        self.backstop_at = loop.time() + BRIEFING_DEADLINE_SECONDS + DEADLINE_GRACE_SECONDS
        self._finished = False

    @property
    def config(self) -> RunnableConfig:
        return {"configurable": {"budget": self.budget}}

    @property
    def past_deadline(self) -> bool:
        return self.budget.remaining() == 0

    def finish(self, outcome: str) -> None:
        """Release everything the run holds. Idempotent: the first outcome reported wins."""
        if self._finished:
            return
        self._finished = True
        self.budget.cancel.set()
        self._deadline_timer.cancel()
        self._lease.release()
        # Both caches exist to dedupe fetches *within* one request's tool fan-out. Clearing
        # them here is what buys freshness *across* requests — a range query cached before a
        # race's results are published would otherwise report the wrong championship leader
        # until the process restarts.
        clear_schedule_cache()
        clear_openf1_cache()
        logger.info(
            "Briefing finished: ip=%s outcome=%s duration=%.1fs",
            self._ip,
            outcome,
            time.monotonic() - self._started,
        )


class _BackstopReachedError(Exception):
    """The graph had not returned by the deadline plus its grace."""


async def _until_backstop(stream: AsyncIterator[Any], backstop_at: float) -> AsyncIterator[Any]:
    """Re-yield ``stream``, raising :class:`_BackstopReachedError` if a wait outlives ``backstop_at``.

    Each wait is bounded on its own, rather than one timeout wrapped round a loop that yields:
    a timeout that fires while the consumer is suspended at a ``yield`` would cancel whatever
    the consumer is doing — sending to the client — not the wait on the graph.
    """
    while True:
        timeout = asyncio.timeout_at(backstop_at)
        try:
            async with timeout:
                item = await anext(stream)
        except StopAsyncIteration:
            return
        except TimeoutError:
            # Only our own timer means the backstop: the graph raising a TimeoutError of its
            # own is a failure like any other.
            if timeout.expired():
                raise _BackstopReachedError from None
            raise
        yield item


def _rejection_response(rejection: Rejection) -> JSONResponse:
    return JSONResponse(
        status_code=rejection.status,
        content={
            "code": rejection.code,
            "retry_after_seconds": rejection.retry_after_seconds,
            "limit": rejection.limit,
        },
        headers={"Retry-After": str(rejection.retry_after_seconds)},
    )


class _ReleasingEventSourceResponse(EventSourceResponse):
    """An event stream that runs ``on_close`` however the response ends.

    The generator's own ``finally`` is not enough by itself. When the client hangs up,
    sse-starlette cancels its streaming task, and a generator that was parked at a ``yield`` at
    that moment — or had not started, because the client left before the first event — is not
    closed by that. Its ``finally`` would run whenever the garbage collector got round to it, or,
    for one that never started, never. This does both teardowns deterministically.
    """

    def __init__(self, content: AsyncIterator[dict[str, str]], *, on_close: Callable[[], None]):
        super().__init__(content)
        self._on_close = on_close

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        try:
            await super().__call__(scope, receive, send)
        finally:
            try:
                await self.body_iterator.aclose()
            finally:
                self._on_close()


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


@router.post("/briefing/stream", response_model=None)
async def generate_briefing_stream(
    request: BriefingRequest, http_request: Request
) -> EventSourceResponse | JSONResponse:
    """Stream briefing generation via Server-Sent Events, one event per completed node.

    Admission runs first, while a refusal can still be an ordinary 429/503: once the event
    stream opens, its status is 200 whatever happens.
    """
    admission = _admit(http_request)
    if isinstance(admission, JSONResponse):
        return admission
    run = _BriefingRun(admission, _client_ip(http_request))

    async def event_generator():
        # Left None by every path that ends without a terminal event of ours — a hang-up
        # cancelling the wait on the graph, or closing the generator at a `yield`.
        outcome: str | None = None
        # Every Delta already on the wire, so the backstop can serve them as the truncated
        # briefing they are rather than an error below prose the reader is already reading.
        prose: list[str] = []
        try:
            logger.info("Starting briefing generation for: %s", request.query)

            yield {
                "event": "status",
                "data": json.dumps({"step": "resolving", "message": "Resolving race..."}),
            }

            stream = agent.astream(
                initial_state(request.query),
                config=run.config,
                stream_mode=["updates", "custom"],
            )

            async for mode, payload in _until_backstop(stream, run.backstop_at):
                if mode == "custom":
                    # Node-to-transport writes, discriminated by `kind`.
                    if payload.get("kind") == "briefing_delta":
                        prose.append(payload["content"])
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
                        outcome = "unresolved"
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
                        truncated = bool(step_data.get("briefing_truncated"))
                        outcome = "truncated" if truncated else "complete"
                        yield {
                            "event": "briefing",
                            "data": json.dumps({"content": briefing, "truncated": truncated}),
                        }
                        yield {
                            "event": "complete",
                            "data": json.dumps({"message": "Briefing complete"}),
                        }
                        # The run is over for the reader. Whatever the graph does after its
                        # last node — fail included — must not send a second terminal event.
                        return

            # The graph ran out without a terminal event of ours: a synthesis that produced no
            # prose, or a graph that never reached the synthesizer. Ending quietly would show
            # the reader a dropped connection when the server is what failed.
            outcome, event = _failure_event(run)
            logger.error("Briefing graph ended without a briefing (outcome=%s)", outcome)
            yield event

        except _BackstopReachedError:
            logger.warning(
                "Briefing graph still running %ds past the deadline; ending the response",
                DEADLINE_GRACE_SECONDS,
            )
            if prose:
                outcome = "truncated"
                yield {
                    "event": "briefing",
                    "data": json.dumps({"content": "".join(prose), "truncated": True}),
                }
                yield {"event": "complete", "data": json.dumps({"message": "Briefing complete"})}
            else:
                outcome = "deadline"
                yield _deadline_event()
        except asyncio.CancelledError:
            task = asyncio.current_task()
            if task is not None and task.cancelling():
                # Our own task is being cancelled — how sse-starlette ends a response whose
                # client hung up. Nobody is left to read an event.
                raise
            # Raised by the graph of its own accord (a future cancelled inside it) while the
            # reader is still connected: a failure like any other.
            outcome, event = _failure_event(run)
            logger.exception("Briefing graph raised CancelledError (outcome=%s)", outcome)
            yield event
        except Exception as exc:
            # The synthesizer raises when it is stopped with no prose; past the deadline that
            # is the deadline, not "something went wrong".
            outcome, event = _failure_event(run)
            if outcome == "deadline":
                logger.warning("Briefing stream stopped at the deadline: %s", exc)
            else:
                logger.exception("Error during briefing stream generation: %s", exc)
            yield event
        finally:
            run.finish(outcome or "disconnected")

    return _ReleasingEventSourceResponse(
        event_generator(), on_close=lambda: run.finish("disconnected")
    )


def _deadline_event() -> dict[str, str]:
    return {
        "event": "error",
        "data": json.dumps({"message": BRIEFING_DEADLINE_ERROR, "code": "deadline"}),
    }


def _failure_event(run: _BriefingRun) -> tuple[str, dict[str, str]]:
    """The outcome and terminal event for a run ending with no briefing: the deadline's once it
    has passed, the generic error before."""
    if run.past_deadline:
        return "deadline", _deadline_event()
    return "error", {"event": "error", "data": json.dumps({"message": GENERIC_BRIEFING_ERROR})}


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
