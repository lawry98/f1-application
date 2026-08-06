'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useScrollSpy } from './use-scroll-spy';

/** `/teams#team-ferrari` — the anchor every rail link, chip, and comparison row points at. */
export function teamSectionId(teamId: string): string {
  return `team-${teamId}`;
}

function teamIdFromHash(hash: string, teamIds: readonly string[]): string | null {
  const id = hash.replace(/^#/, '');
  if (!id.startsWith('team-')) return null;
  const teamId = id.slice('team-'.length);
  return teamIds.includes(teamId) ? teamId : null;
}

interface TeamNavigation {
  /** The team the page is currently "on". Falls back to the first team before any section is. */
  activeTeamId: string;
  /** Whether a section has actually been reached — false while the hero owns the viewport. */
  inSections: boolean;
  /** Navigate to a team: instant highlight, smooth scroll, one history entry. */
  selectTeam: (teamId: string) => void;
}

/**
 * Active-team state for the teams page: scroll spy, hash round-tripping, and click handling.
 *
 * The hash is written with `replaceState` while scrolling (a scroll through eleven teams should
 * not bury the previous page eleven entries deep) and with `pushState` on an explicit click, so
 * Back returns to the team you jumped from.
 */
export function useTeamNavigation(
  teamIds: readonly string[],
  reducedMotion: boolean,
): TeamNavigation {
  const [sectionIds] = useState(() => teamIds.map(teamSectionId));
  const { activeId, claim } = useScrollSpy({ ids: sectionIds });

  const activeTeamId = activeId ? activeId.slice('team-'.length) : teamIds[0]!;
  const inSections = activeId !== null;

  const scrollTo = useCallback(
    (teamId: string, behavior: ScrollBehavior) => {
      const el = document.getElementById(teamSectionId(teamId));
      // `scroll-margin-top` on the section owns the fixed-header and chip-strip offsets, so this
      // stays layout-agnostic.
      el?.scrollIntoView({ behavior: reducedMotion ? 'auto' : behavior, block: 'start' });
    },
    [reducedMotion],
  );

  const selectTeam = useCallback(
    (teamId: string) => {
      claim(teamSectionId(teamId));
      window.history.pushState(null, '', `#${teamSectionId(teamId)}`);
      scrollTo(teamId, 'smooth');
    },
    [claim, scrollTo],
  );

  // Restore the team named by the URL on load. Reading `location` during render would break
  // hydration, so this runs after mount — the browser's own anchor jump has usually already put
  // us in the right place, and this re-asserts it with the right scroll offset.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const teamId = teamIdFromHash(window.location.hash, teamIds);
    if (!teamId) return;
    claim(teamSectionId(teamId));
    // One frame, so the sections have laid out before we measure them.
    requestAnimationFrame(() => scrollTo(teamId, 'auto'));
  }, [claim, scrollTo, teamIds]);

  // Back/forward between anchors.
  useEffect(() => {
    const onPopState = () => {
      const teamId = teamIdFromHash(window.location.hash, teamIds);
      if (!teamId) return;
      claim(teamSectionId(teamId));
      scrollTo(teamId, 'smooth');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [claim, scrollTo, teamIds]);

  // Keep the hash in step with scrolling, without growing the history stack.
  useEffect(() => {
    if (!activeId) return;
    if (window.location.hash === `#${activeId}`) return;
    window.history.replaceState(null, '', `#${activeId}`);
  }, [activeId]);

  return { activeTeamId, inSections, selectTeam };
}
