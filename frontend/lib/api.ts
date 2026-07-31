import type { StreamEvent, Race, RaceInfo } from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export async function getRaces(year: number): Promise<Race[]> {
  const response = await fetch(`${API_BASE_URL}/api/races/${year}`);

  if (!response.ok) {
    throw new Error('Failed to fetch races');
  }

  const data = (await response.json()) as { races: Race[] };
  return data.races;
}

/**
 * Consume the SSE briefing stream and yield typed StreamEvent objects.
 * Uses the SSE `event:` line for type discrimination.
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
    throw new Error('Failed to start briefing stream');
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
              case 'race_info':
                yield { type: 'race_info', data: parsed as RaceInfo };
                break;
              case 'tool_result':
                yield { type: 'tool_result', data: parsed as { tool: string; success: boolean } };
                break;
              case 'briefing':
                yield { type: 'briefing', data: parsed as { content: string } };
                break;
              case 'complete':
                yield { type: 'complete', data: parsed as { message: string } };
                break;
              case 'error':
                yield { type: 'error', data: parsed as { message: string } };
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
