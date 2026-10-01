'use client';

import { useEffect, useState, type RefObject } from 'react';

/** Which ends of a horizontal scroller have content hidden past them. */
export interface ScrollEdges {
  /** Content has been scrolled out past the start edge. */
  start: boolean;
  /** Content lies past the end edge. */
  end: boolean;
}

/**
 * How close to an end counts as being at it. A browser at a fractional device-pixel ratio can stop
 * a scroll a fraction short of `scrollWidth - clientWidth`, and a strict comparison would then keep
 * the end fade up over nothing.
 */
const EDGE_TOLERANCE_PX = 1;

const NEITHER: ScrollEdges = { start: false, end: false };

/**
 * Tracks whether a horizontal scroller has more to show on either side, for an overflow fade.
 *
 * Measured on mount, on every scroll, and whenever the scroller or one of its children changes
 * size. The mount measurement is the one that matters on arrival: a caller that scrolls its
 * current item into view in an earlier effect has already moved `scrollLeft` by the time this one
 * reads it, and the browser's scroll event for that move only arrives a frame later. The size
 * observation covers what a scroll event never reports: a phone turned to landscape, or a web font
 * swapping in and changing every label's width.
 *
 * Starts with neither edge set — on the server and on the first client render — because nothing is
 * laid out yet, and on a wide screen, where everything fits, a fade painted and then removed would
 * be a flash of something that was never true.
 */
export function useScrollEdges(ref: RefObject<HTMLElement | null>): ScrollEdges {
  const [edges, setEdges] = useState<ScrollEdges>(NEITHER);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const measure = () => {
      const hidden = el.scrollWidth - el.clientWidth;
      const start = hidden > EDGE_TOLERANCE_PX && el.scrollLeft > EDGE_TOLERANCE_PX;
      const end = hidden - el.scrollLeft > EDGE_TOLERANCE_PX;
      setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };

    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);

    return () => {
      el.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [ref]);

  return edges;
}
