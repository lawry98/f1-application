/**
 * The `/teardown` frame sequence: where each frame lives and the order they are fetched in.
 *
 * The frames are lossy WebP, re-derived from the source renders in `assets/teardown-frames/` by
 * `scripts/encode-teardown-frames.mjs`. `tests/teardown-frames.test.ts` checks every URL below
 * against the files actually in `public/`.
 */

export const FRAME_COUNT = 192;

/**
 * The gap between frames in the first load pass. The loading overlay waits for that pass only, so
 * this sets both how long the reader waits and how coarse the scrub is until the rest arrive:
 * 13 frames (~240 KB), each at most 8 frames from wherever the reader is.
 */
const FIRST_PASS_STRIDE = 16;

export function framePath(i: number): string {
  return `/frames/frame_${String(i).padStart(4, '0')}.webp`;
}

/**
 * Coarse to fine: every 16th frame plus the last, then every 8th, 4th, 2nd, and the rest. Each
 * pass fills the midpoints of the gaps the previous one left, so at any moment the loaded frames
 * are spread evenly across the whole scrub rather than bunched at the start of it, and a reader who
 * scrolls ahead of the download sees a lower frame rate instead of a blank or a frozen car.
 *
 * The last frame goes in the first pass regardless of the stride, because the docked still in the
 * header is that exact URL and has to be cached before the car lands.
 */
export function frameLoadPasses(count: number): number[][] {
  const seen = new Set<number>();
  const passes: number[][] = [];
  for (let stride = FIRST_PASS_STRIDE; stride >= 1; stride /= 2) {
    const pass: number[] = [];
    for (let i = 0; i < count; i += stride) {
      if (!seen.has(i)) {
        seen.add(i);
        pass.push(i);
      }
    }
    if (stride === FIRST_PASS_STRIDE && !seen.has(count - 1)) {
      seen.add(count - 1);
      pass.push(count - 1);
    }
    passes.push(pass);
  }
  return passes;
}

/**
 * The loaded frame closest to `target`, the earlier one on a tie, or -1 if none has loaded. A frame
 * that failed to load is never marked loaded, so it is skipped rather than drawn as a hole.
 */
export function nearestLoaded(loaded: readonly boolean[], target: number): number {
  for (let d = 0; d < loaded.length; d++) {
    if (loaded[target - d]) return target - d;
    if (loaded[target + d]) return target + d;
  }
  return -1;
}
