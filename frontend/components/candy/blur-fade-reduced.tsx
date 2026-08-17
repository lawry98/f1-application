'use client';

import type { ComponentProps } from 'react';

import { BlurFade } from '@/components/ui/blur-fade';
import { useReducedMotionSafe } from '@/hooks/use-reduced-motion-safe';

/**
 * Exactly `BlurFade`'s props. Taken through `ComponentProps` rather than restated because
 * `components/ui/blur-fade.tsx` does not export its interface and is **vendored** — it may be
 * regenerated at any time, and a hand-copied prop list would then diverge silently.
 */
export type BlurFadeReducedProps = ComponentProps<typeof BlurFade>;

/**
 * `BlurFade` with a reduced-motion branch.
 *
 * **Why this is a wrapper and not a fix in `BlurFade` itself.** The vendored `BlurFade` has no
 * reduced-motion branch at all — it animates a 6px translate and a 6px blur over 0.4s off
 * `useInView`, unconditionally — and it wraps eight landing sections plus the six feature cards,
 * so under `prefers-reduced-motion` the whole landing page still translates and un-blurs as you
 * scroll. `components/ui/` is generated and must not be hand-edited (`CLAUDE.md`), so the fix has
 * to live at the call sites; this is the call sites' shared piece of it.
 *
 * **The reduced state is the finished state, never a frozen initial one.** It would be easy to
 * "disable the animation" by leaving the element on its `hidden` variant, which under this
 * component means `opacity: 0` — content that is present in the DOM and invisible on screen is
 * strictly worse than the animation it replaced. So the reduced branch pins the *visible* values
 * and turns the initial animation off entirely:
 *
 *   - `initial={false}` tells motion to mount already at the animate target, with no first
 *     transition. `BlurFade` sets `initial="hidden"` but spreads `...props` **after** it on the
 *     `motion.div`, so passing these through props is enough to override them — no fork of the
 *     vendored file, and no reliance on its `variant` prop, whose type only admits a `y`.
 *   - `animate` is an explicit target rather than a variant label, so it cannot be re-gated by
 *     `useInView`: the content is complete and readable whether or not it has been scrolled to.
 *   - `filter: 'blur(0px)'` is named rather than omitted. Dropping a value from a target does not
 *     reliably return it to its style default in motion, and the one thing that must not happen
 *     here is a permanently blurred section.
 *
 * **The two `key`s are load-bearing and were arrived at by a failing test, not by taste.** Motion
 * reads `initial` once, at mount. The preference can only be known *after* mount (see below), so
 * without the keys the element is already mounted on `initial="hidden"` when the branch flips, and
 * `initial={false}` is simply ignored: motion instead *animates* opacity 0 → 1, which lands on the
 * next frame. Measured in jsdom, the element sat at `opacity: 0` after the flip — the exact
 * "present in the DOM, invisible on screen" state this component exists to prevent. Distinct keys
 * remount it, so `initial={false}` is read at a real mount and the final values are written during
 * the commit instead of by an animation.
 *
 * **Why `useReducedMotionSafe` and not motion's `useReducedMotion`.** This branches on the
 * preference, and motion's hook returns `null` during SSR but the real preference on the client's
 * first render — a confirmed hydration error on `/` under emulated reduced motion. The safe hook
 * returns `false` on the server and on the first client render, then flips in a layout effect
 * (before paint, so no un-reduced frame is ever painted). See `hooks/use-reduced-motion-safe.ts`.
 *
 * Adoption is an import swap plus the name: `BlurFade` → `BlurFadeReduced`. Every prop is passed
 * through untouched on the un-reduced path, so a call site's `inView`, `delay`, `direction` and
 * `className` all keep behaving exactly as they did.
 */
export function BlurFadeReduced({ children, ...props }: BlurFadeReducedProps) {
  const prefersReducedMotion = useReducedMotionSafe();

  if (prefersReducedMotion) {
    return (
      <BlurFade
        key="reduced"
        {...props}
        initial={false}
        animate={{ opacity: 1, filter: 'blur(0px)', x: 0, y: 0 }}
        transition={{ duration: 0 }}
      >
        {children}
      </BlurFade>
    );
  }

  return (
    <BlurFade key="motion" {...props}>
      {children}
    </BlurFade>
  );
}
