'use client';

import dynamic from 'next/dynamic';
import { AnimatePresence, motion } from 'motion/react';
import { Expand } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { paletteFor, teamColorButtonStyle, withAlpha } from '@/lib/team-utils';
import { SEASON, type Team } from '@/data/teams-data';

const F1HeroScene = dynamic(() => import('@/components/3d/f1-hero-scene'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-zinc-900">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400" />
    </div>
  ),
});

interface StickyCarViewerProps {
  activeTeam: Team;
  teamIndex: number;
  total: number;
  onInspect: () => void;
  /** True while the fullscreen inspector owns the screen — idles this canvas instead of unmounting. */
  paused: boolean;
  reducedMotion: boolean;
}

/**
 * The right rail: the car, who drives it, and the numbers. Deliberately not a second copy of the
 * centre column — no tagline, no base, no lineup prose, just identity, standing, and the way in
 * to the fullscreen inspector.
 *
 * The canvas is mounted once for the whole page. Switching teams changes props on the existing
 * scene (livery cross-fade, rim-light shift, camera ease); it never remounts.
 */
export function StickyCarViewer({
  activeTeam,
  teamIndex,
  total,
  onInspect,
  paused,
  reducedMotion,
}: StickyCarViewerProps) {
  const palette = paletteFor(activeTeam.color);
  const cta = teamColorButtonStyle(activeTeam);
  const hasStanding = activeTeam.championshipPosition !== undefined;

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      {/* 3D car */}
      <div className="relative min-h-0 flex-1">
        <div
          className="absolute left-0 right-0 top-0 z-10 h-[2px] transition-colors duration-700"
          style={{
            backgroundColor: activeTeam.color,
            boxShadow: `0 0 16px ${withAlpha(activeTeam.color, 0.7)}`,
          }}
          aria-hidden="true"
        />
        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-400">3D preview</span>
          <span className="font-mono text-[11px] tracking-widest text-zinc-500">
            <span className="sr-only">{`Team ${teamIndex + 1} of ${total}`}</span>
            <span aria-hidden="true">{`${String(teamIndex + 1).padStart(2, '0')} / ${total}`}</span>
          </span>
        </div>

        <F1HeroScene
          teamColor={activeTeam.color}
          hideOverlay
          paused={paused}
          reducedMotion={reducedMotion}
          maxDpr={1.75}
          cameraVariant={teamIndex}
          className="h-full w-full"
        />
      </div>

      {/* Identity + numbers. Only this block animates on a team change; the canvas stays put. */}
      <div
        className="flex-shrink-0 border-t bg-zinc-950 transition-colors duration-700"
        style={{ borderColor: withAlpha(activeTeam.color, 0.35) }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTeam.id}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
            transition={{ duration: reducedMotion ? 0.15 : 0.28, ease: 'easeOut' }}
            className="space-y-4 px-4 py-4"
          >
            <div className="flex items-start gap-2.5">
              <span
                aria-hidden="true"
                className="mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full"
                style={{
                  backgroundColor: activeTeam.color,
                  boxShadow: `0 0 12px ${withAlpha(activeTeam.color, 0.9)}`,
                }}
              />
              <div className="min-w-0">
                <p className="truncate text-base font-black uppercase tracking-tight text-white">
                  {activeTeam.shortName}
                </p>
                <p className="truncate text-[10px] uppercase tracking-[0.15em] text-zinc-500">
                  {activeTeam.name}
                </p>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-3 py-2">
                <dt className="text-[9px] uppercase tracking-[0.15em] text-zinc-500">
                  {hasStanding ? `${SEASON} standing` : `Constructors' titles`}
                </dt>
                <dd
                  className="mt-0.5 text-xl font-black leading-none"
                  style={{ color: palette.display }}
                >
                  {hasStanding ? `P${activeTeam.championshipPosition}` : activeTeam.championships}
                </dd>
              </div>
              <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-3 py-2">
                <dt className="text-[9px] uppercase tracking-[0.15em] text-zinc-500">
                  {activeTeam.points !== undefined ? `${SEASON} points` : 'First entry'}
                </dt>
                <dd className="mt-0.5 text-xl font-black leading-none text-white">
                  {activeTeam.points ?? activeTeam.firstEntry}
                </dd>
              </div>
            </dl>

            <ul className="space-y-1">
              {activeTeam.drivers.map((driver) => (
                <li key={driver.id} className="flex items-center gap-2 text-xs">
                  <span className="w-7 font-mono text-[10px] text-zinc-500">{`#${driver.number}`}</span>
                  <span className="truncate text-zinc-300">{driver.name}</span>
                  <span className="ml-auto font-mono text-[10px] tracking-widest text-zinc-500">
                    {driver.shortCode}
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>
        </AnimatePresence>

        <div className="px-4 pb-4">
          <Button
            onClick={onInspect}
            className="w-full gap-2 text-xs font-semibold transition-opacity hover:opacity-90"
            style={cta.style}
          >
            <Expand className="h-3.5 w-3.5" />
            Inspect in 3D
          </Button>
        </div>
      </div>
    </div>
  );
}
