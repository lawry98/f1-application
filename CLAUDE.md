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
    <feature>/   Page sections: landing/, briefing/, teams/, teardown/, tyres/
    3d/          Three.js — only ever loaded via dynamic import, ssr: false
    ui/          shadcn/ui + vendored Magic UI — do not hand-edit
  data/          Static domain data (TEAMS, tyre compounds) and the types describing it
  hooks/         Custom hooks, use- prefix
  lib/           api.ts (typed client), utils.ts, team-utils.ts, tyre-utils.ts
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

**`tools/` is not uniform.** Eight `@tool` functions live across five modules
(`fastf1_tools`, `f1_data_tools`, `search_tools`, `weather_tools`, `standings_tools`). The other
six files are plain helpers, **not** LLM-callable: `race_resolver.py` (used by the resolver
node), `schedule_cache.py` (a FastF1 schedule cache), `fastf1_helpers.py` (shared FastF1
lookup/session helpers), `openf1_client.py` (the OpenF1 HTTP client and its range-query
cache), `openf1_races.py` (shared "which session is this event's race" lookups), and
`openf1_shaping.py` (converts OpenF1 rows into the tools' existing return shapes). Adding a
file here does not make it a tool.

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

**FastF1 session loads hit the network every time, cache or no cache — which is why three
result tools now read OpenF1 instead.** `backend/cache/` (gitignored) never gets populated:
FastF1 only persists a session that loaded cleanly, and these loads never do, so warming it
achieves nothing. `get_recent_race_results`, `get_recent_top_finishers`, and `get_driver_form`
went from a 2.4s FastF1 session load per race (`get_driver_form` measured at 9.31s for five
races) to a single OpenF1 range query (`get_driver_form` measured at 1.38s, three requests).
FastF1 remains the **schedule** source — `get_event_schedule` is 0.16s, works, and reaches
back to 1950 — and the fallback for seasons before `OPENF1_FIRST_YEAR`.

**`get_circuit_winners` is deliberately still on FastF1 — the migration made it slower, not
faster, so it was reverted.** It needs one race from each of N different years, and OpenF1's
endpoints are all per-year, so porting it cost four requests per year (12 requests, 6.57s for a
5-year window) against FastF1's 4.62s. Don't "finish the migration" by re-porting it; the
tool's own docstring in `f1_data_tools.py` carries the same numbers.

**OpenF1 coverage starts in 2023, and `OPENF1_FIRST_YEAR` is the only place that number
lives.** Every ported result tool tries OpenF1 first and falls through to its
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
11-team grid renders as 10.

**`tests/conftest.py` blocks OpenF1 as well as FastF1, and the two differ on purpose.**
`_block_fastf1_network` raises `AssertionError` because no production path should swallow
one. `_block_openf1_network` raises `requests.ConnectionError` because the tools *do*
handle that — it is the FastF1 fallback — and that is what lets `test_fastf1_tools.py`
keep testing the FastF1 path unedited. The consequence is that the fallback is the
default under test, so `test_openf1_tools.py` asserts the OpenF1 request is genuinely
made rather than silently fallen through.

**`gltf.scene.clone()` must stay inside `useMemo`** — without it Three.js re-clones the scene on
every render.

**The 3D scene's `frameloop` is state, and `demand` is not the default for a reason.** `f1-hero-scene.tsx`
is reached from exactly one place — the teams page's Inspect modal — and the right rail deliberately
has no canvas, which is what keeps `three` / `@react-three/fiber` out of the page-load bundle. The
loop is `never` while `document.visibilityState` is not `visible`, `demand` under
`prefers-reduced-motion`, and `always` otherwise. Setting `demand` unconditionally looks like the
obvious optimisation and freezes the car: `RealCar`'s rotation and float run through `useFrame`,
which under `demand` fires only on invalidation. An `Invalidator` component sits inside the
`Canvas` for a narrower reason than it looks: R3F's reconciler already auto-invalidates on any
scene-graph mutation, so the Suspense swap when the GLB resolves needs no help. What actually
requires `Invalidator` is `RealCar`'s imperative `material.color.set(teamColor)`, which mutates an
existing Three.js object outside R3F's prop diffing and so is never auto-invalidated — without it,
a livery change under `demand` would show the wrong colour until the next invalidation. That
recolour call is dormant today, though: `f1-car-model.tsx`'s material filter matches names
containing `body`/`Body`/`paint`, but the committed GLB's materials are named `Livery`, `RearLight`,
`Wheels` and `WheelCovers`, so `bodyMaterials` is empty and `material.color.set()` never runs on
anything — `Invalidator` currently invalidates for a colour change that never happens, and becomes
load-bearing the moment that filter is fixed.

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
at 12px. If you add compound-coloured text, the first question is what is behind it; the second is
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

**The teams page's three columns appear at three different widths.** Left rail from `lg`, sticky
dossier from `xl`, mobile chip strip below `lg` — laptop widths get two columns on purpose. The
dossier is also *mounted* on a `matchMedia` check, not just `hidden xl:block`: inside a
`display: none` wrapper it still runs its `AnimatePresence` swap and instantiates a logo image on
every team change. Moving it to `xl` also means the per-section "Inspect in 3D" button is
`xl:hidden`, not `lg:hidden` — otherwise 1024–1279px gets no dossier *and* no way to reach the
inspector.

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
  page calls all three, and jsdom implements none of them. `matchMedia` reports no match, so
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