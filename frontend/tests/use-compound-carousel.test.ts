import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useCompoundCarousel, stepTo } from '@/hooks/use-compound-carousel';

/*
 * The whole point of this hook is that *one* number — `direction` — drives every animated
 * layer in the explorer, so the tyre, the copy, the indicators and the background type
 * cannot disagree about which way the scene is moving. These tests pin that number.
 */

describe('stepTo', () => {
  const count = 5;

  it('moves forward for a later index', () => {
    expect(stepTo(1, 3, count)).toEqual({ index: 3, direction: 1 });
  });

  it('moves backward for an earlier index', () => {
    expect(stepTo(3, 1, count)).toEqual({ index: 1, direction: -1 });
  });

  /*
   * Selecting what is already selected must not re-trigger the scene. Direction is held at
   * its previous value rather than reset, because a re-render mid-transition would otherwise
   * flip an in-flight animation's direction under it.
   */
  it('is a no-op for the current index', () => {
    expect(stepTo(2, 2, count)).toBeNull();
  });

  it('wraps forward off the end', () => {
    expect(stepTo(count - 1, count, count)).toEqual({ index: 0, direction: 1 });
  });

  it('wraps backward off the start', () => {
    expect(stepTo(0, -1, count)).toEqual({ index: count - 1, direction: -1 });
  });

  /*
   * Wrapping is the one case where "later index" and "forward" disagree: going from the last
   * compound to the first is a *forward* move even though the index decreases. A naive
   * `to > from` would animate it backwards and the scene would appear to rewind.
   */
  it('calls the wrap forward even though the index decreases', () => {
    expect(stepTo(count - 1, count, count)?.direction).toBe(1);
  });

  it('calls the wrap backward even though the index increases', () => {
    expect(stepTo(0, -1, count)?.direction).toBe(-1);
  });
});

describe('useCompoundCarousel', () => {
  const render5 = () => renderHook(() => useCompoundCarousel(5));

  it('starts at the first compound', () => {
    const { result } = render5();
    expect(result.current.index).toBe(0);
  });

  it('starts with a forward direction so the first paint is not a rewind', () => {
    const { result } = render5();
    expect(result.current.direction).toBe(1);
  });

  it('advances and reports a forward direction', () => {
    const { result } = render5();
    act(() => result.current.next());
    expect(result.current).toMatchObject({ index: 1, direction: 1 });
  });

  it('retreats and reports a backward direction', () => {
    const { result } = render5();
    act(() => result.current.next());
    act(() => result.current.previous());
    expect(result.current).toMatchObject({ index: 0, direction: -1 });
  });

  it('wraps from the last compound to the first, still forwards', () => {
    const { result } = render5();
    act(() => result.current.select(4));
    act(() => result.current.next());
    expect(result.current).toMatchObject({ index: 0, direction: 1 });
  });

  it('wraps from the first compound to the last, still backwards', () => {
    const { result } = render5();
    act(() => result.current.previous());
    expect(result.current).toMatchObject({ index: 4, direction: -1 });
  });

  /*
   * A tab three to the right must animate the same way as three Next presses, or clicking
   * the strip would feel like a different control from the arrows.
   */
  it('gives a jump the same direction as the equivalent run of next()', () => {
    const jumped = render5();
    act(() => jumped.result.current.select(3));

    const stepped = render5();
    act(() => stepped.result.current.next());
    act(() => stepped.result.current.next());
    act(() => stepped.result.current.next());

    expect(jumped.result.current.index).toBe(stepped.result.current.index);
    expect(jumped.result.current.direction).toBe(stepped.result.current.direction);
  });

  it('holds the previous direction when the current compound is reselected', () => {
    const { result } = render5();
    act(() => result.current.previous());
    expect(result.current.direction).toBe(-1);
    act(() => result.current.select(4));
    expect(result.current).toMatchObject({ index: 4, direction: -1 });
  });

  it('keeps the callbacks stable so consumers do not re-subscribe every render', () => {
    const { result, rerender } = render5();
    const first = result.current;
    rerender();
    expect(result.current.next).toBe(first.next);
    expect(result.current.previous).toBe(first.previous);
    expect(result.current.select).toBe(first.select);
  });
});
