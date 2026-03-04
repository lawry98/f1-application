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
- Tailwind CSS + shadcn/ui + Magic UI for styling
- react-markdown for briefing display
- pnpm as package manager

## Project Structure

```
backend/
  main.py              # FastAPI app init, CORS, env validation
  config.py            # Centralised env vars (ANTHROPIC_API_KEY, LLM_MODEL, etc.)
  api/
    routes.py          # API endpoints (REST + SSE streaming)
    models.py          # Pydantic request/response models (BriefingRequest, etc.)
  agent/
    graph.py           # LangGraph workflow: resolver -> planner -> tool_executor -> synthesizer
    state.py           # TypedDict state definitions (AgentState, RaceInfo, ToolResult)
    prompts.py         # System prompts for planner and synthesizer LLM calls
  tools/
    fastf1_tools.py    # Track info, race results, driver form (FastF1 library)
    f1_data_tools.py   # Season standings, circuit winners (FastF1)
    search_tools.py    # F1 news search (Tavily API)
    weather_tools.py   # Race location weather (OpenWeather API)
    schedule_cache.py  # FastF1 schedule caching layer
  requirements.txt     # Pinned Python deps
  pyproject.toml       # Ruff linter config
  env.example          # Required env vars template

frontend/
  app/
    page.tsx           # Home page with 3D hero + BriefingChat + DotPattern
    layout.tsx         # Root layout with full metadata/OG tags
    loading.tsx        # Route-level loading skeleton
    error.tsx          # Route-level error boundary
    not-found.tsx      # 404 page
    credits/page.tsx   # Credits & attributions
    showcase/page.tsx  # Interactive 3D team livery showcase
    teardown/page.tsx  # Scroll-driven F1 car anatomy teardown (/teardown)
  components/
    briefing/
      briefing-chat.tsx    # Main chat UI (uses useBriefing hook)
      briefing-card.tsx    # Rendered markdown briefing (shadcn Card + BlurFade)
      race-selector.tsx    # Quick-select race buttons (shadcn Button + Skeleton)
      tool-trace.tsx       # Tool execution trace (shadcn Badge)
    teardown/
      teardown-scene.tsx   # Scroll-driven frame animation (canvas + rAF, ssr: false)
    ui/                    # shadcn/ui + Magic UI components (Button, Card, Badge, etc.)
    3d/                    # Three.js 3D car components (dynamically imported, ssr: false)
  hooks/
    use-briefing.ts    # useBriefing hook: streaming state, submit handler
  lib/
    api.ts             # Typed API client: REST calls + SSE AsyncGenerator<StreamEvent>
    constants.ts       # F1_RED, F1_DARK_BG, STEP_LABELS
    utils.ts           # cn() tailwind utility
  types/
    f1.ts              # RaceInfo, Race, ToolResult interfaces
    api.ts             # StreamEvent discriminated union, BriefingResponse
  package.json
```

## Commands

### Backend
```bash
cd backend
python -m venv venv && venv\Scripts\activate  # Windows
pip install -r requirements.txt
uvicorn main:app --reload --port 8000         # Dev server
ruff check .                                   # Lint
ruff format .                                  # Format
```

### Frontend
```bash
cd frontend
pnpm install
pnpm dev          # Dev server on port 3000
pnpm build        # Production build
pnpm typecheck    # TypeScript check (tsc --noEmit)
pnpm lint         # ESLint
pnpm format       # Prettier
```

### API Endpoints
- `POST /api/briefing` - Synchronous briefing generation
- `POST /api/briefing/stream` - SSE streaming briefing (used by frontend)
- `GET /api/races/{year}` - F1 calendar from FastF1
- `GET /api/health` - Health check

## Environment Variables

**Backend** (`backend/.env`, copy from `env.example`):
- `ANTHROPIC_API_KEY` - **Required**, fatal on missing
- `TAVILY_API_KEY` - Warning on missing, disables news search
- `OPENWEATHER_API_KEY` - Warning on missing, disables weather

**Frontend** (`frontend/.env.local`):
- `NEXT_PUBLIC_API_URL` - Backend URL, defaults to `http://localhost:8000`

## Key Technical Details

- LLM model is `claude-sonnet-4-20250514` at temperature 0.7 (`backend/config.py`)
- Agent graph is a **4-node pipeline**: resolver → planner → tool_executor → synthesizer (`backend/agent/graph.py`)
- Streaming runs the synchronous LangGraph agent in a ThreadPoolExecutor (`backend/api/routes.py`)
- 3D components use `next/dynamic` with `ssr: false` to avoid server-side Three.js errors
- FastF1 caches data to `backend/cache/` directory; first requests are slow
- All tools return `{"error": "..."}` on failure — never raise exceptions
- SSE event type discrimination uses the `event:` line from the SSE protocol (not field-presence heuristics)
- `gltf.scene.clone()` is wrapped in `useMemo` to prevent Three.js scene cloning on every render
- Teardown page (`/teardown`) preloads 192 PNG frames (`public/frames/frame_0000.png` … `frame_0191.png`) then maps scroll position to frame index via `requestAnimationFrame`; canvas is sized with `min(92vw, calc(82vh * 800 / 420))` to respect both viewport constraints simultaneously

## Code Conventions

### Frontend
- **File naming**: kebab-case (`briefing-card.tsx`, `use-briefing.ts`)
- **Exports**: Named exports everywhere; `default export` only for Next.js page/layout files
- **Imports**: All shared types from `@/types`; all components from `@/components/...`
- **React hooks**: Custom hooks in `hooks/` directory, prefixed with `use-`
- **shadcn/ui components**: In `components/ui/` — do not manually edit, re-add via CLI if needed
- **No `data: any`**: All SSE events typed via `StreamEvent` discriminated union

### Backend
- **snake_case** for all Python identifiers
- **All tools** use `@tool` decorator and return `{"error": "..."}` on failure (never raise)
- **Logging**: Use `logger = logging.getLogger(__name__)` — no `print()` statements
- **Config**: All env vars read from `config.py` — never use `os.getenv()` directly in other files
- **Async**: Use `asyncio.get_running_loop()` inside async functions (not `get_event_loop()`)

## Additional Documentation

Check these files for deeper context on specific topics:

| File | When to consult |
|------|-----------------|
| `.claude/docs/architectural_patterns.md` | Modifying agent workflow, adding tools, changing API design, or frontend state |
