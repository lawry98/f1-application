'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

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
  teams: Team[];
  /** Which constructor the inspector opens on. Paging from here is the dialog's own business. */
  initialTeamId: string;
  onClose: () => void;
}

/**
 * The 3D inspector.
 *
 * It owns its own index rather than driving the page's active team. Calling `claim` from in here
 * would rewrite the URL, move the nav rail's highlight and open a 1200ms claim lease against a
 * scroll spy that cannot see any scrolling — the body is locked — in exchange for nothing anyone
 * using a dialog asked for. Closing leaves the page exactly where it was.
 */
export function InspectModal({ teams, initialTeamId, onClose }: InspectModalProps) {
  const previousFocusRef = useRef<Element | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [index, setIndex] = useState(() => {
    const found = teams.findIndex((t) => t.id === initialTeamId);
    return found === -1 ? 0 : found;
  });

  const team = teams[index]!;
  const count = teams.length;

  /**
   * Wraps in both directions, so neither control is ever a dead end and neither is ever disabled.
   *
   * Reference-stable across index changes — it closes over `count`, not `index`. That matters more
   * than it looks: it is a dependency of the mount effect below, and an effect that re-ran on every
   * page would re-lock the body and restore focus out of the dialog on each arrow press.
   */
  const go = useCallback(
    (delta: number) => setIndex((i) => (i + delta + count) % count),
    [count],
  );

  const previousTeam = teams[(index - 1 + count) % count]!;
  const nextTeam = teams[(index + 1) % count]!;

  useEffect(() => {
    previousFocusRef.current = document.activeElement;

    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowLeft') {
        go(-1);
        return;
      }
      if (e.key === 'ArrowRight') {
        go(1);
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
  }, [onClose, go]);

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
              <p
                data-testid="inspect-team-name"
                aria-live="polite"
                className="text-sm font-bold uppercase tracking-wider text-white"
              >
                {team.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => go(-1)}
              className="h-8 w-8 text-zinc-400 hover:text-white"
              aria-label={`Previous constructor, ${previousTeam.shortName}`}
            >
              <ChevronLeft size={16} />
            </Button>
            <p className="w-14 text-center font-mono text-[11px] tracking-[0.1em] text-zinc-400">
              {`${String(index + 1).padStart(2, '0')} / ${String(count).padStart(2, '0')}`}
            </p>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => go(1)}
              className="h-8 w-8 text-zinc-400 hover:text-white"
              aria-label={`Next constructor, ${nextTeam.shortName}`}
            >
              <ChevronRight size={16} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              autoFocus
              className="ml-2 h-8 w-8 text-zinc-400 hover:text-white"
              aria-label="Close inspector"
            >
              <X size={16} />
            </Button>
          </div>
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
            className="text-xs text-zinc-400 hover:text-zinc-200"
          >
            Close
          </Button>
        </div>
      </motion.div>
    </>
  );
}
