import type { Page } from '@playwright/test';

/**
 * How long the page must stay still before it counts as settled. A debounce, not a sleep: the
 * wait returns as soon as this much time passes with nothing moving. It has to outlast the gap
 * between hydration and motion creating its first animation (about 40ms measured on `/teams`),
 * and the arrival of a lazily imported component such as the teams dossier.
 */
const QUIET_MS = 300;

/** How long to wait for entrance motion to finish before failing the test. */
const TIMEOUT_MS = 10_000;

/** The computed properties an entrance can change, and that axe folds into the colours it measures. */
const WATCHED = ['opacity', 'filter', 'transform', 'color', 'background-color'] as const;

interface SettleResult {
  settled: boolean;
  elapsedMs: number;
  /** Finite animations still running at the deadline. */
  running: string[];
  /** Elements whose watched style changed in the last frame before the deadline. */
  changing: string[];
}

/**
 * Resolves once entrance motion has finished. Throws if it has not finished within the timeout.
 *
 * `reducedMotion: 'reduce'` does not stop entrance motion here. `BlurFade` and the teams dossier's
 * `AnimatePresence` swap still fade opacity after load, and axe folds opacity into the colours it
 * measures. An axe pass that lands mid-fade reports a contrast ratio that depends on timing: the
 * `/teams` hero CTA measured 2.14 to 4.43:1 mid-fade and had no violations once settled.
 *
 * Two conditions must both hold, because neither is enough on its own:
 *
 * 1. **No finite Web Animation is still running.** motion hands opacity to WAAPI, so the CTA
 *    fade shows up in `document.getAnimations()`, delay included. Infinite loops (the marquee, a
 *    loading pulse) never finish, and they are not entrance motion, so they are ignored.
 * 2. **No element's watched style changed for `QUIET_MS`.** motion drives some values from JS on
 *    `requestAnimationFrame`, and those never appear in `getAnimations()`. Just after load, before
 *    motion has created its animations, `getAnimations()` can also be empty. Targets of an infinite
 *    animation are left out of this check, since their style changes on every frame.
 */
export async function waitForMotionToSettle(page: Page): Promise<void> {
  const result = await page.evaluate(
    async ({ quietMs, timeoutMs, watched }): Promise<SettleResult> => {
      const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const describe = (node: unknown): string => {
        if (!(node instanceof Element)) return String(node);
        const cls = typeof node.className === 'string' ? node.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
        const text = (node.textContent ?? '').trim().slice(0, 40);
        return `${node.tagName.toLowerCase()}${cls ? `.${cls}` : ''} "${text}"`;
      };
      const isInfinite = (a: Animation) => a.effect?.getComputedTiming().endTime === Infinity;
      const targetOf = (a: Animation) => (a.effect instanceof KeyframeEffect ? a.effect.target : null);

      const snapshot = (skip: Set<Element | null>) => {
        const styles = new Map<Element, string>();
        for (const el of Array.from(document.body.querySelectorAll('*'))) {
          if (skip.has(el)) continue;
          const style = getComputedStyle(el);
          styles.set(el, watched.map((p) => style.getPropertyValue(p)).join('|'));
        }
        return styles;
      };

      const start = performance.now();
      let previous = new Map<Element, string>();
      let quietSince = start;
      let running: Animation[] = [];
      let changing: Element[] = [];
      while (performance.now() - start < timeoutMs) {
        await frame();
        const now = performance.now();
        const animations = document.getAnimations();
        running = animations.filter((a) => a.playState !== 'finished' && !isInfinite(a));
        const current = snapshot(new Set(animations.filter(isInfinite).map(targetOf)));
        changing = Array.from(current).filter(([el, value]) => previous.get(el) !== value).map(([el]) => el);
        previous = current;
        if (running.length > 0 || changing.length > 0) quietSince = now;
        else if (now - quietSince >= quietMs) return { settled: true, elapsedMs: now - start, running: [], changing: [] };
      }
      return {
        settled: false,
        elapsedMs: performance.now() - start,
        running: running.slice(0, 10).map((a) => `${a.constructor.name} ${a.playState} on ${describe(targetOf(a))}`),
        changing: changing.slice(0, 10).map(describe),
      };
    },
    { quietMs: QUIET_MS, timeoutMs: TIMEOUT_MS, watched: [...WATCHED] },
  );
  if (!result.settled) {
    throw new Error(
      `waitForMotionToSettle: motion still running after ${Math.round(result.elapsedMs)}ms\n` +
        `  running: ${result.running.join('; ') || 'none'}\n  changing: ${result.changing.join('; ') || 'none'}`,
    );
  }
}
