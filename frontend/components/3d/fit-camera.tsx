'use client';

import { useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

import { VIEW_DIRECTION, fitDistance, fogRange, type SweptCylinder } from '@/lib/scene-fit';

/** `VIEW_DIRECTION` as three.js sees it. Module scope: the value never changes. */
const UNIT_VIEW = new THREE.Vector3(...VIEW_DIRECTION).normalize();

interface FitCameraProps {
  /** The cylinder to keep in frame while the subject turns — `CAR_SWEPT`. */
  subject: SweptCylinder;
  /** What to aim at, in world space — `CAR_TARGET`. */
  target: readonly [number, number, number];
  /** Breathing room around the subject; `1` puts it against an edge of the frame. */
  margin?: number;
  /** Fog colour. This component owns the scene's fog; see below. */
  fogColor: string;
}

/**
 * Places the camera so the whole car is in frame, and moves the fog to match.
 *
 * Must live inside a `<Canvas>` — `useThree` throws outside one, and the canvas aspect is not
 * knowable anywhere else. That is the entire reason this is a component rather than a prop: the
 * binding field of view flips from vertical to horizontal when the canvas turns portrait, which
 * `/showcase`'s `h-[70vh]` canvas does on a phone, and no value computed outside the Canvas can
 * see that.
 *
 * **It owns `scene.fog` rather than leaving a `<fog attach="fog">` in the JSX.** Fog near and far
 * are functions of the camera distance, which is computed here; a declarative `<fog args={...}>`
 * alongside would recreate the fog from stale literals on every re-render and win. `/showcase`
 * shipped `[8, 20]` against a camera at 7.5, and at a fitted distance those planes put the entire
 * car past the far one — a correctly framed car, fogged out to a grey rectangle.
 *
 * R3F re-aims a camera at the origin exactly once, when it first creates it, and its resize
 * handler only touches `aspect`. So this effect's `lookAt` is not clobbered by either.
 *
 * `invalidate()` at the end is for the Inspect modal's `frameloop="demand"` path, where nothing
 * else schedules a frame — the same reason `Invalidator` exists in `f1-hero-scene.tsx`.
 */
export function FitCamera({ subject, target, margin, fogColor }: FitCameraProps) {
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);
  // Width and height separately: `state.size` is a fresh object each resize, so depending on it
  // re-runs this effect on every render rather than on every actual resize.
  const width = useThree((state) => state.size.width);
  const height = useThree((state) => state.size.height);

  const [targetX, targetY, targetZ] = target;
  const { radius, halfHeight } = subject;

  // Layout, not passive: a passive effect runs after the browser has painted, so the first frame
  // would show R3F's own default camera before this corrects it — a visible jump on every mount.
  // Safe here because both scenes are `next/dynamic` with `ssr: false`.
  useLayoutEffect(() => {
    // Zero until the canvas has been measured. It stays zero indefinitely in a hidden browser
    // pane, where ResizeObserver never delivers.
    if (!width || !height) return;

    // Duck-typed rather than `instanceof`: a second copy of three in the tree would make the
    // instance check silently false and leave the camera where R3F put it.
    const perspective = camera as THREE.PerspectiveCamera;
    if (!perspective.isPerspectiveCamera) return;

    const distance = fitDistance({
      radius,
      halfHeight,
      fovDeg: perspective.fov,
      aspect: width / height,
      viewDirection: VIEW_DIRECTION,
      margin,
    });

    perspective.position
      .copy(UNIT_VIEW)
      .multiplyScalar(distance)
      .add(new THREE.Vector3(targetX, targetY, targetZ));
    perspective.lookAt(targetX, targetY, targetZ);
    perspective.updateProjectionMatrix();

    const [near, far] = fogRange(distance, radius);
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.set(fogColor);
      scene.fog.near = near;
      scene.fog.far = far;
    } else {
      scene.fog = new THREE.Fog(fogColor, near, far);
    }

    invalidate();
  }, [
    camera,
    scene,
    invalidate,
    width,
    height,
    radius,
    halfHeight,
    margin,
    fogColor,
    targetX,
    targetY,
    targetZ,
  ]);

  return null;
}
