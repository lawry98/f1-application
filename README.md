# F1 Race Weekend Briefing Agent

An AI-powered F1 race weekend briefing generator that provides comprehensive pre-race analysis using Claude AI. The agent gathers data from multiple sources and produces detailed briefings covering track info, championship context, driver form, news storylines, weather, and predictions.

## Features

- **Comprehensive Race Analysis**: Track profiles, championship standings, circuit history
- **AI-Powered Insights**: Claude Sonnet 4 synthesizes data into expert-level briefings
- **Multi-Source Data**: FastF1 telemetry, web search (Tavily), weather forecasts (OpenWeather)
- **Agent Transparency**: View the tool execution trace for each briefing
- **Real-time Streaming**: Server-Sent Events for live updates as the agent works
- **Modern 3D UI**: Three.js F1 car visualization with team liveries
- **F1 Car Teardown**: Scroll-driven anatomy page — 192 frames reveal the car's internals as you scroll

## Tech Stack

### Backend
- **Python 3.11+** with FastAPI + Uvicorn
- **LangGraph** for agent orchestration (4-node pipeline)
- **LangChain + Anthropic Claude** (`claude-sonnet-4-20250514`)
- **FastF1** for F1 telemetry and session data
- **Tavily API** for news search
- **OpenWeather API** for race location forecasts
- **SSE-Starlette** for server-sent events streaming

### Frontend
- **Next.js 14** (App Router) + React 18
- **TypeScript** (strict mode)
- **Three.js / @react-three/fiber / @react-three/drei** for 3D car visuals
- **Tailwind CSS** + **shadcn/ui** + **Magic UI**
- **pnpm** package manager

## Project Structure

```
f1-application/
├── backend/
│   ├── agent/
│   │   ├── state.py          # AgentState, RaceInfo, ToolResult TypedDicts
│   │   ├── graph.py          # LangGraph 4-node workflow
│   │   └── prompts.py        # System prompts for planner and synthesizer
│   ├── tools/
│   │   ├── fastf1_tools.py   # Track info, race results, driver form (FastF1)
│   │   ├── f1_data_tools.py  # Season standings, circuit winners (FastF1)
│   │   ├── search_tools.py   # F1 news search (Tavily)
│   │   └── weather_tools.py  # Race location weather (OpenWeather)
│   ├── api/
│   │   ├── routes.py         # FastAPI endpoints (REST + SSE streaming)
│   │   └── models.py         # Pydantic request/response models
│   ├── config.py             # Centralised env var config
│   ├── main.py               # FastAPI app entry + startup
│   ├── requirements.txt
│   └── env.example
├── frontend/
│   ├── app/
│   │   ├── page.tsx          # Landing page (CSS hero + features + CTA)
│   │   ├── layout.tsx        # Root layout + metadata
│   │   ├── loading.tsx       # Route loading skeleton
│   │   ├── error.tsx         # Route error boundary
│   │   ├── not-found.tsx     # 404 page
│   │   ├── briefing/         # AI race weekend briefing chat
│   │   ├── credits/          # Credits & attributions
│   │   ├── showcase/         # Interactive 3D team livery showcase
│   │   └── teardown/         # Scroll-driven F1 car anatomy teardown
│   ├── components/
│   │   ├── briefing/         # BriefingChat, BriefingCard, ToolTrace, RaceSelector
│   │   ├── teardown/         # TeardownScene (canvas scroll animation)
│   │   ├── ui/               # shadcn/ui + Magic UI components
│   │   └── 3d/               # Three.js car components (F1HeroScene, F1CarShowcase)
│   ├── hooks/
│   │   └── use-briefing.ts   # useBriefing hook (streaming state management)
│   ├── lib/
│   │   ├── api.ts            # API client (REST + typed SSE generator)
│   │   ├── constants.ts      # Shared constants
│   │   └── utils.ts          # cn() utility
│   ├── types/
│   │   ├── f1.ts             # F1 domain types (RaceInfo, Race, ToolResult)
│   │   └── api.ts            # StreamEvent discriminated union, BriefingResponse
│   └── package.json
└── README.md
```

## Setup

### Prerequisites

- Python 3.11+
- Node.js 18+ with pnpm (`npm install -g pnpm`)

### API Keys Required

1. **Anthropic API Key** (required): [console.anthropic.com](https://console.anthropic.com)
2. **Tavily API Key** (optional, enables news): [tavily.com](https://tavily.com)
3. **OpenWeather API Key** (optional, enables weather): [openweathermap.org](https://openweathermap.org/api)

### Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
venv\Scripts\activate          # Windows
source venv/bin/activate       # Mac/Linux

# Install dependencies
pip install -r requirements.txt

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

The agent uses a 4-node LangGraph pipeline:

```
INPUT ("Monaco GP 2025")
        │
        ▼
┌───────────────┐
│   RESOLVER    │  Identify circuit → fetch FastF1 schedule → set race_info
└───────┬───────┘
        │
        ▼
┌───────────────┐
│   PLANNER     │  Decide which tools to call based on race_info
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ TOOL EXECUTOR │  Execute tools in parallel:
│               │  - get_track_info         (FastF1)
│               │  - get_last_race_results  (FastF1)
│               │  - get_driver_form        (FastF1)
│               │  - get_season_standings   (FastF1)
│               │  - get_circuit_winners    (FastF1)
│               │  - search_f1_news         (Tavily)
│               │  - get_weather_forecast   (OpenWeather)
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
```

### Frontend

```bash
cd frontend
pnpm dev          # Dev server
pnpm build        # Production build
pnpm typecheck    # TypeScript check
pnpm lint         # ESLint
pnpm format       # Prettier
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

## Troubleshooting

**`"ANTHROPIC_API_KEY not configured"`**
- Ensure `backend/.env` exists and contains a valid key starting with `sk-ant-`

**`"Failed to fetch races"`**
- Ensure the backend is running on port 8000
- FastF1 may be downloading data on first request (can take 30–60 seconds)

**`"No event found for circuit"`**
- Try the official Grand Prix name (e.g., "Monaco Grand Prix" not "Monte Carlo")
- Check `backend/agent/prompts.py` for the circuit name resolution logic

**Slow first requests**
- FastF1 downloads telemetry on first use; cache is populated after the first run

## Credits

- **Claude Sonnet 4** by Anthropic — AI reasoning and synthesis
- **FastF1** — Python library for F1 telemetry data
- **Tavily** — Web search API
- **OpenWeather** — Weather forecast API
- **shadcn/ui** — UI component library
- **Magic UI** — Animation components
- **Three.js / React Three Fiber** — 3D rendering
- **3D Model**: "F1 2026 Release Car" by Nimaxo, licensed under CC BY 4.0 (https://skfb.ly/oWL8J)
