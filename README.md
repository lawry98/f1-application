# F1 Race Weekend Briefing Agent

An AI-powered F1 race weekend briefing generator that provides comprehensive pre-race analysis using Gemini. The agent gathers data from multiple sources and produces detailed briefings covering track info, championship context, driver form, news storylines, weather, and predictions.

## Features

- **Comprehensive Race Analysis**: Track profiles, recent results, circuit history
- **The right moment**: an upcoming race is briefed as of today; a race already run gets the pre-race briefing a reader saw before its weekend, with nothing after its first session ([ADR-0004](docs/adr/0004-past-races-brief-as-of-the-weekend.md))
- **AI-Powered Insights**: Gemini 3.6 Flash synthesizes data into expert-level briefings
- **Multi-Source Data**: race results and standings (OpenF1, FastF1), web search (Tavily), weather forecasts (OpenWeather)
- **Agent Transparency**: View the tool execution trace for each briefing
- **Real-time Streaming**: Server-Sent Events for live updates as the agent works, with the briefing prose filling in as the model writes it
- **Modern 3D UI**: Three.js F1 car visualization with team liveries
- **F1 Car Teardown**: Scroll-driven anatomy page — 192 frames reveal the car's internals as you scroll
- **Team Explorer**: All 11 teams for 2026 with liveries, driver line-ups, and a side-by-side comparison grid

## Tech Stack

### Backend
- **Python 3.12** with FastAPI + Uvicorn
- **LangGraph** for agent orchestration (4-node pipeline)
- **LangChain + Google Gemini** (`gemini-3.6-flash`)
- **FastF1** for schedules, circuit history and race results before 2023
- **OpenF1** for race results and derived standings, 2023 onward
- **Tavily API** for news search
- **OpenWeather API** for race location forecasts
- **SSE-Starlette** for server-sent events streaming

### Frontend
- **Next.js 16** (App Router, Turbopack) + React 19
- **TypeScript** (strict mode)
- **Three.js / @react-three/fiber** for 3D car visuals
- **Tailwind CSS** + **shadcn/ui** + **Magic UI** (vendored into `components/ui/`)
- **Motion** for animation
- **pnpm** package manager (versions pinned in `mise.toml`)

## Project Structure

```
f1-application/
├── backend/
│   ├── agent/        LangGraph workflow, TypedDict state, and LLM prompts
│   ├── tools/        Data-source modules — @tool functions plus plain helpers
│   ├── api/          FastAPI routes (REST + SSE) and Pydantic models
│   ├── config.py     Centralised env var config
│   ├── main.py       FastAPI app entry + startup
│   ├── tests/        pytest suite — no network, frozen clock
│   ├── requirements.txt
│   ├── requirements-dev.txt
│   └── env.example
├── frontend/
│   ├── app/          Next.js App Router — one directory per route
│   ├── components/
│   │   ├── landing/  Landing page sections
│   │   ├── briefing/ Briefing chat, card, tool trace, race selector
│   │   ├── teams/    Team explorer — hero, sections, comparison grid
│   │   ├── teardown/ Canvas scroll animation
│   │   ├── 3d/       Three.js car scenes (dynamically imported)
│   │   └── ui/       shadcn/ui + Magic UI components
│   ├── data/         Static team and driver data
│   ├── hooks/        Custom React hooks
│   ├── lib/          API client and utilities
│   ├── types/        Shared TypeScript types
│   ├── tests/        Vitest suite — jsdom, no network, real SSE fixtures
│   └── package.json
├── docs/agents/      Issue tracker, triage, and domain-doc conventions
├── Makefile          Cross-platform entry points — make dev, make ci
├── mise.toml         Pinned Node, pnpm, and Python versions
├── CLAUDE.md         Conventions and gotchas for AI coding agents
└── README.md
```

> Directory-level by design — a file-by-file tree goes stale the moment a file is added.
> Use `ls` for current contents.

## Setup

### Prerequisites

- Python 3.12 (pinned in `mise.toml`, matching CI)
- Node.js and pnpm — versions are pinned in `mise.toml`, so with
  [mise](https://mise.jdx.dev) installed, `mise install` gets you the right ones.
  Without mise: Node.js 18+ and pnpm 11.

### API Keys Required

1. **Google AI Studio API Key** (required, free tier): [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. **Tavily API Key** (optional, enables news): [tavily.com](https://tavily.com)
3. **OpenWeather API Key** (optional, enables weather): [openweathermap.org](https://openweathermap.org/api)

### Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv .venv
.venv\Scripts\activate         # Windows
source .venv/bin/activate      # Mac/Linux

# Install dependencies (add requirements-dev.txt for linting and tests)
pip install -r requirements.txt -r requirements-dev.txt

# Configure environment
cp env.example .env            # Mac/Linux
copy env.example .env          # Windows
# Edit .env and add your API keys

# Start the server
uvicorn main:app --reload --port 8000
```

Backend runs on `http://localhost:8000`.

### Frontend Setup

```bash
cd frontend

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

Frontend runs on `http://localhost:3000`.

Two internal surfaces are off unless asked for: the API docs (`/docs`, `/redoc`,
`/openapi.json`) need `EXPOSE_API_DOCS=1` on the backend, and the `/candy` styleguide needs
`ENABLE_INTERNAL_ROUTES=1` on the frontend. `make dev` sets both; with the commands above,
prefix them (`EXPOSE_API_DOCS=1 uvicorn …`, `ENABLE_INTERNAL_ROUTES=1 pnpm dev`).

### Or use the Makefile

`make dev` does both setups above and starts both servers. Run `make` on its own for the
full target list.

| Target | Does |
|---|---|
| `make dev` | Both servers — backend on `:8000`, frontend on `:3000`, with the internal surfaces on |
| `make backend` / `make frontend` | One server |
| `make install` | `.venv` + `requirements*.txt`, then `pnpm install` |
| `make lint` `make format` `make typecheck` `make test` | Checks, both platforms |
| `make ci` | Everything [ci.yml](.github/workflows/ci.yml) runs, in its order |
| `make clean` | Drops `.venv`, `node_modules`, `.next` — leaves the FastF1 cache |

Dependency installs are keyed to `requirements*.txt` and `pnpm-lock.yaml`, so they re-run
only when those change. Every recipe shells through `mise exec --` when mise is available,
so the pinned versions apply without activating anything. Windows needs `make` from Git Bash
or WSL; it is not part of the OS.

### Frontend Environment (optional)

Create `frontend/.env.local` to override the backend URL, or the site origin used for share
images and the sitemap (see [Deploying it](#cost-guard-and-deploying)):

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

## Agent Architecture

The agent uses a 4-node LangGraph pipeline. The resolver sits behind a conditional edge: if it
cannot identify the race, the run short-circuits to `END` and no briefing is produced.

```
INPUT ("Monaco GP 2025")
        │
        ▼
┌───────────────┐
│   RESOLVER    │  Event → track (by location) → as_of cutoff → race_info
└───────┬───────┘
        │
        ├────────────► END   (resolution failed)
        ▼
┌───────────────┐
│   PLANNER     │  Pick tools; a past race drops weather and news
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ TOOL EXECUTOR │  Execute tools in parallel:
│               │  - get_track_info             (FastF1)
│               │  - get_recent_race_results    (OpenF1; FastF1 before 2023)
│               │  - get_driver_form            (every driver, last 5 GPs; OpenF1; FastF1 before 2023)
│               │  - get_recent_top_finishers   (OpenF1; FastF1 before 2023)
│               │  - get_championship_standings (OpenF1, 2023 onward)
│               │  - get_circuit_winners        (FastF1)
│               │  - search_f1_news             (Tavily)
│               │  - get_race_weather           (OpenWeather)
└───────┬───────┘
        │
        ▼
┌───────────────┐
│  SYNTHESIZER  │  Combine all data into structured briefing via Gemini
└───────┬───────┘
        │
        ▼
OUTPUT (Race Briefing)
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/briefing/stream` | POST | SSE streaming briefing (used by frontend). Behind the cost guard: 429/503 before the stream opens |
| `/api/races/{year}` | GET | F1 calendar from FastF1, with each event's format and official name |
| `/api/standings/{year}` | GET | Driver and constructor championship tables, derived from OpenF1 (2023 onwards) |
| `/api/circuits/{circuit_id}/winners` | GET | Recent winners at one circuit (the three seasons before this one), matched by circuit; ~5s cold, cached after |
| `/api/health` | GET | Health check |

### Frontend Routes

| Route | Description |
|-------|-------------|
| `/` | Landing page — features overview and entry point |
| `/briefing` | AI race weekend briefing chat |
| `/teardown` | Scroll-driven F1 car anatomy (192-frame canvas animation) |
| `/showcase` | Interactive 3D car with all 11 team liveries |
| `/standings` | Drivers' and constructors' championship tables for every season since 2023, with a season picker |
| `/teams` | 2026 team explorer — liveries, driver line-ups, comparison grid |
| `/circuits` | Every round of a season's calendar with its track outline, with a season picker |
| `/circuits/[slug]` | One circuit's facts, calendar row and recent winners |
| `/credits` | Credits & attributions |

### Example: Generate Briefing

```bash
curl -N -X POST http://localhost:8000/api/briefing/stream -H 'Content-Type: application/json' -d '{"query":"Monaco"}'
```

## Development Commands

### Backend

```bash
cd backend
uvicorn main:app --reload --port 8000   # Dev server
ruff check .                             # Lint
ruff format .                            # Format
pytest                                   # Tests (no network; ~7s)
```

Tests live in `backend/tests/` and never touch the network — every external boundary is
faked and the clock is frozen. Run them from `backend/`.

### Frontend

```bash
cd frontend
pnpm dev        # Dev server
pnpm build      # Production build
pnpm typecheck  # TypeScript check
pnpm lint       # ESLint
pnpm test       # Vitest (jsdom, no network)
pnpm test:watch # Vitest in watch mode
pnpm format     # Prettier
```

Frontend tests live in `frontend/tests/`. They cover the SSE client, the `useBriefing`
hook and the briefing card; `fetch` is replaced in every test that reaches the API client,
so nothing touches the network. The `.sse` fixtures are real bytes captured from the
FastAPI route — regenerate them with `cd backend && python scripts/dump_sse_fixtures.py`
after any change to the SSE contract.

## Important Notes

### Caching
Two caches exist, and only one of them speeds anything up.

- **`backend/cache/` does nothing.** FastF1 only persists a session that loaded cleanly, and
  these loads never do, so the directory (gitignored) stays empty of `.ff1pkl` files. Cold and
  warm measure the same. A briefing is slow because of upstream API latency, not cold-cache
  telemetry downloads — so there is no point warming it.
- **The tool result cache is what makes a repeat briefing fast.** The six historical tools
  are cached in-process across requests, taking the gathering stage from ~15s to well under a
  second on a second briefing for the same race. Weather and news are never cached. The result
  tools take the briefing's `as_of` cutoff, which is the key's only date: an upcoming race's
  rolls over daily, a past race's never changes. See
  [ADR-0003](docs/adr/0003-cache-tool-results-across-requests.md) and
  [ADR-0004](docs/adr/0004-past-races-brief-as-of-the-weekend.md).

Total request time drops less than you might expect: once gathering is cached, LLM synthesis
dominates the wall clock.

### Tool Error Handling
- All tools return `{"error": "message"}` instead of raising exceptions
- The agent gracefully handles missing data and continues with available info

### Streaming Architecture
- The backend iterates the LangGraph agent's `astream()` directly — no thread bridge. LangGraph
  runs the synchronous nodes on worker threads itself, so the event loop stays free
- Each SSE event is emitted the moment its node returns, while the rest of the run is still
  going — except `briefing_delta`, which the synthesizer emits *during* its own run, one per
  chunk of prose the model produces, and `tool_result`, which `tool_executor_node` emits
  per tool as each one completes inside the node's collection loop
- `tool_result` carries `cached`, saying whether that tool's payload came from the result cache
  or a live fetch. Nothing in the UI renders it yet — the field exists so the transport stays
  honest about provenance
- Frontend consumes the typed `AsyncGenerator<StreamEvent>` from `lib/api.ts`, buffering deltas
  and repainting on an 80ms timer rather than once per delta
- A synthesis that dies partway still delivers the prose it wrote, marked as unfinished — see
  [ADR-0002](docs/adr/0002-serve-truncated-briefings.md)

### Cost guard and deploying

Every briefing is two to four Gemini calls (the planner's two attempts, the synthesizer's one
503 retry), so the briefing stream sits behind an admission guard
(`backend/api/guard.py`). Before any work starts it checks, in order:

| Check | Default | Refusal |
|---|---|---|
| Per client IP, rolling hour | `BRIEFING_PER_IP_PER_HOUR=5` | `429 {"code": "rate_limited", ...}` |
| Global, per day in `BRIEFING_DAY_TZ` (`0` = no cap) | `BRIEFING_DAILY_CAP=100` | `503 {"code": "daily_cap", ...}` |
| Simultaneous generations (never queued) | `BRIEFING_MAX_CONCURRENT=2` | `503 {"code": "busy", ...}` |

Each refusal carries `retry_after_seconds`, the `limit` that was hit and a `Retry-After` header;
only an admitted request counts against a limit. An admitted run is stopped at
`BRIEFING_DEADLINE_SECONDS` (90): the tool fan-out and the synthesizer stop spending, prose
already written is served as a truncated briefing, and with none the stream ends with
`error {"code": "deadline"}`. Gemini calls themselves time out per read: the planner's at 15s
with one retry, the synthesizer's at 30s with one retry for a 503 only, taken only while the run
has time for another read — the arithmetic is in `backend/config.py`.

Deploying it, on any host (this repo's own Fly and Vercel setup is under
[Deployment](#deployment)):

- **Run exactly one worker.** The limits live in the process's memory, so two workers would each
  allow the full limits, and a restart resets the day's count.
- **Set `BRIEFING_DAY_TZ` to the IANA zone your LLM quota resets in.** The daily cap's day starts
  at midnight there, UTC by default. Gemini's free tier resets at midnight Pacific, so `fly.toml`
  sets `America/Los_Angeles`; counted on UTC days, one quota day would span two of the guard's,
  and up to twice the cap could land in it.
- **Behind a proxy, set `CLIENT_IP_HEADER` to the header it writes the visitor's address into.**
  The guard keys on `request.client.host` and never parses `X-Forwarded-For` itself, because
  anyone can send one. `CLIENT_IP_HEADER=Fly-Client-IP`, which `fly.toml` sets, makes
  `client.host` the address in that one header. Name only a header your proxy sets and
  overwrites: one it passes through is one a visitor can forge.

  With no such header, uvicorn can rewrite the address itself, given the proxy's exact address:

  ```bash
  FORWARDED_ALLOW_IPS=<your proxy's exact address> uvicorn main:app --workers 1 --proxy-headers --port 8000
  ```

  Never `FORWARDED_ALLOW_IPS='*'`. uvicorn then takes the leftmost `X-Forwarded-For` entry, the
  one the visitor writes, so every forged header is a fresh hourly allowance. The production image
  runs with `--no-proxy-headers`, so this form is only for running uvicorn yourself. With neither,
  every visitor shares the proxy's address, and so its one hourly allowance.
- **Leave `EXPOSE_API_DOCS` and `ENABLE_INTERNAL_ROUTES` unset.** Off is the default: the API
  docs 404 and `/candy` is the not-found page.
- **Set `CORS_ORIGINS`** to the deployed frontend. The API exposes `Retry-After` to it, so the
  page can read a refusal cross-origin.
- **Set `NEXT_PUBLIC_SITE_URL`** to the frontend's public origin, with no path, **before
  `pnpm build`** — Next inlines it at build time:

  ```bash
  NEXT_PUBLIC_SITE_URL=https://f1.example.com pnpm build
  ```

  Every `og:image`, `twitter:image`, the sitemap and robots.txt are absolute URLs on that origin.
  Without it they point at `http://localhost:3000`, so shared links preview with no image, and
  the build prints a warning saying so.

### Working on this with an AI agent

[CLAUDE.md](CLAUDE.md) holds the conventions, invariants, and traps that aren't obvious from
reading the code. Setup and orientation stay here; agent-facing rules live there.

## Deployment

```
browser ──HTML/JS──▶ <project>.vercel.app    Vercel Hobby, frontend/, built from main
   └────fetch/SSE──▶ <app>.fly.dev            Fly, 1 machine, iad, always on
                         └─▶ Gemini · OpenF1 · FastF1 · Tavily · OpenWeather
```

`<app>` is `f1-race-briefing-api` and `<project>` is `f1-race-briefing`. If either name was taken
at setup, `fly.toml`'s `app` and `CORS_ORIGINS` hold the real ones. The browser calls the API
itself, so the API is public, `CORS_ORIGINS` names the Vercel origin, and the API's URL is baked
into the frontend at build time. The backend is one machine running one worker, because the cost
guard's limits live in that process;
[ADR-0005](docs/adr/0005-deploy-on-fly-and-vercel.md) has the reasoning and the alternatives.

| Part | Plan | Cost |
|---|---|---|
| API | Fly.io `shared-cpu-1x`, 512 MB, `iad`, always on | $3.69 per 30 days, plus $0.02/GB outbound. No free tier; Fly needs a card on file |
| Frontend | Vercel Hobby | Free, for non-commercial use only |
| Gemini | Free tier, the same key as local development | Free. `BRIEFING_DAILY_CAP=8` per Pacific day, the day the quota counts: 16 of the ~20 daily calls at two a briefing, leaving local work the rest, and up to 32 if every briefing takes both retries. Google's quota is the hard stop |

### Set it up

Merge to `main` first, because `.github/workflows/deploy.yml` cannot run from any other branch.
Then, from the repo root on an up-to-date `main`:

```bash
scripts/deploy-wizard.sh
```

[The wizard](scripts/deploy-wizard.sh) walks through the steps only the owner can take: the Fly
account and card, the app, the API keys, the first `fly deploy --ha=false`, the Vercel import and
the deploy token. It runs the post-deploy checks as it goes, including that a forged
`Fly-Client-IP` never reaches the guard, and asks you to confirm the dashboard checks it cannot
make itself. The keys go from a `backend/.env` straight into `fly secrets import`, and the token
straight into `gh secret set`; neither is shown or saved. It keeps only the app name and the
Vercel origin, in the gitignored `.env.deploy.local`, so a re-run picks up where the last one
stopped. If either name was taken, it rewrites `fly.toml` and holds the token back until that
change is merged. The last stage is optional: one real briefing, 2 Gemini calls (4 at most), to
check that the stream arrives progressively and how much memory the machine used.

Until the wizard has set the `FLY_API_TOKEN` repository secret, every "Deploy backend" run ends
green with a "Deploy skipped" notice and deploys nothing.

### Redeploy

- **Backend:** merge to `main`. Once CI passes, "Deploy backend" deploys the exact commit CI
  passed. Every merge redeploys, frontend-only ones too, and each restart resets the guard's day.
  To redeploy `main` without a merge, run `gh workflow run deploy.yml`. By hand, from the repo
  root, it is `fly deploy --ha=false`, and always with `--ha=false`: an app left with no machine
  would come back with two. Both skip the CI gate and deploy whatever they are given, so check
  that `main` is green first.
- **Frontend:** Vercel builds every push to `main` by itself. No other branch deploys. Previews
  are off, because a preview's origin is not in `CORS_ORIGINS`.
- **The deploy token lasts a year**, and the deploy job fails once it expires. Re-run
  `scripts/deploy-wizard.sh`; stage 10 replaces the token. By hand, in one guarded line:
  `t=$(fly tokens create deploy -a <app> -x 8760h) && [[ $t == "FlyV1 "* ]] && printf %s "$t" | gh secret set FLY_API_TOKEN -R lawry98/f1-application; unset t`.
  Piping `fly` straight into `gh` would set an empty secret if `fly` fails (a mistyped app, an
  expired login), and an empty secret makes every deploy skip green. `-R` is needed because the
  `origin` remote is an SSH alias, which `gh` cannot read a repository from.

### Change a URL

The URLs are set on both platforms, and each platform picks up a change differently:

- **`NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SITE_URL`** are Vercel Production environment
  variables. Next inlines them at build time, so the live site keeps the old value until you
  redeploy production, with "Use existing Build Cache" unticked.
- **`CORS_ORIGINS`** is in `fly.toml`'s `[env]`. Change it there and merge to `main`, and the
  deploy ships it. Until it names the frontend's origin, every API call from the site fails in the
  browser.

A custom domain takes both: the new origin goes into `NEXT_PUBLIC_SITE_URL` and `CORS_ORIGINS`.

### Run the production image locally

| Target | Does |
|---|---|
| `make docker` | Builds the image with CI's command and runs it on `localhost:8080` with `backend/.env`. Point the frontend at it with `NEXT_PUBLIC_API_URL=http://localhost:8080` |
| `make docker-check` | Builds it and runs CI's container checks (`scripts/container-smoke.sh`) with a dummy key; nothing reaches Gemini |

Both need a running Docker daemon, and so does `make ci`, which includes `docker-check`. The
image is about 932 MB on disk, since FastF1 pulls in scipy, matplotlib and pandas.
`docker run --env-file` takes values literally, so a value quoted in `backend/.env` reaches the
app with its quotes. `make dev` strips them, so a key that works there can fail in the container.

## Troubleshooting

**`"GOOGLE_API_KEY not configured"`**
- Ensure `backend/.env` exists and contains a valid Google AI Studio key
- Get one free at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

**`"Failed to fetch races"`**
- Ensure the backend is running on port 8000
- The season schedule is fetched from the F1 API on demand; a slow or unreachable upstream
  surfaces here

**`"No event found for circuit"`**
- Try the official Grand Prix name (e.g., "Monaco Grand Prix" not "Monte Carlo")
- Check `backend/tools/race_resolver.py` for the circuit name resolution logic

**Slow first requests**
- Expected: the tools fetch from the F1 API, and that latency is the cost. Warming
  `backend/cache/` will not help — see [Caching](#caching). A second briefing for the *same*
  race is much faster, because the tool results are cached in process.

## Credits

- **Gemini 3.6 Flash** by Google — AI reasoning and synthesis
- **FastF1** — Python library for F1 telemetry data
- **Tavily** — Web search API
- **OpenWeather** — Weather forecast API
- **shadcn/ui** — UI component library
- **Magic UI** — Animation components
- **Three.js / React Three Fiber** — 3D rendering
- **3D Model**: "F1 2026 Release Car" by Nimaxo, licensed under CC BY 4.0 (https://skfb.ly/oWL8J)
