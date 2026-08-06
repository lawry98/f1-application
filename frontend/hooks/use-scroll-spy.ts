'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseScrollSpyOptions {
  /** Element ids to watch, in document order. Order is the tie-break, so it must be accurate. */
  ids: string[];
  /** Top edge of the activation band, as a fraction of viewport height. */
  bandTop?: number;
  /** Bottom edge of the activation band, as a fraction of viewport height. */
  bandBottom?: number;
}

interface ScrollSpy {
  /** Element id currently in the band, or `null` before any watched element has entered it. */
  activeId: string | null;
  /**
   * Activate `id` immediately and hold it until the scroll it triggers settles. Click feedback
   * must not wait for the observer, but the observer still owns the state afterwards.
   */
  claim: (id: string) => void;
}

/** How long after the last scroll event a programmatic claim stops suppressing the observer. */
const SETTLE_MS = 140;
/** Hard ceiling on a claim, for clicks that scroll nowhere (already-active team). */
const CLAIM_MAX_MS = 1200;

/**
 * One IntersectionObserver for a whole page of sections, resolving to exactly one active id.
 *
 * Sections here are taller than the viewport and adjacent, so per-section observers each firing
 * `isIntersecting` fight over the active state at every boundary. This watches all of them
 * against a single narrow band near the top of the viewport and picks a winner deterministically:
 * the section covering the most of the band, ties going to the earlier one in `ids`. Two sections
 * only overlap the band while their shared edge crosses it, and during that window the winner
 * changes exactly once — no flicker.
 */
export function useScrollSpy({
  ids,
  bandTop = 0.22,
  bandBottom = 0.42,
}: UseScrollSpyOptions): ScrollSpy {
  const [activeId, setActiveId] = useState<string | null>(null);

  /** Height of each watched element's overlap with the band. Kept fresh even while claimed. */
  const overlapRef = useRef(new Map<string, number>());
  const orderRef = useRef(ids);
  orderRef.current = ids;

  const claimedRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolve = useCallback(() => {
    let best: string | null = null;
    let bestOverlap = 0;
    for (const id of orderRef.current) {
      const overlap = overlapRef.current.get(id) ?? 0;
      if (overlap > bestOverlap) {
        best = id;
        bestOverlap = overlap;
      }
    }
    // Nothing in the band (the hero, or the footer past the last section): hold the last answer
    // rather than blanking the rail.
    if (best !== null) setActiveId(best);
  }, []);

  const release = useCallback(() => {
    claimedRef.current = false;
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    settleTimerRef.current = null;
    maxTimerRef.current = null;
    resolve();
  }, [resolve]);

  const claim = useCallback(
    (id: string) => {
      setActiveId(id);
      claimedRef.current = true;
      if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
      maxTimerRef.current = setTimeout(release, CLAIM_MAX_MS);
    },
    [release],
  );

  // Observe the band.
  useEffect(() => {
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const overlaps = overlapRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // Floor at 1 so "intersecting at all" still beats "not intersecting" when heights are
          // unavailable; ties then fall through to document order below.
          const overlap = entry.isIntersecting
            ? Math.max(entry.intersectionRect?.height ?? 0, 1)
            : 0;
          overlaps.set(entry.target.id, overlap);
        }
        if (!claimedRef.current) resolve();
      },
      {
        // Collapse the root to the activation band. `threshold: 0` is enough because the decision
        // is made on intersectionRect height, not ratio — ratio would bias towards short sections.
        rootMargin: `-${bandTop * 100}% 0px -${(1 - bandBottom) * 100}% 0px`,
        threshold: 0,
      },
    );
    elements.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
      overlaps.clear();
    };
    // `key` stands in for the array identity so a re-created `ids` array does not churn the
    // observer on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join('|'), bandTop, bandBottom, resolve]);

  // Hand control back to the observer once the claimed scroll settles.
  useEffect(() => {
    const onScroll = () => {
      if (!claimedRef.current) return;
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      settleTimerRef.current = setTimeout(release, SETTLE_MS);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    };
  }, [release]);

  return { activeId, claim };
}
