import type { Metadata } from 'next';

import { CircuitGlow } from '@/components/candy/circuit-glow';
import { DoubleMarquee } from '@/components/candy/double-marquee';
import { MegaStat } from '@/components/candy/mega-stat';
import { RedactedReveal } from '@/components/candy/redacted-reveal';
import { Scribble } from '@/components/candy/scribble';
import { TicketCard } from '@/components/candy/ticket-card';
import monaco from '@/data/circuits/mc-1929.json';
import monza from '@/data/circuits/it-1922.json';
import type { Point } from '@/lib/svg-path';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Candy kit',
  description: 'Living styleguide for the candy component kit.',
};

/*
 * Why this page exists, and why you will not find a link to it.
 *
 * Every component in `components/candy/` is a *visual* component whose unit tests can only assert
 * structure — jsdom lays nothing out, so a bar that never clears, a numeral that clips, or a
 * circuit that distorts all pass their tests happily. This page is where those failures are
 * actually visible, at every variant, on one screen. It is deliberately **absent from
 * `components/landing/links.ts`**, so it never appears in the nav; reach it by typing `/candy`.
 *
 * A server component holding client components: the geometry is read from the vendored JSON at
 * build time and handed down as plain arrays, which is the same shape Phase 3 and Phase 6 will
 * use. `lib/circuit-geometry.ts` exists for the runtime case where only a race *location* is
 * known; here the circuits are known at author time, so importing them directly is both simpler
 * and cheaper than going through the loader.
 */

/**
 * The JSON's `points` widen to `number[][]`, and `Point` is a fixed-length readonly pair, so a
 * straight `as Point[]` is not a legal assertion between them (TS2352).
 *
 * The `= 0` defaults are what make this typecheck under `noUncheckedIndexedAccess`, which makes
 * destructuring an array yield `number | undefined`. They are unreachable for this data — the
 * converter writes pairs — but writing them is cheaper than a non-null assertion and cannot lie.
 */
function toPoints(raw: number[][]): Point[] {
  return raw.map(([x = 0, y = 0]): Point => [x, y]);
}

const MONZA_POINTS = toPoints(monza.points);
const MONACO_POINTS = toPoints(monaco.points);

/**
 * Demo corner markers, taken from points that are actually **on** the Monza outline.
 *
 * The vendored circuit data carries no corner list — it is an outline only — so the numbering here
 * is invented and these are not really Monza's turns 1/4/7/11. The *coordinates*, though, are
 * lifted straight out of `it-1922.json` at spread indices, which matters: a first pass used
 * plausible-looking round numbers instead, and the markers rendered floating in empty space beside
 * the track, which reads as a broken component rather than as a track map. A corner marker only
 * makes sense sitting on the line.
 */
const DEMO_CORNERS = [
  { n: 1, x: 0.2292, y: 0.6351 },
  { n: 4, x: 0.267, y: 0.1912 },
  { n: 7, x: 0.6008, y: 0.044 },
  { n: 11, x: 0.7839, y: 0.154 },
];

const SECTION = 'border-t border-white/10 px-6 py-16 md:px-12';
const SECTION_LABEL = 'mb-10 text-[11px] uppercase tracking-[0.2em] text-zinc-400';
const CAPTION = 'mt-3 text-xs text-zinc-500';
/** A cell that names the variant it holds, so a screenshot is self-describing. */
const CELL = 'rounded-lg border border-white/5 bg-white/[0.02] p-6';

function Section({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(SECTION, className)}>
      <h2 className={SECTION_LABEL}>{label}</h2>
      {children}
    </section>
  );
}

export default function CandyPage() {
  return (
    <main className="min-h-screen bg-base pb-24 text-zinc-300">
      <header className="px-6 pb-16 pt-24 md:px-12">
        <p className={SECTION_LABEL}>Styleguide · not in nav</p>
        <h1 className="font-display text-[clamp(2.5rem,8vw,6rem)] uppercase leading-[0.9] tracking-tight text-ink">
          Candy <span className="font-serif-display lowercase italic text-f1-red">component</span>{' '}
          kit
        </h1>
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-zinc-400">
          Every variant of every Phase 2 component, with dummy data. Scroll-triggered components
          fire once as they enter view, so reload to watch them again. Toggle
          <code className="mx-1 rounded bg-white/5 px-1 py-0.5 text-xs">prefers-reduced-motion</code>
          in devtools: everything here must still read as finished, never mid-animation and never
          blank.
        </p>
      </header>

      <Section label="RedactedReveal">
        <div className="grid gap-10 md:grid-cols-2">
          <div className={CELL}>
            <RedactedReveal as="h3" variant="accent">
              <span className="font-display text-3xl uppercase tracking-tight text-ink">
                Single line, accent
              </span>
            </RedactedReveal>
            <p className={CAPTION}>variant=&quot;accent&quot; · the red bar, the default</p>
          </div>

          <div className={CELL}>
            <RedactedReveal as="h3" variant="ink">
              <span className="font-display text-3xl uppercase tracking-tight text-ink">
                Single line, ink
              </span>
            </RedactedReveal>
            <p className={CAPTION}>variant=&quot;ink&quot; · the quiet one</p>
          </div>

          <div className={CELL}>
            {/*
             * RedactedReveal renders one `inline-block` element per child and no outer wrapper, so
             * the lines would sit side by side on one row without a block context from the call
             * site. `flex-col` supplies it, and `items-start` keeps each bar shrink-wrapped to its
             * own line's glyphs — `items-stretch` would widen every line to the column and the
             * staircase's uneven bar widths would all resolve to the same width.
             */}
            <div className="flex flex-col items-start">
              <RedactedReveal variant="accent">
                <span className="font-display text-3xl uppercase tracking-tight text-ink">
                  Race weekend
                </span>
                <span className="font-display text-3xl uppercase tracking-tight text-ink">
                  intel, before
                </span>
                <span className="font-serif-display text-3xl italic text-f1-red">
                  the lights go out
                </span>
              </RedactedReveal>
            </div>
            <p className={CAPTION}>
              Three children · staircase: 100 ms stagger, uneven bar widths and offsets
            </p>
          </div>

          <div className={CELL}>
            <RedactedReveal variant="accent" trigger="immediate" delay={0.2}>
              <span className="font-display text-3xl uppercase tracking-tight text-ink">
                Immediate trigger
              </span>
            </RedactedReveal>
            <p className={CAPTION}>
              trigger=&quot;immediate&quot;, delay 0.2 s · fires on mount, not on view. This is what
              /briefing&apos;s streamed blocks will use.
            </p>
          </div>
        </div>
      </Section>

      <Section label="Scribble">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
          <div className={CELL}>
            <Scribble type="circle">
              <span className="font-display text-2xl uppercase tracking-tight text-ink">
                one click
              </span>
            </Scribble>
            <p className={CAPTION}>circle · ~1.5 revolutions, overshoots the start</p>
          </div>

          <div className={CELL}>
            <Scribble type="underline">
              <span className="font-display text-2xl uppercase tracking-tight text-ink">
                lights out
              </span>
            </Scribble>
            <p className={CAPTION}>underline · double zigzag</p>
          </div>

          <div className={CELL}>
            <Scribble type="p1">
              <span className="font-display text-2xl uppercase tracking-tight text-ink">
                379
              </span>
            </Scribble>
            <p className={CAPTION}>
              p1 · handwritten, for a win. Centred, so it is drawn across a numeral — its real use
              is over a /teams points stat, never across a long word.
            </p>
          </div>

          <div className={CELL}>
            <Scribble type="strike">
              <span className="font-display text-2xl uppercase tracking-tight text-ink">
                DNF
              </span>
            </Scribble>
            <p className={CAPTION}>strike · diagonal scrawl</p>
          </div>
        </div>
      </Section>

      <Section label="MegaStat">
        <div className="grid gap-12 md:grid-cols-3">
          <div className={CELL}>
            <MegaStat value={379} label="Points" />
            <p className={CAPTION}>Counts up from 0 on entering view</p>
          </div>

          <div className={CELL}>
            <MegaStat value={1} label="Championship position" ordinal="ST" scribble="p1" />
            <p className={CAPTION}>ordinal + scribble · the P1 moment</p>
          </div>

          <div className={CELL}>
            <MegaStat value="1:12" label="Fastest lap" sup=".909" scale="mid" />
            <p className={CAPTION}>
              scale=&quot;mid&quot; · a string value never counts; sup rides high
            </p>
          </div>
        </div>
      </Section>

      <Section label="TicketCard">
        <div className="grid gap-10 lg:grid-cols-3">
          <div>
            <TicketCard
              kicker="Race briefing · RND.08"
              divide="y"
              footer={
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-f1-red" />
                  <span className="h-1.5 w-1.5 rounded-full bg-f1-red" />
                  <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
                  <span className="ml-2">3 tools</span>
                </div>
              }
            >
              {[
                ['Circuit', 'Monaco'],
                ['Length', '3.337 km'],
                ['First GP', '1929'],
                ['Laps', '78'],
              ].map(([key, value]) => (
                <div key={key} className="flex items-baseline justify-between px-4 py-3">
                  <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                    {key}
                  </span>
                  <span className="font-display text-sm uppercase tracking-tight text-ink">
                    {value}
                  </span>
                </div>
              ))}
            </TicketCard>
            <p className={CAPTION}>
              kicker + footer + divide=&quot;y&quot; · the Phase 3 hero preview shape
            </p>
          </div>

          <div>
            <TicketCard kicker="Session pace" divide="x">
              {[
                ['P1', 'VER'],
                ['P2', 'NOR'],
                ['P3', 'LEC'],
              ].map(([position, code]) => (
                <div key={position} className="flex-1 px-4 py-5 text-center">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                    {position}
                  </div>
                  <div className="mt-1 font-display text-xl uppercase tracking-tight text-ink">
                    {code}
                  </div>
                </div>
              ))}
            </TicketCard>
            <p className={CAPTION}>divide=&quot;x&quot; · hairline columns</p>
          </div>

          <div>
            <TicketCard notch="none">
              <p className="px-4 py-5 text-sm leading-relaxed text-zinc-400">
                No kicker, no footer, no notch. Neither strip should render an empty bordered band
                — if you can see a hairline above or below this paragraph, that is the bug.
              </p>
            </TicketCard>
            <p className={CAPTION}>notch=&quot;none&quot;, both slots omitted</p>
          </div>
        </div>
      </Section>

      <Section label="DoubleMarquee" className="overflow-hidden">
        {/* Full-bleed: the marquee cancels the section's horizontal padding so the lines run to
            both edges, which is the only way the loop reads as endless. */}
        <div className="-mx-6 md:-mx-12">
          <DoubleMarquee topText="lights out" bottomText="and away we go" />
        </div>
        <p className={cn(CAPTION, 'px-0')}>
          Two lines, opposite directions, 40 s linear. Watch the seam: it must not jump.
        </p>
      </Section>

      <Section label="CircuitGlow">
        <div className="grid gap-12 lg:grid-cols-3">
          <div className={cn(CELL, 'lg:col-span-2')}>
            {/* Square, because the component's user space is square and it letterboxes with
                `xMidYMid meet` rather than distorting — a 4/3 box would draw the map at 504×504
                with ~84px of dead space each side. */}
            <div className="mx-auto aspect-square w-full max-w-2xl">
              <CircuitGlow points={MONZA_POINTS} corners={DEMO_CORNERS} />
            </div>
            <p className={CAPTION}>
              variant=&quot;glow&quot; · Monza, 125 points, four demo corner markers. Three layered
              strokes: blurred 14, solid 5, white core 1.5.
            </p>
          </div>

          <div>
            <TicketCard kicker="Monaco · RND.08">
              <div className="px-4 py-5">
                <div className="mx-auto aspect-square w-[120px]">
                  <CircuitGlow points={MONACO_POINTS} variant="plain" />
                </div>
              </div>
            </TicketCard>
            <p className={CAPTION}>
              variant=&quot;plain&quot; at 120 px inside a card · no glow, grey stroke. Two
              instances on one page must not share a blur filter id.
            </p>
          </div>
        </div>
      </Section>
    </main>
  );
}
