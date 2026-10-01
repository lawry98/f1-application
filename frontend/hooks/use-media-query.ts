'use client';

import { useCallback, useSyncExternalStore } from 'react';

/** The server has no viewport, so no query matches there. */
const getServerSnapshot = () => false;

/**
 * Whether a media query currently matches.
 *
 * Reads `false` on the server and throughout hydration, then corrects itself once hydrated. That
 * asymmetry is deliberate rather than a hydration bug waiting to happen: the caller uses this to
 * decide whether to *mount* a wide-viewport-only subtree, and false-first means that subtree is
 * absent from the SSR output and appears after hydration, which is the only order that cannot
 * mismatch. `getServerSnapshot` is what holds it there; a client-only mount has nothing to match,
 * so it reads the real value on its first render.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );

  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, getServerSnapshot);
}
