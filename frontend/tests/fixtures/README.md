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

# Standings and calendar fixtures

`standings-2026.json`, `standings-2024.json` and `races-2026.json` are responses from the real
`/api/standings/{year}` and `/api/races/{year}` routes. They were captured on 2026-09-22 against
live OpenF1 and FastF1 — `standings-2024.json` again on 2026-09-23, once the drivers' table went
from one row per car number to one per driver, and both standings files again later that day, once
ties broke on the FIA's Grand Prix countback rather than a best finish that counted sprints (which
swapped Albon and Ricciardo in 2024 and Ocon and Alonso in 2026; 2026 was still after Round 14) —
and pretty-printed with `python3 -m json.tool`;
the values are untouched.

They are real for the same reason the `.sse` files are. The team-name join in `lib/standings.ts`
and the round join in `seasonStamp` both depend on how upstream _spells_ things: `Haas F1 Team`,
`Red Bull Racing`, and a 2026 calendar renumbered around two cancelled races. A hand-written
fixture would encode the spelling its author expected rather than the one served.

Unlike the `.sse` files, these are **snapshots of live data**. There is no generator script, and
re-capturing changes the numbers the tests pin:

- 2026, after Round 14 of 23 (the Spanish Grand Prix): 23 drivers, 11 constructors;
- 2024, final after 24 rounds: 24 drivers (Bearman once, on 7 points), with `Kick Sauber` and `RB`.

To re-capture, run the backend (`GOOGLE_API_KEY=unused` is enough, since neither route calls
Gemini), then:

```bash
curl -sf http://localhost:8000/api/standings/2026 | python3 -m json.tool > frontend/tests/fixtures/standings-2026.json
curl -sf http://localhost:8000/api/standings/2024 | python3 -m json.tool > frontend/tests/fixtures/standings-2024.json
curl -sf http://localhost:8000/api/races/2026 | python3 -m json.tool > frontend/tests/fixtures/races-2026.json
```
