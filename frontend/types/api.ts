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
  | { type: 'error'; data: { message: string } };

/**
 * `GET /api/standings/{year}`. Rows arrive already ranked — driver ties broken on best finish,
 * then car number — so they render in served order and are never re-sorted.
 *
 * A season that has not started is a 200 with `races_completed: 0` and both tables empty, not
 * an error: it is a correct answer, and no retry would change it.
 */
export interface StandingsResponse {
  year: number;
  races_completed: number;
  drivers: DriverStanding[];
  constructors: ConstructorStanding[];
}
