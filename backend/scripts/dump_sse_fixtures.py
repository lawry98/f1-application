"""Regenerate the frontend's SSE fixtures from the real FastAPI route.

The frontend's ``streamBriefing`` tests parse bytes that this script produced, so the
transport contract is verified against what the backend actually puts on the wire rather
than against a hand-written approximation of it. Run this whenever the SSE event set,
event order, or payload shape changes:

    cd backend && python scripts/dump_sse_fixtures.py

Only the LangGraph agent is doubled — the router, the SSE encoder and the payload
construction are all the production ones. ``FakeAgent`` and the step fixtures are
imported from the backend suite so the two stay in step by construction.

This is not collected by pytest (``testpaths = ["tests"]``); it is a generator, not a test.
"""

import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
FIXTURES = BACKEND.parent / "frontend" / "tests" / "fixtures"

# agent/graph.py builds a live Gemini client at module scope, so a key must be present
# before any app module is imported. Mirrors tests/conftest.py, for the same reason.
os.environ["GOOGLE_API_KEY"] = "AIza-test-key-not-real"
sys.path.insert(0, str(BACKEND))

from datetime import UTC, datetime

from fastapi import FastAPI
from fastapi.testclient import TestClient

from agent.quota import DailyQuotaExhaustedError, next_quota_reset
from api import routes as routes_module
from api.guard import AdmissionGuard
from api.routes import router
from tests.api.test_routes import FakeAgent, successful_deltas, successful_steps
from tests.factories import FakeClock

# The stream's daily-cap event carries a wait, so the quota fixture's guard runs on a fixed clock
# for bytes that do not change between runs. 10:00 UTC on 30 September is 03:00 in Los Angeles,
# 21 hours before Gemini's reset.
QUOTA_FIXTURE_NOW = datetime(2026, 9, 30, 10, 0, tzinfo=UTC).timestamp()


def dump(agent: FakeAgent, name: str) -> None:
    routes_module.agent = agent
    app = FastAPI()
    app.include_router(router)
    client = TestClient(app)

    with client.stream("POST", "/api/briefing/stream", json={"query": "Monaco"}) as response:
        body = b"".join(response.iter_raw())

    path = FIXTURES / name
    path.write_bytes(body)
    print(f"wrote {path.relative_to(BACKEND.parent)} ({len(body)} bytes)")


def main() -> None:
    FIXTURES.mkdir(parents=True, exist_ok=True)

    dump(FakeAgent(steps=successful_steps(), deltas=successful_deltas()), "clean.sse")

    # A synthesis that died after producing prose: the terminal briefing carries what was
    # written, marked truncated, and there is deliberately no error event.
    truncated_steps = successful_steps()
    truncated_steps[-1]["synthesizer"] = {
        "briefing": "## Mon\naco",
        "briefing_truncated": True,
        "current_step": "complete",
    }
    dump(FakeAgent(steps=truncated_steps, deltas=["## Mon", "\naco"]), "truncated.sse")

    # A repeat briefing for the same race: the championship standings were served from the result
    # cache (ADR-0003) and the news search ran live — news is never cached — failing as it does in
    # the clean run. Standings is the longest id that is ever cached, so a narrow-row test sees
    # the worst case for a chip crowding the raw id. Everything else is the clean run, so a test
    # can tell the two apart by `cached`.
    cached_steps = successful_steps()
    cached_steps[1]["planner"]["tasks"][0] = "get_championship_standings"
    cached_steps[2]["tool_executor"]["tool_results"][0]["tool_name"] = "get_championship_standings"
    cached_steps[2]["tool_executor"]["tool_results"][0]["cached"] = True
    dump(FakeAgent(steps=cached_steps, deltas=successful_deltas()), "cached.sse")

    # The planner met Gemini's spent daily quota: the run ends after the resolver on the
    # daily-cap error event, the same body a refusal at admission sends. Last, because it closes
    # the guard it runs against — a fresh one, at the stock limits, on the fixed clock above.
    routes_module.briefing_guard = AdmissionGuard(
        per_ip_per_hour=5,
        daily_cap=100,
        max_concurrent=2,
        lease_seconds=150,
        clock=FakeClock(QUOTA_FIXTURE_NOW),
    )
    spent = DailyQuotaExhaustedError(resets_at=next_quota_reset(QUOTA_FIXTURE_NOW))
    dump(
        FakeAgent(steps=successful_steps()[:1], raises=spent, raises_after=1),
        "quota-exhausted.sse",
    )


if __name__ == "__main__":
    main()
