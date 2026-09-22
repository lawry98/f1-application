/**
 * Placing a camera so the car actually fits the canvas.
 *
 * Both 3D scenes shipped framed by hand, with a literal `camera={{ position: [5, 2.5, 5] }}` —
 * 7.5 units from the origin. The car is **11.24 units long**, so `/showcase` (which also scaled
 * it by 2, to 22.5) showed roughly a quarter of it and the Inspect modal roughly half. The
 * numbers below replace those literals.
 *
 * Five things make this harder than "move the camera back", and each has a test in
 * `tests/scene-fit.test.ts`:
 *
 * 1. **The car rotates.** `RealCar` spins its group continuously, so the volume to fit is the
 *    cylinder the box sweeps, not the box. Its radius is the box's XZ *diagonal* — 5.98, against
 *    a half-length of 5.62.
 * 2. **A cylinder is not a sphere, and the difference is 19% of the distance.** The obvious fit
 *    — enclose the subject in a sphere and use `radius / sin(fov / 2)`, which is exact for a
 *    sphere — models this 2.66-tall car as 12.3 tall. It fits, and it leaves the car filling
 *    39% of the frame width. Measured live: that was the first cut of this file, and every "does
 *    it fit" assertion passed on it.
 * 3. **The binding field of view depends on the canvas.** `/showcase`'s is `h-[70vh]` at full
 *    width: landscape on a desktop, where the vertical fov binds, and **portrait on a phone**,
 *    where the horizontal one does and is far tighter. One hardcoded distance cannot serve both,
 *    which is why this is a function of `aspect`.
 * 4. **The camera looks down, so the bottom of the frame binds.** At this scene's 19.5°
 *    elevation the constraint that actually decides the distance is the car's near-bottom edge
 *    against the bottom plane — not either side, and not the top.
 * 5. **Fog has to move with the camera.** `/showcase` ships `fog=[8, 20]`. A camera fitted at
 *    ~14 units puts most of the car past the far plane and the scene fogs to a grey rectangle.
 *
 * And the model is neither centred nor grounded: its own centre is 0.218 off the rotation axis
 * in x — so it orbits instead of turning on the spot — and its lowest point is -0.090, not 0, so
 * `position={[0, -0.5, 0]}` sinks the wheels through the floor rather than resting them on it.
 *
 * Nothing here touches three.js. The scene component that consumes it is
 * `components/3d/fit-camera.tsx`; keeping the arithmetic pure is what makes it testable at all,
 * given jsdom has no WebGL and a screenshot is the only other witness.
 */

type Vec3 = readonly [number, number, number];

export interface ModelBounds {
  /** World-space extent, in the order `[x, y, z]`. */
  size: Vec3;
  /** World-space midpoint of the box, in the order `[x, y, z]`. */
  centre: Vec3;
  /** World-space lowest point — what has to meet the ground plane. */
  minY: number;
}

/**
 * `public/models/f1-car.glb`, measured in **world** space.
 *
 * World space, not the POSITION accessors': the asset nests its meshes under
 * `Sketchfab_model → F1 2026.fbx → RootNode → Car`, whose matrices cancel out to a net scale of 1
 * but permute Y-up to Z-up on the way. Read the accessors alone and the car is 4.10 tall and 2.66
 * wide; in the scene it is 2.66 tall and 4.10 wide.
 *
 * `tests/scene-fit.test.ts` checks these against the shipped file, so a re-exported model fails
 * CI instead of quietly mis-framing both routes.
 */
export const CAR_BOUNDS: ModelBounds = {
  size: [11.242697, 2.662192, 4.097002],
  centre: [-0.218475, 1.241258, 0],
  minY: -0.089838,
};

/** The y the ground plane and its grid sit at, in both scenes. */
export const GROUND_Y = -0.5;

/**
 * The direction from the subject to the camera, in both scenes.
 *
 * The three-quarter view they were authored with: `[5, 2.5, 5]` is this, times 7.5. Only the
 * *angle* survives from those literals — the distance is computed, because 7.5 units from an
 * 11.24-unit car is a close-up of a sidepod.
 */
export const VIEW_DIRECTION: Vec3 = [1, 0.5, 1];

export interface SweptCylinder {
  /** Horizontal radius — how far the subject reaches from the axis it turns about. */
  radius: number;
  /** Half the subject's height. */
  halfHeight: number;
}

/**
 * The cylinder a box sweeps while turning about its own vertical axis.
 *
 * The radius is the box's XZ diagonal rather than its longest side: a car at 45° puts its nose
 * further from the axis than a car side-on does. Fitting `size[0] / 2` passes a static check and
 * clips a rotating car.
 */
export function sweptCylinder(size: Vec3): SweptCylinder {
  return { radius: Math.hypot(size[0] / 2, size[2] / 2), halfHeight: size[1] / 2 };
}

export interface FitOptions extends SweptCylinder {
  /** The camera's **vertical** field of view in degrees, three.js's `PerspectiveCamera.fov`. */
  fovDeg: number;
  /** Canvas `width / height`. Below 1 the canvas is portrait and the horizontal fov binds. */
  aspect: number;
  /**
   * Direction from the subject to the camera; need not be normalised. Must not be vertical —
   * a camera directly overhead has no `lookAt` basis with world up, and this returns `NaN`.
   */
  viewDirection: Vec3;
  /** Breathing room around the subject; `1` puts it exactly against an edge of the frame. */
  margin?: number;
}

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const normalise = (a: Vec3): Vec3 => {
  const length = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / length, a[1] / length, a[2] / length];
};

/**
 * How far the camera has to sit from the subject for all of it to be in frame.
 *
 * Exact for a cylinder, by its support function. Each of the four side planes of the frustum
 * passes through the camera at a known half-angle `θ` from the view axis, so a plane with inward
 * normal `n` admits the subject exactly when
 *
 * ```
 * d·sin θ  ≥  radius·‖n.xz‖ + halfHeight·|n.y|
 * ```
 *
 * — the left side because the subject's centre is `d` along the view axis, the right because
 * that is the furthest the cylinder reaches against `n`. The answer is the largest `d` the four
 * planes ask for. Which plane wins is not fixed: at this scene's shallow elevation it is the
 * bottom one, on a portrait phone it is a side.
 */
export function fitDistance({
  radius,
  halfHeight,
  fovDeg,
  aspect,
  viewDirection,
  margin = 1,
}: FitOptions): number {
  const unit = normalise(viewDirection);
  const forward: Vec3 = [-unit[0], -unit[1], -unit[2]];
  // `right` is horizontal for any non-vertical view direction, which is why the two side planes
  // stay symmetric while the top and bottom ones do not.
  const right = normalise(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);

  const verticalHalf = (fovDeg * Math.PI) / 360;
  const horizontalHalf = Math.atan(Math.tan(verticalHalf) * aspect);

  let distance = 0;
  for (const [halfAngle, axis] of [
    [horizontalHalf, right],
    [verticalHalf, up],
  ] as const) {
    const sin = Math.sin(halfAngle);
    const cos = Math.cos(halfAngle);
    for (const side of [1, -1]) {
      const normal: Vec3 = [
        sin * forward[0] - side * cos * axis[0],
        sin * forward[1] - side * cos * axis[1],
        sin * forward[2] - side * cos * axis[2],
      ];
      const reach = radius * Math.hypot(normal[0], normal[2]) + halfHeight * Math.abs(normal[1]);
      distance = Math.max(distance, reach / sin);
    }
  }

  return margin * distance;
}

/** How far past the subject fog takes to reach full density, as a multiple of `radius`. */
const FOG_DEPTH_IN_RADII = 3;

/**
 * Fog near and far planes for a camera sitting `distance` from a subject of `radius`.
 *
 * Fog is here to fade the 50x50 ground plane out before its own hard edge, not to touch the car,
 * so it starts at the subject's centre — the nose, a full radius nearer, stays clear — and
 * reaches full density three radii behind it. The tail ends up about a third fogged, which is the
 * depth cue; the plane is gone well before its edge.
 */
export function fogRange(distance: number, radius: number): [number, number] {
  return [distance, distance + FOG_DEPTH_IN_RADII * radius];
}

/**
 * The translation that puts a model on its rotation axis and rests it on the ground plane.
 *
 * Applied to the model *inside* the group that spins, so the car turns on the spot instead of
 * orbiting the world origin 0.218 units away, and so the scene component no longer needs to say
 * where the exporter happened to leave the pivot.
 */
export function groundedOffset(bounds: ModelBounds, groundY: number): [number, number, number] {
  return [-bounds.centre[0], groundY - bounds.minY, -bounds.centre[2]];
}

/**
 * The point the camera should look at: the middle of the car's height, above where it stands.
 *
 * A three.js camera with no explicit target looks at `[0, 0, 0]`, which once the car is grounded
 * is its contact patch. Aiming there sits the car high in frame over half a canvas of empty
 * floor — the part of the miscomposition that moving the camera back does not fix.
 */
export function fitTarget(bounds: ModelBounds, groundY: number): [number, number, number] {
  return [0, groundY + bounds.size[1] / 2, 0];
}

/** The shipped car's swept cylinder — what both scenes ask {@link fitDistance} to frame. */
export const CAR_SWEPT = sweptCylinder(CAR_BOUNDS.size);

/** {@link fitTarget} for the shipped car — what both scenes aim at. */
export const CAR_TARGET = fitTarget(CAR_BOUNDS, GROUND_Y);

/*
 * The two margins.
 *
 * `1` is not "no margin" — it is the swept *envelope* exactly touching the frame, and the car is
 * not a solid cylinder. Measured live at `margin: 1`, the real mesh reaches 82% of the frame at
 * its worst orientation and well under that at most. So `1` is already a comfortable frame, and
 * anything below it trades the envelope's guarantee for a crop at some angle of the rotation.
 *
 * Both fits are also set by the *worst* pose — a car pointing at the camera spans far more of a
 * 19.5°-elevation frame than a car side-on — so a large margin on top of that reads as a small
 * car for most of the turn, which is what 1.15 did.
 */

/** `/showcase`: a little air, on a route whose whole purpose is the car. */
export const SHOWCASE_FIT_MARGIN = 1.1;

/**
 * The Inspect modal: the tighter of the two, as it shipped. Its 45° lens does most of that work
 * — a longer lens on a smaller panel — and this takes the last of the slack out. What was never
 * deliberate about the old crop is that it cut the car in half.
 */
export const INSPECT_FIT_MARGIN = 1;
