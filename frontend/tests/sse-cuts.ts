/**
 * Broken streams, cut at runtime out of a real captured `.sse` fixture.
 *
 * A stream that dies mid-way is the one shape the backend never serves on purpose, so it cannot
 * be captured — and a hand-cut fixture committed beside the real ones would be exactly the
 * hand-edited bytes `fixtures/README.md` forbids. Cutting the real bytes here keeps every frame
 * before the cut genuine.
 *
 * No Vite-only imports (`?raw`), so the Playwright harness can load this too. Offsets are string
 * offsets, which equal byte offsets because the backend JSON-escapes every payload to ASCII.
 */

interface Frame {
  event: string;
  /** Offset of the frame's first byte. */
  start: number;
  /** Offset just past the blank line that ends it. */
  end: number;
}

function framesOf(sse: string): Frame[] {
  const frames: Frame[] = [];
  let start = 0;
  for (const separator of sse.matchAll(/\r?\n\r?\n/g)) {
    const end = separator.index + separator[0].length;
    const event = /^event: *(.*?)\r?$/m.exec(sse.slice(start, end))?.[1] ?? '';
    frames.push({ event, start, end });
    start = end;
  }
  return frames;
}

/** The `n`th frame (1-based) of type `event`; throws when the fixture has fewer. */
function nth(sse: string, event: string, n: number): Frame {
  const found = framesOf(sse).filter((frame) => frame.event === event)[n - 1];
  if (!found) throw new Error(`the fixture has no frame ${n} of type "${event}"`);
  return found;
}

/** Everything up to and including the `n`th `event` frame. */
export function cutAfter(sse: string, event: string, n = 1): string {
  return sse.slice(0, nth(sse, event, n).end);
}

/** Everything before the `n`th `event` frame. */
export function cutBefore(sse: string, event: string, n = 1): string {
  return sse.slice(0, nth(sse, event, n).start);
}

/** Everything before the `n`th `event` frame, plus half of that frame's `data:` line. */
export function cutInsideData(sse: string, event: string, n = 1): string {
  const frame = nth(sse, event, n);
  const data = sse.indexOf('data:', frame.start);
  const lineEnd = sse.indexOf('\n', data);
  return sse.slice(0, Math.floor((data + lineEnd) / 2));
}

/** The `content` of every `briefing_delta` frame in `sse`, in order. */
export function deltasIn(sse: string): string[] {
  return framesOf(sse)
    .filter((frame) => frame.event === 'briefing_delta')
    .map((frame) => {
      const data = /^data: *(.*?)\r?$/m.exec(sse.slice(frame.start, frame.end))?.[1] ?? '{}';
      return (JSON.parse(data) as { content: string }).content;
    });
}
