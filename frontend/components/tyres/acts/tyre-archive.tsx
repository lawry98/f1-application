import {
  LIFECYCLE_UNSUPPORTED_CLAIMS,
  TYRES_CONTENT_AS_OF,
  TYRE_FAQ,
  TYRE_SOURCES,
} from '@/data/tyres-data';
import { EYEBROW_RED } from '@/lib/tyre-utils';

import { AnimatedDisclosure } from './animated-disclosure';

/**
 * The archive: the questions and the full citation list.
 *
 * Everything the four acts moved out of sight ends up reachable here, which is what makes the
 * page's text budget a *disclosure* decision rather than a deletion one. Nothing sourced was
 * dropped to shorten the page — it was moved to somewhere a reader who wants it can find it, and
 * the citation list is complete rather than representative.
 *
 * Server-rendered, and the answers stay in the DOM whether or not a disclosure is open — the
 * animated disclosure keeps its content mounted behind a collapsed height rather than removing it —
 * so a crawler reading the page source still sees every answer.
 *
 * `LIFECYCLE_UNSUPPORTED_CLAIMS` is published rather than kept as a code comment on purpose: a
 * page this heavily cited should say what it deliberately does *not* claim, and it stops the same
 * four things being re-researched every time someone notices they are missing.
 */
export function TyreArchive() {
  return (
    <section
      aria-labelledby="archive-heading"
      className="relative isolate overflow-hidden bg-base-warm"
    >
      <div className="container relative mx-auto max-w-7xl px-4 py-14 sm:py-20">
        <p
          className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em]"
          style={{ color: EYEBROW_RED }}
        >
          <span className="h-[3px] w-6 bg-f1-red" aria-hidden="true" />
          Archive
        </p>
        <h2
          id="archive-heading"
          className="mt-3 font-display text-[clamp(1.85rem,4.4vw,3.25rem)] font-black uppercase leading-[0.9] tracking-[-0.03em] text-ink"
        >
          Common questions
        </h2>

        <div className="mt-9 grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
          <ul className="space-y-3" role="list">
            {TYRE_FAQ.map((entry) => (
              <li key={entry.id}>
                <AnimatedDisclosure
                  summary={entry.question}
                  surface="base-warm"
                  align="start"
                  iconSize="sm"
                  summaryClassName="py-1"
                  className="border-b border-white/10 pb-3"
                >
                  <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-zinc-300">
                    {entry.answer}
                  </p>
                  <p className="mt-2">
                    <a
                      href={entry.source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-zinc-400 underline underline-offset-2 transition-colors hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-f1-red focus-visible:ring-offset-2 focus-visible:ring-offset-base-warm"
                    >
                      {`${entry.source.publisher} — ${entry.source.title}`}
                    </a>
                  </p>
                </AnimatedDisclosure>
              </li>
            ))}
          </ul>

          <div className="min-w-0">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
              What this page does not claim
            </h3>
            <ul className="mt-2.5 space-y-1.5" role="list">
              {LIFECYCLE_UNSUPPORTED_CLAIMS.map((claim) => (
                <li key={claim} className="text-xs leading-relaxed text-zinc-400">
                  {`No source here supports ${claim}.`}
                </li>
              ))}
            </ul>

            <AnimatedDisclosure
              summary={`All sources (${TYRE_SOURCES.length})`}
              surface="base-warm"
              className="mt-8 border-t border-white/10 pt-4"
            >
              <ul className="mt-3 space-y-2" role="list">
                {TYRE_SOURCES.map((s) => (
                  <li key={s.url}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs leading-relaxed text-zinc-400 underline underline-offset-2 transition-colors hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-f1-red focus-visible:ring-offset-2 focus-visible:ring-offset-base-warm"
                    >
                      {`${s.publisher} — ${s.title}`}
                    </a>
                  </li>
                ))}
              </ul>
            </AnimatedDisclosure>

            <p className="mt-8 text-[11px] leading-relaxed text-zinc-400">
              {`Content current as of ${TYRES_CONTENT_AS_OF}. Tyre renders © Pirelli — see /credits.`}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
