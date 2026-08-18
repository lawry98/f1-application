import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LIFECYCLE, LIFECYCLE_COUNT } from '@/components/tyres/lifecycle/lifecycle-data';
import { useLifecycleActiveStage } from '@/hooks/use-lifecycle-active-stage';

/*
 * The hook, in isolation from the DOM it observes. `renderHook` mounts no stage elements, so the
 * IntersectionObserver has nothing to report and the active stage is driven purely by deliberate
 * navigation — which is exactly the path a keyboard or button user takes, and the one that must be
 * predictable. Scroll-driven activation is a browser behaviour and is verified there, not here.
 */

afterEach(() => {
  vi.useRealTimers();
});

describe('useLifecycleActiveStage', () => {
  it('starts on the first stage, moving forward', () => {
    const { result } = renderHook(() => useLifecycleActiveStage());
    expect(result.current.activeIndex).toBe(0);
    expect(result.current.direction).toBe(1);
  });

  it('jumps straight to a selected stage and tracks the travel direction', () => {
    const { result } = renderHook(() => useLifecycleActiveStage());

    act(() => result.current.goToStage(4));
    expect(result.current.activeIndex).toBe(4);
    expect(result.current.direction).toBe(1);

    act(() => result.current.goToStage(1));
    expect(result.current.activeIndex).toBe(1);
    expect(result.current.direction).toBe(-1);
  });

  it('clamps out-of-range selections to the ends', () => {
    const { result } = renderHook(() => useLifecycleActiveStage());

    act(() => result.current.goToStage(99));
    expect(result.current.activeIndex).toBe(LIFECYCLE_COUNT - 1);

    act(() => result.current.goToStage(-5));
    expect(result.current.activeIndex).toBe(0);
  });

  it('announces only the last of a rapid burst, and only after it settles', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useLifecycleActiveStage());

    act(() => {
      result.current.goToStage(2);
      result.current.goToStage(5);
    });

    // Nothing announced mid-burst.
    expect(result.current.announcement).toBe('');

    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(result.current.announcement).toBe(
      `Stage 6 of ${LIFECYCLE_COUNT}: ${LIFECYCLE[5]!.stage.name}`,
    );
  });
});
