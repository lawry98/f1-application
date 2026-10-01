/**
 * API types — the discriminated union matching SSE events emitted by
 * backend/api/routes.py event_generator(), and the envelopes its REST routes return.
 */
import type { ConstructorStanding, DriverStanding, RaceInfo } from './f1';

export type StreamEvent =
  | { type: 'status'; data: { step: string; message: string } }
  | { type: 'tool_plan'; data: { tools: string[] } }
  | { type: 'race_info'; data: RaceInfo }
  | { type: 'tool_result'; data: { tool: string; success: boolean; cached?: boolean } }
  | { type: 'briefing_delta'; data: { content: string } }
  | { type: 'briefing'; data: { content: string; truncated: boolean } }
  | { type: 'complete'; data: { message: string } }
  /**
   * `code` is present only when the server stopped the run at its deadline before any prose
   * existed. A deadline after prose is not an error at all: it arrives as a `briefing` with
   * `truncated: true` (ADR-0002).
   */
  | { type: 'error'; data: { message: string; code?: 'deadline' } };

/**
 * Why the briefing routes refused to start a run, from the JSON body of their 429 / 503.
 * They are refused before the event stream opens, so none of this ever arrives as an event.
 */
export type BriefingRejectionCode = 'busy' | 'rate_limited' | 'daily_cap';

/**
 * `GET /api/standings/{year}`. Rows arrive already ranked — ties broken on the Grand Prix
 * countback, then car number (team name for constructors) — so they render in served order and
 * are never re-sorted.
 *
 * A season with no results yet is a 200 with `races_completed: 0` and both tables empty, not an
 * error: it is an answer rather than an outage, so the page states it instead of offering a
 * retry. It covers a season that has not started and first results not yet published, which a
 * later load does change. Empty tables are the tell, not the count: a season whose only held
 * session is a sprint has real rows at `races_completed: 0`.
 */
export interface StandingsResponse {
  year: number;
  races_completed: number;
  drivers: DriverStanding[];
  constructors: ConstructorStanding[];
}
