/**
 * API types — discriminated union matching SSE events emitted by
 * backend/api/routes.py event_generator()
 */
import type { RaceInfo, ToolResult } from './f1';

export type StreamEvent =
  | { type: 'status'; data: { step: string; message: string } }
  | { type: 'race_info'; data: RaceInfo }
  | { type: 'tool_result'; data: { tool: string; success: boolean } }
  | { type: 'briefing'; data: { content: string } }
  | { type: 'complete'; data: { message: string } }
  | { type: 'error'; data: { message: string } };

export interface BriefingResponse {
  race: string;
  briefing: string;
  tool_trace: ToolResult[];
}
