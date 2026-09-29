import Link from 'next/link';

import { CircuitGlow } from '@/components/candy/circuit-glow';
import type { SeasonCircuit } from '@/hooks/use-season-circuits';
import { focusRingOffsetBase } from '@/lib/focus';
import { parseRaceDate } from '@/lib/race-date';
import { cn } from '@/lib/utils';

const CARD = 'flex h-full flex-col rounded-xl border border-zinc-800/80 bg-zinc-950 p-5';
const KICKER = 'font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400';

interface CircuitCardProps {
  circuit: SeasonCircuit;
  /** The season on screen, carried into the detail link so its calendar row matches. */
  year: number;
}

/**
 * One round of the `/circuits` grid.
 *
 * **A round with no outline still renders, and that is deliberately not the band's rule.** The
 * briefing band hides its outline on a miss because a briefing without a track map is still
 * complete. Here the card is the content, so hiding it would delete a race from the calendar.
 * The slot keeps its square box and says "No track map", with no fake shape drawn. There's
 * nothing to link to, since the detail page needs an outline, so the card is not focusable.
 *
 * The outline is `CircuitGlow`'s `plain` variant: it exists for this ~120–250px size, and it
 * carries no blur filter. Twenty-four Gaussian blurs on one page is a paint cost the grid doesn't
 * need. Every glyph is a zinc neutral or `ink` on bare `zinc-950`: no accent colour on text, so
 * none of the lifted-colour helpers apply.
 */
export function CircuitCard({ circuit, year }: CircuitCardProps) {
  const { race, geometry, slug } = circuit;
  const date = parseRaceDate(race.date);
  const sprint = race.event_format.includes('sprint');

  const body = (
    <>
      <div data-circuit-slot className="aspect-square w-full">
        {geometry ? (
          <CircuitGlow points={geometry.points} variant="plain" draw="onView" className="h-full w-full" />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-zinc-800">
            <p className={KICKER}>No track map</p>
          </div>
        )}
      </div>
      <div className={cn('mt-4 flex items-baseline justify-between gap-3', KICKER)}>
        <span>Round {race.round}</span>
        {date && <span>{`${date.day} ${date.monthAbbr}`}</span>}
      </div>
      <h2 className="mt-2 text-lg font-bold leading-tight text-ink">{race.name}</h2>
      <p className="mt-1 text-sm text-zinc-300">
        {race.location}, {race.country}
      </p>
      {sprint && (
        <span className="mt-3 self-start rounded-sm bg-zinc-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-200">
          Sprint
        </span>
      )}
    </>
  );

  if (!slug) return <div className={CARD}>{body}</div>;

  return (
    <Link
      href={`/circuits/${slug}?year=${year}`}
      className={cn(CARD, 'transition-colors duration-200 hover:border-zinc-600', focusRingOffsetBase)}
    >
      {body}
    </Link>
  );
}
