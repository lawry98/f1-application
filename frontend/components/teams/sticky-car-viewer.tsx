'use client';

import dynamic from 'next/dynamic';
import { AnimatePresence, motion } from 'motion/react';

import { Button } from '@/components/ui/button';
import { type Team } from '@/data/teams-data';

const F1HeroScene = dynamic(() => import('@/components/3d/F1HeroScene'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-zinc-900">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400" />
    </div>
  ),
});

interface StickyCarViewerProps {
  activeTeam: Team;
  onInspect: () => void;
}

export function StickyCarViewer({ activeTeam, onInspect }: StickyCarViewerProps) {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* 3D car — keep ONE canvas mounted, update teamColor only */}
      <div className="relative min-h-0 flex-1">
        <F1HeroScene
          teamColor={activeTeam.color}
          hideOverlay
          className="h-full w-full"
        />

        {/* Color accent line at top */}
        <div
          className="absolute left-0 right-0 top-0 h-[2px] transition-colors duration-500"
          style={{ backgroundColor: activeTeam.color }}
        />
      </div>

      {/* Info panel — AnimatePresence animates this, not the canvas */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTeam.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="flex items-center justify-between border-t border-zinc-800/60 bg-zinc-950 px-4 py-4"
        >
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-600">Active</p>
            <div className="flex items-center gap-2 mt-1">
              <span
                className="h-2 w-2 flex-shrink-0 rounded-full"
                style={{ backgroundColor: activeTeam.color }}
              />
              <p className="truncate text-sm font-bold text-white">{activeTeam.shortName}</p>
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">
              {activeTeam.drivers[0].shortCode} · {activeTeam.drivers[1].shortCode}
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={onInspect}
            className="flex-shrink-0 border-zinc-700 bg-transparent text-xs text-zinc-300 hover:text-white"
            style={{ borderColor: `${activeTeam.color}80` }}
          >
            Inspect ↗
          </Button>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
