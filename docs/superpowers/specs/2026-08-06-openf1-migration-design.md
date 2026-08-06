# Migrate result-reading tools to OpenF1

**Date:** 2026-08-06
**Status:** Implemented
**Scope:** Backend only. The frontend standings UI ships on a separate branch.

## Context

Four of the seven `@tool` functions read finishing positions out of FastF1, and each one pays
for a full session load to do it. Those loads are the dominant cost of a briefing:

| Call | Measured (2026-08-06, this machine) |
|---|---|
| `fastf1.get_event_schedule(2025)` | 0.16s |
| One `session.load(laps=False, …)` | **2.40s** |
| `get_driver_form` (5 sessions) | ~12s |
| `get_circuit_winners` (3 sessions) | ~7s |

The same run logged `Failed to load session info data!` and `Failed to load extended driver
information!`, which is why `backend/cache/` never fills: FastF1 only persists a session that
loaded cleanly, and these never do. The cost is paid again on every request, forever.

OpenF1 serves the same classification data as plain JSON, supports range filters
(`?session_key>=X&session_key<=Y`), and returns a whole season in one request in ~0.6s.

There is also a capability the current data source cannot provide at all. `SYNTHESIZER_PROMPT`
asks for a `## Championship Context — Current standings` section, and no tool supplies one;
`get_recent_top_finishers` carries an explicit `"note"` disclaiming that its positions are not
cumulative. `Team.championshipPosition` and `Team.points` in `frontend/data/teams-data.ts` are
deliberately unset for the same reason. Summing `session_result.points` across a season closes
that gap.

### Intended outcome

- The four result tools answer in ~1s instead of 2.4–12s, keeping their return contracts byte-identical.
- A new `get_championship_standings` tool and `GET /api/standings/{year}` endpoint expose real
  driver and constructor tables.
- FastF1 stays for what it is still best at: the schedule, and any season before 2023.

## What changed during implementation

The outcome differs from the plan above in two ways — read this before trusting the rest of
this document as a description of what shipped.

1. **`get_circuit_winners` was ported to OpenF1, then reverted.** Only three of the four result
   tools ended up on OpenF1, not all four. `get_circuit_winners` needs one race from each of N
   different years, and OpenF1's endpoints are all per-year, so the port cost four requests per
   year — 12 requests, 6.57s for a 5-year window — against FastF1's 4.62s. The migration made
   the other three tools faster; this one it made slower, so it was reverted and stays on
   FastF1. Its docstring in `f1_data_tools.py` carries the same numbers.
2. **A `requests` range-query encoding bug cost four tasks.** `params={"session_key>=": v}`
   makes `requests` percent-encode the `>=` *inside the key* to `session_key%3E%3D` and then
   append its own `=`, producing `session_key>==v` and a silent HTTP 404. It went undetected
   for four tasks because every test fake ignores query params, and every tool's OpenF1 failure
   absorbs into a silent FastF1 fallback — a total OpenF1 outage looks identical to a healthy,
   merely slower, run. Fixed by stopping the param key at the comparison character
   (`{"session_key>": v}`, letting `requests` supply the `=`) and guarded by
   `test_the_range_query_serialises_to_openf1s_filter_syntax`, which asserts the serialised URL
   via `requests.models.PreparedRequest` rather than the params dict.

Measured results, live against the API on 2026-08-06:

| Tool | Before | After | Source |
|---|---|---|---|
| `get_driver_form` | 9.31s | 1.38s, 3 requests | OpenF1 |
| `get_recent_race_results` | ~2.4s | ~0.5s | OpenF1 |
| `get_recent_top_finishers` | ~2.4s | ~0.5s | OpenF1 |
| `get_circuit_winners` | 4.62s | 4.62s | FastF1 — reverted |
| `get_championship_standings` | did not exist | 2.9s | OpenF1 (new) |

## Verified facts

Everything below was checked against the live API on 2026-08-06, not read from docs.

| Fact | Evidence |
|---|---|
| Coverage starts 2023 | `sessions?year=2022&session_name=Race` → `{"detail": "No results found."}` |
| Full future calendar available | `meetings?year=2026` → 27 meetings, through Abu Dhabi 2026-12-06 |
| Range filters work | `session_result?session_key>=11234&session_key<=11342` → 153 rows, 51 sessions, 0.62s |
| `session_result` has no names | Fields are `position, driver_number, points, dnf, dns, dsq, duration, gap_to_leader` — a `drivers` join is required |
| **Sprints carry points** | Sprint `session_key=11240` → 8.0 / 7.0 / 6.0 for P1–P3 |
| Qualifying carries none | `session_key=11330` rows have **no** `points` key at all |
| Championship endpoints are dead unauthenticated | `drivers_championship` and `teams_championship` → `No results found` for every session tried |
| Derivation works | 3 requests, 4.04s cold → correct 2026 tables (Antonelli 219, Mercedes 379) |
| **Zero-point teams vanish** | Cadillac absent from the derived constructors table |
| Rate limits | 3 req/s, 30 req/min unauthenticated |

### Known data trap

Meeting 1308 is `meeting_name: "Bahrain Grand Prix"`, `location: "Kuala Lumpur"` — official name
`FORMULA 1 GULF AIR BAHRAIN GRAND PRIX IN MALAYSIA 2026`. Two 2026 rounds therefore match a
`bahrain` query. This is upstream F1 data, not an OpenF1 bug, and `race_resolver.py`'s
`.iloc[0]` already picks arbitrarily between them today. **Out of scope**, recorded here so the
follow-up is findable.

## Design

### `backend/tools/openf1_client.py` — new, plain helper

Not LLM-callable. Same category as `fastf1_helpers.py`, `schedule_cache.py`, and
`race_resolver.py`; per the `tools/` is not uniform rule in `CLAUDE.md`, adding a file here does
not make it a tool.

| Function | Requests | Returns |
|---|---|---|
| `list_sessions(year, session_name=None)` | 1 | `session_key` → meeting_key, circuit_short_name, country_name, date_start, session_name |
| `session_results(keys: set[int])` | 1 range query, filtered to `keys` in Python | position, points, dnf, dns, dsq, duration, gap_to_leader |
| `driver_index(keys: set[int])` | 1 range query | `driver_number` → full_name, name_acronym, team_name |

- `OPENF1_FIRST_YEAR = 2023` and `OPENF1_BASE_URL` are module constants.
- HTTP via **`requests`**, with an explicit timeout. `requests==2.34.2` is already declared in
  `backend/requirements.txt` and already used directly by `tools/weather_tools.py`. No new
  dependency, and the test-stubbing pattern below comes free.
- Module-level cache keyed by `(endpoint, frozenset(params))`, reusing `schedule_cache.py`'s
  shape exactly: lock to read, **lock released during the fetch**, lock to write, duplicate
  concurrent fetch acceptable. Add `clear()` for tests.
- The client raises on transport failure. Callers translate to `{"error": …}` — the
  never-raise contract lives at the `@tool` boundary, not here.

### Range-query pattern

The one thing to get right. Given a set of session keys, issue **one** request spanning
`min(keys)` to `max(keys)` and discard rows whose `session_key` is not in the set. This is what
turns `get_driver_form`'s five sequential 2.4s session loads into a single sub-second call. Never
loop one request per race — that is both slow and the only realistic way to hit the 3 req/s ceiling.

### Ported tools — contracts unchanged

`get_recent_race_results`, `get_driver_form` (`fastf1_tools.py`); `get_recent_top_finishers`,
`get_circuit_winners` (`f1_data_tools.py`).

Every returned key, and the shape of every value, stays as it is today. `backend/tests/test_fastf1_tools.py`
and `backend/tests/test_tools.py` must pass unchanged — that is the acceptance criterion for the port.

Each tool gains one guard at the top:

```
if year < OPENF1_FIRST_YEAR:  ->  existing load_race_session path
try openf1 path
except (transport failure, empty response):  ->  existing load_race_session path
```

`fastf1_helpers.py` and `schedule_cache.py` stay untouched and remain the fallback path.

**`Status` loses fidelity.** FastF1 gives `"Finished"`, `"+1 Lap"`, `"Accident"`, `"Gearbox"`.
OpenF1 gives three booleans, so the OpenF1 path derives `"DSQ"` / `"DNS"` / `"DNF"` /
`"Finished"` in that precedence order. The synthesizer writes retirement prose from this field,
so state the loss in each tool's docstring — a reader comparing a 2022 briefing against a 2026
one will otherwise think something broke.

`format_position` in `fastf1_helpers.py` is reused for the `DNF`-vs-int coercion; do not write a
second one.

### `backend/tools/standings_tools.py` — new tool

```
get_championship_standings(year: int) -> dict
  {"year", "races_completed", "drivers": [...], "constructors": [...]}
```

1. `list_sessions(year)`, keep only `session_name in {"Race", "Sprint"}`. Filtering on
   `session_name` rather than on the presence of `points` is deliberate: quali rows happen to
   carry no `points` key today, so a presence check would be right by accident.
2. `session_results` over those keys; sum `points` per `driver_number`.
3. `driver_index` over the same keys for `full_name`, `name_acronym`, `team_name`. Take the
   **latest** session's entry per driver so a mid-season team change reports the current team.
4. **Zero-fill** every team and driver seen in `driver_index` but absent from the points map.
   Without this Cadillac is missing from 2026 entirely.
5. Sort by points descending, assign `position` 1..n. Ties broken by best finishing position,
   then by driver number, so the order is stable between runs.
6. `year < OPENF1_FIRST_YEAR` → `{"error": "Championship standings are only available from 2023."}`.
   No FastF1 fallback: FastF1 has no standings source either, which is why this gap exists.

### Agent wiring — `agent/graph.py`, `agent/prompts.py`

- `all_tools` gains `get_championship_standings`.
- `_invoke_tool` gains a branch: `{"year": race_info["historical_year"]}`.
- `PLANNER_PROMPT`'s tool list gains the line
  `get_championship_standings: Driver and constructor championship tables`.
- `DEFAULT_TOOLS` gains `"get_championship_standings"` — it feeds a section the synthesizer
  prompt already asks for, so it belongs in the degraded path too.
- **Keep** `get_recent_top_finishers`'s `"note"` about positions not being cumulative standings.
  It stops the LLM reading one race's order as a table, and the planner can still select that
  tool without selecting `get_championship_standings`, so the risk survives.

### API — `backend/api/routes.py`

`GET /api/standings/{year}`, placed next to `/races/{year}` and copying its shape:
`Path(ge=OPENF1_FIRST_YEAR, le=date.today().year)` — bound to the constant, not a literal, so the
API and the tool cannot disagree about coverage. `asyncio.to_thread` for the blocking client, and
`logger.exception` plus a generic `detail` in the style of `GENERIC_SCHEDULE_ERROR` on failure. A
tool-level `{"error": …}` becomes a 502 with a generic message, not a 200 carrying an error body.

The frontend consumer is out of scope for this branch.

### Explicitly not changing

| Left alone | Why |
|---|---|
| `race_resolver.py`, `/api/races` | FastF1 schedule is 0.16s, works, reaches 1950, and carries `event_format` and `OfficialEventName` that OpenF1 lacks |
| `weather_tools.py` | OpenF1 weather is session-time historical. It cannot forecast an upcoming race, so it is not a substitute for OpenWeather |
| `search_tools.py`, `get_track_info` | No OpenF1 equivalent; `get_track_info` reads the schedule, not a session |
| The `fastf1` dependency | Still the schedule source and the pre-2023 fallback |

## Testing

New `backend/tests/test_openf1_client.py` and `backend/tests/test_standings_tools.py`. The backend
test tree is **flat** — `tests/test_fastf1_tools.py`, `tests/test_tools.py` — so do not create a
`tests/tools/` directory.

Stub with `monkeypatch.setattr(openf1_client.requests, "get", …)` and reuse the existing
`FakeResponse` helper in `tests/test_tools.py`, which is exactly how the OpenWeather tests already
work. Never hit the live API from a test. Response bodies come from the real API, in the spirit of
`frontend/tests/fixtures/`'s real SSE bytes.

Cases that must exist, each mapping to a verified fact above:

| Case | Guards against |
|---|---|
| `tests/test_fastf1_tools.py` and `tests/test_tools.py` pass unchanged | The port silently changing a contract |
| `year=2022` routes to FastF1 | Losing pre-2023 history |
| Transport failure routes to FastF1 | A hard dependency on a third-party API |
| Sprint points included | Undercounting a sprint weekend by 8 points |
| Qualifying excluded | Counting quali positions as points |
| Zero-point team present | Cadillac vanishing from the constructors table |
| Range query issues **one** request, filters in Python | A regression to per-race looping, which reintroduces the latency and risks the rate limit |
| `dsq` / `dns` / `dnf` → correct `Status` precedence | A DSQ reported as a DNF |
| Mid-season team change reports the latest team | A driver counted under a team they have left |

## Verification

```bash
cd backend && ruff check . && ruff format --check .
cd backend && pytest
```

End-to-end, with `backend/.env` populated:

```bash
# Standings endpoint
curl -s localhost:8000/api/standings/2026 | python3 -m json.tool | head -30

# Full briefing — compare wall-clock against main
time curl -s -X POST localhost:8000/api/briefing \
  -H 'Content-Type: application/json' -d '{"race_query": "Zandvoort"}' | head -c 400
```

Expected: the standings endpoint returns 11 constructors for 2026 including Cadillac at 0 points,
and the briefing's `## Championship Context` section cites real points gaps rather than a single
race's finishing order. The briefing should complete measurably faster than on `main`; record
both numbers.

Sanity-check the fallback by hand, since no live test covers it:

```bash
cd backend && .venv/bin/python -c "
from tools.f1_data_tools import get_circuit_winners
print(get_circuit_winners.invoke({'circuit_name': 'Monaco', 'years_back': 5}))"
```

Expected: five years of winners, 2021 and 2022 served by FastF1 and 2023–2025 by OpenF1.

## Follow-ups, not this branch

1. Frontend standings UI — merge into `TEAMS` and light up `championshipPosition` / `points`.
   The four components that render standings (`team-section`, `sticky-car-viewer`,
   `inspect-modal`, `teams-comparison`) already take `team`/`teams` as props, so the merge point
   is `teams-page-client.tsx`. Update the "deliberately unset" comment in `teams-data.ts` and the
   matching note in `CLAUDE.md` when it lands.
2. `race_resolver.py`'s Bahrain / Kuala Lumpur double-match.
3. OpenF1 authentication, if rate limits ever bind — it also unlocks the first-party
   `drivers_championship` endpoint, retiring the derivation in `standings_tools.py`.
