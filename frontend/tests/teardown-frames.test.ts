/**
 * The `/teardown` frame sequence: the URLs the scene asks for, the order it asks for them in, and
 * the files actually sitting in `public/`.
 *
 * The asset half exists because a broken sequence is invisible to every other test. jsdom never
 * loads an image, so a `framePath` that names a file nobody shipped (a `.png` left behind after
 * the WebP conversion, say) renders the scene exactly as a working one does, while the real page
 * 404s all 192 frames, nulls each slot in `onerror`, and paints a blank canvas. So these read the
 * files in `public/frames/` rather than a fixture describing them, the same way `livery.test.ts`
 * reads the real GLB.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { FRAME_COUNT, frameLoadPasses, framePath, nearestLoaded } from '@/lib/teardown-frames';

const ROOT = join(__dirname, '..');
const PUBLIC_DIR = join(ROOT, 'public');
const SHIPPED_DIR = join(PUBLIC_DIR, 'frames');
const SOURCE_DIR = join(ROOT, 'assets', 'teardown-frames');

/** Every index the scene can ask for, 0 … FRAME_COUNT - 1. */
const ALL_INDICES = Array.from({ length: FRAME_COUNT }, (_, i) => i);

/**
 * Width and height out of a lossy WebP's VP8 frame header, or null for anything else. The layout
 * is fixed by RFC 9649: a RIFF container, the `WEBP` form type, a `VP8 ` chunk, a 3-byte frame
 * tag, the start code `9d 01 2a`, then two little-endian 14-bit dimensions.
 */
function lossyWebpSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') {
    return null;
  }
  if (bytes.toString('ascii', 12, 16) !== 'VP8 ') return null;
  if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
  return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
}

describe('framePath', () => {
  it('names a file that is actually shipped in public/, for every frame', () => {
    const missing = ALL_INDICES.map(framePath).filter((url) => {
      try {
        return !statSync(join(PUBLIC_DIR, url)).isFile();
      } catch {
        return true;
      }
    });
    expect(missing, 'frame URLs with no file behind them').toEqual([]);
  });

  it('is a root-relative URL, so the preloader and the docked still share one cache entry', () => {
    // The docked still is `framePath(FRAME_COUNT - 1)` rendered through `next/image` with
    // `unoptimized`, which emits the src verbatim. Anything but a plain root-relative path (an
    // absolute origin, a query string) would give the still a different cache key from the
    // preloaded frame and download it a second time.
    expect(framePath(0)).toBe('/frames/frame_0000.webp');
    expect(framePath(191)).toBe('/frames/frame_0191.webp');
  });
});

describe('the shipped frames', () => {
  it('are exactly the frames the scene asks for, with nothing left behind', () => {
    // A leftover PNG is 157 KB of dead payload that `public/` still serves to anyone who asks.
    const expected = ALL_INDICES.map((i) => framePath(i).replace('/frames/', '')).sort();
    expect(readdirSync(SHIPPED_DIR).sort()).toEqual(expected);
  });

  it('are all lossy WebP at the 800x420 the canvas is sized for', () => {
    // The canvas backing store is 800x420 and its box is `aspect-ratio: 800 / 420`, so a frame at
    // any other size is stretched. `VP8 ` rather than `VP8X`/`VP8L` also pins that no alpha
    // channel was shipped: every source is fully opaque, and the encoder asserts it.
    const wrong = ALL_INDICES.map(framePath)
      .map((url) => ({ url, size: lossyWebpSize(readFileSync(join(PUBLIC_DIR, url))) }))
      .filter(({ size }) => size?.width !== 800 || size?.height !== 420);
    expect(wrong).toEqual([]);
  });

  it('stay inside the payload budget', () => {
    // The PNG set was 30.1 MB, 72% of everything in public/. q85 WebP measured 3.60 MB. The budget
    // is what a re-encode at the wrong settings (lossless WebP is ~13.7 MB) runs into.
    const total = ALL_INDICES.reduce(
      (sum, i) => sum + statSync(join(PUBLIC_DIR, framePath(i))).size,
      0,
    );
    expect(total).toBeLessThanOrEqual(5_000_000);
  });

  it('each have a source render the encoder can re-derive it from', () => {
    // `scripts/encode-teardown-frames.mjs` reads these. A frame shipped with no source cannot be
    // re-derived, and a source with no shipped frame was never encoded.
    const sources = readdirSync(SOURCE_DIR)
      .filter((f) => f.endsWith('.png'))
      .map((f) => f.replace(/\.png$/, ''))
      .sort();
    const shipped = readdirSync(SHIPPED_DIR)
      .map((f) => f.replace(/\.webp$/, ''))
      .sort();
    expect(sources).toEqual(shipped);
  });
});

describe('frameLoadPasses', () => {
  it('fetches every 16th frame and the last one first', () => {
    // The first pass is what the loading overlay waits for. It has to include the last frame,
    // because the docked still in the header is that exact URL and must be cached before the dock.
    expect(frameLoadPasses(192)[0]).toEqual([
      0, 16, 32, 48, 64, 80, 96, 112, 128, 144, 160, 176, 191,
    ]);
  });

  it('then halves the gap on each pass', () => {
    const passes = frameLoadPasses(192);
    expect(passes[1]).toEqual([8, 24, 40, 56, 72, 88, 104, 120, 136, 152, 168, 184]);
    expect(passes.map((p) => p.length)).toEqual([13, 12, 24, 48, 95]);
    // The final pass is the odd frames, with 191 already fetched in the first.
    expect(passes[4]?.slice(0, 3)).toEqual([1, 3, 5]);
    expect(passes[4]?.at(-1)).toBe(189);
  });

  it('fetches every frame exactly once', () => {
    const flat = frameLoadPasses(192).flat();
    expect([...flat].sort((a, b) => a - b)).toEqual(ALL_INDICES);
  });

  it('puts the last frame in the first pass even when it is not on the stride', () => {
    expect(frameLoadPasses(10)).toEqual([[0, 9], [8], [4], [2, 6], [1, 3, 5, 7]]);
  });
});

describe('nearestLoaded', () => {
  const loadedAt = (count: number, indices: number[]) =>
    Array.from({ length: count }, (_, i) => indices.includes(i));

  it('returns the frame itself once it has loaded', () => {
    expect(nearestLoaded(loadedAt(10, [3, 4, 5]), 4)).toBe(4);
  });

  it('falls back to the closest loaded frame on either side', () => {
    expect(nearestLoaded(loadedAt(20, [0, 16]), 3)).toBe(0);
    expect(nearestLoaded(loadedAt(20, [0, 16]), 13)).toBe(16);
  });

  it('takes the earlier frame on a tie', () => {
    expect(nearestLoaded(loadedAt(20, [0, 16]), 8)).toBe(0);
  });

  it('looks past the ends of the range without wrapping', () => {
    expect(nearestLoaded(loadedAt(10, [9]), 0)).toBe(9);
    expect(nearestLoaded(loadedAt(10, [0]), 9)).toBe(0);
  });

  it('returns -1 when nothing has loaded yet', () => {
    expect(nearestLoaded(loadedAt(10, []), 5)).toBe(-1);
  });
});
