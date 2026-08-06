import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { pickActive, useScrollSpy, CLAIM_TIMEOUT_MS } from '@/hooks/use-scroll-spy';

// The winner selection is pure and tested directly. jsdom performs no layout, so an
// end-to-end test of the hook's geometry would assert only what the fake observer was
// told to say — which is worth nothing.
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

/** Captures the observer the hook constructs so a test can drive it. */
class FakeObserver implements IntersectionObserver {
  static latest: FakeObserver | null = null;
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: ReadonlyArray<number> = [];
  readonly observed: Element[] = [];

  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeObserver.latest = this;
  }

  observe(target: Element): void {
    this.observed.push(target);
  }

  /** Report a section as covering `height` px of the activation band. */
  report(entries: { id: string; height: number }[]): void {
    this.callback(
      entries.map(
        ({ id, height }) =>
          ({
            target: document.getElementById(`team-${id}`)!,
            intersectionRect: { height } as DOMRectReadOnly,
            isIntersecting: height > 0,
          }) as unknown as IntersectionObserverEntry,
      ),
      this as IntersectionObserver,
    );
  }

  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

const IDS = ['mercedes', 'ferrari', 'mclaren'];

function mountSections(): void {
  document.body.innerHTML = IDS.map((id) => `<section id="team-${id}"></section>`).join('');
}

describe('useScrollSpy', () => {
  let original: typeof globalThis.IntersectionObserver;

  beforeEach(() => {
    mountSections();
    original = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver = FakeObserver as unknown as typeof IntersectionObserver;
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.IntersectionObserver = original;
    FakeObserver.latest = null;
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('starts on the first id', () => {
    const { result } = renderHook(() => useScrollSpy(IDS));
    expect(result.current.activeId).toBe('mercedes');
  });

  it('observes every section exactly once', () => {
    renderHook(() => useScrollSpy(IDS));
    expect(FakeObserver.latest!.observed).toHaveLength(3);
  });

  it('follows the observer when nothing has been claimed', () => {
    const { result } = renderHook(() => useScrollSpy(IDS));
    act(() => {
      FakeObserver.latest!.report([{ id: 'mclaren', height: 120 }]);
    });
    expect(result.current.activeId).toBe('mclaren');
  });

  // Feedback must not wait for an observer. This is brief item 5's first half.
  it('claims immediately on click', () => {
    const { result } = renderHook(() => useScrollSpy(IDS));
    act(() => {
      result.current.claim('mclaren');
    });
    expect(result.current.activeId).toBe('mclaren');
  });

  it('ignores the observer while a claim is outstanding', () => {
    const { result } = renderHook(() => useScrollSpy(IDS));
    act(() => {
      result.current.claim('mclaren');
    });
    // Mid-flight through the smooth scroll the band is still covered by earlier sections.
    act(() => {
      FakeObserver.latest!.report([{ id: 'ferrari', height: 300 }]);
    });
    expect(result.current.activeId).toBe('mclaren');
  });

  // The observer owns the state again once it agrees — the claim is a lease, not a lock.
  it('hands control back as soon as the observer agrees with the claim', () => {
    const { result } = renderHook(() => useScrollSpy(IDS));
    act(() => {
      result.current.claim('mclaren');
    });
    act(() => {
      FakeObserver.latest!.report([{ id: 'mclaren', height: 400 }]);
    });
    act(() => {
      FakeObserver.latest!.report([{ id: 'ferrari', height: 400 }, { id: 'mclaren', height: 0 }]);
    });
    expect(result.current.activeId).toBe('ferrari');
  });

  // A short final section may never cover the band, so agreement may never arrive. Without
  // the timeout the spy would be frozen on the claimed id for the rest of the page's life.
  it('releases the claim on a timeout even if the observer never agrees', () => {
    const { result } = renderHook(() => useScrollSpy(IDS));
    act(() => {
      result.current.claim('mclaren');
    });
    act(() => {
      vi.advanceTimersByTime(CLAIM_TIMEOUT_MS + 1);
    });
    act(() => {
      FakeObserver.latest!.report([{ id: 'ferrari', height: 200 }]);
    });
    expect(result.current.activeId).toBe('ferrari');
  });

  it('does not blank the active id when the band is briefly uncovered', () => {
    const { result } = renderHook(() => useScrollSpy(IDS));
    act(() => {
      FakeObserver.latest!.report([{ id: 'mclaren', height: 120 }]);
    });
    act(() => {
      FakeObserver.latest!.report([{ id: 'mclaren', height: 0 }]);
    });
    expect(result.current.activeId).toBe('mclaren');
  });

  it('disconnects on unmount', () => {
    const spy = vi.spyOn(FakeObserver.prototype, 'disconnect');
    const { unmount } = renderHook(() => useScrollSpy(IDS));
    unmount();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
