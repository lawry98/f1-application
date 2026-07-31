# Architectural Patterns

## 1. LangGraph Linear Pipeline (Agent Orchestration)

The agent uses a 4-node LangGraph `StateGraph` with one conditional edge:

```
resolver -> planner -> tool_executor -> synthesizer -> END
    └── current_step == "error" ──────────────────────> END
```

Assembled at the bottom of `backend/agent/graph.py` (`workflow = StateGraph(AgentState)` through `agent = workflow.compile()`). Each node is a plain function that receives the full `AgentState` TypedDict and returns a partial dict of updated fields. LangGraph merges the returned fields into state automatically.

The resolver's conditional edge is the pipeline's **only** error gate: downstream nodes index `state["race_info"]` directly and assume it is set. Do not add defensive `if not race_info` fallbacks to later nodes — an error step returned by a mid-pipeline node would be silently clobbered by the next unconditional edge.

**Adding a new node**: Define a function matching `(AgentState) -> dict[str, Any]`, register it with `workflow.add_node()`, and insert it into the edge chain.

## 2. TypedDict State Management (Backend)

All agent state flows through a single `AgentState` TypedDict (`backend/agent/state.py`). Fields:

- `race_query` - Original user input string
- `race_info` - Resolved `RaceInfo` TypedDict or `None` (name, year, circuit_id, location, country, date, is_upcoming, historical_year)
- `tasks` - List of tool names to execute (strings matching tool function names)
- `tool_results` - List of `ToolResult` TypedDicts tracking each tool's outcome
- `briefing` - Final markdown briefing string or `None`
- `current_step` - Progress marker: "resolving" | "planning" | "gathering" | "synthesizing" | "complete" | "error"

Supporting TypedDicts (`RaceInfo`, `ToolResult`) are flat structures with no nesting beyond `data: dict` on ToolResult. There is no `messages` field and no LangGraph message reducer — the two LLM-calling nodes build local message lists.

**Convention**: Node functions return only the fields they change; LangGraph handles the merge.

## 3. LangChain @tool Decorator Pattern (Tool Interface)

Every data-gathering tool uses the `@tool` decorator from `langchain_core.tools`. Seven tools across four files:

- `backend/tools/fastf1_tools.py` - get_track_info, get_recent_race_results, get_driver_form
- `backend/tools/f1_data_tools.py` - get_recent_top_finishers, get_circuit_winners
- `backend/tools/search_tools.py` - search_f1_news
- `backend/tools/weather_tools.py` - get_race_weather

The other files in `tools/` (`race_resolver.py`, `schedule_cache.py`, `fastf1_helpers.py`) are plain helpers, not LLM-callable tools.

**Convention for all tools**:
- Signature: typed parameters -> `dict[str, Any]`
- Docstring with Args/Returns sections (LangChain uses these for tool descriptions)
- Return `{"error": "message"}` on failure, never raise exceptions
- Tool names must match keys in the `tool_map` dispatch built in `tool_executor_node` (`backend/agent/graph.py`)
- Each tool's invocation arguments are hardcoded per-tool in `_invoke_tool` (`backend/agent/graph.py`)

**Adding a new tool**: Create the `@tool` function in the appropriate tools file, add it to the `all_tools` list at the top of `graph.py`, add its dispatch case in `_invoke_tool`, and list it in `PLANNER_PROMPT` (and `DEFAULT_TOOLS` if it should run when the planner's response is unparseable). The planner selects tools by string name, so the prompt string, the dispatch string, and the tool's `.name` must all match.

## 4. Error-as-Value Pattern (Tools)

Tools never throw exceptions to the caller. Every tool wraps its body in try/except and returns a dict with an `"error"` key on failure. `_invoke_tool` checks for this when building each `ToolResult`:

```python
success="error" not in result
```

This pattern appears uniformly across all 7 tools. The synthesizer receives failed tool results alongside successful ones and generates briefings with whatever data is available (its prompt explicitly tells the model to omit sections whose data is missing rather than invent facts).

## 5. SSE Streaming over Native `astream` (API Layer)

The streaming endpoint's `event_generator` is a single-layer async generator: it iterates
`agent.astream(initial_state)` with `async for` and translates each `{node_name: partial_state}`
chunk into one or more SSE events with typed event names (`status`, `race_info`, `tool_result`,
`briefing`, `complete`, `error`).

There is **no thread bridge**. LangGraph's `astream()` runs the graph's synchronous node functions
on anyio worker threads itself, so the event loop is not blocked and node signatures stay
`(AgentState) -> dict[str, Any]` with no `async`. The API layer holds no executor; the only
`ThreadPoolExecutor` in the backend is the tool fan-out inside `tool_executor_node`, which is what
`EXECUTOR_MAX_WORKERS` sizes.

**Timing is the point.** Each event is emitted the instant its node returns, while later nodes are
still running. An earlier version drained the whole stream into a list before emitting anything,
which produced the same events in the same order — but only after the run had finished, making the
progress UI decorative. A change here that reintroduces buffering will pass every ordering test;
`test_stream_delivers_events_while_the_agent_is_still_running` is the one that catches it.

**SSE event schema**:
- `status` -> `{step: string, message: string}`
- `race_info` -> `RaceInfo` fields
- `tool_result` -> `{tool: string, success: boolean}`
- `briefing` -> `{content: string}` (the full markdown briefing)
- `complete` -> `{message: "Briefing complete"}`
- `error` -> `{message: string}` (generic text — internal exception details are logged, never sent to the client)

## 6. Dynamic Import with SSR Bypass (Frontend 3D)

All Three.js components are loaded via `next/dynamic` with `ssr: false` to prevent server-side rendering failures (Three.js requires browser APIs). The four import sites:

- `frontend/app/showcase/page.tsx` - F1CarShowcase
- `frontend/components/briefing/briefing-chat.tsx` - F1LoadingAnimation (named-only export, mapped via `.then((mod) => ({ default: mod.F1LoadingAnimation }))`)
- `frontend/components/teams/sticky-car-viewer.tsx` - F1HeroScene
- `frontend/components/teams/inspect-modal.tsx` - F1HeroScene

Each dynamic import uses a **direct file path** (`import('@/components/3d/f1-hero-scene')`) — there is no barrel in `components/3d/`. Each includes a loading fallback (placeholder div or null). The 3D components are never imported by server components.

## 7. AsyncGenerator SSE Consumer (Frontend API Client)

The frontend consumes SSE streams via an `async function*` generator (`streamBriefing` in `frontend/lib/api.ts`). The pattern:

1. `fetch()` with POST to the streaming endpoint, forwarding an optional `AbortSignal`
2. `response.body.getReader()` to get a `ReadableStream` reader
3. Manual line-by-line parsing of `event:` and `data:` SSE fields
4. `yield` typed `StreamEvent` objects to the caller
5. A `finally` block cancels the reader so early generator exit (abort, consumer break) tears down the HTTP connection

Event type discrimination uses the **SSE `event:` line**: the generator captures it into `eventType` and a `switch (eventType)` casts each JSON-parsed `data:` payload to the matching `StreamEvent` arm. It never inspects payload field presence — that heuristic was deliberately removed; do not reintroduce it.

The consumer is `frontend/hooks/use-briefing.ts`, which drives the generator with `for await...of`.

## 8. React Hooks Local State (Frontend State Management)

No global state store. Briefing state lives in the `useBriefing` custom hook (`frontend/hooks/use-briefing.ts`), which owns:

- `query`, `loading`, `race`, `briefing`, `toolTrace`, `error`, `statusMessage`

plus an `AbortController` ref: each `submit()` aborts any in-flight stream, resets state, and consumes `streamBriefing`; unmount aborts via a `useEffect` cleanup. `BriefingChat` (`frontend/components/briefing/briefing-chat.tsx`) is a slim orchestrator over the hook; child components (`BriefingCard`, `ToolTrace`, `RaceSelector`) receive data via props only.

## 9. Pydantic Request/Response Models (API Contracts)

API input/output shapes are defined as Pydantic `BaseModel` classes in `backend/api/models.py`:

- `BriefingRequest` - `query: str` with `Field(min_length=1, max_length=500)` validation
- `ToolTraceSummary` - `{tool: str, success: bool, summary: str}`
- `BriefingResponse` - `{race: str, briefing: str, tool_trace: list[ToolTraceSummary]}`

The non-streaming endpoint uses `response_model=BriefingResponse` for automatic validation, and maps outcomes to status codes: 404 when resolution fails (client-input problem), 500 with a generic detail for unexpected failures. The streaming endpoint bypasses `response_model` since it returns an `EventSourceResponse`. The `/api/races/{year}` path param is bounded (`ge=1950, le=current year + 1`), so out-of-range years 422 before touching FastF1.

## 10. Prompt Template with Variable Injection

Both LLM prompts in `backend/agent/prompts.py` use Python `str.format`-style `{variable}` placeholders:

- `PLANNER_PROMPT`: receives the already-resolved race fields (`{race_name}`, `{race_year}`, `{race_location}`, `{race_country}`, `{race_date}`, `{is_upcoming}`, `{historical_year}`) and returns **only a JSON array of tool names**. It does not resolve races and contains no race-name mapping.
- `SYNTHESIZER_PROMPT`: takes `{tool_results}` (JSON-serialized ToolResults), returns the markdown briefing. It instructs the model to skip or caveat sections whose tool data failed.
- `DEFAULT_TOOLS`: the planner's fallback tool list, used when the LLM response fails to parse as a JSON string array.

Race-name resolution is deterministic, not prompted: the `ALIASES` dict in `backend/tools/race_resolver.py` maps common names ("monaco", "spa", …) to official event names. When adding new races or name aliases, update `ALIASES` — not the prompts.
