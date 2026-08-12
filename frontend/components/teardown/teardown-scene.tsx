'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';

const FRAME_COUNT = 192;

function framePath(i: number): string {
  return `/frames/frame_${String(i).padStart(4, '0')}.png`;
}

interface ComponentLabel {
  id: string;
  name: string;
  detail: string;
  /** Percentage left offset relative to canvas wrapper */
  x: number;
  /** Percentage top offset relative to canvas wrapper */
  y: number;
  /** Scroll fraction at which the label fades in */
  showFrom: number;
  /** Scroll fraction at which the label fades out */
  showTo: number;
}

const LABELS: ComponentLabel[] = [
  {
    id: 'engine',
    name: 'V6 Turbo Hybrid Power Unit',
    detail: '1.6L V6 turbo-hybrid — over 1000 HP combined output',
    x: 52,
    y: 38,
    showFrom: 0.55,
    showTo: 0.95,
  },
];

export function TeardownScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const framesRef = useRef<(HTMLImageElement | null)[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastFrameIndexRef = useRef(-1);

  const [loadedCount, setLoadedCount] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [scrollFraction, setScrollFraction] = useState(0);
  const [hasScrolled, setHasScrolled] = useState(false);

  // ── Preload all frames ────────────────────────────────────────────────────
  useEffect(() => {
    let isCancelled = false;
    const images: (HTMLImageElement | null)[] = new Array(FRAME_COUNT).fill(null);
    framesRef.current = images;
    let completed = 0;

    const onComplete = () => {
      if (isCancelled) return;
      completed++;
      setLoadedCount(completed);
      if (completed === FRAME_COUNT) setIsLoaded(true);
    };

    for (let i = 0; i < FRAME_COUNT; i++) {
      const img = new Image();
      img.onload = onComplete;
      // Null the slot so drawFrame skips broken frames instead of throwing on drawImage.
      img.onerror = () => {
        images[i] = null;
        onComplete();
      };
      img.src = framePath(i);
      images[i] = img;
    }

    return () => {
      isCancelled = true;
    };
  }, []);

  // ── Draw a single frame to canvas ─────────────────────────────────────────
  const drawFrame = useCallback((index: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = framesRef.current[index];
    if (!img) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }, []);

  // ── Scroll → frame mapping ────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoaded) return;

    drawFrame(0);

    const handleScroll = () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

      rafRef.current = requestAnimationFrame(() => {
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        const fraction = maxScroll > 0 ? Math.min(1, window.scrollY / maxScroll) : 0;

        setScrollFraction(fraction);
        if (fraction > 0.005) setHasScrolled(true);

        const idx = Math.min(FRAME_COUNT - 1, Math.floor(fraction * FRAME_COUNT));
        if (idx !== lastFrameIndexRef.current) {
          lastFrameIndexRef.current = idx;
          drawFrame(idx);
        }
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [isLoaded, drawFrame]);

  const pct = Math.round(scrollFraction * 100);
  const loadPct = Math.round((loadedCount / FRAME_COUNT) * 100);

  // ── Loading screen ─────────────────────────────────────────────────────────
  if (!isLoaded) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-0 bg-zinc-950">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Loading frames
        </p>
        <p className="mb-6 font-mono text-5xl font-bold tabular-nums text-ink">
          {loadedCount}
          <span className="text-zinc-700">/{FRAME_COUNT}</span>
        </p>
        {/* Progress bar */}
        <div className="h-[3px] w-72 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full bg-f1-red"
            style={{ width: `${loadPct}%`, transition: 'width 80ms linear' }}
          />
        </div>
        <p className="mt-5 text-xs text-zinc-600">Preparing teardown sequence…</p>
      </div>
    );
  }

  // ── Main scene ─────────────────────────────────────────────────────────────
  return (
    <div className="bg-zinc-950">
      {/* ── Header ── */}
      <header className="fixed top-0 z-30 w-full border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-xs text-zinc-500 transition-colors hover:text-zinc-300">
              ← Back
            </Link>
            <span className="select-none text-zinc-700">|</span>
            <span className="text-sm font-semibold text-ink">
              <span className="text-f1-red">Anatomy</span> of an F1 Car
            </span>
          </div>
          <span className="font-mono text-sm tabular-nums text-zinc-400">
            {pct}
            <span className="text-zinc-600">%</span>
          </span>
        </div>
      </header>

      {/* ── Scroll container (500vh gives ~192 frames of range) ── */}
      <div style={{ height: '500vh' }}>
        {/* Sticky viewport — stays in place as user scrolls */}
        <div className="sticky top-0 flex h-screen flex-col items-center justify-center">
          {/*
           * Canvas wrapper: sized to preserve 800×420 aspect ratio while respecting
           * both 92vw (width) and 82vh (height) constraints simultaneously.
           * `min(92vw, calc(82vh * 800 / 420))` picks whichever constraint binds first.
           */}
          <div
            className="relative mt-12"
            style={{
              width: 'min(92vw, calc(82vh * 800 / 420))',
              aspectRatio: '800 / 420',
            }}
          >
            {/* Canvas — fills the wrapper exactly */}
            <canvas
              ref={canvasRef}
              width={800}
              height={420}
              className="absolute inset-0 h-full w-full"
            />

            {/* ── Component labels ── */}
            {LABELS.map((label) => {
              const visible = scrollFraction >= label.showFrom && scrollFraction <= label.showTo;
              return (
                <div
                  key={label.id}
                  className="pointer-events-none absolute"
                  style={{
                    left: `${label.x}%`,
                    top: `${label.y}%`,
                    opacity: visible ? 1 : 0,
                    transform: `translateX(-50%) translateY(${visible ? 0 : 10}px)`,
                    transition: 'opacity 0.45s ease, transform 0.45s ease',
                  }}
                >
                  {/* Glowing connector dot */}
                  <div className="mb-1.5 flex justify-center">
                    <div className="relative h-2 w-2">
                      <div className="absolute inset-0 rounded-full bg-f1-red" />
                      {visible && (
                        <div className="absolute inset-0 animate-ping rounded-full bg-f1-red opacity-60" />
                      )}
                    </div>
                  </div>

                  {/* Label card */}
                  <div className="w-[180px] rounded-lg border border-zinc-700/50 bg-zinc-900/90 px-3 py-2.5 shadow-xl backdrop-blur-sm">
                    <p className="text-xs font-semibold leading-snug text-white">{label.name}</p>
                    <p className="mt-1 text-[10px] leading-relaxed text-zinc-400">{label.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Scroll hint ── */}
          <div
            className="pointer-events-none mt-8 flex flex-col items-center gap-1.5"
            style={{
              opacity: hasScrolled ? 0 : 1,
              transition: 'opacity 0.6s ease',
            }}
          >
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Scroll to begin</p>
            <ChevronDown className="h-4 w-4 animate-bounce text-zinc-600" />
          </div>
        </div>
      </div>

      {/* ── Bottom scroll progress bar ── */}
      <div className="fixed bottom-0 left-0 z-30 h-0.5 bg-f1-red" style={{ width: `${pct}%` }} />
    </div>
  );
}
