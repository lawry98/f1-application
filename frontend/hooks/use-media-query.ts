'use client';

import { useEffect, useState } from 'react';

/**
 * Matches a CSS media query at runtime. Returns `false` on the server and on the first client
 * render so hydration stays identical, then settles in an effect.
 *
 * Used to gate *mounting* on a breakpoint where `hidden xl:block` is not enough — a WebGL canvas
 * inside a `display: none` wrapper still allocates a context and runs its render loop.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [query]);

  return matches;
}
