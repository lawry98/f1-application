/**
 * Turning sampled points into a smooth SVG path.
 *
 * Both things that need this — the topographic contour lines and (from Phase 2) the circuit
 * maps — are sampled curves, and a polyline `L` between samples reads as a polygon rather
 * than as a drawn line. Catmull-Rom passes *through* every sample, which is what we want:
 * the samples are the data, not control hints.
 */

export type Point = readonly [number, number];

/**
 * Convert points to a path of cubic beziers that passes through each one.
 *
 * The Catmull-Rom → bezier conversion for the segment P1→P2 is
 * `C1 = P1 + (P2 - P0) / 6` and `C2 = P2 - (P3 - P1) / 6`. On a closed curve the
 * neighbour indices wrap, which is what keeps the seam from developing a corner.
 *
 * Fewer than two points cannot describe a curve and yield an empty path — callers render
 * nothing rather than an `M` with no line, which some renderers draw as a dot.
 */
export function catmullRomPath(points: readonly Point[], closed = false): string {
  if (points.length < 2) return '';

  const n = points.length;
  // Both branches produce an index inside [0, n), so the assertion is safe under
  // `noUncheckedIndexedAccess` — wrapping for a closed curve, clamping for an open one.
  const at = (i: number): Point =>
    closed ? points[((i % n) + n) % n]! : points[Math.min(Math.max(i, 0), n - 1)]!;

  const segments = closed ? n : n - 1;
  const [startX, startY] = points[0]!;
  let path = `M ${fmt(startX)} ${fmt(startY)}`;

  for (let i = 0; i < segments; i++) {
    const [p0x, p0y] = at(i - 1);
    const [p1x, p1y] = at(i);
    const [p2x, p2y] = at(i + 1);
    const [p3x, p3y] = at(i + 2);

    const c1x = p1x + (p2x - p0x) / 6;
    const c1y = p1y + (p2y - p0y) / 6;
    const c2x = p2x - (p3x - p1x) / 6;
    const c2y = p2y - (p3y - p1y) / 6;

    path += ` C ${fmt(c1x)} ${fmt(c1y)}, ${fmt(c2x)} ${fmt(c2y)}, ${fmt(p2x)} ${fmt(p2y)}`;
  }

  return closed ? `${path} Z` : path;
}

/** Three decimals is well inside sub-pixel for our viewBoxes and keeps the markup small. */
function fmt(value: number): string {
  return Number(value.toFixed(3)).toString();
}
