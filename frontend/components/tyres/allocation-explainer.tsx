import { BlurFade } from '@/components/ui/blur-fade';
import { cn } from '@/lib/utils';
import {
  COMPOUND_COLORS,
  ALLOCATION_EXAMPLES,
  ALLOCATION_RULES,
  ALLOCATION_TRACKED_COMPOUND,
  DRY_RANGE,
  DRY_RANGE_SOURCE,
} from '@/data/tyres-data';
import { EYEBROW_RED, compoundTextOnCard, compoundTextOnTrackedRow } from '@/lib/tyre-utils';

const LABEL_COLOR = {
  Hard: COMPOUND_COLORS.hard,
  Medium: COMPOUND_COLORS.medium,
  Soft: COMPOUND_COLORS.soft,
} as const;

/**
 * The section that does the page's actual teaching.
 *
 * The numbered range is rendered **without any compound colour** — deliberately graphite,
 * because a coloured C3 chip is the exact misconception this section exists to remove. Colour
 * appears only in the allocation rows, where a label has genuinely been assigned.
 *
 * Three examples, not one, and all three follow the same compound. C3 was the Soft at Suzuka,
 * the Medium at Barcelona and the Hard at Monaco — one season, three labels, three sources. A
 * single example would be indistinguishable from a rule.
 */
export function AllocationExplainer() {
  return (
    <section
      id="allocation"
      className="border-t border-zinc-800 bg-zinc-950 py-20 lg:py-24"
      aria-labelledby="allocation-heading"
    >
      <div className="container mx-auto max-w-7xl px-4">
        <BlurFade inView direction="up">
          <div className="max-w-3xl">
            <p
              className="mb-3 text-sm font-semibold uppercase tracking-widest"
              style={{ color: EYEBROW_RED }}
            >
              Race weekend allocation
            </p>
            <h2
              id="allocation-heading"
              className="text-3xl font-bold tracking-tight text-white lg:text-4xl"
            >
              How Hard, Medium and Soft are decided
            </h2>
            <p className="mt-4 text-lg text-zinc-400">
              A season has a numbered range of dry compounds. A Grand Prix has three tyres called
              Hard, Medium and Soft. Those are not the same list — the second is drawn from the
              first, one race at a time.
            </p>
          </div>
        </BlurFade>

        {/* The numbered range: no colour anywhere. */}
        <BlurFade inView direction="up" delay={0.05}>
          <div className="mt-12">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Step one — the season&rsquo;s range
            </h3>
            <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {DRY_RANGE.map((compound) => (
                <li
                  key={compound.id}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4"
                >
                  <p className="text-2xl font-black tracking-tight text-zinc-200">
                    {compound.name}
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                    {compound.rank === 1
                      ? 'Hardest'
                      : compound.rank === DRY_RANGE.length
                        ? 'Softest'
                        : `Step ${compound.rank}`}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-zinc-400">{compound.character}</p>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-zinc-400">
              These carry no colour and no label of their own.{' '}
              <a
                href={DRY_RANGE_SOURCE.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded underline decoration-zinc-700 underline-offset-2 transition-colors hover:text-zinc-200 hover:decoration-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
              >
                {DRY_RANGE_SOURCE.publisher}: {DRY_RANGE_SOURCE.title}
              </a>
            </p>
          </div>
        </BlurFade>

        {/* The join, three times over. */}
        <BlurFade inView direction="up" delay={0.1}>
          <div className="mt-14">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Step two — three of them are nominated for one race
            </h3>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-300">
              Pirelli picks three compounds for each Grand Prix. The hardest of the three becomes
              that weekend&rsquo;s Hard, the middle one the Medium, the softest the Soft. Watch{' '}
              <span className="font-semibold text-white">{ALLOCATION_TRACKED_COMPOUND}</span> across
              these three {ALLOCATION_EXAMPLES[0]!.season} races: the same compound, a different
              label each time.
            </p>

            <div className="mt-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="grid min-w-[38rem] gap-4 lg:min-w-0 lg:grid-cols-3">
                {ALLOCATION_EXAMPLES.map((example) => (
                  <article
                    key={example.event}
                    className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5"
                  >
                    <h4 className="text-sm font-semibold text-white">{example.event}</h4>
                    <p className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                      {example.season}
                    </p>
                    <ul className="mt-4 space-y-2">
                      {example.picks.map((pick) => {
                        const tracked = pick.compound === ALLOCATION_TRACKED_COMPOUND;
                        return (
                          <li
                            key={pick.label}
                            className={cn(
                              'flex items-center justify-between gap-3 rounded-md px-2.5 py-1.5',
                              tracked ? 'bg-zinc-800/70 ring-1 ring-zinc-700' : 'bg-zinc-950/40',
                            )}
                          >
                            <span className="flex items-center gap-2 text-xs uppercase tracking-[0.14em]">
                              <span
                                aria-hidden="true"
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: LABEL_COLOR[pick.label] }}
                              />
                              {/* The tracked row carries an extra `bg-zinc-800/70` on top of
                                  the card, so its label needs the composite backdrop, not the
                                  card's. Soft measured 3.95:1 here with the card helper. */}
                              <span
                                style={{
                                  color: tracked
                                    ? compoundTextOnTrackedRow(LABEL_COLOR[pick.label])
                                    : compoundTextOnCard(LABEL_COLOR[pick.label]),
                                }}
                              >
                                {pick.label}
                              </span>
                            </span>
                            <span
                              className={cn(
                                'text-sm font-bold tabular-nums',
                                tracked ? 'text-white' : 'text-zinc-400',
                              )}
                            >
                              {pick.compound}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="mt-4 text-xs leading-relaxed text-zinc-400">{example.note}</p>
                    <a
                      href={example.source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-block rounded text-[11px] text-zinc-400 underline decoration-zinc-700 underline-offset-2 transition-colors hover:text-zinc-200 hover:decoration-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
                    >
                      {example.source.publisher}: {example.source.title}
                    </a>
                  </article>
                ))}
              </div>
            </div>

            <p className="mt-5 max-w-3xl rounded-lg border border-l-2 border-zinc-800 border-l-zinc-500 bg-zinc-900/40 p-4 text-sm leading-relaxed text-zinc-300">
              These are three examples, not a mapping. Which numbered compound carries which label
              changes from race to race, so there is no permanent answer to &ldquo;which one is the
              Medium&rdquo; — only an answer for a given Grand Prix.
            </p>
          </div>
        </BlurFade>

        {/* The rules that sit around it. */}
        <BlurFade inView direction="up" delay={0.15}>
          <dl className="mt-14 grid gap-px overflow-hidden rounded-lg border border-zinc-800 bg-zinc-800 sm:grid-cols-2 lg:grid-cols-3">
            {ALLOCATION_RULES.map((rule) => (
              <div key={rule.label} className="bg-zinc-950 p-5">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  {rule.label}
                </dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-zinc-200">
                  {rule.value}
                  {/* Inside the <dd>, not beside it: a <dl> group may only hold <dt>/<dd>
                      pairs, and an <a> sibling breaks the grouping axe checks for. */}
                  <a
                    href={rule.source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 block rounded text-[11px] text-zinc-400 underline decoration-zinc-700 underline-offset-2 transition-colors hover:text-zinc-200 hover:decoration-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
                  >
                    {rule.source.publisher}: {rule.source.title}
                  </a>
                </dd>
              </div>
            ))}
          </dl>
        </BlurFade>
      </div>
    </section>
  );
}
