'use client';

import { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence, useReducedMotion } from 'motion/react';

import { TEAMS, TEAM_INDEX, TEAM_MAP } from '@/data/teams-data';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useTeamNavigation } from '@/hooks/use-team-navigation';
import { TeamsHero } from './teams-hero';
import { TeamsNavRail } from './teams-nav-rail';
import { TeamsChipStrip } from './teams-chip-strip';
import { TeamSection } from './team-section';
import { TeamsComparison } from './teams-comparison';

const StickyCarViewer = dynamic(
  () => import('./sticky-car-viewer').then((m) => ({ default: m.StickyCarViewer })),
  {
    ssr: false,
    loading: () => <div className="h-full w-full animate-pulse bg-zinc-900" />,
  },
);

const InspectModal = dynamic(
  () => import('./inspect-modal').then((m) => ({ default: m.InspectModal })),
  { ssr: false },
);

/** The width at which the left rail, the editorial column, and the 3D rail all get real room. */
const VIEWER_BREAKPOINT = '(min-width: 1280px)';

export function TeamsPageClient() {
  const reducedMotion = useReducedMotion() ?? false;
  const teamIds = useMemo(() => TEAMS.map((t) => t.id), []);
  const { activeTeamId, inSections, selectTeam } = useTeamNavigation(teamIds, reducedMotion);

  const [inspectTeamId, setInspectTeamId] = useState<string | null>(null);
  const inspectOpen = inspectTeamId !== null;

  // `hidden xl:block` alone would still mount the canvas on a phone — a WebGL context, the GLB,
  // and a render loop, all for something nobody can see.
  const viewerFits = useMediaQuery(VIEWER_BREAKPOINT);

  const openInspect = useCallback(() => setInspectTeamId(activeTeamId), [activeTeamId]);
  const closeInspect = useCallback(() => setInspectTeamId(null), []);

  const stepInspect = useCallback((delta: number) => {
    setInspectTeamId((current) => {
      if (current === null) return current;
      const next = (TEAM_INDEX[current]! + delta + TEAMS.length) % TEAMS.length;
      return TEAMS[next]!.id;
    });
  }, []);

  const inspectIndex = inspectTeamId ? TEAM_INDEX[inspectTeamId]! : 0;
  const activeIndex = TEAM_INDEX[activeTeamId]!;

  return (
    <div className="relative bg-zinc-950">
      <TeamsHero onSelectTeam={selectTeam} reducedMotion={reducedMotion} />

      {/* Below xl the left rail is gone, so the chip strip is the team navigation */}
      <div className="sticky top-14 z-20 border-b border-zinc-900 bg-zinc-950/90 backdrop-blur-sm lg:hidden">
        <TeamsChipStrip
          activeTeamId={activeTeamId}
          onSelectTeam={selectTeam}
          inSections={inSections}
          reducedMotion={reducedMotion}
        />
      </div>

      <div className="flex">
        {/* Left rail — navigation */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[200px] flex-shrink-0 self-start overflow-hidden border-r border-zinc-900 lg:block xl:w-[240px]">
          <TeamsNavRail
            activeTeamId={activeTeamId}
            onSelectTeam={selectTeam}
            inSections={inSections}
          />
        </aside>

        {/* Centre — editorial */}
        <div className="min-w-0 flex-1">
          {TEAMS.map((team, index) => (
            <TeamSection
              key={team.id}
              team={team}
              index={index}
              total={TEAMS.length}
              isActive={inSections && activeTeamId === team.id}
              onInspect={openInspect}
              reducedMotion={reducedMotion}
            />
          ))}
          <TeamsComparison
            teams={TEAMS}
            activeTeamId={activeTeamId}
            reducedMotion={reducedMotion}
            onSelectTeam={selectTeam}
          />
        </div>

        {/* Right rail — 3D inspection and numbers. xl and up only. */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[340px] flex-shrink-0 self-start border-l border-zinc-900 xl:block 2xl:w-[380px]">
          {viewerFits && (
            <StickyCarViewer
              activeTeam={TEAM_MAP[activeTeamId]!}
              teamIndex={activeIndex}
              total={TEAMS.length}
              onInspect={openInspect}
              paused={inspectOpen}
              reducedMotion={reducedMotion}
            />
          )}
        </aside>
      </div>

      <AnimatePresence>
        {inspectTeamId && (
          <InspectModal
            team={TEAM_MAP[inspectTeamId]!}
            index={inspectIndex}
            total={TEAMS.length}
            onClose={closeInspect}
            onPrev={() => stepInspect(-1)}
            onNext={() => stepInspect(1)}
            reducedMotion={reducedMotion}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
