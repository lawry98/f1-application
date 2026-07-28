'use client';

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'motion/react';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
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

  useEffect(() => {
    // Store previously focused element to restore on close
    previousFocusRef.current = document.activeElement;

    // Lock body scroll
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Escape key close
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = original;
      document.removeEventListener('keydown', onKey);
      // Restore focus
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
              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Inspecting</p>
              <p className="text-sm font-bold uppercase tracking-wider text-white">{team.name}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            autoFocus
            className="h-8 w-8 text-zinc-400 hover:text-white"
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
                <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-500">
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
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            Close
          </Button>
        </div>
      </motion.div>
    </>
  );
}
