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

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api import routes as routes_module
from api.routes import router
from tests.api.test_routes import FakeAgent, successful_deltas, successful_steps


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


if __name__ == "__main__":
    main()
