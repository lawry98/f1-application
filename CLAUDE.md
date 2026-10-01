# F1 Race Weekend Briefing Agent

A LangGraph agent that turns a Grand Prix name into a synthesised race weekend briefing, served by FastAPI over SSE and rendered by a Next.js frontend.

This file carries what you **cannot derive by reading the repo** — conventions, traps, and invariants. For setup, the tech stack, the endpoint list, and a feature tour, see [README.md](README.md).

## Where things live

```
backend/
  agent/       graph.py (pipeline), state.py (TypedDicts), prompts.py (LLM prompts)
  api/         routes.py (REST + SSE endpoints), models.py (Pydantic contracts)
  tools/       Mixed — see "tools/ is not uniform" below
  config.py    Every env var read in the app happens here

frontend/
  app/           App Router, one directory per route
  components/
    <feature>/   Page sections: landing/, briefing/, standings/, teams/, teardown/, tyres/
    3d/          Three.js — only ever loaded via dynamic import, ssr: false
    ui/          shadcn/ui + vendored Magic UI — do not hand-edit
  data/          Static domain data (TEAMS, tyre compounds) and the types describing it
  hooks/         Custom hooks, use- prefix
  lib/           api.ts (typed client), utils.ts, team-utils.ts, tyre-utils.ts
  types/         Shared types, re-exported through types/index.ts
  tests/         Vitest — flat, not mirroring the source tree; fixtures/ holds real SSE bytes
                 and captured JSON route responses
```

## Commands

The frontend is **pnpm**. `frontend/pnpm-lock.yaml` is committed; a `package-lock.json`
appearing anywhere means someone ran npm by mistake — delete it. Node and pnpm versions are
pinned in `mise.toml`, so `mise exec -- pnpm …` always uses the right ones.

```bash
cd frontend && pnpm typecheck   # tsc --noEmit
cd frontend && pnpm lint        # ESLint
cd frontend && pnpm test        # Vitest (jsdom)
cd frontend && pnpm build && pnpm test:browser   # Playwright, production build, no backend
cd frontend && pnpm test:browser:mutants         # prove it still fails on each recorded defect
cd backend  && ruff check .
cd backend  && ruff format .
```

The root `Makefile` wraps all of these — `make dev`, `make lint`, `make test`, `make ci`, and
`make` alone for the list. It is a dispatcher only: if a recipe ever disagrees with
`.github/workflows/ci.yml`, CI is right and the Makefile is the bug. The backend venv it
creates and expects is **`backend/.venv`**, not `venv`.

Full setup (venv, API keys, both platforms) → [README.md](README.md).

## Environment variables

Backend reads `backend/.env` (copy from `env.example`). Behaviour on missing values is the
part worth knowing:

| Variable | Missing behaviour |
|---|---|
| `GOOGLE_API_KEY` | **Fatal** — `validate_config()` raises `SystemExit(1)` |
| `TAVILY_API_KEY` | Warning; news search silently disabled |
| `OPENWEATHER_API_KEY` | Warning; weather silently disabled |

"Missing" includes an `env.example` placeholder (`your-…`, `tvly-your-…`): `config.is_configured`
is the one test, used by `validate_config` and by both tools, so a copied placeholder never reaches
upstream to earn a 401.
| `FASTF1_CACHE_DIR` | Defaults to `cache/` |
| `EXECUTOR_MAX_WORKERS` | Defaults to `4` |
| `STANDINGS_TTL_SECONDS` | Defaults to `300`; `0` disables current-season caching; invalid/negative warns and uses `300` |
| `BRIEFING_PER_IP_PER_HOUR` | Defaults to `5`; invalid, negative or `0` warns and uses `5` |
| `BRIEFING_DAILY_CAP` | Defaults to `100` per UTC day; `0` means no cap; invalid/negative warns and uses `100` |
| `BRIEFING_MAX_CONCURRENT` | Defaults to `2`; invalid, negative or `0` warns and uses `2` |
| `BRIEFING_DEADLINE_SECONDS` | Defaults to `90`; invalid, negative or `0` warns and uses `90` |
| `CORS_ORIGINS` | Comma-separated; defaults to `http://localhost:3000,http://localhost:3001` |

`LLM_MODEL` is a **hardcoded constant** in `config.py`, not an env var — changing the model
means editing code. That is deliberate: the prompts are written against a specific model
(`PLANNER_PROMPT` demands a bare JSON array, `SYNTHESIZER_PROMPT` a six-section structure), so
a model change should go through a diff, not an env var.

**There is no temperature setting, and that is not an oversight.** `gemini-3.6-flash` uses
fixed sampling defaults and *ignores* a `temperature` argument — passing one changes nothing
and makes the client emit a `UserWarning` on every construction. Gemini 3 is optimised for its
default sampling regardless, and Google warns that lowering temperature risks looping or
degraded reasoning. Do not add one back because the synthesizer writes prose.

Frontend: `NEXT_PUBLIC_API_URL` in `frontend/.env.local`, defaults to `http://localhost:8000`.
`NEXT_PUBLIC_SITE_URL` is the deployed origin, read only in `lib/site.ts`; it becomes
`metadataBase`, the sitemap's `<loc>`s and robots.txt's `Sitemap:`. Next inlines it **at build
time**, so it must be set for `pnpm build`. Unset falls back to `http://localhost:3000` and warns
once per build worker (about a dozen identical lines); a path, a non-http(s) scheme or garbage
throws.

## Key technical details

**pnpm's `node_modules` is strict — no phantom imports.** Anything you import must be declared in
`package.json`. npm's flat tree used to resolve undeclared transitive deps by accident;
`three-stdlib` was exactly that case (imported by the 3D components, but only present as a dep of
the since-removed `@react-three/drei`) and is now an explicit dependency. A `TS2307: Cannot find module` on a
package that clearly exists in the tree means it is undeclared, not missing.

**Build scripts need explicit approval, and one unapproved script breaks everything.** pnpm 11
blocks postinstall scripts by default *and* re-runs its dependency check before every script — so
a single unapproved build makes `pnpm typecheck`, `pnpm lint`, and `pnpm build` all fail with
`ERR_PNPM_IGNORED_BUILDS`, which looks nothing like the real cause. Approvals live in
`frontend/pnpm-workspace.yaml` under `allowBuilds`; the `pnpm` field in `package.json` is
**ignored** by pnpm 11. The same file carries `minimumReleaseAgeExclude`: pnpm 11 refuses a
version published less than a day ago, lockfile or not, so taking a same-day security release
means an exact-version entry per package there, deleted once it is a day old.

**A Tailwind class that no `content` glob reaches generates no rule, and nothing but a browser
can tell.** `tailwind.config.ts`'s `content` lists `components/`, `app/` **and `lib/`** — the last
one because `lib/focus.ts` is the only place `focus-visible:ring-ink` is written (`ring-f1-red`
is also written literally in `components/tyres/acts/tyre-archive.tsx` and `source-list.tsx`, both
already inside `content`). Without it the `ring-ink` rule was never emitted, so every control built
from `focusRing` / `focusRingOffsetBase` / `focusRingOnRedFill` kept its `ring-2` and fell back to
Tailwind's default blue `--tw-ring-color` (`rgb(59 130 246 / 0.5)`, measured live) — on the
red-filled CTA, the invisible-indicator case `lib/focus.ts` exists to prevent. The same shape bit
once before: `duration-[600ms]` is an *ambiguous* arbitrary value here, generated no rule, and the
crossfade silently ran at the 150ms `transition-[background-color]` sets for itself, which is why
`transitionDuration: { 600: '600ms' }` is a real token. **Both failures pass every test** — jsdom
computes no CSS, so an assertion on the class name holds with the rule absent, and a screenshot
can see neither a duration nor a ring that only paints on `:focus-visible`. Read the rule out of
`document.styleSheets`, or the computed value off a live element. `tests/tailwind-content.test.ts`
is the guard, and it asserts the glob rather than the colour for exactly that reason. Any new
module outside `components/`/`app/` that authors a class string needs adding to `content`.

**`text-base` is a *colour* in this theme, and at a responsive variant it silently repaints
text.** `tailwind.config.ts` defines a colour token named `base` (`#09090B`), which collides with
Tailwind's built-in `text-base` font-size utility. Which one applies is decided by source order in
the generated sheet, not by the order you wrote the classes: a **bare** `text-base` is harmless
because every colour utility is emitted after it (`text-base leading-relaxed text-zinc-300` on
`/teams` measures `rgb(212,212,216)`, verified live), but **`sm:text-base` is emitted after all
unprefixed utilities**, so its colour beats the `text-zinc-300` you wrote and the text is painted
`#09090b` — invisible on the `#09090b` page. It looks exactly like text that failed to render.
Use `sm:text-[1rem]` (or `text-[15px]`, as `landing-features.tsx` already does) for any
breakpoint-scoped body size. Neither `pnpm test` nor a type check can see this; jsdom computes no
CSS, and the class string reads correctly.

**The cost guard's limits are per process — run exactly one worker.** `api/guard.py` keeps the
per-IP hour, the UTC-day count and the concurrency slots in memory, so a second uvicorn worker
doubles every limit and a restart resets the day. It keys on `request.client.host` and never
parses `X-Forwarded-For` (anyone can send one): behind a proxy, run uvicorn with
`--proxy-headers` and `FORWARDED_ALLOW_IPS` set to the proxy, or every visitor shares one
allowance. Admission runs *before* `EventSourceResponse` exists, which is the only reason a
refusal can be a 429/503 at all — once the stream opens its status is 200. Three things there are
not guessable. **The slot is released by the response, not only the generator**: a client that
hangs up before the first event (generator never started) or mid-send (generator parked at a
`yield`) is not covered by the generator's `finally`, so `_ReleasingEventSourceResponse.__call__`
closes the generator and runs the run's idempotent `finish()` itself; the ASGI-level disconnect
tests only prove this because their `send` yields to the loop — with one that never yields, both
passed with that teardown deleted. **Spend is stopped by a `RunBudget`, not by cancellation**:
the nodes run on worker threads that no `CancelledError` reaches, so each node checks the
budget's cancel event and deadline (`agent/budget.py`) before an LLM call, before submitting a
tool and between streamed chunks; the route sets the event at the deadline and when the response
ends. **`max_retries` on `ChatGoogleGenerativeAI` is an attempt count**, first request included,
and its `timeout` bounds each read of a stream, not the stream — `config.py` carries the source
citations and the deadline arithmetic, and a test re-does the sum.

**The graph is not a flat pipeline.** It has four nodes, but `resolver` sits behind a
conditional edge: when `state["current_step"] == "error"` it routes straight to `END`, skipping
planner, tools, and synthesizer. Anything assuming the synthesizer always runs is wrong.

**A past race is briefed as of its weekend's start, not as of today ([ADR-0004](docs/adr/0004-past-races-brief-as-of-the-weekend.md)).**
The resolver sets `race_info["as_of"]`: the start of today for an upcoming race (mid-weekend
included), the first session's start for a past one. With no year, "Monaco" resolves to its
already-run 2026 edition, so this is the default path, not an edge. Every result tool takes
`as_of` instead of a year and counts only what started before it, crossing into the previous
season only when the cutoff's own has too little — there is no `historical_year` any more.
`_build_tool_args` is the result cache's key, and `as_of` is its only date component (ADR-0003, as
amended). `get_race_weather` and `search_f1_news` cannot be cut off, so `UPCOMING_ONLY_TOOLS` are
dropped from a past race's plan right after the planner, before `tool_plan` is announced. Both
prompts get the resolved race as an authoritative block (`race_context`), so the model writes
about the circuit the race is at rather than the one its name suggests. The band's "Pre-race
briefing as of …" line has a slot rendered from the shell on, because it lands above a loader
already on screen.

**`tools/` is not uniform.** Eight `@tool` functions live across five modules
(`fastf1_tools`, `f1_data_tools`, `search_tools`, `weather_tools`, `standings_tools`). The other
eight files are plain helpers, **not** LLM-callable: `race_resolver.py` (used by the resolver
node), `schedule_cache.py` (a FastF1 schedule cache), `fastf1_helpers.py` (shared FastF1
session helpers, including a weekend's session times), `cutoff.py` (reads `as_of` back into a
`datetime` — the one place the tools agree on "before the cutoff"), `openf1_client.py` (the
OpenF1 HTTP client, its range-query cache and its rate limiter), `openf1_races.py` (shared
"which races had run by the cutoff" lookups), `openf1_shaping.py` (converts OpenF1 rows into the
tools' existing return shapes), and `circuit_winners.py` (the backend's one reader of
`frontend/data/circuits`: the location matcher, a circuit's own file, and recent winners for
`/circuits` and `get_circuit_winners`). Adding a file here does not make it a tool.

**Tools never raise.** Every `@tool` returns `{"error": "..."}` on failure. The agent is built to
continue on partial data — preserve this or the pipeline loses its degradation behaviour.

**The planner and the synthesizer degrade differently, on purpose.** `planner_node` catches
*any* LLM failure — a free-tier 429 above all — and falls back to `DEFAULT_TOOLS`, because the
planner only chooses which tools to run and the pipeline works without it. The planner's two
failure paths log differently on purpose ("LLM call failed" vs "failed to parse response") —
one means the model was never reached, the other that it returned something unusable.

`synthesizer_node` degrades only once it has prose: a stream that dies after at least one chunk
returns the partial briefing with `briefing_truncated: True` and `current_step: "complete"`,
while a failure before the first chunk still raises. That bare `except` around an LLM call
followed by a "complete" step is deliberate and looks wrong on sight — read
[ADR-0002](docs/adr/0002-serve-truncated-briefings.md) before changing it.

**Read `response.text`, never `response.content`.** Gemini 3 returns `.content` as a *list of
content blocks*, not a string. Using `.content` fails in two ways that both look like something
else: the planner's parse raises inside its `try` and silently degrades to `DEFAULT_TOOLS`
forever (a planner that appears to work and never runs), and the synthesizer hands the API a
list where a Briefing string is expected. `make_llm()` in `tests/factories.py` deliberately
models this — its fake `.content` is a block list — so the tests fail if anyone reverts to it.

**The LLM client is built at module scope** in `agent/graph.py`, so importing the graph without
`GOOGLE_API_KEY` set fails at *import* time, not call time. `tests/conftest.py` seeds the key
before any app module loads; that ordering is load-bearing.

**Streaming is native `astream`, not a thread bridge.** `routes.py` iterates
`agent.astream(...)` directly and emits an SSE event the moment each node returns, while the rest
of the run is still going. The graph's nodes stay *synchronous* — LangGraph offloads them to anyio
worker threads itself, so the event loop is never blocked and node signatures need no `async`.
There is no executor in the API layer; `EXECUTOR_MAX_WORKERS` governs only the tool fan-out inside
`tool_executor_node`.

Because it asks for two stream modes — `stream_mode=["updates", "custom"]` — `astream` yields
`(mode, payload)` **tuples**, not the bare `{node: partial_state}` dicts a single mode gives. The
`custom` mode carries the synthesizer's briefing Deltas and `tool_executor_node`'s per-tool
`tool_result` writes — both written with `get_stream_writer()`, one per chunk and one per
completed tool respectively, discriminated by a `kind` field. `/api/briefing/stream` is the
only route that runs the graph: the synchronous `POST /api/briefing` was removed because the UI
never called it and each unauthenticated request spent two Gemini calls.

**SSE discrimination uses the `event:` line** from the SSE protocol, not field-presence
heuristics on the payload.

**FastF1 session loads hit the network every time, cache or no cache — which is why three
result tools now read OpenF1 instead.** `backend/cache/` (gitignored) never gets populated:
FastF1 only persists a session that loaded cleanly, and these loads never do, so warming it
achieves nothing. `get_recent_race_results`, `get_recent_top_finishers`, and `get_driver_form`
went from a 2.4s FastF1 session load per race (the old one-driver `get_driver_form` measured at
9.31s for five races) to a single OpenF1 range query (1.38s, three requests). The grid-wide
`get_driver_form` is 1.50s and three requests cold, and **none of its own inside a briefing**:
its results span is `held_races`' and its `drivers` span is the season's held races — exactly
what `get_recent_top_finishers` already asks for. Narrowing the roster to the window's races
looks tidier and costs a request; `test_driver_form_costs_no_request_the_other_result_tools_have_not_made`
fails on it.
FastF1 remains the **schedule** source — `get_event_schedule` is 0.16s, works, and reaches
back to 1950 — and the fallback for seasons before `OPENF1_FIRST_YEAR`.

**`get_driver_form` is every driver's last five Grands Prix, one text line each, on purpose.**
The synthesizer serialises tool data with `indent=2`, where a `{race, position}` object per finish
came to 15.8 KB for 22 drivers; a line per driver is ~3.5 KB there, and
`test_a_full_grids_form_stays_inside_the_synthesizer_budget` holds it. Each race's rows are joined
to a driver by session (`drivers_by_session`) and aggregated by `name_acronym`, never by car
number: #1 changes hands with the title, so a window crossing 2025 into 2026 joined on number hands
Norris Verstappen's Abu Dhabi. Two classification traps, both measured. OpenF1 classifies a car
that retired past 90% distance (`position: 16`, `dnf: True` — Bottas, Baku 2026), so a place beats
the `dnf` flag; an unclassified car is `position: None`. FastF1 gives a retired car a
finishing-order `Position` (17–20 in a real 2022 load), not 0, so only `ClassifiedPosition` (`R`,
`N`, `D`, `E`, `W`, `F`) says it retired — the shared `RESULTS_ROWS` fixture's `Position: 0.0` is
not what FastF1 serves. The FastF1 fallback is five loads, 8.1s cold, inside the fan-out's 25s.

**`get_circuit_winners` is deliberately still on FastF1 — the migration made it slower, not
faster, so it was reverted.** It needs one race from each of N different years, and OpenF1's
endpoints are all per-year, so porting it cost four requests per year (12 requests, 6.57s for a
5-year window) against FastF1's 4.62s. Don't "finish the migration" by re-porting it; the
tool's own docstring in `f1_data_tools.py` carries the same numbers.

**OpenF1 coverage starts in 2023, and `OPENF1_FIRST_YEAR` is the only place in the backend that
number lives.** The frontend's season picker mirrors it as `STANDINGS_FIRST_YEAR` in
`lib/standings.ts`, and `tests/standings.test.ts` reads the constant out of `backend/tools/openf1_client.py`
and fails on drift. Every ported result tool tries OpenF1 first and falls through to its
`load_race_session` path for an earlier year or a transport failure. The visible cost of the
OpenF1 path is `Status` fidelity: FastF1 reports *why* a car stopped ("+1 Lap", "Accident"),
OpenF1 exposes only `dnf`/`dns`/`dsq`, so `derive_status()` collapses it to
`Finished`/`DNF`/`DNS`/`DSQ`. A real unclassified row also carries `position: None`, not `0` —
code that coerces with `position or 0` handles this, but a naive `int(position)` will not.

**The `requests` range-query encoding trap cost four tasks of this migration.** OpenF1's filter
syntax is `session_key>=11334`. Passing `params={"session_key>=": v}` makes `requests`
percent-encode the `>=` **inside the key** — `session_key%3E%3D` — and then append its own
`=`, producing `session_key>==v` on the wire and a plain HTTP 404. The fix is to stop the
param key at the comparison character and let `requests` supply the `=`:
`{"session_key>": v}`. It went undetected for four tasks because every test fake ignores query
params, and every tool absorbs an OpenF1 failure as a silent FastF1 fallback — a total OpenF1
outage is indistinguishable from a healthy, merely slower, run. The regression guard is
`test_the_range_query_serialises_to_openf1s_filter_syntax` in `test_openf1_client.py`, which
asserts the **serialised URL** via `requests.models.PreparedRequest`, not the params dict —
asserting on the dict would have passed with the bug still in place.

**Standings are derived, not fetched.** OpenF1's `drivers_championship` and
`teams_championship` endpoints return `{"detail": "No results found."}` without a paid
subscription, so `get_championship_standings` sums `session_result.points` across Race
**and Sprint** sessions. Two traps live in that derivation: sprints score on the 8/7/6
scale and must be included, and the table is seeded from the driver roster rather than
from the results — otherwise a team on zero points (Cadillac, 2026) vanishes and an
11-team grid renders as 10. Drivers' rows are per driver (`name_acronym`), not per car number:
Bearman raced #38 for Ferrari and #50 for Haas in 2024, and a number-keyed table listed him twice.
A third trap is the tie-break: sprints count for **points** but not for the **countback** (most
Grand Prix wins, then 2nds, …; a constructor pools both cars). A best-finish tie-break over
both session types put Ricciardo — P4 in the 2024 Miami sprint — ahead of Albon on 12 points,
the reverse of the official order.

**A standings session counts only once it has results, not once its date has passed.** A
cancelled race keeps its OpenF1 session and entry list and serves no result rows, so the
date-based count reported 16 races for 2026 when 14 had run (Bahrain and Saudi Arabia never did)
and 23 for 2023's 22 (Imola). It never touched the points — an empty race adds none — only
`races_completed`, which is exactly the number the briefing and `/standings` quote. A season
with no held session at all returns `reason: SEASON_NOT_STARTED`, which `/api/standings` serves as
a **200 with empty tables** — the one tool error the route does not fold into
`502 GENERIC_STANDINGS_ERROR`, because it is an answer, not an outage, so the page states it
rather than offering a retry. It also covers first results not yet published, which a later load
does change.

**`/standings` joins two upstreams, and both joins are exact on purpose.** OpenF1 spells two
2026 teams differently from `Team.shortName` (`Haas F1 Team`, `Red Bull Racing`), so
`teamForStanding` matches `shortName` exactly plus an explicit two-entry alias map — never a
substring, the defect class the livery fix removed. Predecessor brands (`Kick Sauber`, `RB`,
`AlphaTauri`, `Alfa Romeo`) are deliberately unmapped: an unmatched team renders as plain text
with an empty bar slot, which is expected in every season before 2026. The as-of stamp
joins `races_completed` to FastF1's calendar by `round`, and that is exact only because FastF1
drops cancelled events and renumbers the rest *and* the count now skips them too — Round 14 of
23 is the Spanish Grand Prix. Name the event by `Race.name`: FastF1 files the rescheduled 2026
Bahrain Grand Prix under `Location: "Kuala Lumpur"`.

**Team colour on `/standings` is decorative only.** Each row carries a 4px bar in the true hex
and every glyph is a zinc neutral on bare `zinc-950` — no zebra, no hover tint, no highlighted
leader — which is why `standings-tables.tsx` calls no `team-utils` helper at all.
`tests/standings-tables.test.tsx` asserts `inlineColouredText()` is empty and that no table
element carries a `bg-` class, so colouring a name or tinting a row fails there until it has its
own backdrop variant, built the way the five on `/teams` are.

**`/standings` reads its season from `useSearchParams`, never from state seeded by a server
prop.** The first version seeded `useState` from a server-parsed `initialYear` and desynced both
ways, measured in a browser: pick 2024, follow "Compare the teams →", press Back, and the URL
said `?year=2024` while the page showed 2026; pick 2024, click the nav's "Standings" link, and
the URL said `/standings` while the page showed 2024. Next keys the page segment without its
search params, so client state survives a same-page navigation — measured identically on 14.2 and
16.3: after picking 2024, the nav link lands on `/standings` with the page's DOM nodes still the
same ones. Its patched `window.history.replaceState` (still installed unconditionally in
`app-router.js` on 16) moves the router's URL — and so `useSearchParams()` — but not the RSC
payload, so Back re-mounts the page from the original payload's props (measured on 14.2, against
the first version). `useSearchParams()` follows the patched `replaceState`, Back and Forward
alike — on 16.3 both desync paths above now land right: Back shows 2024 at `?year=2024`, the nav
link shows 2026 at `/standings` — so the rule for URL state on this page is: derive it from
`useSearchParams`, and make the picker's only write a `replaceState`. The page is `force-dynamic` because `latestYear`
is read from the server clock per request — a prerendered page would freeze it at build time —
and because `useSearchParams` on a static page needs a Suspense boundary. `pnpm build` lists it
as `ƒ /standings`.

**Standings are cached per year above the OpenF1 cache, because routes.py empties that one.**
The `finally: clear_openf1_cache()` in every route means the client cache only dedupes
*within* a request, so each /standings view cost four OpenF1 requests — ~7 views/min on the
free tier. `get_championship_standings` now keeps its own per-year result: a season with
`year < date.today().year` for the life of the process, the running season for
`STANDINGS_TTL_SECONDS`. "Completed" is the calendar year, **not** "last race held", on
purpose — a final race's classification can still move for days (publication lag, the
stewards' 14-day right of review), and the season ends in early December anyway. Failures
are never cached; `season_not_started` is, under the TTL. A briefing passes `as_of`, so the key
is `(year, as_of)`: a cutoff before today is kept for good, and a cutoff of today — every
upcoming race's — is the running season again, under the TTL. /standings passes none, and that
path is exactly the policy above. Don't delete the route's
`clear_openf1_cache()` thinking the new cache replaces it — it still bounds the other
OpenF1 tools' staleness, and the TTL miss path relies on it.

**OpenF1 requests are paced, then retried, process-wide, because standings is the one tool a 429
kills.** The free tier is 3 req/s and 30 req/min (openf1.org); a cold briefing costs five to eight
requests (measured: Bahrain 5, Monaco 7, Singapore 8) and a cold `/standings` view four. Every
other tool absorbed a 429 as a silent FastF1 fallback; standings has none, so briefings lost it (2
of 3 cold fan-outs, measured 2026-09-30). `openf1_client._pace` spaces request starts
`OPENF1_MIN_INTERVAL` apart. Pacing is the fix and the retry only its backstop: retrying alone
spent ~25 requests on ~12 answers and tripped the separate 30 req/min limit. Only the single-flight
fetcher retries — waiters share its result — and only 429 and 502/503/504: Retry-After when sent,
else exponential backoff with jitter, at most `MAX_RETRIES` within `MAX_RETRY_WAIT` (~5s). Past
that, the per-minute 429's `Retry-After: 60` included, it raises `OpenF1Error` at once. Timeouts
and other 4xx are never retried. `_next_start` lives outside `clear()` so the per-request clear
above leaves the pacing intact. Tests run with `_pace` stubbed by an autouse fixture — a frozen
`monotonic` under `freeze_time` is epoch-sized, so a real reserved start would stall the suite —
and `openf1_retry_sleeps` records the waits instead of sleeping them.

**`tests/conftest.py` blocks OpenF1 as well as FastF1, and the two differ on purpose.**
`_block_fastf1_network` raises `AssertionError` because no production path should swallow
one. `_block_openf1_network` raises `requests.ConnectionError` because the tools *do*
handle that — it is the FastF1 fallback — and that is what lets `test_fastf1_tools.py`
keep testing the FastF1 path unedited. The consequence is that the fallback is the
default under test, so `test_openf1_tools.py` asserts the OpenF1 request is genuinely
made rather than silently fallen through.

**Anything circuit-shaped is matched by location, never by Grand Prix name — on `/circuits` and
in the agent alike.** A Grand Prix is not a track: 2026's Spanish GP is at Madrid while 2023–25's
was at Barcelona, and FastF1 files the rescheduled 2026 Bahrain GP under Kuala Lumpur — matching
it by name described Sakhir in a briefing whose band said Sepang. So `tools/circuit_winners.py`
slugs each schedule row's `Location` and looks it up in `frontend/data/circuits/index.json`
(`CIRCUIT_INDEX_PATH` in `config.py`) — which makes `location_slug` the **third** copy of the slug
rule, after `locationSlug` and the converter's `slug()`. `frontend/tests/fixtures/slug-cases.json`
is read by both test suites; add a case there, never to one side. The resolver stores the match as
`race_info["track_id"]`; `get_track_info`, `get_recent_race_results` and the weather's
coordinates all key on it, and `get_circuit_winners` shares the matcher *and* the cache. A
location the index lacks gets "No recent data" or "No circuit data for this location" — never a
name-based guess. A race found on FastF1's calendar is joined to OpenF1 by its start time
(`openf1_races.race_session_at`), never by name: 2026 has two meetings called "Bahrain Grand
Prix".

**The winners cache has no expiry, on purpose.** Keyed `(circuit_id, year)`, and every year it
holds is finished — so nothing a TTL could refresh — and bounded by the 40 ids in `index.json`,
because the route rejects an unknown id (404) before anything is stored. The page's window is the
three seasons before the current one; a briefing's is the three before *its race's* season, with
no edition on or after its `as_of` (Silverstone 2023 gets 2020–22). A year the circuit did not host
is cached as `()`; a year whose FastF1 load *failed*, or that the cutoff cut short, is not cached,
and a failed one is reported in `unavailable_years`, so a transient outage is never remembered as
"never raced here". A lock per circuit id makes two cold views of the same circuit pay the ~4.6s
once — different circuits never block each other.

**`index.json`'s aliases must cover past seasons, not just the current calendar.** FastF1 spells
Abu Dhabi `Yas Island` for 2020–25 and Belgium `Spa` before 2022; without those aliases the
winners matcher misses them and the briefing band draws no outline for those years. Aliases live in
`LOCATION_ALIASES` in `scripts/fetch-circuit-geometry.mjs` and nowhere else.
`tests/circuit-catalog.test.ts` pins them.

**Weather is forecast at the circuit's coordinates for the weekend's sessions, never at a geocoded
name for "now".** `_build_tool_args` gives `get_race_weather(lat, lon, sessions)` the centre of
`race_info["track_id"]` from `frontend/data/circuits/coordinates.json` (written only by
`scripts/fetch-circuit-geometry.mjs`) and the weekend's session times; the tool reads only the slots
from the first session − 3h to the race + 3h and gives each session the nearest one. The version
this replaced geocoded `"{Location},{country code}"` and returned the next 24 hours whatever the race
date: measured 2026-09-30, it missed Kuala Lumpur (FastF1 files it under Bahrain), Sakhir, Yas
Marina and Spa-Francorchamps outright, and its `"US"` default for an unmapped country made
Silverstone North Carolina. No track or no coordinates is an error, never a geocode. The free
endpoint reaches about five days, so a weekend past its last slot is `status:
"outside_forecast_range"` with `available_from`, and one already over is `weekend_over` — answers
with **no `error` key**, like `SEASON_NOT_STARTED`, and neither costs a request when the session
times alone settle it. Weather Watch in `SYNTHESIZER_PROMPT` steers on those keys, which
`test_the_synthesizer_prompt_steers_on_keys_the_tool_really_emits` pins.

**A round with no outline renders a card on `/circuits`, unlike the band.** The band hides a missing
outline because a briefing without it is still complete; in the grid the card *is* the content, so
it keeps its box, says "No track map", and is not a link. The grid loads one lazy chunk per unique
circuit and reveals when all have settled; `tests/circuit-imports.test.ts` fails any new static
import of an outline outside the three files that draw one known circuit.

**`/circuits/<alias>` redirects, and an unknown slug 404s — both as an HTTP 200.** The route
resolves through `redirect()` or `notFound()` in `app/circuits/[slug]/page.tsx`, but
`app/circuits/loading.tsx` streams the response, so both a client-side redirect and a soft 404 land
with status 200. `browser/circuits.spec.ts` asserts the landed URL and the rendered not-found content,
never the response status.

**`loading.tsx` goes on a dynamic segment only, never at the root.** A root one wraps every page in
a Suspense boundary, and React 19 streams a finished boundary *outlined* once its content passes
12,800 bytes, then reveals it no sooner than 300ms after first paint. On Next 16 that put seven
static routes on the spinner first — `/` read its spinner at +150ms in 3 of 5 loads, where Next 14
inlined every route. So only `app/circuits/` and `app/standings/` carry one: there a client
navigation shows it at once while the server renders. The price is `/circuits/[slug]`, whose page
is big enough to be outlined too, so a hard load of it still opens on the spinner (5 of 5).

**`gltf.scene.clone()` must stay inside `useMemo`** — without it Three.js re-clones the scene on
every render.

**Neither 3D scene frames its own camera any more, and the arithmetic is not `radius / sin(fov/2)`.**
`camera={{ position: [5, 2.5, 5] }}` put both cameras **7.5 units** from a car that is **11.23 units
long** — `/showcase` also scaled it by 2, so it showed about a quarter of a car. `lib/scene-fit.ts`
now computes the distance and `components/3d/fit-camera.tsx` applies it, and five things there are
not guessable. The car **rotates**, so the volume to fit is the cylinder it sweeps (radius 5.98, the
box's XZ diagonal, not its 5.62 half-length). That cylinder is **not** usefully approximated by its
enclosing sphere: the sphere models a 2.50-tall car as 12.2 tall, and the exact-for-a-sphere
`radius / sin(fov/2)` then parks the camera 38% too far out — measured live, the car filled **51%**
of the frame against **72%** for the cylinder fit, and *every* "does it fit" assertion passed on the
sphere version. The **binding fov depends on the canvas**: `/showcase`'s is `h-[70vh]` at full width,
so it is landscape on a desktop and **portrait on a phone**, where the horizontal fov binds and the
camera needs to be at 24.6 rather than 13.2 — aspect is only knowable inside `<Canvas>`, which is the
whole reason `FitCamera` is a component. **Fog moves with the camera**, so `FitCamera` owns
`scene.fog` outright; a `<fog attach="fog">` left in the JSX would recreate it from stale literals
and win, and the shipped `[8, 20]` puts a correctly framed car entirely past the far plane. And the
model is **not centred** — centre 0.223 off the rotation axis in x, lowest vertex +0.001 by the
exporter's luck — so `RealCar` carries a constant `groundedOffset` and no longer takes `scale` or
`position`. `CAR_BOUNDS` is checked against the shipped GLB in `tests/scene-fit.test.ts`, so a
re-exported model fails CI instead of quietly mis-framing both routes. `glbBounds` measures the
**decoded vertices**, not the accessors' min/max boxes: the `Car` node rakes the body 0.648°, and
the box-of-boxes it used to read reported a 2.66-tall car whose lowest point, -0.090, no vertex
reaches — grounding that phantom floated the tyres 0.091 above the floor on both routes while every
test passed.

**Verifying a camera means projecting vertices, and the node you rotate is not the one you think.**
jsdom lays nothing out and a screenshot cannot tell a fitted camera from a lucky one, so the check
that matters is: sweep the spin group through 360 degrees, project every Nth vertex with
`Vector3.project(camera)`, and assert `|ndc| <= 1`. Two traps cost real time here.
`Sketchfab_model`'s **parent is `Sketchfab_Scene`, the GLB's own root, which carries the grounding
offset** — the R3F group that `useFrame` spins is one level above that, so rotating `sketch.parent`
orbits the car eccentrically and reports a 596% overflow that is purely an artefact. And an
**axis-aligned bounding box of a rotated model has phantom corners**: at 50 degrees the live `Box3`
reports half-extents of 5.10 and 5.56, whose corner is 7.55 from the axis, but no vertex is out
there — the real reach is 5.79, inside even the 5.98 box diagonal the fit uses. Measure vertices,
not boxes.

**The 3D scene's `frameloop` is state, and `demand` is not the default for a reason.** `f1-hero-scene.tsx`
is reached from exactly one place — the teams page's Inspect modal — and the right rail deliberately
has no canvas, which is what keeps `three` / `@react-three/fiber` out of the page-load bundle. The
loop is `never` while `document.visibilityState` is not `visible`, `demand` under
`prefers-reduced-motion`, and `always` otherwise. Setting `demand` unconditionally looks like the
obvious optimisation and freezes the car: `RealCar`'s rotation and float run through `useFrame`,
which under `demand` fires only on invalidation. An `Invalidator` component sits inside the
`Canvas` for a narrower reason than it looks: R3F's reconciler already auto-invalidates on any
scene-graph mutation, so the Suspense swap when the GLB resolves needs no help. What actually
requires `Invalidator` is `RealCar`'s repaint of the livery texture, which writes pixels into a
canvas and flips `texture.needsUpdate` outside R3F's prop diffing and so is never
auto-invalidated — without it, a livery change under `demand` would show the wrong colour until
the next invalidation. Measured in a browser in that dialog under `demand`: idle draws **0**
frames, a bare `texture.needsUpdate = true` draws **0**, and the same mutation plus `invalidate()`
draws exactly **1**.

**The livery recolour rewrites the texture, and `material.color` is the trap.** `color`
*multiplies* into `.map`, and the committed GLB's base texel is `#003572` — **red channel zero**,
so no multiply can put red back. Computed in linear space, the one-line "widen the filter" fix
renders Ferrari `#000000`, Audi/Cadillac/McLaren/Aston Martin/Racing Bulls within a few counts of
it, and the remaining five the same blue only darker; Haas, being white, changes nothing at all.
Zero of eleven teams come out recognisable. So `lib/livery.ts` repaints the texels instead: the
texture is 62.9% flat `#003572`, 30.2% pure black (floor, wings, underbody) and ~4.3% FIA/F1
decals that all carry red at full scale, so a texel is bodywork exactly when it is `k · base` for
`k` in `[0, 1.2]` and becomes `k · teamColour`. Black is on that ray at `k = 0`, so the structure
survives with no special case, and the decals are off it, so they survive untouched. The three
tolerances are measured, not guessed. Material selection is an **exact** name match — the defect
this replaced was a `body`/`Body`/`paint` substring guess that matched none of `Livery`,
`RearLight`, `Wheels`, `WheelCovers`, so nothing recoloured and nothing reported it.
`tests/livery.test.ts` parses the real GLB out of `public/` rather than a fixture, which is what
makes an asset re-export fail in CI instead of silently un-fixing this.

**`f1-car.glb` is meshopt-compressed, and only `scripts/compress-car-model.mjs` should write it.**
7.57 → 1.35 MB on disk and 4.58 → 0.95 MB gzipped as `next start` serves it, all 205,876
triangles kept. The weight was geometry, so gltfpack quantizes it and meshopt-compresses it; the
four PNGs pass through byte-identical, because the livery recolour matches exact texels and any
lossy texture codec breaks it. The source is the untouched Sketchfab export, read back out of git
history and pinned by SHA-256, and `--check` proves the committed file is a fresh build. `RealCar`
gives GLTFLoader three-stdlib's `MeshoptDecoder` (+19.6 KB on the lazy 3D chunk, 2.6 ms to
decode) — without it the loader refuses the file. Four things are not guessable. **`-ce ext`**:
three-stdlib's loader implements only `EXT_meshopt_compression`, and its decoder throws
`Malformed buffer data` on the v1 codec that `-ce khr` emits. **`-kn`**: flattening merges the car
into one unnamed node, so the `Sketchfab_model`/`Car` graph the vertex-projection check walks is
gone, and the re-quantized vertices move `CAR_BOUNDS` 5.4e-4 in z — just past the guard. **Integer
positions**: a normalized encoding stores positions as raw integers, which `glbBounds` read in
gltf-transform's meshopt output as a 368,389-unit car; it throws on that now. **Draco was measured
and lost**: 117 KB smaller gzipped, but 78 KB of decoder (two files to host), twice meshopt's parse
time (82 vs 39 ms warm), and gltf-transform writes the source's float bounds over quantized
vertices — bounds GLTFLoader copies straight into every geometry's `boundingBox` for frustum
culling.
`CAR_BOUNDS` was re-baselined to the compressed file, not tolerated — the reasoning is on the
constant. `tests/car-model-asset.test.ts` is the weight guard: a 1.5 MB budget, no extension the
scenes cannot decode, a decode with the runtime's decoder, POSITION bounds true to the decoded
vertices, and the source's triangle count, since decimation (half the triangles for 139 KB
gzipped) changes the silhouette and belongs in a diff.

**The car's shadows need a normal bias, and `DoubleSide` is why.** Every material in the GLB is
`DoubleSide`, and three.js puts a double-sided mesh's *front* faces in the shadow map (a
single-sided one gets its back faces), so at zero bias the car shadows itself texel by texel and
the bodywork renders hatched, on a real GPU and in SwiftShader alike. `CAR_SHADOW_NORMAL_BIAS`
(`f1-car-model.tsx`, which carries the measurements) goes on every light that casts onto the car.
That includes the spot lights: their maps carry the same acne, which is invisible only because
they are about 1% of the key light, so raising one would bring it back. Any light added with
`castShadow` takes the bias too. jsdom has no WebGL, so `browser/shadow-acne.spec.ts` is the only
guard, and mutant 07 proves it.

**A segment's `openGraph` drops the inherited share image.** `app/opengraph-image.tsx` and
`twitter-image.tsx` attach to the root's metadata, and Next replaces `openGraph` whole rather than
merging it, so a page that sets its own `openGraph` loses `og:image` on that one route and nowhere
else — `/tyres` shipped that way. Such a page uses `generateMetadata(_, parent)` and passes
`(await parent).openGraph?.images` forward. A page's own `twitter` is replaced whole the same way,
though Next then back-fills a missing `twitter:image` from `og:image`. `browser/site-identity.spec.ts`
sweeps every sitemap route's `<head>`, as a crawler, and mutant 08 proves it; nothing in jsdom
can see this, and the metadata object reads correctly.

**The share image is drawn by Satori, which reads WOFF but not WOFF2.** `next/font/google` only
fetches WOFF2, so `lib/share-image.tsx` reads static WOFF instances from `@fontsource/archivo`
(900, the display headlines' `font-black`) and `@fontsource/inter` — a variable font would draw at
its default instance, weight 400. A glyph missing from those files makes `@vercel/og` fetch a
fallback font from the network at build time, so keep the copy Latin. The image's colours are hex
literals, held to `tailwind.config.ts` by `tests/share-image.test.ts`, which runs under
`@vitest-environment node` because resvg's wasm rejects a jsdom-realm `Uint8Array`
(`tests/setup.ts` skips its DOM stubs there). `apple-icon.png` and `favicon.ico` are rasterised
from `app/icon.svg` by `scripts/build-site-icons.mjs` — never edit them by hand; `--check` proves
they are fresh.

**The landing page composes, it doesn't contain.** `app/page.tsx` is seven imports from
`components/landing/`; the hero, features, and footer markup are not inline.

**`/tyres` keeps the numbered compounds and the race labels in different shapes, and that is
the whole point of the page.** Pirelli builds a numbered dry range for a season (C1–C5 in 2026 —
five, not six; the C6 existed in 2025 only) and nominates three of them per Grand Prix, where they
become Hard, Medium and Soft. The same number is the Hard at one race and the Soft at another, so
`data/tyres-data.ts` gives `RaceCompound` no compound-number field and `DryCompoundNumber` no label
field; the join exists only inside a dated `WeekendAllocation`, and `ALLOCATION_EXAMPLES` always
renders as several. That is why the **explorer shows the five colour-owning tyres, not C1–C5**: only
a label owns a colour, and a coloured `C3` chip would assert the mapping the page exists to deny.
The numbered range renders in graphite for the same reason. `tyres-page.test.tsx` asserts the range
has five entries and that no `C6` reaches the allocation section.

**Facts on `/tyres` are frozen to `TYRES_CONTENT_AS_OF` and every claim carries a `SourceRef`.**
Qualitative behaviour is prose; ordinals are labelled relative and compared only *within*
`comparisonGroup` (a full wet's grip is about standing water, where no slick has any). Four things
are deliberately absent because no Pirelli/F1/FIA publication supports them — per-compound
operating temperature windows, any recycled-content percentage for an F1 tyre, ISCC PLUS on one,
and front/rear attribution of camber limits. `LIFECYCLE_UNSUPPORTED_CLAIMS` records them so nobody
re-researches them.

**`lib/tyre-utils.ts` has a backdrop helper per surface, and it needed five before the page
shipped.** `compoundTextOnGlow` / `OnCard` / `OnTab` / `OnTrackedRow` each judge a compound colour
against the composite genuinely behind it. Two shipped wrong and were caught separately: the
active tab used a bare-`zinc-950` helper while sitting on `bg-zinc-800/80`, and the allocation
section's highlighted row used the *card* helper while sitting on a further `bg-zinc-800/70` on top
of the card — Soft measured 4.60:1 against the card and **3.95:1** where the glyphs actually sit,
at 12px. (Since the tyres redesign into acts, `compoundTextOnTrackedRow` has no call site; the
browser harness's class-2 mutant uses the teams rail's `railStandingColor` instead.)
`EYEBROW_RED_ON_WARM` (`lib/tyre-utils.ts`) exists because `EYEBROW_RED` is lifted against
`#09090b` and measured under 4.5:1 on the `bg-base-warm` acts; the browser harness's axe smoke
found it. It too has zero headroom, so it is right only on *bare* `base-warm` (Act 2, the
Archive): Act 3b's eyebrow sits under the strategy glow and measured 3.83–4.44:1 with it, so it
uses `EYEBROW_RED_ON_STRATEGY_GLOW`, judged against the lightest scenario tint at
`STRATEGY_GLOW_PEAK` (`browser/tyres-contrast.spec.ts` measures every scenario). If you add compound-coloured text, the first question is what is behind it; the second is
whether a helper already describes that composite. `tyre-utils.test.ts` asserts one surface per
helper *and* that the weaker helper genuinely falls short on it, so a redundant helper cannot
survive — there is no `compoundTextOnPage`, because it was byte-identical to `readableOnDark`.
`liftUntilContrast` is exported from `team-utils.ts` for this; it is the shared mechanism, not
team-specific.

**Three `/tyres` defects were invisible to jsdom and are worth knowing before touching the
explorer.** A `-z-10` decorative layer paints *behind its own section's `bg-zinc-950`* unless the
wrapper carries `isolate` — both the accent glow and the background wordmark shipped invisible
this way. A motion **variant** setting `opacity` overrides an `opacity-[…]` class, so
`WORDMARK_OPACITY` is carried by the variant. And a 520px glow centred on a 390px viewport scrolls
the whole page sideways, so it lives inside an `overflow-hidden` wrapper.

**Reduced motion on `/tyres` must not change the rendered tree.** `useReducedMotion()` is
necessarily `false` during SSR, so rendering a different element for the reduced branch is a
hydration mismatch by construction — it produced a real "Expected server HTML to contain a
matching `<span>`" in the browser. The drag wrapper is therefore always mounted with `drag="x"`
and only `dragElasticFor()` changes; the cursor affordance is dropped by a `motion-reduce:` CSS
variant. Swipe stays available under `reduce` with zero displacement, because a gesture the user is
performing is not the autonomous motion `reduce` is asking to be spared.

**`BlurFade` renders a `motion.div`, so it cannot wrap an `<li>` or a `<dl>` group.** Wrapping list
items put a `div` directly inside `<ol>` and broke list semantics for assistive technology; axe
found it, no unit test did. Put the `<li>` outside and `BlurFade` inside it.

**The credit tables are matched by their header row, never by a filename scan.** `lib/credits.ts`
parses `public/drivers/CREDITS.md` and `public/logos/CREDITS.md` at build time for `/credits`, and
`logos/CREDITS.md` carries a *second* table — `| File | What it is | What it is missing |` — whose
rows also lead with a backticked filename. A naive `` `*.svg` `` scan over that file finds **14
rows for 10 files**. `tests/credits-data.test.ts` asserts ten, which is the guard.

**`lib/credits.ts` throws on a malformed row, on purpose.** A short row, a missing header, an
empty author or a source cell that is not a markdown link fails `pnpm build`. The "tools never
raise" convention is about keeping a degrading LLM pipeline alive and does not extend to a
build-time read of a file we ship: silently rendering an empty author is an undischarged licence
obligation on a public page. Two source-data quirks are deliberately *not* treated as errors —
the driver rows say `CC0` where the licence-terms table says `CC0 1.0`, so that one licence
renders unlinked, and Commons source URLs carry literal parentheses, which is why the link
pattern is greedy rather than `[^)]+`.

**Both `CREDITS.md` files are in `.prettierignore`, and must stay there.** Those literal
parentheses are also why: prettier rewrites a markdown link whose URL contains them into
CommonMark's angle-bracket form — `[title](<https://…(cropped).jpg>)` — which `LINK_CELL` does
not match, so a single `prettier --write` over `public/` throws at build time and reds 27 tests.
They are a machine-read data source with a parser contract, not prose to be formatted. Reformat
the tables by hand if you must, never with the formatter.

**The teams page's scroll spy measures rects on a frame; `IntersectionObserver` cannot do this
job.** `hooks/use-scroll-spy.ts` picks the section covering most of a narrow band near the top of
the viewport, ties going to document order. The observer version of exactly that — one observer,
the root shrunk to the band by `rootMargin`, thresholds `[0, 0.01, 0.5, 1]` — shipped and did not
track scroll at all, through thirteen task reviews and a whole-branch review, because none of them
ran a browser. `intersectionRatio` is a fraction of the **target's** area, not of the band, so a
~560px section against a 270px band peaks at 0.48 and 0.5 is unreachable: only the entry and exit
crossings fire (25 callbacks across 6288px of scrolling), and between them the coverage map is a
snapshot from the last boundary. 8 of 31 sampled scroll positions named the wrong section. No
threshold list fixes this. So `scroll` and `resize` schedule one `getBoundingClientRect` pass per
animation frame — eleven rects in an uninterrupted read pass, 0.2ms, one layout flush — plus one
pass on mount, because arriving part-way down the page produces no scroll event. A click *claims*
the active id immediately and suppresses the measurement until it independently agrees or
`CLAIM_TIMEOUT_MS` elapses; the timeout matters because a section shorter than the band may never
win. Because jsdom lays nothing out, a test that feeds a fake observer its numbers proves nothing
here — `tests/use-scroll-spy.test.ts` models the layout, drives real scroll events and frames, and
derives the expected winner from the model rather than from the hook.
`hooks/use-team-navigation.ts` layers the URL on top:
the rail, chips and comparison rows are real anchors, so the browser pushes one history entry per
click by itself, and the hook only handles hash restore, `popstate`, and `replaceState` while
scrolling. Scroll offsets are `--teams-scroll-offset` in `app/globals.css` consumed as
`scroll-mt-[…]`, never maths in a handler.

**Centre an item in a horizontal scroller by scrolling the scroller — `centredScrollLeft` in
`lib/scroll-row.ts`.** `item.scrollIntoView({ inline: 'center' })` looks equivalent and also moves
Chromium's sequential focus navigation starting point to the item. The site nav and the `/teams`
chip strip centred their current item that way on mount, so on every route with a nav link the
first Tab skipped the wordmark and landed on whatever followed the current item (`/tyres` →
"Circuits", `/teams` at 375 → "FerrariP2"). jsdom has no starting point, so only
`browser/first-tab.spec.ts` can see it; a spec that Tabs from page load waits for hydration first,
since the defect lives in a mount effect. A deliberate jump to content (a section, a stage) is the
other case: there, moving the starting point with the scroll is what Tab should do next.

**Team colours are brand assets and must go through `lib/team-utils.ts` before carrying text.**
`readableOnDark` lifts a livery until it clears WCAG AA as small text on `zinc-950`; `ringOnDark`
does the same against the lower non-text bar for focus rings; `onColor` picks black or white to
sit *on* a fill; `needsDamping` says whether a fill is too bright to be a surface at all. That
last one replaced a `team.color === '#ffffff'` equality check that only ever covered Haas —
Racing Bulls' navy reads at 2.02:1 and was never caught by it. Decorative use — glows, bars, the
livery wall, the 3D livery — keeps the true hex. `tests/team-utils.test.ts` asserts every variant
for all eleven teams, so a new team with an unreadable colour fails CI rather than shipping.

**`readableOnDark` is only correct on bare `zinc-950`, and it has zero headroom by
construction** — it stops at the first lightness step clearing 4.5:1, so *any* translucent layer
between the glyphs and the page pushes it under. Five call sites sit on something lighter and each
needs its own backdrop variant, all built from `blendOver` + `liftUntilContrast`: `seamLabelColor`
for the seam wash, `railStandingColor` for the active rail row's `bg-zinc-800/60` highlight
(`readableOnDark` measured 4.02:1 there), `sectionStandingColor` for the section glow,
`portraitCaptionColor` for the caption scrim over a photograph, and `trayValueColor` for the compare
tray's `bg-zinc-900/60` card (4.23:1 there). The mistake looks identical every time and the tests
reproduced it twice: an assertion that measures the right *colour* against the wrong *background*
passes while the rendered page fails. If you add team-coloured text, ask what is behind it first.

**The section glow's peak opacity is a contrast constraint, not a taste one.** A `40vw` blob with
a 120px blur is wider than the margin of an 840px-wide section, so its core lands on the content
column. At the peak of 1 it originally animated to, the composite behind the standing line is the
livery at ~0.78 alpha and Alpine's `#0184e9` admits **no** readable text at all — pure white tops
out at 3.83:1 — so no colour helper could have fixed that line. `GLOW_PEAK_OPACITY` caps it, and
the same constant is the alpha the composite is judged at (measured effective alpha is 0.92 of
peak, so the peak is the conservative side). Raising it back breaks
`holds the glow weak enough that a readable colour exists at all`.

**Neither `pnpm test` nor axe can see these.** jsdom lays nothing out, and axe returns
*incomplete* — "background could not be determined" — for text over a blurred, absolutely
positioned sibling, which is every one of these call sites. What works is hiding only the glyphs
(`visibility: hidden`), screenshotting, and reading the pixel behind them; `agent-browser
screenshot` plus `sips -s format bmp` gives a trivially parseable 24-bit BMP. Two traps in that
method: an element that carries its own `background-color` disappears along with its text, so a
monogram tile reads as page background (axe catches those — the two tools are complementary), and
`TextAnimate` renders an `sr-only` copy beside the painted `aria-hidden` spans, so hiding the
accessible copy measures the visible glyphs and reports 1:1.

**`reducedMotion: 'reduce'` does not stop entrance opacity fades, and axe folds a mid-fade
opacity into the colour it measures.** The `/teams` hero CTA wrapper and the sticky dossier's
`AnimatePresence` swap both still fade in after `goto` under `reduce`; an axe pass timed right
after load caught the CTA between 2.14:1 and 4.43:1 and failed 8/10 serial runs (3/10 in
parallel) before the fix, 0 failures once settled. `waitForMotionToSettle`
(`frontend/browser/support/motion.ts`) is the guard, and every `a11y-smoke` pass calls it before
`analyze()`. It requires both: no finite Web Animation still running, because the CTA sits at
`opacity: 0` for several frames before motion has even created that animation; and a `QUIET_MS`
(300ms) window with no change to opacity, filter, transform, colour or background-color, because
motion drives some values from JS on `requestAnimationFrame`, which `document.getAnimations()`
never sees. It throws after `TIMEOUT_MS` (10s) rather than proceeding silently. Its blind spot: a
JS-driven animation still in a delay phase longer than 300ms would slip past unnoticed — none
exists on the routes it covers today. Any new browser check that reads colour must call it first.

**The teams page's three columns appear at three different widths.** Left rail from `lg`, sticky
dossier from `xl`, mobile chip strip below `lg` — laptop widths get two columns on purpose. The
dossier is also *mounted* on a `matchMedia` check, not just `hidden xl:block`: inside a
`display: none` wrapper it still runs its `AnimatePresence` swap and instantiates a logo image on
every team change. Moving it to `xl` also means the per-section "Inspect in 3D" button is
`xl:hidden`, not `lg:hidden` — otherwise 1024–1279px gets no dossier *and* no way to reach the
inspector.

**The teardown page** (`/teardown`) scrubs 192 frames on a canvas sized
`min(92vw, calc(82vh * 800 / 420))`, which respects both viewport constraints at once. What ships is
lossy WebP (`public/frames/frame_NNNN.webp`, 3.60 MB); the PNG renders it is derived from live in
`assets/teardown-frames/` (30.1 MB, never served). Never re-encode or hand-edit a shipped frame:
change the source and re-run `node scripts/encode-teardown-frames.mjs`, whose `--check` confirms
the committed set is byte-identical to a fresh encode. That is why `sharp` is pinned exactly —
another libwebp is another set of bytes — and the script's header carries the measurements behind
q85 and against AVIF (Safari decodes it only from 16, so it would need a second, fallback set).
All 192 frames are kept on purpose: none is a duplicate, and at 96 each image holds for ~38px of
scroll, which steps visibly on a slow trackpad drag. Loading is coarse to fine
(`lib/teardown-frames.ts`): the overlay waits only for every 16th frame plus the last, and the
canvas draws the nearest loaded frame and redraws as closer ones land — jsdom cannot see that, so
`browser/teardown-scrub.spec.ts` compares canvas pixels and mutant 06 proves it would notice. The
last frame is in the first pass because the docked still in the header is the same URL, served
from cache. A spec that holds frame responses must `goto` with `waitUntil: 'domcontentloaded'`:
an unfinished `new Image()` delays the document's `load` event, so the default never resolves.

## Code conventions

### Frontend

- **File naming**: kebab-case, no exceptions — including `components/3d/`. Component *names*
  stay PascalCase (`f1-hero-scene.tsx` exports `F1HeroScene`).
- **Exports**: named exports. The only `default export`s outside `app/` are
  `3d/f1-car-showcase.tsx` and `3d/f1-hero-scene.tsx`.
- **Shared types** come from `@/types` — *except* `Team` and `Driver`, which live in
  `@/data/teams-data` alongside the `TEAMS` data they describe.
- **3D components**: always `next/dynamic` with `ssr: false`; server-rendering Three.js throws.
  The `dynamic()` call must sit in a Client Component — since Next 15 `next build` refuses
  `ssr: false` in a Server Component — which is why `app/showcase` and `app/teardown` render a
  `*-page-client.tsx` wrapper and keep their `metadata`.
- **No `any` on SSE events** — everything flows through the `StreamEvent` discriminated union.
- **shadcn/ui** components in `components/ui/` are generated; re-add with `pnpm dlx shadcn add
  <name>` from `frontend/` (where `components.json` lives) rather than editing them by hand.

### Frontend tests

Vitest with jsdom, in `frontend/tests/`. A few things about them are not guessable:

- **`pnpm lint` is `eslint .`, and nothing narrows it.** Next 16 removed `next lint`, which
  walked only the directories in `next.config.js`'s `eslint.dirs` — `tests/`, `browser/` and
  `scripts/` were linted only because someone had added them, and a directory left off passed
  while never being looked at. `eslint.config.mjs` (flat config) now takes the whole package, so
  a new top-level directory is linted by default; only generated output is ignored. Every React
  Compiler rule eslint-config-next 16 switched on is enforced, with two scoped exceptions and the
  reason beside each: `immutability` for `components/3d/fit-camera.tsx` (R3F's three.js objects
  are meant to be mutated) and `purity` for vendored `components/ui/`. Fix a new violation in the
  code — `useSyncExternalStore`, `useEffectEvent`, a `key`, state derived during render — before
  reaching for another override.
- **The `.sse` fixtures are real captured bytes, not hand-written.** `frontend/tests/fixtures/`
  holds output from the actual FastAPI route; regenerate with
  `cd backend && python scripts/dump_sse_fixtures.py`, which imports its step fixtures from
  `backend/tests/api/test_routes.py`. Editing a `.sse` file by hand decouples the parser tests
  from the format the backend really serves, which is the one thing they exist to catch.
- **`tests/setup.ts` stubs `IntersectionObserver`.** jsdom has none, and `BlurFade` wraps most
  page sections, so without it any test that renders one dies inside framer-motion's `useInView`.
  It also stubs `scrollIntoView`, `scrollTo` (on `window` and on every element), and `matchMedia`
  for the same reason — the teams page calls all of them, and jsdom implements none of them. `matchMedia` reports no match, so
  components take their narrow branch unless a test overrides it.
- **`next/image` renders two different `src` shapes, and a test that assumes one fails on the
  other.** Next's default loader refuses to proxy an SVG without `dangerouslyAllowSVG`, so
  `/logos/alpine.svg` stays literal while `/drivers/x.png` becomes
  `/_next/image?url=%2Fdrivers%2Fx.png&w=64&q=75`. `tests/attribution-table.test.tsx` normalises
  both before comparing. `/credits`' page component is *synchronous* despite being a server
  component doing file I/O, which is the only reason RTL can render it at all — an `async` server
  component cannot be rendered by RTL, and that is why the data, the table and the page are three
  units.
- **`AnimatePresence mode="wait"` makes content untestable.** The incoming child is held back
  behind the outgoing one's exit animation, which never resolves synchronously under jsdom, so
  `getByRole` finds nothing. Use it for swaps nobody asserts on; anywhere a test needs the new
  content, render conditionally instead.

Fake timers are load-bearing in `use-briefing.test.tsx` — the flush interval is a module
constant, so controlling the clock is the only way to observe a paint mid-stream. Use
`vi.advanceTimersByTimeAsync` and not the sync variant; the stream's promise chain has to be
allowed to run between pushes.

### Browser tests

Playwright, in `frontend/browser/`, against `next start` on a **production** build. This is the
gate for everything jsdom cannot see: CSS that was never generated, contrast against the real
composite, text painted in its own backdrop colour, and scroll/layout behaviour. It is a
required CI check (`browser` job). Things that are not guessable:

- **Build first, every time.** The suite never builds, and `reuseExistingServer` is off, so it
  always tests the bundle in `.next`. After `pnpm test:browser:mutants` locally, the runner
  rebuilds the clean tree; if you kill it midway, rebuild before trusting a result.
- **`page.goto` resolving does not mean the page is showing — `waitForMain` first.** A
  placeholder can outlive it: `/circuits/[slug]`'s outlined `loading.tsx` spinner (see "loading.tsx
  goes on a dynamic segment only") and the `next/dynamic` loading screens of `/showcase` and
  `/teardown`. When the root still had a `loading.tsx`, the focus sweep tabbed through a spinner and
  reached zero controls, 6 runs in 21 (on `/`: `load` at 83ms, reveal at 333ms). A sweep that reads
  text or colour would *pass* on a page it never saw. `browser/support/page-content.ts` explains
  the rest; any new route sweep calls it.
- **A contrast assertion names a WCAG floor and a site, never a measured ratio:**
  `expectContrast(loc, { atLeast: AA_SMALL_TEXT, site: 'rail active row over bg-zinc-800/60' })`.
  The text colour is computed style; the backdrop is pixels, from `backdropBehindGlyphs`, which
  ports the hide-the-glyphs method to pngjs and designs out both of its traps: glyphs go
  *transparent* rather than `visibility: hidden` (so an element's own fill survives), and a
  1px `sr-only` copy is refused (TextAnimate's accessible twin reads 1:1).
- **There is no screenshot diffing, on purpose.** Every defect here asserts better than it
  diffs, and a golden captured on a broken tree would bless the bug.
- **`/api/` is served from `tests/fixtures/` and fails closed.** A new endpoint with no fixture
  fails the test that reaches it.
- **Mutants prove coverage.** `browser/mutations/` holds one patch per recorded defect and the
  tests it must fail; the weekly `browser-mutants` workflow runs them. A surviving mutant means
  a class is no longer covered: fix the spec. A stale patch means the code moved: regenerate
  it (the README says how), never delete it. Mutant 01 only proves the `ring-ink` half of the
  Tailwind-content claim above — `ring-f1-red`'s literal call sites keep that rule generated
  regardless, so "a flush control on base takes the red ring" stays in the suite as a guard
  with no mutant behind it.
- **The scroll-spy band is copied into the spec, not imported**, so a mutant that removes an
  export cannot be "killed" by a compile error.
- **A WebGL check reads the drawing buffer under SwiftShader.** Follow `shadow-acne.spec.ts`:
  it sets SwiftShader launch flags for its own file (the CI runner has no GPU), gets the R3F store
  through `window.__THREE_DEVTOOLS__` (the one hook a production build keeps), and calls
  `gl.readPixels` in the same task as `gl.render()`. An element screenshot also captures CSS
  transforms and overlays, and the Inspect dialog's entrance scale made one pose read two
  different values.
- **The route sweeps are hand-written lists, not discovered.** `focus-rings.spec.ts`,
  `a11y-smoke.spec.ts` and `invisible-text.spec.ts` each name their routes literally; a new
  route is covered only once it is added to all three. `/candy` stays out of the focus sweep
  because it has no focusable controls by design.

### Backend

- **snake_case** for all Python identifiers.
- **All tools** use the `@tool` decorator and return `{"error": "..."}` — never raise.
- **Logging** via `logger = logging.getLogger(__name__)` — no `print()`.
- **Config**: read env vars in `config.py` only; never `os.getenv()` elsewhere.
- **Async**: `asyncio.get_running_loop()` inside async functions, not `get_event_loop()`.

## Additional documentation

| File | When to consult |
|------|-----------------|
| `.claude/docs/architectural_patterns.md` | Modifying agent workflow, adding tools, changing API design, or frontend state |
| `frontend/components/3d/README.md` | Working on the Three.js scenes — props, usage, and model details |

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, used verbatim. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

All Claude Responses:
When reporting to me, be extremely concise, load-bearing words only. Priorities: user understanding > concision > grammar. Directive not recap → never padding. Split-second read. Do not compromise on meaning.  Presenting data: use tables.
End with: *DO THIS* block → concrete next actions for user, numbered, priority-first. Spell out reply options on decisions. Omit only when no user action.