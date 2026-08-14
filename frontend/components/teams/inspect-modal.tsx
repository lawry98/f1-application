'use client';

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'motion/react';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
/* Both controls in this dialog are `variant="ghost"` — no fill — on a `bg-zinc-950` panel, which
   is `base`. That is exactly the flush default's case: red is 4.01:1 straight against it and an
   offset band would separate the ring from nothing. */
import { focusRing } from '@/lib/focus';
import { type Team } from '@/data/teams-data';

const F1HeroScene = dynamic(() => import('@/components/3d/f1-hero-scene'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center bg-zinc-900">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400" />
    </div>
  ),
});

interface InspectModalProps {
  team: Team;
  onClose: () => void;
}

export function InspectModal({ team, onClose }: InspectModalProps) {
  const previousFocusRef = useRef<Element | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement;

    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      // aria-modal claims the background is inert, so Tab must wrap within the panel.
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      const inPanel = active instanceof Node && panelRef.current.contains(active);
      if (e.shiftKey) {
        if (!inPanel || active === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (!inPanel || active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = original;
      document.removeEventListener('keydown', onKey);
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus();
      }
    };
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Inspect ${team.name} in 3D`}
        className="fixed inset-4 z-50 flex flex-col overflow-hidden rounded-2xl bg-zinc-950 shadow-2xl md:inset-6 lg:inset-8"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <span
              className="h-3 w-3 flex-shrink-0 rounded-full"
              style={{ backgroundColor: team.color }}
            />
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-400">Inspecting</p>
              <p className="text-sm font-bold uppercase tracking-wider text-ink">{team.name}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            autoFocus
            className={cn('h-8 w-8 text-zinc-400 hover:text-white', focusRing)}
            aria-label="Close inspector"
          >
            <X size={16} />
          </Button>
        </div>

        {/* Color accent line */}
        <div className="h-[2px] flex-shrink-0" style={{ backgroundColor: team.color }} />

        {/* 3D car */}
        <div className="relative min-h-0 flex-1">
          <F1HeroScene teamColor={team.color} hideOverlay className="h-full w-full" />
        </div>

        {/* Bottom info strip */}
        <div className="flex flex-shrink-0 items-center justify-between border-t border-zinc-800/60 px-5 py-3">
          <div className="flex gap-4">
            {team.drivers.map((driver) => (
              <div key={driver.id}>
                <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-400">
                  {driver.shortCode}
                </p>
                <p className="text-sm font-medium text-zinc-200">{driver.name}</p>
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className={cn('text-xs text-zinc-400 hover:text-zinc-200', focusRing)}
          >
            Close
          </Button>
        </div>
      </motion.div>
    </>
  );
}
