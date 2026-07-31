# SSE fixtures

`clean.sse` and `truncated.sse` are **real bytes from the real FastAPI route**, not
hand-written approximations. Only the LangGraph agent was doubled when they were captured;
the router, the SSE encoder and the payload construction are production code.

That is the point of them: `lib/api.ts` discriminates on the SSE `event:` line and parses
`data:` payloads, so a fixture written by hand would drift from the backend silently and the
parser tests would keep passing against a format nobody serves.

Regenerate after any change to the SSE event set, event order, or payload shape:

```bash
cd backend && python scripts/dump_sse_fixtures.py
```

That script imports its step fixtures from `backend/tests/api/test_routes.py`, so the shape
here follows the backend suite rather than being maintained separately.
