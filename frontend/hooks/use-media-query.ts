'use client';

import { useEffect, useState } from 'react';

/**
 * Whether a media query currently matches.
 *
 * Starts `false` — on the server, and on the first client render — and corrects itself in
 * an effect. That asymmetry is deliberate rather than a hydration bug waiting to happen:
 * the caller uses this to decide whether to *mount* a wide-viewport-only subtree, and
 * false-first means that subtree is absent from the SSR output and appears after mount,
 * which is the only order that cannot mismatch.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const list = window.matchMedia(query);
    setMatches(list.matches);

    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
