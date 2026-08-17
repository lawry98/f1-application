import { describe, expect, it } from 'vitest';
import { catmullRomPath, polylinePath, type Point } from '@/lib/svg-path';

/** Every coordinate pair in a path string, in order, as numbers. */
function coords(path: string): number[] {
  return (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
}

describe('catmullRomPath', () => {
  it('returns an empty path for fewer than two points', () => {
    // A single point cannot describe a curve, and an `M` with no line after it renders as a
    // stray dot in some engines. Callers check for '' and render nothing.
    expect(catmullRomPath([])).toBe('');
    expect(catmullRomPath([[1, 2]])).toBe('');
  });

  it('starts at the first point and emits one cubic per segment', () => {
    const points: Point[] = [
      [0, 0],
      [10, 10],
      [20, 0],
    ];
    const path = catmullRomPath(points);

    expect(path.startsWith('M 0 0')).toBe(true);
    // An open curve over n points has n-1 segments.
    expect(path.match(/C/g)).toHaveLength(2);
    expect(path.endsWith('Z')).toBe(false);
  });

  it('closes the loop and adds the wrap-around segment', () => {
    const points: Point[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    const path = catmullRomPath(points, true);

    // A closed curve over n points has n segments — the extra one returns to the start.
    expect(path.match(/C/g)).toHaveLength(4);
    expect(path.endsWith('Z')).toBe(true);
  });

  it('passes through every input point', () => {
    // The reason for Catmull-Rom over a bezier fit: the samples *are* the data, so the curve
    // has to interpolate them rather than be pulled towards them. Each cubic's third
    // coordinate pair is its endpoint, and those endpoints must be the inputs in order.
    const points: Point[] = [
      [0, 5],
      [12, 9],
      [30, 2],
      [41, 17],
    ];
    const endpoints = catmullRomPath(points)
      .split('C')
      .slice(1)
      .map((segment) => coords(segment).slice(4, 6));

    expect(endpoints).toEqual([
      [12, 9],
      [30, 2],
      [41, 17],
    ]);
  });

  it('places control points a sixth of the way along the neighbour chord', () => {
    // C1 = P1 + (P2 - P0) / 6. For the middle segment of this set that is
    // (10, 10) + ((20, 0) - (0, 0)) / 6 = (13.333, 10).
    const path = catmullRomPath([
      [0, 0],
      [10, 10],
      [20, 0],
      [30, 10],
    ]);
    const middle = coords(path.split('C')[2]!);

    expect(middle[0]).toBeCloseTo(13.333, 3);
    expect(middle[1]).toBeCloseTo(10, 3);
  });

  it('rounds coordinates without leaving trailing zeroes in the markup', () => {
    const path = catmullRomPath([
      [0, 0],
      [1 / 3, 2],
      [1, 0],
    ]);

    expect(path).not.toMatch(/\.\d*0(\D|$)/);
    expect(path).toContain('0.333');
  });
});

describe('polylinePath', () => {
  it('returns an empty path for fewer than two points', () => {
    expect(polylinePath([])).toBe('');
    expect(polylinePath([[1, 2]])).toBe('');
  });

  it('joins the points with straight segments', () => {
    expect(
      polylinePath([
        [0, 0],
        [10, 0],
        [10, 10],
      ]),
    ).toBe('M 0 0 L 10 0 L 10 10');
  });

  it('closes the loop with Z rather than a repeated point', () => {
    const path = polylinePath(
      [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      true,
    );

    expect(path.endsWith('Z')).toBe(true);
    expect(path.match(/L/g)).toHaveLength(2);
  });

  it('introduces no curves at all', () => {
    // The reason for choosing this over catmullRomPath for a schematic circuit: smoothing a
    // sparse point set rounds a hairpin and a fast sweep to the same radius, and the outline
    // stops reading as a track.
    const path = polylinePath(
      [
        [0, 0],
        [10, 1],
        [3, 9],
        [0, 4],
      ],
      true,
    );

    expect(path).not.toContain('C');
    expect(path).not.toContain('Q');
  });
});
