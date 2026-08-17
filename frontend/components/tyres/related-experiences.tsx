import Link from 'next/link';
import { ArrowRight, Layers, MessageSquare, Users, Box } from 'lucide-react';

import { BlurFade } from '@/components/ui/blur-fade';
import { TYRES_CONTENT_AS_OF, TYRE_SOURCES } from '@/data/tyres-data';
import { EYEBROW_RED } from '@/lib/tyre-utils';

const RELATED = [
  {
    href: '/teardown',
    icon: Layers,
    title: 'Car Anatomy',
    body: 'The tyre is one corner of a system. Scroll through the car it is bolted to and see what else is fighting for the same lap time.',
  },
  {
    href: '/briefing',
    icon: MessageSquare,
    title: 'Briefing',
    body: 'Ask the agent about any Grand Prix and get the weather, the circuit and the recent form that shape which compounds make sense there.',
  },
  {
    href: '/teams',
    icon: Users,
    title: 'Teams',
    body: 'Strategy is made by people. See the eleven constructors making these calls, and the drivers living with them.',
  },
  {
    href: '/showcase',
    icon: Box,
    title: 'Showcase',
    body: 'A closer look at the machine itself, in 3D.',
  },
] as const;

/**
 * Onward links, then the page's citation list.
 *
 * The sources live here rather than in a footer nobody reads because the page makes factual
 * claims about a live sport and every one of them should be one click from its origin. The
 * freshness date is the same constant the hero prints, so the two cannot disagree.
 */
export function RelatedExperiences() {
  return (
    <section
      id="related"
      className="border-t border-zinc-800 bg-zinc-950 py-20 lg:py-24"
      aria-labelledby="related-heading"
    >
      <div className="container mx-auto max-w-7xl px-4">
        <BlurFade inView direction="up">
          <div className="max-w-3xl">
            <p
              className="mb-3 text-sm font-semibold uppercase tracking-widest"
              style={{ color: EYEBROW_RED }}
            >
              Keep going
            </p>
            <h2
              id="related-heading"
              className="text-3xl font-bold tracking-tight text-white lg:text-4xl"
            >
              Where this connects
            </h2>
          </div>
        </BlurFade>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {RELATED.map(({ href, icon: Icon, title, body }, i) => (
            <BlurFade key={href} inView direction="up" delay={0.05 * i}>
              <Link
                href={href}
                className="group flex h-full flex-col rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 transition-colors hover:border-zinc-700 hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-f1-red focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 transition-colors group-hover:border-f1-red/30 group-hover:bg-f1-red/5">
                  <Icon className="h-5 w-5 text-f1-red" aria-hidden="true" />
                </span>
                <span className="mt-4 flex items-center gap-1.5 text-base font-semibold text-white">
                  {title}
                  <ArrowRight
                    aria-hidden="true"
                    className="h-4 w-4 text-zinc-400 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none"
                  />
                </span>
                <span className="mt-2 text-sm leading-relaxed text-zinc-400">{body}</span>
              </Link>
            </BlurFade>
          ))}
        </div>

        <div className="mt-16 border-t border-zinc-800 pt-8">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
            Sources
          </h3>
          <p className="mt-2 max-w-3xl text-sm text-zinc-400">
            Everything on this page is drawn from Pirelli, Formula 1 and FIA publications, and is
            current as of {TYRES_CONTENT_AS_OF}. Figures change between seasons — where a published
            number describes an earlier specification, the page says so.
          </p>
          <ul className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
            {TYRE_SOURCES.map((source) => (
              <li key={source.url} className="text-sm">
                <span className="text-zinc-400">{source.publisher} — </span>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded text-zinc-300 underline decoration-zinc-700 underline-offset-2 transition-colors hover:text-white hover:decoration-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
                >
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
