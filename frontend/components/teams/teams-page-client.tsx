'use client';

import { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence } from 'motion/react';

import { TEAMS, TEAM_MAP } from '@/data/teams-data';
import { useReducedMotionSafe } from '@/hooks/use-reduced-motion-safe';
import { useScrollSpy } from '@/hooks/use-scroll-spy';
import { useTeamNavigation } from '@/hooks/use-team-navigation';
import { useMediaQuery } from '@/hooks/use-media-query';
import { TeamsHero } from './teams-hero';
import { TeamsNavRail } from './teams-nav-rail';
import { TeamsChipStrip } from './teams-chip-strip';
import { TeamSection } from './team-section';
import { TeamsComparisonGrid } from './teams-comparison-grid';

const StickyTeamPanel = dynamic(
  () => import('./sticky-team-panel').then((m) => ({ default: m.StickyTeamPanel })),
  {
    ssr: false,
    loading: () => <div className="h-full w-full animate-pulse bg-zinc-900" />,
  },
);

const InspectModal = dynamic(
  () => import('./inspect-modal').then((m) => ({ default: m.InspectModal })),
  { ssr: false },
);

/** Matches Tailwind's `xl`. The dossier's own breakpoint, kept in one place. */
const DOSSIER_QUERY = '(min-width: 1280px)';

export function TeamsPageClient() {
  // `useReducedMotionSafe`, not `useReducedMotion() ?? false`. The `?? false` reads like it makes
  // motion's hook safe and does not: the `null` it coalesces is the *server's* answer, so the
  // server still gets `false` while the client's first render gets the real preference — which is
  // precisely the mismatch. Two of this page's columns branch on the value in ways that reach the
  // markup: `TeamsNavRail`'s rows swap `initial={hidden}` for `initial={false}` (a different
  // `style` attribute) and `TeamsComparisonGrid`'s value cell swaps a `<NumberTicker>` for a bare
  // numeral (a different element). `TeamsHero` had the same bug independently — it calls the hook
  // itself rather than taking this prop, and it is the one Chromium's console names — so both had
  // to move.
  const reducedMotion = useReducedMotionSafe();
  const [inspectOpen, setInspectOpen] = useState(false);

  const ids = useMemo(() => TEAMS.map((t) => t.id), []);
  const { activeTeamId, claim } = useTeamsSpy(ids);

  // Mounted, not merely hidden. A dossier inside a `display: none` wrapper still runs its
  // AnimatePresence swap and instantiates a logo image on every team change, for a column
  // nobody can see.
  const showDossier = useMediaQuery(DOSSIER_QUERY);

  const openInspect = useCallback(() => setInspectOpen(true), []);
  const closeInspect = useCallback(() => setInspectOpen(false), []);

  /**
   * Claim *and* navigate, for callers that are not anchors.
   *
   * The rail, chip strip and comparison rows are real links, so the browser scrolls for
   * them and `claim` alone is enough. `TeamsHero`'s livery columns are still buttons — it
   * is Plan B's file and is not touched here — so they need the fragment set explicitly.
   * Assigning `location.hash` takes the same path an anchor would: it honours
   * `scroll-mt-[var(--teams-scroll-offset)]` and `scroll-behavior`, and pushes exactly one
   * history entry.
   *
   * Except when the fragment is already the current one. `location.hash`'s setter is
   * specified to return early in that case, so the assignment scrolls nowhere — while
   * activating a real anchor with the same fragment still does. `useTeamNavigation`
   * `replaceState`s the hash as the user scrolls, so "already the current fragment" is the
   * *common* case here: scroll down to a team, scroll back to the hero, click that team.
   * `claim` is no help either — the id it is handed is already active. Scrolling the
   * section into view directly is what an anchor would have done.
   *
   * No explicit `behavior`: `scrollIntoView()` defers to the computed `scroll-behavior`,
   * which `app/globals.css` already gates on `prefers-reduced-motion`. Passing one here
   * would override that gate and reintroduce travel the CSS just removed.
   */
  const jumpToTeam = useCallback(
    (id: string) => {
      claim(id);
      const fragment = `#team-${id}`;
      if (window.location.hash === fragment) {
        document.getElementById(`team-${id}`)?.scrollIntoView();
        return;
      }
      window.location.hash = fragment;
    },
    [claim],
  );

  return (
    <div className="relative bg-zinc-950">
      <TeamsHero onSelectTeam={jumpToTeam} />

      {/* `TeamsChipStrip` owns its own `<nav>` landmark, matching `TeamsNavRail` — this
          wrapper only carries the sticky positioning shared by both breakpoints. */}
      <div className="sticky top-14 z-20 bg-zinc-950/90 backdrop-blur-sm lg:hidden">
        <TeamsChipStrip
          activeTeamId={activeTeamId}
          onSelectTeam={claim}
          reducedMotion={reducedMotion}
        />
      </div>

      {/*
        DOM order is rail → dossier → centre; the visual order is restored with `order-*`.
        Reading order and tab order follow the DOM, and the dossier's "Inspect in 3D" button
        used to sit *after* all eleven sections and the comparison grid — roughly 38 tab
        stops in, the last thing on the page, for a control that is permanently on screen.
        Nothing here may move visually: `order-1/2/3` puts the columns back.
      */}
      <div className="flex">
        {/* A plain `div`, like the chip strip's wrapper above: `TeamsNavRail` already owns a
            `<nav aria-label="Constructors">`, and wrapping it in a labelled `<aside>` put two
            landmarks around one rail — with an accessible name that collided with the chip
            strip's "Constructor navigation, compact". This carries positioning only. */}
        <div className="sticky top-14 order-1 hidden h-[calc(100vh-3.5rem)] w-[200px] self-start overflow-y-auto border-r border-zinc-900 lg:block xl:w-[240px]">
          <TeamsNavRail
            activeTeamId={activeTeamId}
            onSelectTeam={claim}
            reducedMotion={reducedMotion}
          />
        </div>

        {/* `xl`, not `lg`. Three columns at laptop width squeezed the centre to nothing;
            the per-section Inspect button covers everything below this. */}
        {showDossier && (
          <aside
            aria-label="Team dossier"
            className="sticky top-14 order-3 hidden h-[calc(100vh-3.5rem)] w-[300px] self-start border-l border-zinc-900 xl:block xl:w-[360px]"
          >
            <StickyTeamPanel activeTeam={TEAM_MAP[activeTeamId]!} onInspect={openInspect} />
          </aside>
        )}

        <div className="order-2 min-w-0 flex-1">
          {TEAMS.map((team, index) => (
            <TeamSection
              key={team.id}
              team={team}
              index={index}
              isActive={activeTeamId === team.id}
              onInspect={openInspect}
              reducedMotion={reducedMotion}
            />
          ))}
          <TeamsComparisonGrid
            teams={TEAMS}
            activeTeamId={activeTeamId}
            reducedMotion={reducedMotion}
            onSelectTeam={claim}
          />
        </div>
      </div>

      <AnimatePresence>
        {inspectOpen && <InspectModal team={TEAM_MAP[activeTeamId]!} onClose={closeInspect} />}
      </AnimatePresence>
    </div>
  );
}

/**
 * The spy and the URL, composed. Kept as a named helper so the component body reads as
 * layout rather than as state plumbing, and so the two hooks' wiring order — the URL layers
 * over the spy, never the other way round — is stated in one place.
 */
function useTeamsSpy(ids: string[]): { activeTeamId: string; claim: (id: string) => void } {
  const { activeId, claim } = useScrollSpy(ids);
  useTeamNavigation({ activeId, claim, ids });
  return { activeTeamId: activeId, claim };
}
