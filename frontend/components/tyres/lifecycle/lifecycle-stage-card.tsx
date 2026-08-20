import { cn } from '@/lib/utils';

import { AnimatedDisclosure } from '../acts/animated-disclosure';
import { SourceList } from '../acts/source-list';
import { THERMAL_DOT, THERMAL_LABEL, wearPercent, type LifecycleEntry } from './lifecycle-data';

/**
 * One lifecycle stage, in normal document flow.
 *
 * The heading, the one-sentence summary and the wear/thermal state label are primary content in
 * normal flow — a real heading, plain prose, and a label that never rests on colour alone. The
 * fuller sourced detail sits behind an `AnimatedDisclosure` (the page's shared APG disclosure): it
 * is server-rendered into the DOM for crawlers, but like every other disclosure on the page it
 * needs script to expand. The sticky tyre and its HUD are an enhancement layered on top.
 *
 * The card carries no `aria-current` — that state belongs to the stepper's buttons, the actual
 * controls. The active card is distinguished visually (accent, wash, a small lift) without dimming
 * any inactive card's text, which would drop the neutrals under AA on this near-black page.
 */

export interface LifecycleStageCardProps {
  entry: LifecycleEntry;
  index: number;
  total: number;
  isActive: boolean;
  setRef: (el: HTMLElement | null) => void;
}

export function LifecycleStageCard({ entry, index, total, isActive, setRef }: LifecycleStageCardProps) {
  const { stage, visual } = entry;
  const pct = wearPercent(visual.wear);

  return (
    <li>
      <article
        ref={setRef}
        id={`lifecycle-stage-${index + 1}`}
        className={cn(
          'scroll-mt-24 rounded-2xl border px-5 py-6 transition-[border-color,background-color,transform] duration-500 ease-out-expo sm:px-7 sm:py-8',
          isActive
            ? 'border-f1-red/60 bg-white/[0.03] lg:-translate-y-0.5'
            : 'border-white/10',
        )}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-400">
          {`Stage ${index + 1} of ${total}`}
        </p>
        <h3 className="mt-2 font-display text-2xl font-black uppercase leading-[0.95] tracking-tight text-ink sm:text-[1.75rem]">
          {stage.name}
        </h3>
        <p className="mt-2.5 max-w-[46ch] text-[15px] leading-relaxed text-zinc-300">
          {visual.summary}
        </p>

        <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-semibold text-zinc-300">
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: THERMAL_DOT[visual.thermal] }}
          />
          {`Wear ${pct}% · ${THERMAL_LABEL[visual.thermal]}`}
        </p>

        <AnimatedDisclosure
          summary="Details and source"
          surface="base"
          className="mt-5 border-t border-white/10 pt-4"
        >
          <div className="mt-4 space-y-4">
            <p className="text-sm leading-relaxed text-zinc-300">{stage.body}</p>
            {stage.source && (
              <SourceList sources={[stage.source]} label={`Source for ${stage.name}`} />
            )}
          </div>
        </AnimatedDisclosure>
      </article>
    </li>
  );
}
