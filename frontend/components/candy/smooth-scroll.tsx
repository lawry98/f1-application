'use client';

import { useEffect } from 'react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

/**
 * Inertial scrolling for the whole app.
 *
 * Lenis drives the *native* scroll position rather than transforming a wrapper, which is
 * why `position: sticky` and every `window.scrollY` read in the app keep working — the
 * teardown scrub in particular depends on both.
 *
 * Under `prefers-reduced-motion` Lenis is never constructed at all. Smoothing the scroll
 * is exactly the kind of unrequested motion that setting asks us to drop, and there is no
 * degraded version of it worth shipping.
 */
export function SmoothScroll({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');

    let lenis: Lenis | null = null;
    let frame: number | null = null;

    const start = () => {
      if (lenis) return;
      // `anchors` matters more than it looks: the teams page navigates by real `#team-<id>`
      // links, and Lenis's own `scrollTo` reads `scroll-margin-top` (lenis.mjs:783), so
      // `--teams-scroll-offset` keeps clearing the fixed nav. Without this, anchor clicks
      // fall through to native scrolling and fight the RAF loop.
      lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1, anchors: true });

      const raf = (time: number) => {
        lenis?.raf(time);
        frame = requestAnimationFrame(raf);
      };
      frame = requestAnimationFrame(raf);
    };

    const stop = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      lenis?.destroy();
      lenis = null;
    };

    // The user can flip the OS setting while the tab is open, so react to it rather than
    // sampling it once on mount.
    const sync = () => (query.matches ? stop() : start());

    sync();
    query.addEventListener('change', sync);

    return () => {
      query.removeEventListener('change', sync);
      stop();
    };
  }, []);

  return <>{children}</>;
}
