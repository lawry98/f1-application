// Deliberately duplicated from the backend's GENERIC_BRIEFING_ERROR (backend/api/errors.py):
// when the request itself fails there is no response to fetch it from.
export const GENERIC_BRIEFING_ERROR =
  'Something went wrong generating this briefing. Please try again.';

/**
 * Display names for the backend's seven `@tool` functions (see `backend/tools/`).
 *
 * `tool_result` events carry the raw Python function name, and `get_recent_top_finishers`
 * is not something to show a reader. Kept here rather than in either consumer because the
 * loader and the tool trace both render tool names on the same page, seconds apart.
 */
const TOOL_LABELS: Record<string, string> = {
  get_track_info: 'Track profile',
  get_recent_race_results: 'Recent race results',
  get_driver_form: 'Driver form',
  get_recent_top_finishers: 'Top finishers',
  get_circuit_winners: 'Circuit winners',
  get_race_weather: 'Weather forecast',
  search_f1_news: 'News search',
};

/**
 * The display name for a tool. An unmapped name — a tool added to the backend before this
 * map caught up — degrades to a readable form of itself rather than to blank.
 */
export function toolLabel(tool: string): string {
  return TOOL_LABELS[tool] ?? tool.replace(/_/g, ' ');
}
