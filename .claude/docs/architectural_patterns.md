# Architectural Patterns

## 1. LangGraph Linear Pipeline (Agent Orchestration)

The agent uses a fixed 3-node LangGraph `StateGraph` with no conditional routing:

```
planner -> tool_executor -> synthesizer -> END
```

Defined in `backend/agent/graph.py:169-180`. Each node is a plain function that receives the full `AgentState` TypedDict and returns a partial dict of updated fields. LangGraph merges the returned fields into state automatically.

**Adding a new node**: Define a function matching `(AgentState) -> Dict[str, Any]`, register it with `workflow.add_node()`, and insert it into the edge chain.

## 2. TypedDict State Management (Backend)

All agent state flows through a single `AgentState` TypedDict (`backend/agent/state.py:16-23`). Key fields:

- `messages` - LangGraph message list with `add_messages` reducer (append-only)
- `race_query` - Original user input string
- `race_info` - Parsed `RaceInfo` TypedDict (name, year, circuit_id, location, country)
- `tasks` - List of tool names to execute (strings matching tool function names)
- `tool_results` - List of `ToolResult` TypedDicts tracking each tool's outcome
- `current_step` - Progress marker: "planning" | "gathering" | "synthesizing" | "complete" | "error"

Supporting TypedDicts (`RaceInfo` at line 4, `ToolResult` at line 11) are flat structures with no nesting beyond `data: dict` on ToolResult.

**Convention**: Node functions return only the fields they change; LangGraph handles the merge.

## 3. LangChain @tool Decorator Pattern (Tool Interface)

Every data-gathering tool uses the `@tool` decorator from `langchain_core.tools`. This appears in all four tool files:

- `backend/tools/fastf1_tools.py:11,45,71` (get_track_info, get_recent_race_results, get_driver_form)
- `backend/tools/f1_data_tools.py:5,55,105` (get_season_standings, get_circuit_winners, get_circuit_info)
- `backend/tools/search_tools.py:6` (search_f1_news)
- `backend/tools/weather_tools.py:7` (get_race_weather)

**Convention for all tools**:
- Signature: typed parameters -> `Dict[str, Any]`
- Docstring with Args/Returns sections (LangChain uses these for tool descriptions)
- Return `{"error": "message"}` on failure, never raise exceptions
- Tool names must match keys in the `tool_map` dispatch in `backend/agent/graph.py:86`
- Each tool's invocation arguments are hardcoded per-tool in `tool_executor_node` (`backend/agent/graph.py:99-125`)

**Adding a new tool**: Create the `@tool` function in the appropriate tools file, add it to `all_tools` list in `graph.py:19-28`, add its dispatch case in `tool_executor_node`, and include it in the planner prompt's task list if it should be auto-selected.

## 4. Error-as-Value Pattern (Tools)

Tools never throw exceptions to the caller. Every tool wraps its body in try/except and returns a dict with an `"error"` key on failure. The tool executor checks for this at `backend/agent/graph.py:129`:

```python
success="error" not in result
```

This pattern appears uniformly across all 8 tools. The synthesizer receives failed tool results alongside successful ones and generates briefings with whatever data is available.

## 5. SSE Streaming with Sync-to-Async Bridge (API Layer)

The streaming endpoint (`backend/api/routes.py:62-160`) uses a two-layer pattern:

1. **Outer**: Async generator yielding SSE events with typed event names (`status`, `race_info`, `tool_result`, `briefing`, `complete`, `error`)
2. **Inner**: Synchronous `agent.stream()` run inside `ThreadPoolExecutor` via `loop.run_in_executor()` (`routes.py:91-97`)

The executor is module-level with `max_workers=4` (`routes.py:12`). This is necessary because LangGraph's `.stream()` is synchronous while FastAPI handlers are async.

**SSE event schema**:
- `status` -> `{step: string, message: string}`
- `race_info` -> `RaceInfo` fields
- `tool_result` -> `{tool: string, success: boolean}`
- `briefing` -> `{content: string}` (the full markdown briefing)
- `complete` -> `{message: "Briefing complete"}`
- `error` -> `{message: string}`

## 6. Dynamic Import with SSR Bypass (Frontend 3D)

All Three.js components are loaded via `next/dynamic` with `ssr: false` to prevent server-side rendering failures (Three.js requires browser APIs). This pattern appears in:

- `frontend/app/page.tsx:4` - F1HeroScene
- `frontend/components/BriefingChat.tsx:10` - F1LoadingAnimation

Each dynamic import includes a loading fallback (placeholder div or null). The 3D components live in `frontend/components/3d/` and are never imported directly by server components.

## 7. AsyncGenerator SSE Consumer (Frontend API Client)

The frontend consumes SSE streams via an `async function*` generator (`frontend/lib/api.ts:53-122`). The pattern:

1. `fetch()` with POST to the streaming endpoint
2. `response.body.getReader()` to get a `ReadableStream` reader
3. Manual line-by-line parsing of `event:` and `data:` SSE fields
4. `yield` typed `StreamEvent` objects to the caller
5. Consumer (`BriefingChat.tsx:48-65`) uses `for await...of` to process events and update React state

Event type discrimination happens by checking data field presence (`data.step` -> status, `data.tool` -> tool_result, etc.) at `api.ts:100-112`.

## 8. React Hooks Local State (Frontend State Management)

No global state store. Each component manages its own state with `useState`. The main stateful component is `BriefingChat` (`frontend/components/BriefingChat.tsx:21-27`) which tracks:

- `query`, `loading`, `race`, `briefing`, `toolTrace`, `error`, `statusMessage`

State is reset at the start of each new request (`BriefingChat.tsx:34-39`). Child components (`BriefingCard`, `ToolTrace`, `RaceSelector`) receive data via props only.

## 9. Pydantic Request/Response Models (API Contracts)

API input/output shapes are defined as Pydantic `BaseModel` classes (`backend/api/routes.py:16-22`):

- `BriefingRequest` - `{query: str}`
- `BriefingResponse` - `{race: str, briefing: str, tool_trace: List[Dict]}`

The non-streaming endpoint uses `response_model=BriefingResponse` for automatic validation. The streaming endpoint bypasses this since it returns an `EventSourceResponse`.

## 10. Prompt Template with Variable Injection

Both LLM prompts in `backend/agent/prompts.py` use Python f-string-style `{variable}` placeholders (escaped with `{{` `}}` for literal braces in JSON examples):

- `PLANNER_PROMPT` (line 1): Takes `{query}`, returns structured JSON with race info and tool list
- `SYNTHESIZER_PROMPT` (line 45): Takes `{tool_results}`, returns markdown briefing

The planner prompt includes a hardcoded mapping of common race names to official names (lines 8-29). When adding new races or name aliases, update this mapping.
