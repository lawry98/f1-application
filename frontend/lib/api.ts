import type {
  StreamEvent,
  Race,
  RaceInfo,
  StandingsResponse,
  CircuitWinnersResponse,
} from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export async function getRaces(year: number): Promise<Race[]> {
  const response = await fetch(`${API_BASE_URL}/api/races/${year}`);

  if (!response.ok) {
    throw new Error('Failed to fetch races');
  }

  const data = (await response.json()) as { races: Race[] };
  return data.races;
}

export async function getStandings(year: number): Promise<StandingsResponse> {
  const response = await fetch(`${API_BASE_URL}/api/standings/${year}`);

  if (!response.ok) {
    throw new Error('Failed to fetch standings');
  }

  return (await response.json()) as StandingsResponse;
}

export async function getCircuitWinners(circuitId: string): Promise<CircuitWinnersResponse> {
  const response = await fetch(`${API_BASE_URL}/api/circuits/${circuitId}/winners`);

  if (!response.ok) {
    throw new Error('Failed to fetch circuit winners');
  }

  return (await response.json()) as CircuitWinnersResponse;
}

/**
 * The briefing stream could not be opened. The cost guard refuses *before* the stream starts,
 * so its 429 / 503 is an ordinary JSON response, and this carries what the page needs from it.
 * Every field is `null` when the response did not supply it — an ordinary 500, say.
 */
export class BriefingRequestError extends Error {
  constructor(
    readonly status: number,
    /** The guard's `code` — `busy`, `rate_limited`, `daily_cap` — as sent. */
    readonly code: string | null,
    /** From the JSON body, falling back to the `Retry-After` header. */
    readonly retryAfterSeconds: number | null,
    /** The limit that was hit, so copy can say "your 5 briefings" without hard-coding 5. */
    readonly limit: number | null,
  ) {
    super('Failed to start briefing stream');
    this.name = 'BriefingRequestError';
  }
}

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * `Retry-After` is either whole seconds or an HTTP date. The guard sends seconds; a proxy in
 * front of it might not. It is only readable cross-origin because the backend's CORS config
 * exposes it.
 */
function retryAfterHeader(response: Response): number | null {
  const raw = response.headers?.get('Retry-After');
  if (!raw) return null;
  if (/^\d+$/.test(raw.trim())) return positiveNumber(Number(raw));
  const at = Date.parse(raw);
  return Number.isNaN(at) ? null : positiveNumber(Math.ceil((at - Date.now()) / 1000));
}

async function briefingRequestError(response: Response): Promise<BriefingRequestError> {
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = await response.json();
    if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>;
  } catch {
    // Not JSON — a proxy's HTML error page, or no body at all. The header may still say when.
  }
  return new BriefingRequestError(
    response.status ?? 0,
    typeof body.code === 'string' ? body.code : null,
    positiveNumber(body.retry_after_seconds) ?? retryAfterHeader(response),
    positiveNumber(body.limit),
  );
}

/**
 * Consume the SSE briefing stream and yield typed StreamEvent objects.
 * Uses the SSE `event:` line for type discrimination.
 *
 * Throws {@link BriefingRequestError} when the server refuses to open the stream.
 */
export async function* streamBriefing(
  query: string,
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent, void, undefined> {
  const response = await fetch(`${API_BASE_URL}/api/briefing/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal,
  });

  if (!response.ok) {
    throw await briefingRequestError(response);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) {
    throw new Error('No response body');
  }

  let remainder = '';
  let eventType = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      const text = remainder + decoder.decode(value, { stream: true });
      const lines = text.split('\n');
      remainder = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim();
          continue;
        }

        if (line.startsWith('data:')) {
          const dataStr = line.slice(5).trim();
          if (!dataStr || !eventType) continue;

          try {
            const parsed: unknown = JSON.parse(dataStr);

            switch (eventType) {
              case 'status':
                yield { type: 'status', data: parsed as { step: string; message: string } };
                break;
              case 'tool_plan':
                yield { type: 'tool_plan', data: parsed as { tools: string[] } };
                break;
              case 'race_info':
                yield { type: 'race_info', data: parsed as RaceInfo };
                break;
              case 'tool_result':
                yield {
                  type: 'tool_result',
                  data: parsed as { tool: string; success: boolean; cached?: boolean },
                };
                break;
              case 'briefing_delta':
                yield { type: 'briefing_delta', data: parsed as { content: string } };
                break;
              case 'briefing':
                yield {
                  type: 'briefing',
                  data: parsed as { content: string; truncated: boolean },
                };
                break;
              case 'complete':
                yield { type: 'complete', data: parsed as { message: string } };
                break;
              case 'error':
                yield { type: 'error', data: parsed as { message: string; code?: 'deadline' } };
                break;
              default:
                break;
            }
          } catch {
            // Malformed JSON — skip
          }

          eventType = '';
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
