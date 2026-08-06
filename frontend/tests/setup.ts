import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Globals are off (tests import from 'vitest' explicitly), so RTL's automatic
// cleanup does not install itself — do it here.
afterEach(() => {
  cleanup();
});

/**
 * jsdom ships no IntersectionObserver, and `BlurFade` — which wraps `BriefingCard` and
 * most page sections — calls framer-motion's `useInView`, which throws without one.
 *
 * Everything observed is reported as immediately in view. That is what the real observer
 * does for content already on screen, and it means a component's children are in the DOM
 * for a test to find. It is a gap in the environment, not a stand-in for app code.
 */
class ImmediatelyInView implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: ReadonlyArray<number> = [];

  constructor(private readonly callback: IntersectionObserverCallback) {}

  observe(target: Element): void {
    this.callback(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this as IntersectionObserver,
    );
  }

  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

globalThis.IntersectionObserver = ImmediatelyInView;

/**
 * jsdom implements neither of these. The teams page calls `scrollIntoView` for anchor navigation
 * and `scrollTo` to centre the mobile chip strip; without stubs they throw "not implemented".
 */
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
Element.prototype.scrollTo ??= function scrollTo() {};

/**
 * jsdom has no `matchMedia`. Reporting "no match" mirrors what `useMediaQuery` returns before it
 * has measured anything, so components that gate on a breakpoint render their narrow layout.
 */
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;
