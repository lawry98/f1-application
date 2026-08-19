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
 * jsdom ships no ResizeObserver, and the strategy act (`act-strategy.tsx`) constructs one to
 * smooth its panel height between scenarios. A no-op observer is enough here: jsdom lays nothing
 * out, so there is no height to report, and the component keeps its content in the DOM regardless.
 * It is a gap in the environment, not a stand-in for app code.
 */
class NoopResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver = NoopResizeObserver;

/**
 * jsdom implements no scrolling and no media queries. The teams page calls all three of
 * these — `scrollIntoView` to centre the active mobile chip, `scrollTo` via anchor
 * navigation, and `matchMedia` to decide whether to mount the sticky dossier at all.
 *
 * `matchMedia` reports **no match**, so components take their narrow-viewport branch
 * unless a test says otherwise. That is the safer default: the dossier stays unmounted
 * and tests assert what a phone actually renders. A test that wants the wide layout
 * overrides `window.matchMedia` itself.
 */
Element.prototype.scrollIntoView = function scrollIntoView(): void {};

window.scrollTo = function scrollTo(): void {};

window.matchMedia = function matchMedia(query: string): MediaQueryList {
  return {
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  } as MediaQueryList;
};
