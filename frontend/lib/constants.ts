// Deliberately duplicated from the backend's GENERIC_BRIEFING_ERROR (backend/api/errors.py):
// when the request itself fails there is no response to fetch it from.
export const GENERIC_BRIEFING_ERROR =
  'Something went wrong generating this briefing. Please try again.';

/**
 * Shown for the stream's `error` event with `code: "deadline"`: the server stopped the run at
 * its deadline before any prose existed. Keyed on the code, not on the backend's message, so the
 * page's wording is the page's to change.
 */
export const BRIEFING_DEADLINE_ERROR = 'This briefing took too long and was stopped. Try again.';

/**
 * Shown when the stream ended before its terminal event — the connection dropped, and the server
 * never said the run was over. Worded apart from the truncation note in `briefing-card.tsx` on
 * purpose: that one is the server *knowing* the prose stopped short (ADR-0002), and "try again"
 * is not the advice there.
 */
export const INTERRUPTED_WITH_PROSE =
  'The connection dropped before this briefing finished — what you see is incomplete.';
export const INTERRUPTED_BEFORE_PROSE =
  'The connection dropped before the briefing started. Try again.';

/**
 * Display names for the backend's **eight** `@tool` functions (see `backend/tools/`).
 *
 * `tool_result` events carry the raw Python function name, and `get_recent_top_finishers`
 * is not something to show a reader. Kept here rather than in either consumer because the
 * loader and the tool trace both render tool names on the same page, seconds apart.
 *
 * **The map has to cover every id, not the ones that happen to show up in a trace.** An unmapped
 * tool does not render blank — it renders its own de-underscored id, which reads as prose and
 * therefore hides in a list beside real prose. `get_championship_standings` sat unmapped through a
 * whole phase for exactly that reason, even though it is in `DEFAULT_TOOLS` in
 * `backend/agent/prompts.py` and so runs on every briefing whose planner call fails. The list the
 * map is checked against lives in `tests/tool-trace.test.tsx`, spelled out from `backend/tools/`
 * rather than derived from these keys — a map checked against itself cannot fail.
 *
 * The register is sentence case and names *what the tool produces*, never the F1 jargon or the
 * Python verb: `search_f1_news` is "News search", not "Search F1 news".
 */
const TOOL_LABELS: Record<string, string> = {
  // fastf1_tools.py
  get_track_info: 'Track profile',
  get_recent_race_results: 'Recent race results',
  get_driver_form: 'Driver form',
  // f1_data_tools.py
  get_recent_top_finishers: 'Top finishers',
  get_circuit_winners: 'Circuit winners',
  // standings_tools.py — "the driver and constructor championship tables for a season", per its
  // own docstring. "Championship standings" rather than "Championship tables" because the page it
  // renders on already calls this data the standings everywhere else.
  get_championship_standings: 'Championship standings',
  // weather_tools.py
  get_race_weather: 'Weather forecast',
  // search_tools.py
  search_f1_news: 'News search',
};

/**
 * The display name for a tool. An unmapped name — a tool added to the backend before this
 * map caught up — degrades to a readable form of itself rather than to blank.
 */
export function toolLabel(tool: string): string {
  return TOOL_LABELS[tool] ?? tool.replace(/_/g, ' ');
}
