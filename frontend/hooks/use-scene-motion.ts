'use client';

import { useReducedMotion } from 'motion/react';

import { useDocumentVisible } from '@/hooks/use-document-visible';

interface CarMotion {
  rotationSpeed: number;
  float?: boolean;
}

interface SceneMotion {
  frameloop: 'never' | 'demand' | 'always';
  rotationSpeed: number;
  float: boolean;
}

/**
 * A car scene's frame loop and its car's motion, decided together because each is only right with
 * the other. Both scenes take it: `/showcase` once had neither half, so under
 * `prefers-reduced-motion` its car kept turning and the canvas drew every frame, even in a
 * background tab.
 *
 * `never` while the tab is hidden, which is purely a saving.
 *
 * `demand` under reduced motion, with the car still: continuous rotation is exactly the sustained
 * movement `prefers-reduced-motion` asks to be spared. The two go together. A moving car under
 * `demand` freezes, because `useFrame` turns it and fires only when a frame is drawn, and then
 * jumps by however long the scene sat idle whenever one is. Under `demand` a frame is drawn only
 * on request: R3F's reconciler asks on a scene-graph change, and `RealCar` asks after repainting
 * its livery.
 *
 * `always` otherwise, with the motion passed through.
 */
export function useSceneMotion({ rotationSpeed, float = false }: CarMotion): SceneMotion {
  const visible = useDocumentVisible();
  const reducedMotion = useReducedMotion() ?? false;

  return {
    frameloop: !visible ? 'never' : reducedMotion ? 'demand' : 'always',
    rotationSpeed: reducedMotion ? 0 : rotationSpeed,
    float: !reducedMotion && float,
  };
}
