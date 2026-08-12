'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * How long a click's claim on the active id survives without the observer confirming it.
 *
 * The claim normally ends when the observer independently agrees. That agreement is not
 * guaranteed: a section shorter than the activation band — the last one, most likely —
 * may never cover enough of it to win. Without this ceiling the spy would stay frozen on
 * the claimed id for the rest of the page's life.
 */
export const CLAIM_TIMEOUT_MS = 1200;

/**
 * Top of the activation band, as a fraction of viewport height. Matches the `scroll-mt`
 * offset in `app/globals.css` closely enough that a section which has just been scrolled
 * to lands inside the band.
 */
const BAND_TOP = 0.08;

/** Bottom of the activation band, as a fraction of viewport height. */
const BAND_BOTTOM = 0.38;

/**
 * The id covering most of the activation band. Ties go to the earlier entry in `ids`, so
 * the winner is deterministic when two sections cover the band equally.
 *
 * Pure and exported for its own test: jsdom performs no layout, so this is the only part
 * of the spy that can be tested against real numbers rather than against a fake.
 */
export function pickActive(ids: string[], covered: Map<string, number>): string | null {
  let best: string | null = null;
  let bestValue = 0;
  for (const id of ids) {
    const value = covered.get(id) ?? 0;
    if (value > bestValue) {
      bestValue = value;
      best = id;
    }
  }
  return best;
}

/**
 * Tracks which of `ids` is the active section: the one covering most of a narrow activation
 * band near the top of the viewport.
 *
 * **This measures. It does not observe, and `IntersectionObserver` cannot do this job.**
 * The obvious implementation — one observer, the root shrunk to the band by `rootMargin`,
 * thresholds at `[0, 0.01, 0.5, 1]` — shipped and did not track scroll at all.
 * `intersectionRatio` is a fraction of the *target's* area, not of the band, so a ~560px
 * section against a 270px band peaks at 0.48 and never reaches 0.5. Only the entry and exit
 * crossings ever fire — 25 callbacks across 6288px of scrolling, measured — and between them
 * the coverage map holds numbers from the last boundary. 8 of 31 sampled scroll positions
 * named the wrong section, each one matching what the stale map said rather than the page.
 * Widening the threshold list does not help: no threshold above 0.48 is reachable.
 *
 * So the rects are read directly, throttled to one pass per animation frame, on `scroll`
 * and `resize` and once on mount. Reading eleven rects in an uninterrupted pass is a single
 * layout flush; a frame that scrolled is a frame that already relayed out.
 *
 * `claim(id)` sets the active id at once and suppresses the measurement, because click
 * feedback must not wait for a scroll to happen. The suppression is a lease: it lifts the
 * moment the measured winner agrees, or after `CLAIM_TIMEOUT_MS`, whichever comes first.
 * The measurement still owns the state.
 */
export function useScrollSpy(ids: string[]): {
  activeId: string;
  claim: (id: string) => void;
} {
  const [activeId, setActiveId] = useState<string>(ids[0] ?? '');

  const coveredRef = useRef<Map<string, number>>(new Map());
  const claimedRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  // Read inside the observer callback, which must not be re-created when ids change identity.
  const idsRef = useRef(ids);
  idsRef.current = ids;

  const releaseClaim = useCallback(() => {
    claimedRef.current = null;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const claim = useCallback(
    (id: string) => {
      setActiveId(id);
      claimedRef.current = id;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(releaseClaim, CLAIM_TIMEOUT_MS);
    },
    [releaseClaim],
  );

  useEffect(() => {
    let frame: number | null = null;

    const measure = () => {
      frame = null;

      const bandTop = window.innerHeight * BAND_TOP;
      const bandBottom = window.innerHeight * BAND_BOTTOM;

      // One uninterrupted read pass. Eleven `getBoundingClientRect` calls with no writes
      // between them cost a single layout flush, not eleven.
      for (const id of idsRef.current) {
        const el = document.getElementById(`team-${id}`);
        if (el === null) {
          coveredRef.current.delete(id);
          continue;
        }
        const rect = el.getBoundingClientRect();
        coveredRef.current.set(
          id,
          Math.max(0, Math.min(rect.bottom, bandBottom) - Math.max(rect.top, bandTop)),
        );
      }

      const winner = pickActive(idsRef.current, coveredRef.current);
      // Nothing covers the band — between sections, or mid-hero. Keep the last answer
      // rather than blanking, which would clear the rail's highlight for a frame.
      if (winner === null) return;

      if (claimedRef.current !== null) {
        if (winner === claimedRef.current) releaseClaim();
        return;
      }

      setActiveId(winner);
    };

    // At most one measurement per frame, however many scroll events the browser delivers.
    const schedule = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(measure);
    };

    // Once up front: the page can already be scrolled on arrival — a deep link, a reload
    // part-way down, a Back — and the first paint must name the right section.
    measure();

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
    // `ids` is a stable module-level array in practice, so its identity is a valid dep.
  }, [ids, releaseClaim]);

  useEffect(() => releaseClaim, [releaseClaim]);

  return { activeId, claim };
}
