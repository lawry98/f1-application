/**
 * API types — discriminated union matching SSE events emitted by
 * backend/api/routes.py event_generator()
 */
import type { RaceInfo } from './f1';

export type StreamEvent =
  | { type: 'status'; data: { step: string; message: string } }
  | { type: 'tool_plan'; data: { tools: string[] } }
  | { type: 'race_info'; data: RaceInfo }
  | { type: 'tool_result'; data: { tool: string; success: boolean; cached?: boolean } }
  | { type: 'briefing_delta'; data: { content: string } }
  | { type: 'briefing'; data: { content: string; truncated: boolean } }
  | { type: 'complete'; data: { message: string } }
  | { type: 'error'; data: { message: string } };
