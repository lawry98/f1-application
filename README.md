# F1 Race Weekend Briefing Agent

An AI-powered F1 race weekend briefing generator that provides comprehensive pre-race analysis using Claude AI. The agent gathers data from multiple sources and produces detailed briefings covering track info, championship context, driver form, news storylines, weather, and predictions.

## Features

- **Comprehensive Race Analysis**: Track profiles, recent results, circuit history
- **AI-Powered Insights**: Gemini 3.6 Flash synthesizes data into expert-level briefings
- **Multi-Source Data**: FastF1 telemetry, web search (Tavily), weather forecasts (OpenWeather)
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
- **FastF1** for F1 telemetry and session data
- **Tavily API** for news search
- **OpenWeather API** for race location forecasts
- **SSE-Starlette** for server-sent events streaming

### Frontend
- **Next.js 14** (App Router) + React 18
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

### Or use the Makefile

`make dev` does both setups above and starts both servers. Run `make` on its own for the
full target list.

| Target | Does |
|---|---|
| `make dev` | Both servers — backend on `:8000`, frontend on `:3000` |
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

Create `frontend/.env.local` to override the backend URL:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Agent Architecture

The agent uses a 4-node LangGraph pipeline. The resolver sits behind a conditional edge: if it
cannot identify the race, the run short-circuits to `END` and no briefing is produced.

```
INPUT ("Monaco GP 2025")
        │
        ▼
┌───────────────┐
│   RESOLVER    │  Identify circuit → fetch FastF1 schedule → set race_info
└───────┬───────┘
        │
        ├────────────► END   (resolution failed)
        ▼
┌───────────────┐
│   PLANNER     │  Decide which tools to call based on race_info
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ TOOL EXECUTOR │  Execute tools in parallel:
│               │  - get_track_info           (FastF1)
│               │  - get_recent_race_results  (FastF1)
│               │  - get_driver_form          (FastF1)
│               │  - get_recent_top_finishers (FastF1)
│               │  - get_circuit_winners      (FastF1)
│               │  - search_f1_news           (Tavily)
│               │  - get_race_weather         (OpenWeather)
└───────┬───────┘
        │
        ▼
┌───────────────┐
│  SYNTHESIZER  │  Combine all data into structured briefing via Claude
└───────┬───────┘
        │
        ▼
OUTPUT (Race Briefing)
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/briefing` | POST | Synchronous briefing generation |
| `/api/briefing/stream` | POST | SSE streaming briefing (used by frontend) |
| `/api/races/{year}` | GET | F1 calendar from FastF1 |
| `/api/health` | GET | Health check |

### Frontend Routes

| Route | Description |
|-------|-------------|
| `/` | Landing page — features overview and entry point |
| `/briefing` | AI race weekend briefing chat |
| `/teardown` | Scroll-driven F1 car anatomy (192-frame canvas animation) |
| `/showcase` | Interactive 3D car with all 11 team liveries |
| `/teams` | 2026 team explorer — liveries, driver line-ups, comparison grid |
| `/credits` | Credits & attributions |

### Example: Generate Briefing

```bash
curl -X POST http://localhost:8000/api/briefing \
  -H "Content-Type: application/json" \
  -d '{"query": "Monaco GP 2025"}'
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
- **The tool result cache is what makes a repeat briefing fast.** The five historical FastF1
  tools are cached in-process across requests, taking the gathering stage from ~15s to well
  under a second on a second briefing for the same race. Weather and news are never cached, and
  the three tools that answer date-relative questions key on the date. See
  [ADR-0003](docs/adr/0003-cache-tool-results-across-requests.md).

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
  per tool as each one completes inside the node's `as_completed` loop
- `tool_result` carries `cached`, saying whether that tool's payload came from the result cache
  or a live fetch. Nothing in the UI renders it yet — the field exists so the transport stays
  honest about provenance
- Frontend consumes the typed `AsyncGenerator<StreamEvent>` from `lib/api.ts`, buffering deltas
  and repainting on an 80ms timer rather than once per delta
- A synthesis that dies partway still delivers the prose it wrote, marked as unfinished — see
  [ADR-0002](docs/adr/0002-serve-truncated-briefings.md)

### Working on this with an AI agent

[CLAUDE.md](CLAUDE.md) holds the conventions, invariants, and traps that aren't obvious from
reading the code. Setup and orientation stay here; agent-facing rules live there.

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
