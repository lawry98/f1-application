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
 * Tracks which of `ids` is the active section, using **one** observer for all of them.
 *
 * Eleven per-section observers firing on `isIntersecting` fight at every boundary, because
 * the sections are taller than the viewport and adjacent: two of them are always
 * intersecting, and whichever fired last wins. Instead the root is shrunk to a narrow band
 * near the top of the viewport via `rootMargin`, and the winner is whichever section covers
 * most of that band.
 *
 * `claim(id)` sets the active id at once and suppresses the observer, because click feedback
 * must not wait for a scroll to happen. The suppression is a lease: it lifts the moment the
 * observer's own winner agrees, or after `CLAIM_TIMEOUT_MS`, whichever comes first. The
 * observer still owns the state.
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
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id.replace(/^team-/, '');
          coveredRef.current.set(id, entry.intersectionRect.height);
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
      },
      {
        rootMargin: `-${BAND_TOP * 100}% 0px -${(1 - BAND_BOTTOM) * 100}% 0px`,
        // Every crossing of the band edge must be reported, not just full entry, or a
        // section taller than the band would never fire at all.
        threshold: [0, 0.01, 0.5, 1],
      },
    );

    for (const id of ids) {
      const el = document.getElementById(`team-${id}`);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
    // `ids` is a stable module-level array in practice, so its identity is a valid dep.
  }, [ids, releaseClaim]);

  useEffect(() => releaseClaim, [releaseClaim]);

  return { activeId, claim };
}
