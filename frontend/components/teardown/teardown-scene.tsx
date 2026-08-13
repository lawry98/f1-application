'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
// Aliased, not imported as `Image`: the frame preloader below calls `new Image()`, the DOM's
// HTMLImageElement constructor, and a bare `import Image from 'next/image'` shadows that global
// with a React component. The failure is a compile error here, but the shape of it — a name
// collision between a DOM global and a default import — is quiet enough to be worth naming.
import NextImage from 'next/image';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { LaurelFlourish } from '@/components/candy/laurel-flourish';
import { RedactedReveal } from '@/components/candy/redacted-reveal';
import { TeardownOutro } from '@/components/teardown/teardown-outro';

const FRAME_COUNT = 192;

/**
 * The scroll container's height. The sticky viewport inside it is 100vh, so the usable scroll
 * range is (SCROLL_CONTAINER_VH - 100)vh — 400vh for 192 frames, ~2vh of scroll per frame.
 */
const SCROLL_CONTAINER_VH = 500;

/** Scroll fraction at which the car starts shrinking towards the header slot. */
const DOCK_START = 0.94;
/**
 * Scroll fraction at which the flying canvas has finished travelling and sits exactly on the slot,
 * at exactly the slot's size. The remaining DOCK_ARRIVE→DOCK_END sliver is spent cross-fading it
 * for the crisp still — see `miniOpacity`. The transform has to *finish* before the cross-fade
 * starts, or the two cars are at different sizes and positions while both are partly visible, and
 * the swap reads as a double image.
 */
const DOCK_ARRIVE = 0.99;
/** Scroll fraction at which the dock is complete. */
const DOCK_END = 1;

/**
 * The reserved header slot, in CSS pixels. 36px tall is the spec's docked car height; 120px wide
 * is deliberately wider than the car needs — a 800x420 frame scaled to 36px tall is only ~69px
 * across, and the ~25px of clearance either side is where the laurel branches flank it.
 */
const SLOT_W = 120;
const SLOT_H = 36;

/**
 * Smoothstep, not the project's out-expo easing, and the difference matters here. Out-expo front-
 * loads almost all of its travel into the first fifth of the range, which is right for a fire-and-
 * forget entrance but wrong for something bolted to the scrollbar: the car would leap most of the
 * way to the header within the first ~1% of scroll and then crawl, reading as a jump rather than a
 * shrink. Smoothstep is symmetric and eases both ends, so the dock accelerates out of the sequence
 * and settles into the slot at a rate that tracks the wheel.
 */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Geometry the FLIP transform is computed from. Re-measured on mount and on resize. */
interface DockMetrics {
  /** Centre-to-centre delta from the car's resting box to the header slot, in px. */
  dx: number;
  dy: number;
  /** Target scale — the slot's 36px against the car box's rendered height. */
  scale: number;
}

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
  const containerRef = useRef<HTMLDivElement>(null);
  const framesRef = useRef<(HTMLImageElement | null)[]>([]);
  const lastFrameIndexRef = useRef(-1);
  /** The car's resting box. Never itself transformed — see `dockMetricsRef` for why. */
  const carBoxRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const dockMetricsRef = useRef<DockMetrics | null>(null);

  const prefersReducedMotion = useReducedMotion();

  const [loadedCount, setLoadedCount] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [scrollFraction, setScrollFraction] = useState(0);
  const [hasScrolled, setHasScrolled] = useState(false);

  /**
   * Progress is container-relative, not document-relative, and that is a correctness requirement
   * rather than a refactor. The previous implementation divided `window.scrollY` by
   * `document.documentElement.scrollHeight - window.innerHeight`, which is only equal to this
   * container's own range while the container is the *entire* document. The moment any content
   * sits below the sequence — which Phase 4 adds, so the docked car has a stage — the denominator
   * grows and the scrub can no longer reach 1.0: the last frame becomes unreachable and the dock,
   * which triggers near 1.0, never fires. `offset: ['start start', 'end end']` maps 0 to "container
   * top meets viewport top" and 1 to "container bottom meets viewport bottom", which is exactly the
   * span the sticky child is pinned for, independent of anything above or below it.
   */
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  // ── Dock geometry (FLIP) ──────────────────────────────────────────────────
  /**
   * Measured rather than hard-coded because both boxes move with the viewport: the car's width is
   * `min(92vw, 82vh * 800/420)`, so which of the two constraints binds — and therefore the car's
   * rendered height — flips as the window is resized, and the slot's x position depends on how wide
   * the title beside it renders.
   *
   * The measurement is taken on `carBoxRef`, which is deliberately a *different element* from the
   * one carrying the transform. `getBoundingClientRect()` reports the post-transform box, so
   * measuring the transformed element mid-dock would feed the scaled-down rect back into the scale
   * calculation and the car would collapse towards zero on any resize past DOCK_START. The outer box
   * holds the layout size and is never transformed; the inner element does all the moving.
   */
  const measureDock = useCallback(() => {
    const box = carBoxRef.current;
    const slot = slotRef.current;
    if (!box || !slot) return;

    const b = box.getBoundingClientRect();
    const s = slot.getBoundingClientRect();
    if (b.height === 0) return;

    dockMetricsRef.current = {
      dx: s.left + s.width / 2 - (b.left + b.width / 2),
      dy: s.top + s.height / 2 - (b.top + b.height / 2),
      scale: SLOT_H / b.height,
    };
  }, []);

  useEffect(() => {
    if (!isLoaded) return undefined;
    measureDock();
    window.addEventListener('resize', measureDock);
    return () => window.removeEventListener('resize', measureDock);
  }, [isLoaded, measureDock]);

  /**
   * 0 before the dock begins, 1 once it has arrived. Under reduced motion this is a step rather
   * than a ramp — the spec asks for "a simple fade into the slot at the end", so the car holds full
   * size for the whole sequence and then appears docked, with the opacity transition on the element
   * doing the fade. Interpolating would be the animation reduced motion exists to suppress.
   */
  const dockProgress = useTransform(scrollYProgress, (p) => {
    if (prefersReducedMotion) return p >= DOCK_END ? 1 : 0;
    const raw = (p - DOCK_START) / (DOCK_ARRIVE - DOCK_START);
    return smoothstep(Math.min(1, Math.max(0, raw)));
  });

  /**
   * Driven as a motion value rather than React state on purpose: this changes on every scroll frame,
   * and routing it through `setState` would re-render the whole scene — canvas element, labels,
   * header and all — 60 times a second. `motion.div` writes the style straight to the DOM node.
   */
  const carTransform = useTransform(dockProgress, (t) => {
    const m = dockMetricsRef.current;
    if (!m || t === 0) return 'none';
    return `translate3d(${m.dx * t}px, ${m.dy * t}px, 0) scale(${1 + (m.scale - 1) * t})`;
  });

  /**
   * The landed car is a natively-sized still, cross-faded in over the last 1% of the scrub, and the
   * reason is a rendering limit rather than a design preference.
   *
   * A canvas scaled down by transform — or given a small CSS box — is resampled in **one bilinear
   * step**, with no mipmap chain. At the dock's final scale (a 1324px-wide box down to 69px, ~19x)
   * that destroys the image: measured in Chromium, the docked canvas rendered as an indistinct dark
   * smudge with no car in it, while the identical PNG in a natively-sized 69x36 `<img>` beside it
   * was cleanly legible — wheels, nose and the engine glow all readable. Both `translate3d` and a
   * plain 2D `translate` were tried, so this is not layer promotion; it is how canvas downscaling
   * works.
   *
   * So the flying canvas does the *journey*, and a still of the last frame does the *arrival*. The
   * still is the same URL the preloader already fetched, so it is served from cache, and because it
   * lives inside the already-`fixed` header it needs no position switch of its own to persist over
   * the outro — which is why there is no `position: fixed` swap on the car layer at all.
   */
  const canvasOpacity = useTransform(scrollYProgress, (p) => {
    if (prefersReducedMotion) return p >= DOCK_END ? 0 : 1;
    return 1 - Math.min(1, Math.max(0, (p - DOCK_ARRIVE) / (DOCK_END - DOCK_ARRIVE)));
  });
  const miniOpacity = useTransform(canvasOpacity, (o) => 1 - o);

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
    if (!isLoaded) return undefined;

    const apply = (fraction: number) => {
      setScrollFraction(fraction);
      if (fraction > 0.005) setHasScrolled(true);

      const idx = Math.min(FRAME_COUNT - 1, Math.floor(fraction * FRAME_COUNT));
      if (idx !== lastFrameIndexRef.current) {
        lastFrameIndexRef.current = idx;
        drawFrame(idx);
      }
    };

    // Seed from the value the container already holds rather than assuming 0. `reload` preserves
    // scroll position in this app, and frames finish preloading well after mount, so "the page just
    // loaded" does not imply "the reader is at the top" — the old code's unconditional `drawFrame(0)`
    // painted an assembled car at 60% progress until the first scroll event nudged it.
    apply(scrollYProgress.get());

    // No rAF throttle of our own any more: motion's `scroll()` already batches its subscribers into
    // one read pass per frame, so wrapping this in another requestAnimationFrame would only add a
    // frame of latency between the scroll and the repaint.
    return scrollYProgress.on('change', apply);
  }, [isLoaded, drawFrame, scrollYProgress]);

  const pct = Math.round(scrollFraction * 100);
  const loadPct = Math.round((loadedCount / FRAME_COUNT) * 100);

  /**
   * Gates the mounting of the landed car and its laurel. Mounting is also how the laurel is
   * *triggered*: it draws on mount at `draw="immediate"`, because "the car has arrived" is not a
   * viewport event and there is nothing else to hang it on. Scrolling back up unmounts it and
   * scrolling down replays the draw, which is correct — the flourish marks the arrival.
   */
  const isArriving = scrollFraction >= DOCK_ARRIVE;

  // ── Main scene ─────────────────────────────────────────────────────────────
  return (
    <div className="bg-zinc-950">
      {/*
       * The loading screen is an overlay, not an early return, and that is load-bearing rather than
       * cosmetic. `useScroll({ target: containerRef })` resolves its target in a layout effect keyed
       * on the ref *object*, whose identity never changes — verified in
       * framer-motion/dist/es/value/use-scroll.mjs, where the effect's dep array is `[start]` and
       * `start` closes over `[container, target, offset]`. A ref that is null when that effect runs
       * and attaches on some later render is never re-read; motion logs "Target ref is defined but
       * not hydrated" once and the progress value stays pinned at 0 forever. Returning a loading
       * screen instead of the scroll container did exactly that — the container mounted only after
       * 192 images resolved, long after the effect had given up.
       */}
      {!isLoaded && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-0 bg-zinc-950">
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
      )}
      {/* ── Header ── */}
      <header className="fixed top-0 z-30 w-full border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center gap-3 px-4 py-2.5 sm:gap-4">
          <Link
            href="/"
            className="flex-shrink-0 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
          >
            {/* The label is hidden rather than shortened below `sm`: at 390px the 24px title, the
                divider and the 120px slot already fill the row, and a wrapped header is the exact
                defect this page's 390px pass exists to avoid. The arrow alone is still a 24px
                target and keeps an accessible name via the visually-hidden word. */}
            <span aria-hidden="true">←</span>
            <span className="sr-only sm:not-sr-only sm:ml-1 sm:inline">Back</span>
          </Link>
          <span aria-hidden="true" className="hidden select-none text-zinc-700 sm:inline">
            |
          </span>

          {/*
           * The title is 24px, not the 14px it was, and the size is a contrast constraint rather
           * than a style choice. `f1-red` on this background measures 4.01:1 — it clears WCAG's 3:1
           * large-text bar but not the 4.5:1 small-text one, so the spec's red serif accent is only
           * legal at 24px+ (or 19px+ bold). At the old `text-sm` the existing red "Anatomy" was
           * already below the floor. Raising the type is what lets Phase 4 keep the red the spec
           * asks for instead of falling back to the `ink` accent variant.
           */}
          <RedactedReveal variant="ink" trigger="immediate" className="min-w-0 flex-1">
            <h1 className="truncate font-display text-2xl uppercase leading-none tracking-tight text-ink">
              Anatomy{' '}
              <span className="font-serif-display text-[1.05em] normal-case italic text-f1-red">
                of an F1 car
              </span>
            </h1>
          </RedactedReveal>

          {/*
           * The dock slot. It is a reserved, always-present empty box — never conditionally
           * rendered — because the FLIP transform measures it on mount and on resize, and a slot
           * that only exists once the car has arrived cannot be measured before the car needs to
           * know where it is going. Reserving it also means the header's layout never changes when
           * the car lands, so docking costs zero CLS.
           */}
          <div
            ref={slotRef}
            aria-hidden="true"
            className="relative flex-shrink-0"
            style={{ width: SLOT_W, height: SLOT_H }}
          >
            {/*
             * The laurel is mounted only once docked, which is also how it is triggered: it draws
             * on mount at `draw="immediate"` rather than on scroll-into-view, because "the car has
             * arrived" is not a viewport event. Scrolling back up unmounts it, and scrolling down
             * again replays the draw — correct here, since the arrival is what the flourish marks.
             *
             * It is absolutely positioned inside the slot rather than filling it, so it can never
             * change the slot's box: `measureDock` reads that box every resize and a slot that grew
             * to fit its contents would move the dock target.
             *
             * The spacer child is what the branches flank. It is exactly the docked car's width —
             * the 800×420 frame scaled to SLOT_H tall — because the car itself is not a child here:
             * it is the real canvas, flown in from the sequence by the FLIP transform and painting
             * over this slot from its own fixed layer.
             */}
            {isArriving && (
              <motion.span
                style={{ opacity: miniOpacity }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <LaurelFlourish draw="immediate" className="text-ink">
                  {/*
                   * `unoptimized` is deliberate and is the whole point of using next/image here at
                   * all: it emits the raw `/frames/frame_0191.png` URL, which is the exact file the
                   * frame preloader has already pulled into the browser cache, so the still costs no
                   * network at all. Without it next/image rewrites the src to `/_next/image?url=…`,
                   * a different URL, and the browser downloads a second copy of a frame we are
                   * already holding in memory. Decorative — the car is the page's subject and the
                   * heading beside it already names it — hence the empty alt.
                   */}
                  <NextImage
                    src={framePath(FRAME_COUNT - 1)}
                    alt=""
                    aria-hidden="true"
                    unoptimized
                    width={Math.round((SLOT_H * 800) / 420)}
                    height={SLOT_H}
                    className="block"
                  />
                </LaurelFlourish>
              </motion.span>
            )}
          </div>
        </div>
      </header>

      {/* ── Scroll container (500vh gives ~192 frames of range) ── */}
      <div ref={containerRef} style={{ height: `${SCROLL_CONTAINER_VH}vh` }}>
        {/* Sticky viewport — stays in place as user scrolls */}
        <div className="sticky top-0 h-screen">
          {/*
           * The car sits in its own absolutely-positioned layer rather than in the sticky element's
           * flex flow, and the scroll hint sits in a second one, because the FLIP maths needs a box
           * whose rect is pure layout — see `measureDock`.
           *
           * This layer never becomes `position: fixed`. It does not need to: what persists over the
           * outro is the still in the header slot, and the header is already fixed. An earlier cut
           * did switch this layer to `fixed` at the end, which worked but bought nothing once the
           * still existed.
           *
           * z-40 puts the flying car above the z-30 header, which is what "docks *into* the header"
           * means: it lands on top of the header's own backdrop rather than sliding behind it.
           */}
          <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
            {/*
             * Canvas wrapper: sized to preserve 800×420 aspect ratio while respecting
             * both 92vw (width) and 82vh (height) constraints simultaneously.
             * `min(92vw, calc(82vh * 800 / 420))` picks whichever constraint binds first.
             * `mt-12` keeps the resting car clear of the fixed header, as before.
             */}
            <div
              ref={carBoxRef}
              className="relative mt-12"
              style={{
                width: 'min(92vw, calc(82vh * 800 / 420))',
                aspectRatio: '800 / 420',
              }}
            >
              <motion.div
                className="absolute inset-0"
                style={{
                  transform: carTransform,
                  opacity: canvasOpacity,
                  // Centre origin is what makes the FLIP maths a plain centre-to-centre delta —
                  // with any other origin the translate would have to compensate for the scale.
                  transformOrigin: 'center center',
                  // Under reduced motion `dockProgress` and `canvasOpacity` both step rather than
                  // ramp, so this transition is what turns the step into the "simple fade into the
                  // slot at the end" the spec asks for. Under normal motion both are continuous and
                  // a transition would fight the scrub, so it is not applied.
                  transition: prefersReducedMotion ? 'opacity 400ms ease' : undefined,
                }}
              >
                {/* Canvas — fills the wrapper exactly */}
                <canvas
                  ref={canvasRef}
                  width={800}
                  height={420}
                  className="absolute inset-0 h-full w-full"
                />

                {/* ── Corner-marker callouts ── */}
                {LABELS.map((label, i) => {
                  const visible =
                    scrollFraction >= label.showFrom && scrollFraction <= label.showTo;
                  return (
                    <div
                      key={label.id}
                      className="pointer-events-none absolute flex items-start gap-2"
                      style={{
                        left: `${label.x}%`,
                        top: `${label.y}%`,
                        opacity: visible ? 1 : 0,
                        transform: `translateY(${visible ? 0 : 10}px)`,
                        transition: 'opacity 0.45s ease, transform 0.45s ease',
                      }}
                    >
                      {/* Marker: 3px red dot, then a hairline leader out to the text. The old
                          treatment was a bordered, blurred card floating over the car; a corner
                          marker annotates the drawing instead of covering it. */}
                      <span
                        aria-hidden="true"
                        className="mt-[7px] block h-[3px] w-[3px] flex-shrink-0 rounded-full bg-f1-red"
                      />
                      <span
                        aria-hidden="true"
                        className="mt-[8px] block h-px w-6 flex-shrink-0 bg-zinc-500"
                      />
                      {/*
                       * Narrower below `sm`, because a corner marker extends to the *right* of its
                       * anchor rather than being centred on it the way the old label card was. The
                       * card carried `translateX(-50%)`, so its 180px sat half either side of the
                       * 52% anchor and could never overflow; a marker's text starts at the end of
                       * its leader line. Measured at 390px: the anchor lands at x=202, the dot,
                       * gaps and 24px leader put the text at x=245, and 180px of it ran to 425 —
                       * a 35px horizontal scrollbar on the whole page.
                       */}
                      <div className="w-[130px] sm:w-[180px]">
                        {/* zinc-400, not zinc-500 — the 10-11px labels on this branch are all
                            zinc-400 (7.75:1); zinc-500 measures 4.11:1 and fails the small-text
                            floor. */}
                        <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        {/* Keyed on visibility so the reveal re-mounts — and therefore re-fires —
                            each time the callout's frame range activates. `trigger="immediate"`
                            fires on mount, and without the key the bar would wipe once on page load,
                            behind an invisible callout, and never again. The text itself is outside
                            the key'd subtree's control: it is a child either way, so it is in the
                            DOM from first render regardless of the bar's state. */}
                        <RedactedReveal
                          key={visible ? 'active' : 'idle'}
                          variant="ink"
                          trigger="immediate"
                          className="mt-0.5"
                        >
                          <span className="text-xs font-semibold leading-snug text-ink">
                            {label.name}
                          </span>
                        </RedactedReveal>
                        <p className="mt-1 text-[10px] leading-relaxed text-zinc-400">
                          {label.detail}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </motion.div>
            </div>
          </div>

          {/* ── Scroll hint ── */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-[8vh] z-20 flex flex-col items-center gap-1.5"
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

      {/* ── Outro ── */}
      <TeardownOutro />

      {/*
       * Progress readout: a mega numeral bottom-left at 15% opacity. `aria-hidden` because at 15%
       * opacity it is texture, not a readout — the accessible progress lives on the bar below,
       * which carries the real `role="progressbar"` and `aria-valuenow`. Fixed and behind the
       * content (z-10) so it reads as a watermark under the outro rather than a label on it.
       */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed bottom-0 left-2 z-10 select-none"
        style={{
          // Fades out as the car lands rather than sitting at a flat 15% forever. A `.text-mega`
          // numeral is ~300px across at 1440, pinned bottom-left, and the outro's closing paragraph
          // is also bottom-left — measured in Chromium, "100%" sat directly across that sentence.
          // The readout has nothing left to report once the scrub is finished, so it leaves.
          opacity: isArriving ? 0 : 0.15,
          transition: 'opacity 400ms ease',
        }}
      >
        <span className="text-mega font-display leading-[0.75] tracking-tight text-ink">
          {pct}
          <sup className="align-super text-[0.35em]">%</sup>
        </span>
      </div>

      {/* ── Bottom scroll progress bar ── */}
      <div
        role="progressbar"
        aria-label="Teardown sequence progress"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="fixed bottom-0 left-0 z-30 h-0.5 bg-f1-red"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
