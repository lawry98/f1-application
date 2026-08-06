'use client';

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

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

interface InspectModalProps {
  team: Team;
  index: number;
  total: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  reducedMotion: boolean;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Fullscreen car inspector.
 *
 * Hand-rolled rather than built on a dialog primitive because the project has no dialog
 * dependency — adding Radix for one modal is a heavier change than owning these four behaviours:
 * focus containment, Escape, focus restoration, and scroll locking. Left/Right arrows and the
 * paddle buttons walk the whole grid without closing.
 */
export function InspectModal({
  team,
  index,
  total,
  onClose,
  onPrev,
  onNext,
  reducedMotion,
}: InspectModalProps) {
  // Captured during render, not in the effect: React applies the close button's `autoFocus`
  // during commit, so by the time an effect runs `document.activeElement` is already the button
  // and the element that opened the dialog is lost.
  const previousFocusRef = useRef<Element | null>(
    typeof document === 'undefined' ? null : document.activeElement,
  );
  const panelRef = useRef<HTMLDivElement>(null);
  const palette = paletteFor(team.color);
  const cta = teamColorButtonStyle(team);

  // Keep the handlers off the effect's dependency list: re-running it would re-lock the body and
  // clobber `previousFocusRef` every time the active team changes.
  const handlers = useRef({ onClose, onPrev, onNext });
  handlers.current = { onClose, onPrev, onNext };

  useEffect(() => {
    const previouslyFocused = previousFocusRef.current;
    const { overflow, paddingRight } = document.body.style;
    // Compensate for the scrollbar the lock removes, so the page behind does not jump.
    const gutter = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (gutter > 0) document.body.style.paddingRight = `${gutter}px`;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handlers.current.onClose();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlers.current.onPrev();
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handlers.current.onNext();
        return;
      }

      // aria-modal claims the background is inert, so Tab must wrap within the panel.
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
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
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      document.removeEventListener('keydown', onKey);
      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus();
      }
    };
  }, []);

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
        aria-labelledby="inspect-modal-title"
        className="fixed inset-4 z-50 flex flex-col overflow-hidden rounded-2xl border bg-zinc-950 shadow-2xl md:inset-6 lg:inset-8"
        style={{ maxHeight: '92vh', borderColor: withAlpha(team.color, 0.4) }}
        initial={reducedMotion ? { opacity: 0 } : { scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={reducedMotion ? { opacity: 0 } : { scale: 0.96, opacity: 0 }}
        transition={{ duration: reducedMotion ? 0.15 : 0.3, ease: 'easeOut' }}
      >
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between gap-4 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="h-3 w-3 flex-shrink-0 rounded-full transition-colors duration-500"
              style={{
                backgroundColor: team.color,
                boxShadow: `0 0 14px ${withAlpha(team.color, 0.9)}`,
              }}
            />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                {`Inspecting · ${SEASON} car`}
              </p>
              <h2
                id="inspect-modal-title"
                className="truncate text-sm font-bold uppercase tracking-wider text-white"
              >
                {team.name}
              </h2>
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-1">
            <span className="mr-2 font-mono text-xs tracking-widest text-zinc-500">
              <span className="sr-only">{`Team ${index + 1} of ${total}`}</span>
              <span aria-hidden="true">{`${String(index + 1).padStart(2, '0')} / ${total}`}</span>
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={onPrev}
              className="h-8 w-8 text-zinc-400 hover:text-white"
              aria-label="Previous constructor"
            >
              <ChevronLeft size={16} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onNext}
              className="h-8 w-8 text-zinc-400 hover:text-white"
              aria-label="Next constructor"
            >
              <ChevronRight size={16} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              autoFocus
              className="ml-1 h-8 w-8 text-zinc-400 hover:text-white"
              aria-label="Close inspector"
            >
              <X size={16} />
            </Button>
          </div>
        </div>

        {/* Color accent line */}
        <div
          className="h-[2px] flex-shrink-0 transition-colors duration-500"
          style={{ backgroundColor: team.color }}
          aria-hidden="true"
        />

        {/* 3D car — one canvas for the whole session; paddling teams only changes its props */}
        <div className="relative min-h-0 flex-1">
          <F1HeroScene
            teamColor={team.color}
            hideOverlay
            reducedMotion={reducedMotion}
            maxDpr={2}
            cameraVariant={index}
            className="h-full w-full"
          />

          {/* Livery wipe: a band in the incoming team's color sweeps across on every change */}
          {!reducedMotion && (
            <AnimatePresence>
              <motion.div
                key={team.id}
                className="pointer-events-none absolute inset-0"
                initial={{ opacity: 0.75, x: '-100%' }}
                animate={{ opacity: 0, x: '100%' }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  background: `linear-gradient(100deg, transparent 0%, ${withAlpha(team.color, 0.35)} 45%, ${withAlpha(team.color, 0.05)} 70%, transparent 100%)`,
                }}
                aria-hidden="true"
              />
            </AnimatePresence>
          )}

          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.2em] text-zinc-600"
          >
            Use ← → to change constructor
          </span>
        </div>

        {/* Bottom strip — lineup and headline numbers */}
        <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-4 border-t border-zinc-800/60 px-5 py-3">
          <AnimatePresence mode="wait" initial={false}>
            <motion.dl
              key={team.id}
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: reducedMotion ? 0.12 : 0.25 }}
              className="flex flex-wrap items-center gap-x-6 gap-y-2"
            >
              {team.drivers.map((driver) => (
                <div key={driver.id}>
                  <dt className="text-[10px] uppercase tracking-[0.15em] text-zinc-500">
                    {`#${driver.number} · ${driver.shortCode}`}
                  </dt>
                  <dd className="text-sm font-medium text-zinc-100">{driver.name}</dd>
                </div>
              ))}
              <div>
                <dt className="text-[10px] uppercase tracking-[0.15em] text-zinc-500">
                  Power unit
                </dt>
                <dd className="text-sm font-medium text-zinc-100">{team.powerUnit}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.15em] text-zinc-500">
                  {team.championshipPosition !== undefined
                    ? `${SEASON} standing`
                    : `Constructors' titles`}
                </dt>
                <dd className="text-sm font-bold" style={{ color: palette.text }}>
                  {team.championshipPosition !== undefined
                    ? `P${team.championshipPosition}`
                    : team.championships || '—'}
                </dd>
              </div>
            </motion.dl>
          </AnimatePresence>

          <Button
            onClick={onClose}
            className="text-xs font-semibold transition-opacity hover:opacity-90"
            style={cta.style}
          >
            Done
          </Button>
        </div>
      </motion.div>
    </>
  );
}
