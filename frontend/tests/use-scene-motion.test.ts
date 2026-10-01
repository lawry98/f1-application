import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useSceneMotion } from '@/hooks/use-scene-motion';

let reduceMotion = false;
vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return { ...actual, useReducedMotion: () => reduceMotion };
});

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  reduceMotion = false;
  setVisibility('visible');
});

/**
 * The browser suite (`browser/showcase-motion.spec.ts`) proves what each loop does on `/showcase`.
 * This holds the pairing both scenes share, including `float`, which only the Inspect modal's car
 * uses and no browser check reaches.
 */
describe('useSceneMotion', () => {
  it('runs the loop and passes the motion through with no preference', () => {
    const { result } = renderHook(() => useSceneMotion({ rotationSpeed: 0.3, float: true }));
    expect(result.current).toEqual({ frameloop: 'always', rotationSpeed: 0.3, float: true });
  });

  it('draws on demand and holds the car still under reduced motion', () => {
    reduceMotion = true;
    const { result } = renderHook(() => useSceneMotion({ rotationSpeed: 0.3, float: true }));
    expect(result.current).toEqual({ frameloop: 'demand', rotationSpeed: 0, float: false });
  });

  it('draws nothing while the tab is hidden, whatever the preference', () => {
    reduceMotion = true;
    const { result } = renderHook(() => useSceneMotion({ rotationSpeed: 0.15 }));
    act(() => setVisibility('hidden'));
    expect(result.current.frameloop).toBe('never');
  });
});
