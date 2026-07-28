# F1 Race Weekend Briefing Agent

An AI-powered F1 race weekend briefing generator that provides comprehensive pre-race analysis using Claude AI. The agent gathers data from multiple sources and produces detailed briefings covering track info, championship context, driver form, news storylines, weather, and predictions.

## Features

- **Comprehensive Race Analysis**: Track profiles, championship standings, circuit history
- **AI-Powered Insights**: Gemini 3.6 Flash synthesizes data into expert-level briefings
- **Multi-Source Data**: FastF1 telemetry, web search (Tavily), weather forecasts (OpenWeather)
- **Agent Transparency**: View the tool execution trace for each briefing
- **Real-time Streaming**: Server-Sent Events for live updates as the agent works
- **Modern 3D UI**: Three.js F1 car visualization with team liveries
- **F1 Car Teardown**: Scroll-driven anatomy page — 192 frames reveal the car's internals as you scroll
- **Team Explorer**: All 10 teams for 2026 with liveries, driver line-ups, and a side-by-side comparison grid

## Tech Stack

### Backend
- **Python 3.11+** with FastAPI + Uvicorn
- **LangGraph** for agent orchestration (4-node pipeline)
- **LangChain + Google Gemini** (`gemini-3.6-flash`)
- **FastF1** for F1 telemetry and session data
- **Tavily API** for news search
- **OpenWeather API** for race location forecasts
- **SSE-Starlette** for server-sent events streaming

### Frontend
- **Next.js 14** (App Router) + React 18
- **TypeScript** (strict mode)
- **Three.js / @react-three/fiber / @react-three/drei** for 3D car visuals
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
│   ├── lib/          API client, constants, utilities
│   ├── types/        Shared TypeScript types
│   └── package.json
├── docs/agents/      Issue tracker, triage, and domain-doc conventions
├── mise.toml         Pinned Node and pnpm versions
├── CLAUDE.md         Conventions and gotchas for AI coding agents
└── README.md
```

> Directory-level by design — a file-by-file tree goes stale the moment a file is added.
> Use `ls` for current contents.

## Setup

### Prerequisites

- Python 3.11+
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
python -m venv venv
venv\Scripts\activate          # Windows
source venv/bin/activate       # Mac/Linux

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
│               │  - get_season_standings     (FastF1)
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
| `/showcase` | Interactive 3D car with all 10 team liveries |
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
pnpm format     # Prettier
```

## Important Notes

### FastF1 Caching
- First requests are slow (FastF1 downloads telemetry data)
- Subsequent requests are fast (data cached in `backend/cache/`)
- Cache directory is in `.gitignore`

### Tool Error Handling
- All tools return `{"error": "message"}` instead of raising exceptions
- The agent gracefully handles missing data and continues with available info

### Streaming Architecture
- The backend runs the synchronous LangGraph agent in a `ThreadPoolExecutor`
- Events are emitted over SSE as each node completes
- Frontend consumes the typed `AsyncGenerator<StreamEvent>` from `lib/api.ts`

### Working on this with an AI agent

[CLAUDE.md](CLAUDE.md) holds the conventions, invariants, and traps that aren't obvious from
reading the code. Setup and orientation stay here; agent-facing rules live there.

## Troubleshooting

**`"GOOGLE_API_KEY not configured"`**
- Ensure `backend/.env` exists and contains a valid Google AI Studio key
- Get one free at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

**`"Failed to fetch races"`**
- Ensure the backend is running on port 8000
- FastF1 may be downloading data on first request (can take 30–60 seconds)

**`"No event found for circuit"`**
- Try the official Grand Prix name (e.g., "Monaco Grand Prix" not "Monte Carlo")
- Check `backend/tools/race_resolver.py` for the circuit name resolution logic

**Slow first requests**
- FastF1 downloads telemetry on first use; cache is populated after the first run

## Credits

- **Gemini 3.6 Flash** by Google — AI reasoning and synthesis
- **FastF1** — Python library for F1 telemetry data
- **Tavily** — Web search API
- **OpenWeather** — Weather forecast API
- **shadcn/ui** — UI component library
- **Magic UI** — Animation components
- **Three.js / React Three Fiber** — 3D rendering
- **3D Model**: "F1 2026 Release Car" by Nimaxo, licensed under CC BY 4.0 (https://skfb.ly/oWL8J)
