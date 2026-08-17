'use client';

import { motion, useIsPresent, type Variants } from 'motion/react';

import { cn } from '@/lib/utils';
import { compoundTextOnGlow } from '@/lib/tyre-utils';
import type { RaceCompound, ComparisonGroup } from '@/data/tyres-data';
import { TyreVisual } from './tyre-visual';
import { IndicatorBar } from './indicator-bar';

interface CompoundSceneProps {
  compound: RaceCompound & { comparisonGroup: ComparisonGroup };
  direction: 1 | -1;
  /**
   * No `reducedMotion` prop, deliberately. Everything this component does about reduced motion
   * is already baked into the three variant objects it is handed, so taking the flag as well
   * would give it a second, redundant source of truth for the same decision.
   */
  variants: Variants;
  tyreVariants: Variants;
  wordmarkVariants: Variants;
  id: string;
  labelledBy: string;
  /** Starts the swipe. Attached to the tyre, which is the scene's drag handle. */
  onDragHandlePointerDown: (event: React.PointerEvent) => void;
}

const GROUP_WORD: Record<ComparisonGroup, string> = {
  dry: 'dry',
  wet: 'wet-weather',
};

/** Where a compound sits on the durability-to-attack scale, in words rather than a percentage. */
function attackWords(attack: number): string {
  if (attack < 0.25) return 'at the durability end';
  if (attack < 0.45) return 'towards the durability end';
  if (attack <= 0.55) return 'around the middle';
  if (attack < 0.75) return 'towards the attacking end';
  return 'at the maximum-attack end';
}

/**
 * One compound, as a single composed scene.
 *
 * Three layers move on the same beat at different distances — the wordmark least, the copy in
 * the middle, the tyre most — which is what makes the change read as one object travelling
 * rather than as four animations that happened to start together. All three take their
 * direction from the same number.
 *
 * **The exiting copy is removed from the accessibility tree.** `useIsPresent` is called here,
 * in the child, because that is where the presence context is; when it is false this panel is
 * `aria-hidden`, `pointer-events-none` and lifted out of flow so it cannot be read, clicked or
 * counted. That is right for a screen reader, and it is also what makes `getByRole` in the
 * tests see exactly one panel instead of two.
 */
export function CompoundScene({
  compound,
  direction,
  variants,
  tyreVariants,
  wordmarkVariants,
  id,
  labelledBy,
  onDragHandlePointerDown,
}: CompoundSceneProps) {
  const isPresent = useIsPresent();
  const accent = compoundTextOnGlow(compound.color);
  const group = GROUP_WORD[compound.comparisonGroup];

  return (
    <motion.div
      id={id}
      role="tabpanel"
      aria-labelledby={labelledBy}
      aria-hidden={!isPresent || undefined}
      tabIndex={isPresent ? 0 : -1}
      custom={direction}
      variants={variants}
      initial="enter"
      animate="center"
      exit="exit"
      className={cn(
        'w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500',
        !isPresent && 'pointer-events-none absolute inset-0',
      )}
    >
      {/* `isolate` for the same reason as in `compound-explorer.tsx`: the wordmark below is
          `-z-10` and would otherwise paint behind the section background rather than behind
          this scene's own content. */}
      <div className="relative isolate grid items-center gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-12">
        {/*
         * Tyre and wordmark share a column, and that is a contrast decision rather than a
         * layout one.
         *
         * The wordmark spanned the full grid in the first version, at `18vw` and `opacity-.07`.
         * Behind the *copy* column that is unusable: the hard compound's near-white set at
         * 260px reads straight through four paragraphs of `zinc-400`, and no opacity that
         * leaves it visible at all is safe over running text. Confined to the tyre column the
         * only thing on top of it is the tyre itself, which is opaque — so it can stay a real
         * graphic element without ever sitting behind a word anyone has to read.
         */}
        {/* Full column width, not the tyre's width: the clip box has to be *wider* than the
            tyre or the wordmark is perfectly hidden behind it and the whole layer is wasted.
            The tyre keeps its own max-width and stays centred inside this. */}
        <div className="relative isolate w-full">
          {/*
           * The wordmark is clipped to this column rather than sized to fit inside it.
           * Compound names run from four characters to twelve, so any single font size either
           * leaves "Hard" small or lets "Intermediate" run 900px wide — and the one thing it
           * must never do is reach the copy. Clipping resolves both: the type stays genuinely
           * oversized, long names bleed off the edges as an editorial device, and the bleed is
           * bounded by the column instead of by luck.
           */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 hidden items-center justify-center overflow-hidden sm:flex"
          >
            <motion.span
              custom={direction}
              variants={wordmarkVariants}
              className="select-none whitespace-nowrap text-[22vw] font-black uppercase leading-none tracking-tighter lg:text-[13vw]"
              style={{ color: compound.color }}
            >
              {compound.name}
            </motion.span>
          </div>

          {/*
            Tyre — the subject, the layer that travels furthest, and the scene's drag handle.
            `touch-pan-y` keeps vertical page scrolling working while claiming horizontal
            gestures for the swipe; framer no longer writes `touch-action` itself because the
            wrapper sets `dragListener={false}`.
          */}
          <motion.div
            data-drag-handle="true"
            onPointerDown={onDragHandlePointerDown}
            custom={direction}
            variants={tyreVariants}
            className="relative mx-auto w-[min(62vw,260px)] cursor-grab touch-pan-y active:cursor-grabbing motion-reduce:cursor-auto sm:w-[min(46vw,320px)] lg:w-[min(100%,380px)]"
          >
            <TyreVisual
              color={compound.color}
              tread={compound.tread}
              label={`${compound.name} tyre`}
            />
          </motion.div>
        </div>

        {/* Copy column. */}
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
            {compound.category}
          </p>
          <h3
            className="mt-2 text-4xl font-black uppercase tracking-tight sm:text-5xl"
            style={{ color: accent }}
          >
            {compound.name}
          </h3>
          <p className="mt-2 text-lg font-light text-zinc-300">{compound.tagline}</p>
          <p className="mt-4 max-w-prose text-sm leading-relaxed text-zinc-400">
            {compound.summary}
          </p>

          {compound.nominationNote && (
            <p
              className="mt-4 max-w-prose border-l-2 pl-3 text-sm leading-relaxed text-zinc-300"
              style={{ borderColor: compound.color }}
            >
              {compound.nominationNote}
            </p>
          )}

          <div className="mt-6">
            <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-zinc-400">
              Relative to the other {group} compounds
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <IndicatorBar
                label="Grip"
                value={compound.grip}
                color={compound.color}
                group={group}
              />
              <IndicatorBar
                label="Stint life"
                value={compound.durability}
                color={compound.color}
                group={group}
              />
              <IndicatorBar
                label="Warm-up"
                value={compound.warmUp}
                color={compound.color}
                group={group}
              />
            </div>
          </div>

          {/* The durability-to-attack scale, as a position rather than a number. */}
          <div className="mt-6">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-zinc-400">
              <span>Durability</span>
              <span>Maximum attack</span>
            </div>
            <div className="relative mt-2 h-1.5 rounded-full bg-zinc-800">
              <span
                aria-hidden="true"
                className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-zinc-950"
                style={{ left: `${compound.attack * 100}%`, backgroundColor: compound.color }}
              />
              {/*
                Described, not measured. `attack` is an authored editorial position with no
                source behind it, so announcing "45%" gave screen-reader users a number that
                reads as a quantity while sighted users correctly saw only a dot — the one place
                the page did the thing it says it never does.
              */}
              <span className="sr-only">
                {compound.name} sits {attackWords(compound.attack)} on the scale from durability to
                maximum attack.
              </span>
            </div>
          </div>

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                Warm-up
              </dt>
              <dd className="mt-1 text-sm leading-relaxed text-zinc-300">{compound.warmUpNote}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                Degradation
              </dt>
              <dd className="mt-1 text-sm leading-relaxed text-zinc-300">{compound.degradation}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                Suits
              </dt>
              <dd className="mt-1 text-sm leading-relaxed text-zinc-300">{compound.suitedTo}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                Strategic role
              </dt>
              <dd className="mt-1 text-sm leading-relaxed text-zinc-300">
                {compound.strategicRole}
              </dd>
            </div>
          </dl>

          <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
              Seen in a race
            </p>
            <p className="mt-1 text-sm font-semibold text-white">{compound.scenario.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-zinc-400">{compound.scenario.body}</p>
            <a
              href={compound.scenario.source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block rounded text-[11px] text-zinc-400 underline decoration-zinc-700 underline-offset-2 transition-colors hover:text-zinc-200 hover:decoration-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
            >
              {compound.scenario.source.publisher}: {compound.scenario.source.title}
            </a>
          </div>

          {/* The panel paraphrases Pirelli directly, so it cites Pirelli directly. */}
          <p className="mt-4 text-[11px] leading-relaxed text-zinc-400">
            <span className="uppercase tracking-[0.18em]">Sources</span>{' '}
            {compound.sources.map((source, i) => (
              <span key={source.url}>
                {i > 0 && <span aria-hidden="true"> · </span>}
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded underline decoration-zinc-700 underline-offset-2 transition-colors hover:text-zinc-200 hover:decoration-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
                >
                  {source.publisher}: {source.title}
                </a>
              </span>
            ))}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
