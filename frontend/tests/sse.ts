import cleanSse from './fixtures/clean.sse?raw';
import truncatedSse from './fixtures/truncated.sse?raw';

const FIXTURES = { 'clean.sse': cleanSse, 'truncated.sse': truncatedSse };

export type FixtureName = keyof typeof FIXTURES;

/** Real SSE bytes captured from the FastAPI route — see fixtures/README.md. */
export function fixture(name: FixtureName): Uint8Array {
  return new TextEncoder().encode(FIXTURES[name]);
}

/** One SSE frame, ready to be pushed through a {@link ChunkFeed}. */
export function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * A reader whose chunks the test hands over one at a time.
 *
 * `streamBriefing` reads from a `ReadableStream`, so a test that wants to observe the UI
 * *mid-stream* — which is the whole subject of delta coalescing — needs to control when
 * bytes arrive rather than handing over the whole body at once. `read()` parks on a promise
 * until the test pushes.
 */
export class ChunkFeed {
  private readonly queued: ReadableStreamReadResult<Uint8Array>[] = [];
  private waiting: ((result: ReadableStreamReadResult<Uint8Array>) => void) | null = null;

  push(text: string): void {
    this.deliver({ done: false, value: new TextEncoder().encode(text) });
  }

  close(): void {
    this.deliver({ done: true, value: undefined });
  }

  private deliver(result: ReadableStreamReadResult<Uint8Array>): void {
    const waiting = this.waiting;
    if (waiting) {
      this.waiting = null;
      waiting(result);
      return;
    }
    this.queued.push(result);
  }

  private read(): Promise<ReadableStreamReadResult<Uint8Array>> {
    const next = this.queued.shift();
    if (next) return Promise.resolve(next);
    return new Promise((resolve) => {
      this.waiting = resolve;
    });
  }

  /** A `fetch` stand-in that serves this feed as the response body. */
  fetch = (): Promise<Response> =>
    Promise.resolve({
      ok: true,
      body: {
        getReader: () => ({
          read: () => this.read(),
          cancel: () => Promise.resolve(undefined),
          releaseLock: () => undefined,
        }),
      },
    } as unknown as Response);
}

/** A `fetch` stand-in that serves `bytes` in fixed-size chunks, then closes. */
export function fetchInChunks(bytes: Uint8Array, chunkSize: number): () => Promise<Response> {
  let offset = 0;
  return () =>
    Promise.resolve({
      ok: true,
      body: {
        getReader: () => ({
          read: () => {
            if (offset >= bytes.length) {
              return Promise.resolve({ done: true, value: undefined });
            }
            const value = bytes.subarray(offset, offset + chunkSize);
            offset += chunkSize;
            return Promise.resolve({ done: false, value });
          },
          cancel: () => Promise.resolve(undefined),
          releaseLock: () => undefined,
        }),
      },
    } as unknown as Response);
}
