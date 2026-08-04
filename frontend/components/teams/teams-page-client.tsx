'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence, useReducedMotion } from 'motion/react';

import { TEAMS, TEAM_MAP } from '@/data/teams-data';
import { TeamsHero } from './teams-hero';
import { TeamsNavRail } from './teams-nav-rail';
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

export function TeamsPageClient() {
  const [activeTeamId, setActiveTeamId] = useState<string>(TEAMS[0]!.id);
  const [inspectOpen, setInspectOpen] = useState(false);
  const reducedMotion = useReducedMotion() ?? false;

  const handleActivate = useCallback((id: string) => {
    setActiveTeamId(id);
  }, []);

  const scrollToTeam = useCallback(
    (id: string) => {
      document.getElementById(`team-${id}`)?.scrollIntoView({
        behavior: reducedMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    },
    [reducedMotion],
  );

  const openInspect = useCallback(() => setInspectOpen(true), []);
  const closeInspect = useCallback(() => setInspectOpen(false), []);

  return (
    <div className="relative bg-zinc-950">
      {/* Hero */}
      <TeamsHero />

      {/* Mobile nav strip */}
      <div className="sticky top-14 z-20 bg-zinc-950/90 backdrop-blur-sm lg:hidden">
        <TeamsNavRail activeTeamId={activeTeamId} onSelectTeam={scrollToTeam} mobile />
      </div>

      {/* Main body: three-column layout */}
      <div className="flex">
        {/* Desktop left nav rail */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[200px] self-start overflow-y-auto border-r border-zinc-900 lg:block xl:w-[240px]">
          <TeamsNavRail activeTeamId={activeTeamId} onSelectTeam={scrollToTeam} />
        </aside>

        {/* Center: scrollable team sections */}
        <div className="min-w-0 flex-1">
          {TEAMS.map((team, index) => (
            <TeamSection
              key={team.id}
              team={team}
              index={index}
              isActive={activeTeamId === team.id}
              onActivate={handleActivate}
              onInspect={openInspect}
              reducedMotion={reducedMotion}
            />
          ))}
          <TeamsComparisonGrid
            teams={TEAMS}
            activeTeamId={activeTeamId}
            reducedMotion={reducedMotion}
            onScrollToTeam={scrollToTeam}
          />
        </div>

        {/* Desktop right sticky team dossier */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[300px] self-start border-l border-zinc-900 lg:block xl:w-[360px]">
          <StickyTeamPanel activeTeam={TEAM_MAP[activeTeamId]!} onInspect={openInspect} />
        </aside>
      </div>

      {/* Inspect modal */}
      <AnimatePresence>
        {inspectOpen && <InspectModal team={TEAM_MAP[activeTeamId]!} onClose={closeInspect} />}
      </AnimatePresence>
    </div>
  );
}
