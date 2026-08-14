'use client';

import { useEffect, useRef, useState } from 'react';

import { useReducedMotionSafe } from '@/hooks/use-reduced-motion-safe';
import { cn } from '@/lib/utils';

/**
 * The two surfaces the landing page alternates between.
 *
 * `base` (#09090B) is the page's resting colour and `base-warm` (#140B0B) is the red-tinted slab —
 * eleven levels of red apart and nothing else, which is enough to feel as a change of material
 * across a whole section and not enough to read as a border anywhere. The tokens are declared in
 * `tailwind.config.ts`, where `base-warm`'s own docblock already says it exists "for sections that
 * alternate against `base`"; this component is what finally does the alternating.
 */
export type LandingTone = 'base' | 'base-warm';

/**
 * The spec's number: "a 600 ms `background-color` transition on a wrapper". Exported so the test
 * asserts the duration the component actually renders rather than a string retyped beside it.
 */
export const TONE_TRANSITION_MS = 600;

/**
 * `transition-[background-color]`, not `transition-colors`.
 *
 * The spec names one property, and `transition-colors` would also cover `color`, `border-color`,
 * `fill` and `stroke` — none of which change here, but all of which *would* start animating the
 * day someone puts a border or a text colour on one of these wrappers. Naming the property keeps
 * the 600 ms budget on the thing it was measured for.
 *
 * Spelled out as a literal and **not** interpolated from `TONE_TRANSITION_MS`: Tailwind's scanner
 * reads source text, so a class assembled at runtime is a class it never generates and the
 * transition silently does not exist. The test asserts the two agree.
 *
 * **`duration-600`, a real token, and not the `duration-[600ms]` this first shipped as.** The
 * arbitrary form was on the element and did nothing — no rule containing `600ms` existed among the
 * 780 generated, so the wrapper inherited the 150 ms that `transition-[background-color]` sets for
 * itself, and the crossfade ran at a quarter of its specified length. This project's Tailwind emits
 * the standard duration steps and not arbitrary ones; a clean `.next` wipe and full rebuild ruled
 * out a stale cache. The step is defined in `tailwind.config.ts`, which is also the only reason
 * the number is greppable. Neither jsdom nor a screenshot can catch this — it is only visible by
 * reading `transitionDuration` off the live element.
 */
const TONE_TRANSITION = 'transition-[background-color] duration-600';

/**
 * The band a section has to reach before it counts as "in view", as an `IntersectionObserver`
 * `rootMargin`: the middle 60% of the viewport, i.e. the top and bottom fifths are shrunk away.
 *
 * At the observer's default (a `rootMargin` of 0) a section counts as in view the instant one
 * pixel of it crosses the bottom edge, so the 600 ms warm-up would run entirely off screen and the
 * reader would only ever arrive at a section that had already finished changing colour. Shrinking
 * the root is what puts the transition inside the viewport where it can be seen.
 */
const IN_VIEW_BAND = '-20% 0px -20% 0px';

export interface LandingSectionThemeProps {
  /** The surface this section settles on once it is in view. */
  tone: LandingTone;
  children: React.ReactNode;
}

/**
 * The wrapper that gives one landing section its surface colour.
 *
 * **Why `IntersectionObserver` is right here, when `CLAUDE.md` says at length that it was wrong for
 * the `/teams` scroll spy.** That warning is specific and it does not transfer. The spy had to
 * answer *which* of eleven sections covers most of a narrow band near the top of the viewport —
 * a ranking over a shared resource, decided by comparing coverage. `intersectionRatio` cannot
 * express that: it is a fraction of the **target's** area, not of the band, so a section taller
 * than the band can never reach a 0.5 threshold and the observer only fires on the entry and exit
 * crossings. The question here is different in kind: *is this one section in view*, a boolean, per
 * section, with no comparison between sections and no threshold on a ratio at all — several
 * sections may be warm at once and that is not a conflict, it is the correct answer. This is
 * exactly the query `IntersectionObserver` exists for, and doing it with per-frame
 * `getBoundingClientRect` reads would be six observers' worth of layout work in a scroll handler
 * to compute a boolean the platform already computes off the main thread. **Do not "fix" this into
 * the scroll-spy shape.**
 *
 * **Reduced motion takes the tone without the transition.** A 600 ms colour crossfade tied to
 * scroll position is exactly the kind of scroll-driven change `prefers-reduced-motion` asks us to
 * drop, so under the preference the section is simply painted its settled tone from the start: no
 * observer is created, no transition class is emitted, and the page still alternates. The
 * preference is read through `useReducedMotionSafe` rather than motion's own hook because the
 * branch changes an *attribute of the rendered element* — motion's hook returns `null` on the
 * server and the real preference on the client's first render, which is a `className` hydration
 * mismatch; the safe hook reports `false` until a layout effect has run, so the two passes agree
 * and the flip lands before paint.
 */
export function LandingSectionTheme({ tone, children }: LandingSectionThemeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotionSafe();
  const [inView, setInView] = useState(false);

  useEffect(() => {
    // A `base` section is already painted its settled colour, so there is nothing for an observer
    // to change — and under reduced motion the tone is applied statically below. Both cases skip
    // creating the observer entirely rather than creating one and ignoring it.
    if (tone === 'base' || prefersReducedMotion) return;

    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // One target per observer, so the last entry is this section's current state. Toggling
        // *back* on exit is deliberate: it costs nothing (the section is off screen when it
        // happens) and it keeps the rendered class an honest function of what is on screen rather
        // than a latch that only ever moves one way.
        const entry = entries[entries.length - 1];
        if (entry) setInView(entry.isIntersecting);
      },
      { rootMargin: IN_VIEW_BAND },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [tone, prefersReducedMotion]);

  const warm = tone === 'base-warm' && (prefersReducedMotion || inView);

  return (
    <div
      ref={ref}
      // The tone is the contract between this file and `app/page.tsx`'s table, and it is not
      // derivable from the class (a warm section renders `bg-base` until it is in view). Exposing
      // it is what lets a test assert the *assignment* rather than the current animation state.
      data-landing-tone={tone}
      className={cn(
        // Exactly one background class, never `bg-base` plus a conditional `bg-base-warm`:
        // `cn()` is `twMerge`, and relying on it to drop the loser of two background-colour
        // classes is the same shape as the `text-mega text-ink` trap this branch already hit.
        warm ? 'bg-base-warm' : 'bg-base',
        !prefersReducedMotion && tone === 'base-warm' && TONE_TRANSITION,
      )}
    >
      {children}
    </div>
  );
}
