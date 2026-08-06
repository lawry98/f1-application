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
    <feature>/   Page sections: landing/, briefing/, teams/, teardown/
    3d/          Three.js — only ever loaded via dynamic import, ssr: false
    ui/          shadcn/ui + vendored Magic UI — do not hand-edit
  data/          Static domain data (TEAMS) and the Team/Driver types
  hooks/         Custom hooks, use- prefix
  lib/           api.ts (typed client), utils.ts, team-utils.ts
  types/         Shared types, re-exported through types/index.ts
  tests/         Vitest — flat, not mirroring the source tree; fixtures/ holds real SSE bytes
```

## Commands

The frontend is **pnpm**. `frontend/pnpm-lock.yaml` is committed; a `package-lock.json`
appearing anywhere means someone ran npm by mistake — delete it. Node and pnpm versions are
pinned in `mise.toml`, so `mise exec -- pnpm …` always uses the right ones.

```bash
cd frontend && pnpm typecheck   # tsc --noEmit
cd frontend && pnpm lint        # ESLint
cd frontend && pnpm test        # Vitest (jsdom)
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
| `FASTF1_CACHE_DIR` | Defaults to `cache/` |
| `EXECUTOR_MAX_WORKERS` | Defaults to `4` |
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
**ignored** by pnpm 11.

**The graph is not a flat pipeline.** It has four nodes, but `resolver` sits behind a
conditional edge: when `state["current_step"] == "error"` it routes straight to `END`, skipping
planner, tools, and synthesizer. Anything assuming the synthesizer always runs is wrong.

**`tools/` is not uniform.** Seven `@tool` functions live across four modules
(`fastf1_tools`, `f1_data_tools`, `search_tools`, `weather_tools`). The other three files are
plain helpers, **not** LLM-callable: `race_resolver.py` (used by the resolver node),
`schedule_cache.py` (a FastF1 schedule cache), and `fastf1_helpers.py` (shared FastF1
lookup/session helpers). Adding a file here does not make it a tool.

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
completed tool respectively, discriminated by a `kind` field. That writer no-ops under plain
`.invoke()`, so `/api/briefing` needs no special-casing.

**SSE discrimination uses the `event:` line** from the SSE protocol, not field-presence
heuristics on the payload.

**FastF1 session loads hit the network every time, cache or no cache.** `backend/cache/`
(gitignored) never gets populated: FastF1 only persists a session that loaded cleanly, and
these loads never do, so warming it achieves nothing. A briefing takes seconds for that
reason, not because of cold-cache telemetry downloads.

**`gltf.scene.clone()` must stay inside `useMemo`** — without it Three.js re-clones the scene on
every render.

**The landing page composes, it doesn't contain.** `app/page.tsx` is seven imports from
`components/landing/`; the hero, features, and footer markup are not inline.

**The teams page has exactly one scroll spy, and it lives in `hooks/use-scroll-spy.ts`.** The
sections are taller than the viewport and adjacent, so a per-section `IntersectionObserver` firing
on `isIntersecting` fights itself at every boundary. One observer watches all eleven against a
narrow band near the top of the viewport and picks the section covering most of it, ties going to
document order. A click *claims* the active id immediately and suppresses the observer until the
scroll it triggered settles — feedback must not wait for an observer, but the observer still owns
the state afterwards. `hooks/use-team-navigation.ts` layers the URL on top: `pushState` on an
explicit click, `replaceState` while scrolling, so eleven teams do not become eleven history
entries. Scroll offsets are `scroll-margin-top` on the sections, never maths in the handler.

**Team colors are brand assets and must go through `lib/team-utils.ts` before carrying text.**
`paletteFor(color)` returns `base` (untouched, decorative only — glows, 3D livery, bars) plus
`text`/`display`/`ring`/`on` variants shifted in lightness until they clear WCAG AA against
`bg-zinc-950`. Racing Bulls navy reads at 1.9:1 raw and Haas is literally `#ffffff`; the old
one-off `isWhite` special case only covered the second of those. `tests/team-utils.test.ts`
asserts the thresholds for every team on the grid, so a new team with an unreadable color fails
CI rather than shipping.

**`Team.championshipPosition` and `Team.points` are deliberately unset.** The page has no
standings source and inventing a table would be worse than omitting it. Every consumer treats them
as optional and falls back to all-time stats; populating them in `teams-data.ts` is the only change
needed to light up the standings UI everywhere.

**The teams page's three columns appear at different widths.** Left rail from `lg`, sticky 3D
viewer from `xl`, mobile chip strip below `lg` — laptop widths get two columns on purpose. The
viewer is also *mounted* on a `matchMedia` check, not just `hidden xl:block`: a canvas inside a
`display: none` wrapper still allocates a WebGL context and runs its loop.

**The teardown page** (`/teardown`) preloads 192 PNG frames (`public/frames/frame_0000.png` …
`frame_0191.png`) and maps scroll position to frame index via `requestAnimationFrame`. Its canvas
is sized `min(92vw, calc(82vh * 800 / 420))` to respect both viewport constraints at once.

## Code conventions

### Frontend

- **File naming**: kebab-case, no exceptions — including `components/3d/`. Component *names*
  stay PascalCase (`f1-hero-scene.tsx` exports `F1HeroScene`).
- **Exports**: named exports. The only `default export`s outside `app/` are
  `3d/f1-car-showcase.tsx` and `3d/f1-hero-scene.tsx`.
- **Shared types** come from `@/types` — *except* `Team` and `Driver`, which live in
  `@/data/teams-data` alongside the `TEAMS` data they describe.
- **3D components**: always `next/dynamic` with `ssr: false`; server-rendering Three.js throws.
- **No `any` on SSE events** — everything flows through the `StreamEvent` discriminated union.
- **shadcn/ui** components in `components/ui/` are generated; re-add with `pnpm dlx shadcn add
  <name>` from `frontend/` (where `components.json` lives) rather than editing them by hand.

### Frontend tests

Vitest with jsdom, in `frontend/tests/`. A few things about them are not guessable:

- **`next lint` only walks the directories listed in `next.config.js`'s `eslint.dirs`.**
  `tests/` is in that list *because* it is not one of Next's defaults — without the entry,
  `pnpm lint` passes while never looking at a test file. Add any new top-level directory there.
- **The `.sse` fixtures are real captured bytes, not hand-written.** `frontend/tests/fixtures/`
  holds output from the actual FastAPI route; regenerate with
  `cd backend && python scripts/dump_sse_fixtures.py`, which imports its step fixtures from
  `backend/tests/api/test_routes.py`. Editing a `.sse` file by hand decouples the parser tests
  from the format the backend really serves, which is the one thing they exist to catch.
- **`tests/setup.ts` stubs `IntersectionObserver`.** jsdom has none, and `BlurFade` wraps most
  page sections, so without it any test that renders one dies inside framer-motion's `useInView`.
  It also stubs `scrollIntoView`, `scrollTo`, and `matchMedia` for the same reason — the teams
  page calls all three, and jsdom implements none of them.
- **`AnimatePresence mode="wait"` makes content untestable.** The incoming child is held back
  behind the outgoing one's exit animation, which never resolves synchronously under jsdom, so
  `getByRole` finds nothing. Use it for swaps nobody asserts on; anywhere a test needs the new
  content, render conditionally instead.

Fake timers are load-bearing in `use-briefing.test.tsx` — the flush interval is a module
constant, so controlling the clock is the only way to observe a paint mid-stream. Use
`vi.advanceTimersByTimeAsync` and not the sync variant; the stream's promise chain has to be
allowed to run between pushes.

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