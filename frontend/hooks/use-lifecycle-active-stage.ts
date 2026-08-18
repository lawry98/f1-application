'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { LIFECYCLE, LIFECYCLE_COUNT } from '@/components/tyres/lifecycle/lifecycle-data';

/**
 * Which lifecycle stage is active, and how the reader got there.
 *
 * The active stage is driven two ways that must not fight each other:
 *
 * 1. **Free scrolling** picks the stage whose card is nearest a fixed activation line ~45% down
 *    the viewport. This is an `IntersectionObserver` with a *zero-height* root band at that line
 *    (`rootMargin` insets summing to −100%), so normally exactly the card straddling the line is
 *    reported. Among any reported cards the nearest to the line wins, measured from a **fresh**
 *    `getBoundingClientRect` at callback time — never a cached rect, which is the staleness trap
 *    `hooks/use-scroll-spy.ts` documents at length. This deliberately does *not* use
 *    `intersectionRatio` thresholds, for the same reason that file records.
 *
 * 2. **Deliberate navigation** (a numbered step, Previous/Next) *claims* its target: it sets the
 *    active stage immediately, scrolls the card to the line, and suppresses scroll-driven updates
 *    until the observer independently agrees or `CLAIM_TIMEOUT_MS` elapses. Rapid clicks therefore
 *    resolve to the last one — each claim supersedes the previous target and the scroll follows it.
 *
 * The observer stub in `tests/setup.ts` reports every observed element as intersecting with no
 * rect; the fresh-rect read returns zeroes in jsdom, so every distance ties and the tie-breaks to
 * the lowest index — leaving stage 0 active at first render, which the page tests rely on.
 */

/** How long a click's claim suppresses scroll-driven activation, in ms. */
const CLAIM_TIMEOUT_MS = 850;
/** Debounce before a deliberate navigation is announced to assistive tech, in ms. */
const ANNOUNCE_DELAY_MS = 450;
/** The activation line, as a fraction of viewport height from the top. */
const ACTIVATION_LINE = 0.45;

export interface LifecycleActiveStage {
  activeIndex: number;
  /** +1 if the last change moved to a later stage, -1 to an earlier one. */
  direction: number;
  /** Ref callback for a stage card, keyed by index. */
  setStageRef: (index: number) => (el: HTMLElement | null) => void;
  /** Deliberate navigation: claim the stage, scroll to it, announce it after settling. */
  goToStage: (index: number) => void;
  /** Live-region text, set only by deliberate navigation — never by ordinary scrolling. */
  announcement: string;
}

export function useLifecycleActiveStage(): LifecycleActiveStage {
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [announcement, setAnnouncement] = useState('');

  const stageEls = useRef<(HTMLElement | null)[]>([]);
  const intersecting = useRef<boolean[]>([]);
  const prevIndex = useRef(0);
  const claimedIndex = useRef<number | null>(null);
  const claimUntil = useRef(0);
  const announceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyActive = useCallback((next: number) => {
    setDirection(next < prevIndex.current ? -1 : 1);
    prevIndex.current = next;
    setActiveIndex(next);
  }, []);

  const setStageRef = useCallback(
    (index: number) => (el: HTMLElement | null) => {
      stageEls.current[index] = el;
    },
    [],
  );

  /** Nearest reported card to the activation line; ties break to the lowest index. */
  const nearestToLine = useCallback((): number | null => {
    const lineY = (typeof window === 'undefined' ? 0 : window.innerHeight) * ACTIVATION_LINE;
    let best: number | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < stageEls.current.length; i += 1) {
      if (!intersecting.current[i]) continue;
      const el = stageEls.current[i];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const dist = Math.abs(rect.top + rect.height / 2 - lineY);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return best;
  }, []);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;

    const indexOf = (target: Element) => stageEls.current.indexOf(target as HTMLElement);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const i = indexOf(entry.target);
          if (i >= 0) intersecting.current[i] = entry.isIntersecting;
        }

        const nearest = nearestToLine();
        if (nearest === null) return;

        if (Date.now() < claimUntil.current) {
          // A claim is in force: accept the observer only once it agrees with the claimed stage,
          // then release the claim. Otherwise keep the claimed stage active.
          if (nearest === claimedIndex.current) claimUntil.current = 0;
          else return;
        }
        applyActive(nearest);
      },
      { rootMargin: `-${ACTIVATION_LINE * 100}% 0px -${(1 - ACTIVATION_LINE) * 100}% 0px` },
    );

    for (const el of stageEls.current) if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [applyActive, nearestToLine]);

  useEffect(
    () => () => {
      if (announceTimer.current) clearTimeout(announceTimer.current);
    },
    [],
  );

  const goToStage = useCallback(
    (index: number) => {
      const next = Math.max(0, Math.min(LIFECYCLE_COUNT - 1, index));

      claimedIndex.current = next;
      claimUntil.current = Date.now() + CLAIM_TIMEOUT_MS;
      applyActive(next);

      // Instant, not smooth: `scrollIntoView({ behavior: 'smooth' })` is a silent no-op in some
      // embedded/headless Chromium builds (verified here), which would leave a click updating the
      // tyre and HUD while the page never moved. A direct jump is reliable everywhere and is what
      // the spec asks of a large jump anyway; the cinematic motion is the tyre settling, the
      // content swap and the stepper indicator, not the page scroll.
      stageEls.current[next]?.scrollIntoView({ behavior: 'auto', block: 'center' });

      // Announce the *final* selection once, after rapid clicks have settled — never mid-scroll.
      if (announceTimer.current) clearTimeout(announceTimer.current);
      announceTimer.current = setTimeout(() => {
        const entry = LIFECYCLE[next];
        if (entry) setAnnouncement(`Stage ${next + 1} of ${LIFECYCLE_COUNT}: ${entry.stage.name}`);
      }, ANNOUNCE_DELAY_MS);
    },
    [applyActive],
  );

  return { activeIndex, direction, setStageRef, goToStage, announcement };
}
