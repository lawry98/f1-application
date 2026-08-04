---
status: accepted
---

# Cache historical tool results across requests

Generating a briefing for the same race twice used to do all the same network work twice:
nothing between the graph and the upstream APIs remembered anything across requests. The five
historical FastF1 tools (`get_track_info`, `get_recent_top_finishers`, `get_circuit_winners`,
`get_driver_form`, `get_recent_race_results`) accounted for 9-20s of measured wall clock per
run, fetching data that cannot change — the finishing order of a past race is immutable.

`_invoke_tool` in `agent/graph.py` now serves those five tools from a module-level dict keyed
on `(tool_name, arguments)`, populated on first success and kept for the life of the process.

## Scope is the freshness policy

There are no TTLs. Freshness is handled by exclusion instead: `get_race_weather` (a forecast —
stale weather in a race-weekend briefing is actively misleading) and `search_f1_news` (current
by definition) are never cached. Only successful results are stored, so one transient upstream
failure cannot become a persistently degraded briefing.

## The departure from the schedule cache

`api/routes.py` clears `tools/schedule_cache.py` in the `finally` of both briefing endpoints —
that cache is per-request by design. The rationale was never recorded (the commit that added
the clears, `306c0ad`, has a title-only message), so this cache does not inherit it: immutable
race results are kept across requests on their own merits. The per-request schedule clear is
left exactly as it was.

## What we accepted

- **Process-local.** The dict dies with the process and is not shared across workers. This app
  runs single-process; Redis would be machinery without a beneficiary.
- **No eviction.** The key space is bounded (~races x 5 tools x a few historical years).
- **Duplicate concurrent fetches.** As in the schedule cache, the lock is released during the
  fetch; two concurrent misses on one key both fetch and the last write wins.
- **A visible seam.** The `tool_result` SSE event carries `cached: true/false` so the transport
  stays honest about provenance; the frontend ignores it for now.
