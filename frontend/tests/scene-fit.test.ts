/**
 * Framing the car in a 3D scene.
 *
 * `/showcase` shipped rendering a 22.4-unit car with the camera 7.5 units away — about a quarter
 * of the car filled the frame. Nothing caught it: jsdom has no WebGL, `showcase-page.test.tsx`
 * mocks the whole scene away, and a screenshot is the only other witness.
 *
 * So the arithmetic lives in pure functions here, and the model's dimensions live in a constant
 * checked against the asset in `public/` — the same shape as `LIVERY_BASE_RGB` in
 * `tests/livery.test.ts`, and for the same reason: a re-exported model should fail CI rather than
 * ship badly framed.
 *
 * The assertions below deliberately do **not** restate `fitDistance`'s plane arithmetic. They
 * build the camera basis, project sampled points on the swept cylinder and check each one lands
 * inside the field of view — the perspective test the renderer itself applies. An assertion
 * phrased as "the support point satisfies the plane inequality" would pass on any sign error the
 * implementation and the test happened to share.
 */

import { describe, expect, it } from 'vitest';

import {
  CAR_BOUNDS,
  CAR_SWEPT,
  CAR_TARGET,
  GROUND_Y,
  VIEW_DIRECTION,
  fitDistance,
  fitTarget,
  fogRange,
  groundedOffset,
  sweptCylinder,
} from '@/lib/scene-fit';
import { glbBounds } from './glb';

type Vec3 = [number, number, number];

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalise = (a: Vec3): Vec3 => {
  const length = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / length, a[1] / length, a[2] / length];
};
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Float slack for "inside the frame".
 *
 * The fit is exact, so at `margin: 1` the subject lands on the edge and this helper's own
 * arithmetic rounds it to 1 + 2e-16. Comparing against a bare 1 fails on that, which says
 * nothing about the code under test.
 */
const EDGE = 1 + 1e-9;

/** three.js's camera basis for a `lookAt` with world up — forward, right, up. */
function cameraBasis(direction: Vec3) {
  const unit = normalise(direction);
  const forward: Vec3 = [-unit[0], -unit[1], -unit[2]];
  const right = normalise(cross(forward, [0, 1, 0]));
  return { forward, right, up: cross(right, forward) };
}

/**
 * Points on the two rims of the swept cylinder — where a convex body's silhouette extremes are.
 *
 * 1800 steps is 0.2° apart, which keeps the sampling error under 2e-6 of the frame. At the
 * obvious 180 the nearest sample misses the true extreme by 2.2e-4, which is enough to make an
 * exact-fit assertion look like a fit bug.
 */
function cylinderRim(radius: number, halfHeight: number, centre: Vec3, steps = 1800): Vec3[] {
  const points: Vec3[] = [];
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    for (const dy of [-halfHeight, halfHeight]) {
      points.push([
        centre[0] + radius * Math.cos(angle),
        centre[1] + dy,
        centre[2] + radius * Math.sin(angle),
      ]);
    }
  }
  return points;
}

/**
 * The worst fraction of the frame the subject reaches, per axis.
 *
 * `1` means it exactly touches the edge; above `1` it is cropped. This is the perspective divide
 * the GPU does, written out longhand.
 */
function frameUsage(
  distance: number,
  subject: { radius: number; halfHeight: number },
  centre: Vec3,
  fovDeg: number,
  aspect: number,
) {
  const { forward, right, up } = cameraBasis(VIEW_DIRECTION as Vec3);
  const camera: Vec3 = [
    centre[0] - forward[0] * distance,
    centre[1] - forward[1] * distance,
    centre[2] - forward[2] * distance,
  ];

  const tanVertical = Math.tan(toRadians(fovDeg / 2));
  const tanHorizontal = tanVertical * aspect;

  let worstX = 0;
  let worstY = 0;
  for (const point of cylinderRim(subject.radius, subject.halfHeight, centre)) {
    const relative: Vec3 = [point[0] - camera[0], point[1] - camera[1], point[2] - camera[2]];
    const depth = dot(relative, forward);
    if (depth <= 0) return { x: Infinity, y: Infinity };
    worstX = Math.max(worstX, Math.abs(dot(relative, right)) / (depth * tanHorizontal));
    worstY = Math.max(worstY, Math.abs(dot(relative, up)) / (depth * tanVertical));
  }
  return { x: worstX, y: worstY };
}

describe('CAR_BOUNDS', () => {
  it('matches the model actually shipped in public/', () => {
    /*
     * The guard. Every camera distance on both routes is derived from these three numbers, and
     * they are world-space — the accessors' own min/max describe the car 4.10 tall and 2.66 wide,
     * because the Sketchfab wrappers permute Y-up to Z-up on the way out.
     */
    const measured = glbBounds();

    expect(CAR_BOUNDS.size[0]).toBeCloseTo(measured.size[0]!, 3);
    expect(CAR_BOUNDS.size[1]).toBeCloseTo(measured.size[1]!, 3);
    expect(CAR_BOUNDS.size[2]).toBeCloseTo(measured.size[2]!, 3);
    expect(CAR_BOUNDS.centre[0]).toBeCloseTo(measured.centre[0]!, 3);
    expect(CAR_BOUNDS.centre[1]).toBeCloseTo(measured.centre[1]!, 3);
    expect(CAR_BOUNDS.centre[2]).toBeCloseTo(measured.centre[2]!, 3);
    expect(CAR_BOUNDS.minY).toBeCloseTo(measured.minY, 3);
  });

  it('is longer along x than it is wide or tall', () => {
    // If a re-export lands axis-permuted, every other assertion here still passes on the wrong
    // numbers. This one says which way round the car is.
    expect(CAR_BOUNDS.size[0]).toBeGreaterThan(CAR_BOUNDS.size[2]);
    expect(CAR_BOUNDS.size[2]).toBeGreaterThan(CAR_BOUNDS.size[1]);
  });
});

describe('sweptCylinder', () => {
  it('reaches every corner of the box at every rotation about y', () => {
    /*
     * The car turns. Fitting its resting bounding box crops it the moment it reaches 45°, so the
     * volume to fit is the cylinder it sweeps — whose radius is the box's XZ *diagonal*, not its
     * half-length. Using `size[0] / 2` passes a static check and clips a rotating car.
     */
    const [x, y, z] = CAR_BOUNDS.size;
    const { radius, halfHeight } = sweptCylinder(CAR_BOUNDS.size);

    expect(halfHeight).toBeCloseTo(y / 2, 9);
    for (let degrees = 0; degrees < 360; degrees += 5) {
      const angle = toRadians(degrees);
      for (const cx of [-x / 2, x / 2]) {
        for (const cz of [-z / 2, z / 2]) {
          const rx = cx * Math.cos(angle) - cz * Math.sin(angle);
          const rz = cx * Math.sin(angle) + cz * Math.cos(angle);
          expect(Math.hypot(rx, rz)).toBeLessThanOrEqual(radius + 1e-9);
        }
      }
    }
  });

  it('is tight — a corner actually reaches the radius', () => {
    // Without this, `sweptCylinder` could return 1000 and pass the test above.
    const [x, , z] = CAR_BOUNDS.size;

    expect(sweptCylinder(CAR_BOUNDS.size).radius).toBeCloseTo(Math.hypot(x / 2, z / 2), 9);
  });

  it('is a cylinder and not a sphere — the car is far wider than it is tall', () => {
    /*
     * The distinction that sets the camera distance. An enclosing *sphere* of this car has radius
     * 6.13 and is four times too tall; fitting one backs the camera off 19% further than it needs
     * and leaves the car filling half the frame. The first cut of this code did exactly that, and
     * every "does it fit" assertion passed.
     */
    const { radius, halfHeight } = sweptCylinder(CAR_BOUNDS.size);

    expect(radius / halfHeight).toBeGreaterThan(4);
  });
});

describe('fitDistance', () => {
  const centre = CAR_TARGET as Vec3;

  it('leaves the whole car inside a landscape frustum', () => {
    const fovDeg = 50;
    const aspect = 1231 / 628;

    const distance = fitDistance({ ...CAR_SWEPT, fovDeg, aspect, viewDirection: VIEW_DIRECTION });

    const usage = frameUsage(distance, CAR_SWEPT, centre, fovDeg, aspect);
    expect(usage.x).toBeLessThanOrEqual(EDGE);
    expect(usage.y).toBeLessThanOrEqual(EDGE);
  });

  it('leaves the whole car inside a portrait frustum', () => {
    /*
     * The regression a desktop-only number cannot survive. `/showcase`'s canvas is `h-[70vh]` at
     * full width, so on a 390px phone it is *taller than it is wide* and the horizontal field of
     * view binds instead of the vertical one. A distance computed from `fovDeg` alone crops the
     * nose and tail off every phone.
     */
    const fovDeg = 50;
    const aspect = 0.606;

    const distance = fitDistance({ ...CAR_SWEPT, fovDeg, aspect, viewDirection: VIEW_DIRECTION });

    const usage = frameUsage(distance, CAR_SWEPT, centre, fovDeg, aspect);
    expect(usage.x).toBeLessThanOrEqual(EDGE);
    expect(usage.y).toBeLessThanOrEqual(EDGE);
  });

  it('fills the frame it is given rather than hedging', () => {
    /*
     * The other half of correctness, and the half a "does it fit" assertion cannot see: at
     * `margin: 1` the car should *touch* an edge. The enclosing-sphere fit this replaces passed
     * every fit assertion while leaving the car at 39% of the frame width.
     */
    const fovDeg = 50;
    const aspect = 1231 / 628;

    const distance = fitDistance({ ...CAR_SWEPT, fovDeg, aspect, viewDirection: VIEW_DIRECTION });

    const usage = frameUsage(distance, CAR_SWEPT, centre, fovDeg, aspect);
    expect(Math.max(usage.x, usage.y)).toBeCloseTo(1, 4);
  });

  it('backs further off a portrait canvas than a landscape one', () => {
    const landscape = fitDistance({
      ...CAR_SWEPT,
      fovDeg: 50,
      aspect: 2.03,
      viewDirection: VIEW_DIRECTION,
    });
    const portrait = fitDistance({
      ...CAR_SWEPT,
      fovDeg: 50,
      aspect: 0.606,
      viewDirection: VIEW_DIRECTION,
    });

    expect(portrait).toBeGreaterThan(landscape);
  });

  it('backs further off for a narrower lens', () => {
    const wide = fitDistance({
      ...CAR_SWEPT,
      fovDeg: 50,
      aspect: 2,
      viewDirection: VIEW_DIRECTION,
    });
    const narrow = fitDistance({
      ...CAR_SWEPT,
      fovDeg: 45,
      aspect: 2,
      viewDirection: VIEW_DIRECTION,
    });

    expect(narrow).toBeGreaterThan(wide);
  });

  it('accounts for how steeply the camera looks down', () => {
    /*
     * Not a detail: looking down at a car pushes its near-bottom edge toward the bottom of frame,
     * and that edge is what binds at this scene's 19.5° elevation. A fit that ignored the view
     * direction would be wrong by the height of the car whenever the angle changed.
     */
    const level = fitDistance({
      ...CAR_SWEPT,
      fovDeg: 50,
      aspect: 2,
      viewDirection: [1, 0.05, 1],
    });
    const steep = fitDistance({
      ...CAR_SWEPT,
      fovDeg: 50,
      aspect: 2,
      viewDirection: [1, 1.6, 1],
    });

    expect(steep).toBeGreaterThan(level);
  });

  it('adds breathing room in proportion to the margin', () => {
    const tight = fitDistance({
      ...CAR_SWEPT,
      fovDeg: 50,
      aspect: 2,
      viewDirection: VIEW_DIRECTION,
    });
    const loose = fitDistance({
      ...CAR_SWEPT,
      fovDeg: 50,
      aspect: 2,
      viewDirection: VIEW_DIRECTION,
      margin: 1.15,
    });

    expect(loose).toBeCloseTo(tight * 1.15, 9);
  });
});

describe('fogRange', () => {
  const distance = fitDistance({
    ...CAR_SWEPT,
    fovDeg: 50,
    aspect: 2.03,
    viewDirection: VIEW_DIRECTION,
    margin: 1.15,
  });

  it('starts no nearer than the car', () => {
    /*
     * The trap behind "just move the camera back". `/showcase` ships `fog=[8, 20]` against a
     * camera 7.5 units out; at a fitted distance the whole car sits past 20 and the scene fogs to
     * an empty grey rectangle. Fog has to move with the camera.
     */
    const [near] = fogRange(distance, CAR_SWEPT.radius);

    expect(near).toBeGreaterThanOrEqual(distance - CAR_SWEPT.radius);
  });

  it('does not swallow the tail of the car', () => {
    const [, far] = fogRange(distance, CAR_SWEPT.radius);

    expect(far).toBeGreaterThan(distance + CAR_SWEPT.radius);
  });

  it('still fades the ground plane out before its far edge', () => {
    // Fog earns its place by hiding the 50x50 plane's hard edge. A far plane out at 1000 would
    // pass both assertions above and show the seam.
    const [, far] = fogRange(distance, CAR_SWEPT.radius);

    expect(far).toBeLessThan(distance + 25);
  });
});

describe('groundedOffset', () => {
  it('rests the car on the ground plane', () => {
    /*
     * Both scenes had this wrong in opposite directions: `/showcase` positioned the model at
     * `y = 0`, floating it 0.41 above the plane, and the Inspect modal at `y = -0.5`, sinking the
     * wheels 0.09 through it. Neither is a number anyone chose — the model's own lowest point is
     * -0.0898, not 0.
     */
    const [, offsetY] = groundedOffset(CAR_BOUNDS, GROUND_Y);

    expect(CAR_BOUNDS.minY + offsetY).toBeCloseTo(GROUND_Y, 9);
  });

  it('puts the car on the axis it rotates about', () => {
    /*
     * `RealCar` spins a group about the world origin, and the model's own centre is 0.219 off it
     * in x — so the car orbits rather than turning on the spot, and at `scale={2}` that is a
     * 0.44-unit wobble.
     */
    const [offsetX, , offsetZ] = groundedOffset(CAR_BOUNDS, GROUND_Y);

    expect(CAR_BOUNDS.centre[0] + offsetX).toBeCloseTo(0, 9);
    expect(CAR_BOUNDS.centre[2] + offsetZ).toBeCloseTo(0, 9);
  });
});

describe('fitTarget', () => {
  it('aims at the middle of the car, not at the origin under it', () => {
    /*
     * The fault distance alone does not fix. A camera with no explicit target looks at `[0, 0, 0]`,
     * which after grounding is the car's *contact patch* — so the car sits high in frame with the
     * empty floor filling the bottom half.
     */
    const [x, y, z] = fitTarget(CAR_BOUNDS, GROUND_Y);

    expect(x).toBeCloseTo(0, 9);
    expect(z).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(GROUND_Y + CAR_BOUNDS.size[1] / 2, 9);
    expect(y).toBeGreaterThan(GROUND_Y);
  });
});

describe('the constants both scenes consume', () => {
  it('CAR_SWEPT is the shipped car’s swept cylinder', () => {
    expect(CAR_SWEPT).toEqual(sweptCylinder(CAR_BOUNDS.size));
  });

  it('CAR_TARGET is the shipped car’s middle, above the ground plane', () => {
    expect(CAR_TARGET).toEqual(fitTarget(CAR_BOUNDS, GROUND_Y));
  });

  it('frames the whole car on a desktop /showcase canvas', () => {
    /*
     * The end-to-end number, against the canvas the route really renders — measured live at
     * 1231x628. The shipped camera sat 7.5 units out with the car scaled to 22.5, showing roughly
     * a quarter of it.
     */
    const aspect = 1231 / 628;
    const distance = fitDistance({
      ...CAR_SWEPT,
      fovDeg: 50,
      aspect,
      viewDirection: VIEW_DIRECTION,
      margin: 1.15,
    });

    expect(distance).toBeGreaterThan(7.5);

    const usage = frameUsage(distance, CAR_SWEPT, CAR_TARGET as Vec3, 50, aspect);
    expect(Math.max(usage.x, usage.y)).toBeLessThanOrEqual(EDGE);
    /*
     * And genuinely uses the canvas — measured at 0.79 of the frame. The enclosing-sphere fit
     * this replaces bottomed out at 0.51 and would fail here, which is the point of the bound:
     * every other assertion in this file passed on that version.
     */
    expect(Math.max(usage.x, usage.y)).toBeGreaterThan(0.75);
  });
});
