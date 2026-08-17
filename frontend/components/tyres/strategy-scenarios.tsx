import { TrendingUp, ShieldAlert } from 'lucide-react';

import { BlurFade } from '@/components/ui/blur-fade';
import { STRATEGY_SCENARIOS } from '@/data/tyres-data';
import { EYEBROW_RED } from '@/lib/tyre-utils';

/**
 * Six situations, each with what it favours and what it costs.
 *
 * Every card carries both an advantage and a risk, and none of them names a correct answer.
 * That is not hedging: the sourced examples behind these are mostly cases where the obvious
 * call was the wrong one — Bahrain's predicted one-stop that could not be done, Silverstone's
 * pre-start gamble on slicks, Hungary's tie broken by a stop nobody had planned.
 *
 * Both halves are visible at rest. Nothing here is behind a hover.
 */
export function StrategyScenarios() {
  return (
    <section
      id="strategy"
      className="border-t border-zinc-800 bg-zinc-950 py-20 lg:py-24"
      aria-labelledby="strategy-heading"
    >
      <div className="container mx-auto max-w-7xl px-4">
        <BlurFade inView direction="up">
          <div className="max-w-3xl">
            <p
              className="mb-3 text-sm font-semibold uppercase tracking-widest"
              style={{ color: EYEBROW_RED }}
            >
              Reading a race
            </p>
            <h2
              id="strategy-heading"
              className="text-3xl font-bold tracking-tight text-white lg:text-4xl"
            >
              Strategy, situation by situation
            </h2>
            <p className="mt-4 text-lg text-zinc-400">
              There is rarely one right tyre. There is a call, a reason for it, and a way it can go
              wrong — and the same call is brilliant one weekend and ruinous the next.
            </p>
          </div>
        </BlurFade>

        <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {STRATEGY_SCENARIOS.map((scenario, i) => (
            <BlurFade key={scenario.id} inView direction="up" delay={0.05 * i}>
              <article className="flex h-full flex-col rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 transition-colors hover:border-zinc-700">
                <h3 className="text-base font-semibold text-white">{scenario.situation}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{scenario.detail}</p>

                <p className="mt-4 rounded-md bg-zinc-950/60 px-3 py-2 text-sm leading-relaxed text-zinc-200">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                    Leans towards{' '}
                  </span>
                  {scenario.leaning}
                </p>

                <dl className="mt-4 space-y-3 text-sm leading-relaxed">
                  <div>
                    <dt className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                      <TrendingUp className="h-3 w-3" aria-hidden="true" />
                      What it buys
                    </dt>
                    <dd className="mt-1 text-zinc-300">{scenario.advantage}</dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                      <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                      What it costs
                    </dt>
                    <dd className="mt-1 text-zinc-300">{scenario.risk}</dd>
                  </div>
                </dl>

                <ul className="mt-4 space-y-1">
                  {scenario.sources.map((source) => (
                    <li key={source.url}>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded text-[11px] text-zinc-400 underline decoration-zinc-700 underline-offset-2 transition-colors hover:text-zinc-200 hover:decoration-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
                      >
                        {source.publisher}: {source.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </article>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  );
}
