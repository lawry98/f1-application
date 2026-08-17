'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { useReducedMotion } from 'motion/react';

/**
 * `useLayoutEffect` on the client, `useEffect` on the server.
 *
 * React warns that `useLayoutEffect` does nothing on the server, and it is right — but the warning
 * fires on import-time evaluation of the component, not on use, so the standard isomorphic swap is
 * the only way to take the layout timing on the client without the warning during SSR. The layout
 * timing is the point: see `useReducedMotionSafe` below.
 */
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * `useReducedMotion()` that is safe to branch the DOM *structure* on.
 *
 * **The problem this exists to fix, measured rather than reasoned about.** motion's
 * `useReducedMotion()` reads a module-level store that is `{ current: null }` until
 * `initPrefersReducedMotion()` runs, and that only happens in the browser. So it returns `null`
 * during SSR and the user's real preference on the client's *first* render. Any component that
 * branches its returned elements on it therefore renders one tree on the server and a different
 * one on the client's first pass, which is a hydration mismatch. Confirmed in Chromium under
 * emulated reduced motion, on `/`:
 *
 *     Warning: Expected server HTML to contain a matching text node for "Race weekend" in <span>
 *         at RedactedReveal (components/candy/redacted-reveal.tsx)
 *
 * It is invisible without reduced motion emulation on, which is why four components shipped with
 * it: the default path has server and client agreeing on "no preference" by accident.
 *
 * **Why a mounted flag and not a structural rewrite.** The alternative is making both branches emit
 * identical DOM and differ only in animation values — but React 18 also warns on a mismatched
 * `style` attribute, and the branches differ precisely in their initial `opacity`/`scaleX`, so that
 * trades a text-node mismatch for a style one. The server cannot know the preference, so the only
 * correct shape is the two-pass one: first client render reproduces the server, then a commit flips
 * it.
 *
 * **Why `useLayoutEffect` and not `useEffect`.** `useEffect` runs *after* the browser paints, so
 * under reduced motion the user would see one painted frame of the un-reduced initial state — a
 * headline hidden behind a full-width red bar — before the static branch replaced it. A layout
 * effect commits before paint, so the flip is never visible. This is the whole reason the
 * isomorphic swap above exists rather than a plain `useEffect`.
 *
 * **Why this wraps motion's hook instead of reading `matchMedia` directly.** Every candy, landing
 * and teardown test drives reduced motion with a partial `vi.mock('motion/react')` over a mutable
 * flag, because `useReducedMotion()` cannot be driven through `window.matchMedia` in jsdom.
 * Calling motion's hook here keeps all of those mocks working unchanged — a `matchMedia`
 * implementation would have silently disabled the reduced-motion assertion in every one of them
 * while leaving the tests green.
 *
 * Returns `false` on the server and on the first client render, then the real preference. Use it
 * anywhere the *elements returned* differ; motion's own hook is still correct for feeding an
 * animation value, which never reaches the SSR markup.
 */
export function useReducedMotionSafe(): boolean {
  const prefersReducedMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);

  useIsomorphicLayoutEffect(() => {
    setMounted(true);
  }, []);

  return mounted && prefersReducedMotion === true;
}
