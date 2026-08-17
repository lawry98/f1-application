import { BlurFade } from '@/components/ui/blur-fade';
import { LIFECYCLE_STAGES } from '@/data/tyres-data';
import { EYEBROW_RED } from '@/lib/tyre-utils';

/**
 * Preparation through to what happens after the flag.
 *
 * A vertical rail with a numbered spine — vertical at every width rather than a horizontal
 * scroller, because nine stages of prose do not fit across a phone and a horizontal rail that
 * needs scrolling to read is worse than a list that does not.
 *
 * **Every sustainability sentence here is one Pirelli or the FIA publishes**, and the ones
 * they do not are listed in `LIFECYCLE_UNSUPPORTED_CLAIMS` in the data module so nobody has to
 * research them twice. There is no "100% recycled" claim on this page because no primary
 * source makes one.
 */
export function TyreLifecycle() {
  return (
    <section
      id="lifecycle"
      className="border-t border-zinc-800 bg-zinc-950 py-20 lg:py-24"
      aria-labelledby="lifecycle-heading"
    >
      <div className="container mx-auto max-w-7xl px-4">
        <BlurFade inView direction="up">
          <div className="max-w-3xl">
            <p
              className="mb-3 text-sm font-semibold uppercase tracking-widest"
              style={{ color: EYEBROW_RED }}
            >
              From blanket to raw material
            </p>
            <h2
              id="lifecycle-heading"
              className="text-3xl font-bold tracking-tight text-white lg:text-4xl"
            >
              The life of a tyre
            </h2>
            <p className="mt-4 text-lg text-zinc-400">
              A set is in service for an afternoon at most. Here is the whole arc, and what is
              actually documented about the end of it.
            </p>
          </div>
        </BlurFade>

        <ol className="relative mt-12 max-w-3xl">
          {/* The spine. Decorative; the list's own semantics carry the order. */}
          <span
            aria-hidden="true"
            className="absolute bottom-6 left-[15px] top-3 w-px bg-gradient-to-b from-zinc-700 via-zinc-800 to-transparent"
          />
          {/*
           * `<li>` outside, `BlurFade` inside — not the other way round. BlurFade renders a
           * `motion.div`, so wrapping the item put a div directly inside the `<ol>` and broke
           * the list semantics for assistive technology. axe caught it; nine orphaned list
           * items and a list with no children.
           */}
          {LIFECYCLE_STAGES.map((stage, i) => (
            <li key={stage.id} className="relative pb-8 last:pb-0">
              <BlurFade inView direction="up" delay={0.04 * i} className="flex gap-5">
                <span
                  aria-hidden="true"
                  className="relative z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-950 text-xs font-semibold tabular-nums text-zinc-300"
                >
                  {i + 1}
                </span>
                <div className="min-w-0 pt-1">
                  <h3 className="text-base font-semibold text-white">{stage.name}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{stage.body}</p>
                  {stage.source && (
                    <a
                      href={stage.source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block rounded text-[11px] text-zinc-400 underline decoration-zinc-700 underline-offset-2 transition-colors hover:text-zinc-200 hover:decoration-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
                    >
                      {stage.source.publisher}: {stage.source.title}
                    </a>
                  )}
                </div>
              </BlurFade>
            </li>
          ))}
        </ol>

        {/*
         * Reader-facing, and deliberately free of certification jargon: naming schemes the
         * page does *not* claim would confuse more people than it informed. The precise list
         * of unsupported claims lives in `LIFECYCLE_UNSUPPORTED_CLAIMS` in the data module,
         * where the next person to write about this can find it without re-researching it.
         */}
        <p className="mt-6 max-w-3xl text-xs leading-relaxed text-zinc-400">
          Some things you may have read elsewhere are missing above on purpose. No Pirelli, Formula
          1 or FIA publication supports the idea that an F1 tyre is recovered in its entirety, and
          none publishes a recycled-content figure for one. What is stated here is what those three
          actually publish, and nothing further.
        </p>
      </div>
    </section>
  );
}
