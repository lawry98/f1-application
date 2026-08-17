import { Plus } from 'lucide-react';

import { BlurFade } from '@/components/ui/blur-fade';
import { TYRE_FAQ } from '@/data/tyres-data';
import { EYEBROW_RED } from '@/lib/tyre-utils';

/**
 * Native `<details>`, not a JavaScript accordion.
 *
 * Three things fall out of that for free and would each have cost code otherwise: the answer
 * is in the DOM whether or not the disclosure is open, so find-in-page and screen readers
 * reach it; the keyboard and `aria-expanded` semantics are the browser's; and it works with
 * JavaScript disabled. Adding Radix for this would have been a dependency bought for nothing.
 *
 * The first entry is open on arrival so the pattern is obvious without anyone clicking.
 */
export function TyreFaq() {
  return (
    <section
      id="faq"
      className="border-t border-zinc-800 bg-zinc-950 py-20 lg:py-24"
      aria-labelledby="faq-heading"
    >
      <div className="container mx-auto max-w-7xl px-4">
        <BlurFade inView direction="up">
          <div className="max-w-3xl">
            <p
              className="mb-3 text-sm font-semibold uppercase tracking-widest"
              style={{ color: EYEBROW_RED }}
            >
              The vocabulary
            </p>
            <h2
              id="faq-heading"
              className="text-3xl font-bold tracking-tight text-white lg:text-4xl"
            >
              Common questions
            </h2>
          </div>
        </BlurFade>

        <div className="mt-10 max-w-3xl divide-y divide-zinc-800 border-y border-zinc-800">
          {TYRE_FAQ.map((entry, i) => (
            <details key={entry.id} open={i === 0} className="group py-4">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 rounded text-base font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 [&::-webkit-details-marker]:hidden">
                {entry.question}
                <Plus
                  aria-hidden="true"
                  className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none"
                />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">{entry.answer}</p>
              <a
                href={entry.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block rounded text-[11px] text-zinc-400 underline decoration-zinc-700 underline-offset-2 transition-colors hover:text-zinc-200 hover:decoration-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
              >
                {entry.source.publisher}: {entry.source.title}
              </a>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
