import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { pickActive, useScrollSpy, CLAIM_TIMEOUT_MS } from '@/hooks/use-scroll-spy';

// The winner selection is pure and tested directly, against real numbers.
describe('pickActive', () => {
  const ids = ['a', 'b', 'c'];

  it('picks the id covering most of the band', () => {
    expect(pickActive(ids, new Map([['a', 10], ['b', 90]]))).toBe('b');
  });

  it('returns null when nothing covers the band', () => {
    expect(pickActive(ids, new Map())).toBeNull();
    expect(pickActive(ids, new Map([['a', 0], ['b', 0]]))).toBeNull();
  });

  // Two adjacent sections taller than the viewport cover the band equally at the exact
  // boundary. Without a deterministic tiebreak that is the flicker the old per-section
  // observers produced.
  it('breaks ties by document order', () => {
    expect(pickActive(ids, new Map([['b', 50], ['c', 50]]))).toBe('b');
    expect(pickActive(['c', 'b', 'a'], new Map([['b', 50], ['c', 50]]))).toBe('c');
  });

  it('ignores ids it was not given', () => {
    expect(pickActive(ids, new Map([['zzz', 999], ['a', 1]]))).toBe('a');
  });
});

/*
 * ---------------------------------------------------------------------------
 * The scroll simulation, and why the hook is tested through one
 * ---------------------------------------------------------------------------
 *
 * This suite used to drive a fake `IntersectionObserver` and hand it the coverage numbers
 * it should report. Such a test can only ever prove that `pickActive` was called with what
 * the test itself just said, and it passed — through thirteen task reviews and a
 * whole-branch review — against a hook that did not track scroll at all.
 *
 * So coverage is not asserted here, it is *derived*: sections sit at fixed document
 * offsets, every rect is computed from a virtual scroll position, and the test drives
 * scroll events and animation frames the way a browser does. `trueWinner()` computes the
 * expected answer from that layout model alone, without going near the hook.
 *
 * Any implementation that stops reacting to scroll fails these, whatever mechanism it uses.
 */

/** Matches the real page at 1440x900. */
const VIEWPORT_HEIGHT = 900;
/** Everything above the first section: the hero. */
const HERO_HEIGHT = 900;
/**
 * Measured on the real page, where sections run 544-624px. The value matters: coverage
 * peaks at 270/560 = 0.48 of a section's own area. That is what defeated the observer
 * implementation, whose 0.5 threshold was therefore unreachable, and it is the regime a
 * replacement has to work in.
 */
const SECTION_HEIGHT = 560;
const SECTION_WIDTH = 1000;

/**
 * The activation band in px: 8% to 38% of the viewport, as the hook documents. Written as
 * literals rather than imported, so the test asserts the contract and not whatever the
 * hook currently computes.
 */
const BAND_TOP_PX = 72;
const BAND_BOTTOM_PX = 342;

const LAYOUT_IDS = ['mercedes', 'ferrari', 'mclaren', 'red-bull', 'haas'];

/** Virtual scroll position. Every rect in the simulation is derived from this. */
let scrollY = 0;

const sectionTop = (index: number): number => HERO_HEIGHT + index * SECTION_HEIGHT;

const overlapWithBand = (top: number, height: number): number =>
  Math.max(0, Math.min(top + height, BAND_BOTTOM_PX) - Math.max(top, BAND_TOP_PX));

/**
 * The correct answer at the current scroll position, computed from the layout model alone.
 * Deliberately independent of the hook — including of `pickActive` — so that a wrong answer
 * is a wrong answer and not a mistake the two share.
 */
function trueWinner(): string | null {
  let best: string | null = null;
  let bestValue = 0;
  LAYOUT_IDS.forEach((id, index) => {
    const value = overlapWithBand(sectionTop(index) - scrollY, SECTION_HEIGHT);
    if (value > bestValue) {
      bestValue = value;
      best = id;
    }
  });
  return best;
}

function mountLayout(): void {
  document.body.innerHTML = LAYOUT_IDS.map((id) => `<section id="team-${id}"></section>`).join('');
  LAYOUT_IDS.forEach((id, index) => {
    const el = document.getElementById(`team-${id}`)!;
    Object.defineProperty(el, 'getBoundingClientRect', {
      configurable: true,
      value: (): DOMRect => {
        const top = sectionTop(index) - scrollY;
        return {
          top,
          bottom: top + SECTION_HEIGHT,
          left: 0,
          right: SECTION_WIDTH,
          width: SECTION_WIDTH,
          height: SECTION_HEIGHT,
          x: 0,
          y: top,
          toJSON: () => ({}),
        } as DOMRect;
      },
    });
  });
}

/** Animation frames, under the test's control: the hook throttles its work to one. */
let frameQueue = new Map<number, FrameRequestCallback>();
let nextFrameHandle = 1;

function flushFrames(count = 1): void {
  for (let i = 0; i < count; i++) {
    const due = Array.from(frameQueue.values());
    frameQueue = new Map();
    for (const cb of due) cb(i);
  }
}

/** One scroll step, as a browser delivers it: move, notify, then a frame. */
function scrollBy(delta: number): void {
  scrollY += delta;
  window.dispatchEvent(new Event('scroll'));
  flushFrames(1);
}

/** Scroll in 40px steps, the way a wheel or a trackpad does, then stop. */
function scrollTo(target: number): void {
  const step = target > scrollY ? 40 : -40;
  while (Math.abs(target - scrollY) >= 40) scrollBy(step);
  if (target !== scrollY) scrollBy(target - scrollY);
  flushFrames(4);
}

describe('useScrollSpy', () => {
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCancelRaf = globalThis.cancelAnimationFrame;

  const installFrameStubs = (): void => {
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => {
      const handle = nextFrameHandle++;
      frameQueue.set(handle, cb);
      return handle;
    };
    globalThis.cancelAnimationFrame = (handle: number): void => {
      frameQueue.delete(handle);
    };
  };

  // Installed for the whole file, not per test. Testing Library's `cleanup` runs in a
  // later `afterEach` than this suite's own, and unmounting the hook calls
  // `cancelAnimationFrame` — which jsdom does not otherwise have at all.
  beforeAll(installFrameStubs);

  afterAll(() => {
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCancelRaf;
  });

  beforeEach(() => {
    scrollY = 0;
    frameQueue = new Map();
    mountLayout();
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: VIEWPORT_HEIGHT });
    vi.useFakeTimers();
    // Again after `useFakeTimers`, which stubs animation frames itself in some versions.
    installFrameStubs();
  });

  afterEach(() => {
    vi.useRealTimers();
    installFrameStubs();
    document.body.innerHTML = '';
  });

  it('starts on the first id while the hero still fills the band', () => {
    const { result } = renderHook(() => useScrollSpy(LAYOUT_IDS));
    expect(result.current.activeId).toBe('mercedes');
  });

  /**
   * The minimal statement of the bug this suite exists for. Ferrari enters the band at
   * y=1118 covering 22px; by y=1300 it covers 182px against Mercedes' 88px, and nothing
   * has crossed a threshold in between. The observer implementation was still holding the
   * numbers from y=1140 and named Mercedes.
   */
  it('moves to the section that has come to cover most of the band', () => {
    const { result } = renderHook(() => useScrollSpy(LAYOUT_IDS));

    act(() => scrollTo(1100));
    expect(result.current.activeId).toBe('mercedes');

    act(() => scrollTo(1300));
    expect(trueWinner()).toBe('ferrari');
    expect(result.current.activeId).toBe('ferrari');
  });

  /**
   * The sweep, mirroring the browser probe that found this: every position a user might
   * stop scrolling at. Collected into a list so a failure names all of them, not the first.
   */
  it('agrees with the geometry at every position a user might stop at', () => {
    const { result } = renderHook(() => useScrollSpy(LAYOUT_IDS));
    act(() => scrollTo(HERO_HEIGHT));

    const wrong: { y: number; expected: string; actual: string }[] = [];
    const lastY = sectionTop(LAYOUT_IDS.length) - VIEWPORT_HEIGHT;

    while (scrollY < lastY) {
      act(() => scrollTo(scrollY + 200));
      const expected = trueWinner();
      // The band is empty above the first section and below the last. The hook keeps its
      // previous answer there on purpose, so there is nothing to compare against.
      if (expected !== null && result.current.activeId !== expected) {
        wrong.push({ y: scrollY, expected, actual: result.current.activeId });
      }
    }

    expect(wrong).toEqual([]);
  });

  /**
   * Arriving part-way down the page — a deep link, a reload, a Back — with no scroll event
   * to follow. The first paint has to name the right section on its own.
   */
  it('is right at the position it mounts at, without any scrolling', () => {
    scrollY = 1300;
    const { result } = renderHook(() => useScrollSpy(LAYOUT_IDS));
    expect(result.current.activeId).toBe('ferrari');
  });

  it('measures at most once per frame, however many scroll events arrive', () => {
    renderHook(() => useScrollSpy(LAYOUT_IDS));
    act(() => {
      flushFrames();
      for (let i = 0; i < 5; i++) window.dispatchEvent(new Event('scroll'));
    });
    expect(frameQueue.size).toBe(1);
  });

  // Feedback must not wait for a scroll. This is brief item 5's first half.
  it('claims immediately on click', () => {
    const { result } = renderHook(() => useScrollSpy(LAYOUT_IDS));
    act(() => {
      result.current.claim('haas');
    });
    expect(result.current.activeId).toBe('haas');
  });

  it('keeps a claimed id while the scroll to it is still travelling', () => {
    const { result } = renderHook(() => useScrollSpy(LAYOUT_IDS));
    act(() => {
      result.current.claim('haas');
    });
    // Mid-flight the band is covered by sections the user is only passing through.
    act(() => scrollTo(1300));
    expect(trueWinner()).toBe('ferrari');
    expect(result.current.activeId).toBe('haas');
  });

  // The claim is a lease, not a lock: the measurement owns the state again once it agrees.
  it('hands control back as soon as the measurement agrees with the claim', () => {
    const { result } = renderHook(() => useScrollSpy(LAYOUT_IDS));
    act(() => {
      result.current.claim('mclaren');
    });

    act(() => scrollTo(2100));
    expect(result.current.activeId).toBe('mclaren');

    // Control is only proven back once a *different* winner is followed.
    act(() => scrollTo(2700));
    expect(trueWinner()).toBe('red-bull');
    expect(result.current.activeId).toBe('red-bull');
  });

  // A short final section may never cover the band, so agreement may never arrive. Without
  // the timeout the spy would be frozen on the claimed id for the rest of the page's life.
  it('releases the claim on a timeout even if the measurement never agrees', () => {
    const { result } = renderHook(() => useScrollSpy(LAYOUT_IDS));
    act(() => {
      result.current.claim('haas');
    });
    act(() => scrollTo(1300));
    expect(result.current.activeId).toBe('haas');

    act(() => {
      vi.advanceTimersByTime(CLAIM_TIMEOUT_MS + 1);
    });
    act(() => scrollBy(40));

    expect(result.current.activeId).toBe('ferrari');
  });

  it('does not blank the active id when nothing covers the band', () => {
    const { result } = renderHook(() => useScrollSpy(LAYOUT_IDS));
    act(() => scrollTo(3400));
    const settled = result.current.activeId;
    expect(settled).toBe('haas');

    // Past the last section: every rect is above the band.
    act(() => scrollTo(4200));
    expect(trueWinner()).toBeNull();
    expect(result.current.activeId).toBe(settled);
  });

  it('ignores an id with no element in the document', () => {
    const ids = [...LAYOUT_IDS, 'ghost'];
    const { result } = renderHook(() => useScrollSpy(ids));
    expect(() => act(() => scrollTo(1300))).not.toThrow();
    expect(result.current.activeId).toBe('ferrari');
  });

  it('stops measuring after unmount', () => {
    const { unmount } = renderHook(() => useScrollSpy(LAYOUT_IDS));
    act(() => flushFrames());
    unmount();

    window.dispatchEvent(new Event('scroll'));
    expect(frameQueue.size).toBe(0);
  });
});
