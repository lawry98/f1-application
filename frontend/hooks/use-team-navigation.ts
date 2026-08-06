'use client';

import { useCallback, useEffect, useRef } from 'react';

/** Team ids are kebab-case slugs. Pinned rather than trusted — this value reaches getElementById. */
const TEAM_HASH = /^#team-([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/** The team id a hash names, or `null` if it names anything else. */
export function teamIdFromHash(hash: string): string | null {
  const match = TEAM_HASH.exec(hash);
  return match ? match[1]! : null;
}

/**
 * Layers the URL over the active team. Knows nothing about observers.
 *
 * Explicit clicks are left alone: the rail, chip strip and comparison rows are real
 * anchors, so the browser sets the hash and adds exactly one history entry per click,
 * which is the `pushState` behaviour brief item 4 asks for — obtained for free. This hook
 * only handles the three cases the browser does not: restoring a hash on arrival,
 * answering `popstate`, and keeping the hash current as the user *scrolls*, which uses
 * `replaceState` so eleven teams do not become eleven history entries.
 */
export function useTeamNavigation({
  activeId,
  claim,
  ids,
}: {
  activeId: string;
  claim: (id: string) => void;
  ids: string[];
}): void {
  const hydratedRef = useRef(false);
  const idsRef = useRef(ids);
  idsRef.current = ids;

  const claimFromHash = useCallback(() => {
    const id = teamIdFromHash(window.location.hash);
    if (id !== null && idsRef.current.includes(id)) claim(id);
  }, [claim]);

  // Deep link. Runs after the first commit, so `scroll-margin-top` is in effect and the
  // browser's own fragment scroll has already landed correctly.
  useEffect(() => {
    claimFromHash();
    hydratedRef.current = true;
  }, [claimFromHash]);

  useEffect(() => {
    window.addEventListener('popstate', claimFromHash);
    return () => window.removeEventListener('popstate', claimFromHash);
  }, [claimFromHash]);

  // Scroll-driven. Never before hydration, or the first paint would rewrite a deep link
  // to the default team before it had been read.
  useEffect(() => {
    if (!hydratedRef.current) return;
    const next = `#team-${activeId}`;
    if (window.location.hash === next) return;
    window.history.replaceState(null, '', next);
  }, [activeId]);
}
