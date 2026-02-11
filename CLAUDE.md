# F1 Race Weekend Briefing Agent

AI-powered application that generates comprehensive F1 race weekend briefings. Users enter a Grand Prix name; a LangGraph agent gathers data from multiple sources (FastF1 telemetry, web news, weather) and synthesizes a structured briefing using Claude Sonnet 4.

## Tech Stack

**Backend** (Python 3.11+):
- FastAPI + Uvicorn (ASGI server)
- LangGraph for agent orchestration, LangChain + LangChain-Anthropic for LLM
- FastF1 for F1 telemetry/historical data (no API key needed)
- Tavily for web search, OpenWeather for forecasts
- SSE-Starlette for server-sent events streaming

**Frontend** (TypeScript):
- Next.js 14 (App Router) + React 18
- Three.js / @react-three/fiber / @react-three/drei for 3D F1 car visuals
- Tailwind CSS for styling
- react-markdown for briefing display

## Project Structure

```
backend/
  main.py              # FastAPI app init, CORS, env validation
  api/routes.py        # API endpoints (REST + SSE streaming)
  agent/
    graph.py           # LangGraph workflow: planner -> tool_executor -> synthesizer
    state.py           # TypedDict state definitions (AgentState, RaceInfo, ToolResult)
    prompts.py         # System prompts for planner and synthesizer LLM calls
  tools/
    fastf1_tools.py    # Track info, race results, driver form (FastF1 library)
    f1_data_tools.py   # Season standings, circuit winners, circuit info (FastF1)
    search_tools.py    # F1 news search (Tavily API)
    weather_tools.py   # Race location weather (OpenWeather API)
  requirements.txt     # Python deps
  env.example          # Required env vars template

frontend/
  app/
    page.tsx           # Home page with 3D hero + BriefingChat
    layout.tsx         # Root layout
  components/
    BriefingChat.tsx   # Main chat UI, handles streaming events
    BriefingCard.tsx   # Rendered markdown briefing display
    RaceSelector.tsx   # Quick-select buttons for upcoming races
    ToolTrace.tsx      # Shows which tools ran and their success/failure
    3d/                # Three.js 3D car components (dynamically imported)
  lib/api.ts           # API client: REST calls + SSE async generator
  package.json
```

## Commands

### Backend
```bash
cd backend
python -m venv venv && venv\Scripts\activate  # Windows
pip install -r requirements.txt
uvicorn main:app --reload --port 8000         # Dev server
python main.py                                 # Production (port 8000)
```

### Frontend
```bash
cd frontend
npm install
npm run dev    # Dev server on port 3000
npm run build  # Production build
npm run lint   # ESLint
```

### API Endpoints
- `POST /api/briefing` - Synchronous briefing generation
- `POST /api/briefing/stream` - SSE streaming briefing (used by frontend)
- `GET /api/races/{year}` - F1 calendar from FastF1
- `GET /api/health` - Health check

## Environment Variables

**Backend** (`backend/.env`, copy from `env.example`):
- `ANTHROPIC_API_KEY` - **Required**, fatal on missing (`backend/main.py:11`)
- `TAVILY_API_KEY` - Warning on missing, disables news search
- `OPENWEATHER_API_KEY` - Warning on missing, disables weather

**Frontend** (`frontend/.env.local`):
- `NEXT_PUBLIC_API_URL` - Backend URL, defaults to `http://localhost:8000` (`frontend/lib/api.ts:1`)

## Key Technical Details

- LLM model is `claude-sonnet-4-20250514` at temperature 0.7 (`backend/agent/graph.py:31`)
- Agent graph is a linear 3-node pipeline: planner -> tool_executor -> synthesizer (`backend/agent/graph.py:169-178`)
- Streaming runs the synchronous LangGraph agent in a ThreadPoolExecutor (max 4 workers) (`backend/api/routes.py:12,97`)
- 3D components use `next/dynamic` with `ssr: false` to avoid server-side Three.js errors (`frontend/app/page.tsx:4`)
- FastF1 caches data to `backend/cache/` directory; first requests are slow (`backend/main.py:29-32`)
- All tools return `{"error": "..."}` on failure instead of raising exceptions

## Additional Documentation

Check these files for deeper context on specific topics:

| File | When to consult |
|------|-----------------|
| `.claude/docs/architectural_patterns.md` | Modifying agent workflow, adding tools, changing API design, or frontend state |
