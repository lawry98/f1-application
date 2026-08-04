---
status: accepted
---

# Cache historical tool results across requests

Generating a briefing for the same race twice used to do all the same network work twice:
nothing between the graph and the upstream APIs remembered anything across requests. The five
historical FastF1 tools (`get_track_info`, `get_recent_top_finishers`, `get_circuit_winners`,
`get_driver_form`, `get_recent_race_results`) account for the ~9s concurrent wall clock of the
FastF1 tools, the dominant share of a 15-20s gathering stage — fetching data whose underlying
race results are immutable, even where (see below) the question being asked of them is not.

`_invoke_tool` in `agent/graph.py` now serves those five tools from a module-level dict keyed
on `(tool_name, arguments)` — or `(tool_name, arguments, today's date)` for the three described
below — populated on first success and kept for the life of the process.

## Scope is the freshness policy

There are no TTLs. Freshness is handled by exclusion and by key design instead:

- `get_race_weather` (a forecast — stale weather in a race-weekend briefing is actively
  misleading) and `search_f1_news` (current by definition) are never cached.
- Of the five cached tools, three ask a question that is relative to *today* rather than to
  the race: `get_recent_top_finishers` ("the most recent completed race"),
  `get_driver_form` ("the last N races"), and `get_circuit_winners` ("the last `years_back`
  years"). The race results underneath are immutable, but the running season keeps producing
  new "most recent" races and the calendar keeps rolling the lookback window forward, so their
  cache key also carries `date.today().isoformat()` (see `DATE_DEPENDENT_TOOLS` in
  `agent/graph.py`). A same-day repeat is still instant; the first request of a new day
  refetches. `get_track_info` and `get_recent_race_results` take an explicit year and stay
  keyed on arguments alone.

Only successful results are stored, so one transient upstream failure cannot become a
persistently degraded briefing.

## The departure from the schedule cache

`api/routes.py` clears `tools/schedule_cache.py` in the `finally` of both briefing endpoints —
that cache is per-request by design. The rationale was never recorded (the commit that added
the clears, `306c0ad`, has a title-only message), so this cache does not inherit it: immutable
race results are kept across requests on their own merits. The per-request schedule clear is
left exactly as it was.

## What we accepted

- **Process-local.** The dict dies with the process and is not shared across workers. This app
  runs single-process; Redis would be machinery without a beneficiary.
- **No eviction.** The key space is bounded (~races x 5 tools x a few historical years, plus one
  extra dimension of size ~365 for the three date-keyed tools) and never explicitly cleared —
  the date key is the only expiry this cache has, by design; see "Scope is the freshness
  policy" above.
- **Duplicate concurrent fetches.** As in the schedule cache, the lock is released during the
  fetch; two concurrent misses on one key both fetch and the last write wins.
- **A visible seam.** The `tool_result` SSE event carries `cached: true/false` so the transport
  stays honest about provenance; the frontend ignores it for now.
