import type { Metadata } from 'next';
import Link from 'next/link';

import { AttributionTable } from '@/components/credits/attribution-table';
import {
  readDriverCredits,
  readLicenceTerms,
  readLogoCredits,
  readMarqueNotes,
} from '@/lib/credits';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Credits & Attributions',
  description:
    'Attribution for the photographs, logos, 3D model, data and technologies used in the F1 Briefing Agent.',
};

/** The link treatment /teams uses. */
const LINK =
  'rounded text-zinc-300 underline decoration-zinc-700 underline-offset-2 transition-colors duration-200 hover:text-white hover:decoration-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500';
const LABEL = 'text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400';
const PROSE = 'max-w-3xl text-sm leading-relaxed text-zinc-400';
/** f1-red is 4.12:1 on zinc-950 — text-2xl and up only. */
const HEADING = 'text-2xl font-bold text-f1-red';
const RULE = 'mb-6 h-px w-16 bg-f1-red';
const NOTE_CELL = 'border-t border-zinc-800 py-2 pr-3 align-top text-zinc-300';

/**
 * Attribution for everything on this site that came from somewhere else.
 *
 * The credit rows are parsed out of `public/drivers/CREDITS.md` and `public/logos/CREDITS.md` at
 * build time, so those files stay the canonical record and this page cannot drift from them: a
 * row that loses its author fails the build rather than rendering blank. `#driver-photographs` is
 * linked from /teams' footer and must keep that id.
 *
 * Synchronous on purpose — `readFileSync`, not `await`. It costs nothing at build time and it
 * keeps the page renderable by React Testing Library.
 */
export default function CreditsPage() {
  const drivers = readDriverCredits();
  const logos = readLogoCredits();
  const marques = readMarqueNotes();
  const licenceTerms = readLicenceTerms();

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="container mx-auto max-w-4xl px-4 py-16">
        <h1 className="mb-3 text-4xl font-bold">
          <span className="text-f1-red">Credits</span> &amp; Attributions
        </h1>
        <p className={cn('mb-16', PROSE)}>
          Everything on this site that came from somewhere else, with its author, its licence and a
          route back to the original.
        </p>

        <section id="driver-photographs" className="mb-16 scroll-mt-24">
          <h2 className={cn('mb-3', HEADING)}>Driver photographs</h2>
          <div className={RULE} />
          <p className={cn('mb-6', PROSE)}>
            All {drivers.length} headshots are photographs hosted on Wikimedia Commons. Most are CC
            BY or CC BY-SA, which oblige attribution — and because the files shipped here are
            downscaled to a 400px longest edge and transcoded from the originals, CC BY-SA&rsquo;s
            share-alike attaches as well. This table is that attribution;{' '}
            <a href="/drivers/CREDITS.md" className={LINK}>
              the source file
            </a>{' '}
            carries the same rows.
          </p>
          <AttributionTable
            rows={drivers}
            basePath="/drivers"
            variant="photo"
            subjectLabel="Driver"
            authorLabel="Author"
            caption="Driver photograph credits: thumbnail, driver, author, licence and Commons source."
            licenceTerms={licenceTerms}
          />
        </section>

        <section id="team-logos" className="mb-16 scroll-mt-24">
          <h2 className={cn('mb-3', HEADING)}>Team logos</h2>
          <div className={RULE} />
          <p className={cn('mb-6', PROSE)}>
            Every logo is a vector mark hosted on Wikimedia Commons under a public-domain tag — the
            designs fall below the threshold of originality, so none of them obliges attribution.
            They are still registered trademarks, used here only to identify the team being written
            about. The attribution column names the rights-holding marque, not an illustrator.
          </p>
          <AttributionTable
            rows={logos}
            basePath="/logos"
            variant="logo"
            subjectLabel="Team"
            authorLabel="Attributed to"
            caption="Team logo credits: thumbnail, team, rights holder, licence and Commons source."
          />

          <h3 className={cn('mb-2 mt-12', LABEL)}>Marque marks standing in for team lockups</h3>
          <p className={cn('mb-4', PROSE)}>
            Four files are an authentic public-domain mark of the correct company, but narrower
            than the full Formula 1 team lockup, for which no free vector exists.
          </p>
          <table className="w-full table-fixed border-collapse text-left text-xs">
            <caption className="sr-only">
              Logo files that show a marque mark rather than a full Formula 1 team lockup.
            </caption>
            <thead>
              <tr>
                <th scope="col" className={cn('w-[28%] pb-2', LABEL)}>
                  File
                </th>
                <th scope="col" className={cn('w-[36%] pb-2', LABEL)}>
                  What it is
                </th>
                <th scope="col" className={cn('pb-2', LABEL)}>
                  What it is missing
                </th>
              </tr>
            </thead>
            <tbody>
              {marques.map((note) => (
                <tr key={note.file}>
                  <td className={cn(NOTE_CELL, 'font-mono text-[11px]')}>{note.file}</td>
                  <td className={NOTE_CELL}>{note.whatItIs}</td>
                  <td className={cn(NOTE_CELL, 'pr-0')}>{note.whatItIsMissing}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className={cn('mt-6', PROSE)}>
            Two more notes live in{' '}
            <a href="/logos/CREDITS.md" className={LINK}>
              the source file
            </a>
            : Visa Cash App Racing Bulls has no freely licensed vector on Commons at all, so the
            team pages render a lettered monogram instead; and <code>alpine.svg</code> has a single
            attribute changed — Commons hosts the near-black variant drawn for light backgrounds,
            and its ink is repainted for a dark background here, leaving the shapes and accent
            colours untouched.
          </p>
        </section>

        <section className="mb-16">
          <h2 className={cn('mb-3', HEADING)}>3D model</h2>
          <div className={RULE} />
          <p className={PROSE}>
            <a
              href="https://skfb.ly/oWL8J"
              target="_blank"
              rel="noopener noreferrer"
              className={LINK}
            >
              &ldquo;F1 2026 Release Car&rdquo;
            </a>{' '}
            by{' '}
            <a
              href="https://sketchfab.com/Nimaxo"
              target="_blank"
              rel="noopener noreferrer"
              className={LINK}
            >
              Nimaxo
            </a>
            , hosted on Sketchfab and licensed under{' '}
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noopener noreferrer"
              className={LINK}
            >
              CC BY 4.0
            </a>
            .
          </p>
        </section>

        <section className="mb-16">
          <h2 className={cn('mb-3', HEADING)}>Technologies</h2>
          <div className={RULE} />
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <h3 className={cn('mb-3', LABEL)}>Frontend</h3>
              <ul className="space-y-1.5 text-sm text-zinc-400">
                <li>React &amp; Next.js 14</li>
                <li>TypeScript</li>
                <li>Three.js / React Three Fiber</li>
                <li>Tailwind CSS</li>
              </ul>
            </div>
            <div>
              <h3 className={cn('mb-3', LABEL)}>Backend</h3>
              <ul className="space-y-1.5 text-sm text-zinc-400">
                <li>Python &amp; FastAPI</li>
                <li>LangChain &amp; LangGraph</li>
                <li>Gemini 3.6 Flash (Google)</li>
                <li>FastF1</li>
                <li>Tavily API</li>
                <li>OpenWeather API</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mb-16">
          <h2 className={cn('mb-3', HEADING)}>Data sources</h2>
          <div className={RULE} />
          <dl className="space-y-3 text-sm text-zinc-400">
            <div>
              <dt className="inline font-semibold text-zinc-300">FastF1 — </dt>
              <dd className="inline">schedules, session timing and race results</dd>
            </div>
            <div>
              <dt className="inline font-semibold text-zinc-300">Tavily — </dt>
              <dd className="inline">web search and F1 news aggregation</dd>
            </div>
            <div>
              <dt className="inline font-semibold text-zinc-300">OpenWeather — </dt>
              <dd className="inline">weather forecasts for race locations</dd>
            </div>
          </dl>
        </section>

        <section className="mb-16">
          <h2 className={cn('mb-3', HEADING)}>Licence</h2>
          <div className={RULE} />
          <p className={cn('mb-3', PROSE)}>This project is licensed under the MIT License.</p>
          <p className={PROSE}>
            The third-party assets are not: the 3D model is CC BY 4.0, the driver photographs are
            CC BY, CC BY-SA, CC0 or OGL 3 as listed above, and the team logos are public-domain
            marks that remain registered trademarks of their owners.
          </p>
        </section>

        <div className="border-t border-zinc-800 pt-10 text-center">
          <Link
            href="/"
            className="inline-block rounded-lg bg-f1-red px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
          >
            ← Back to Briefing Agent
          </Link>
        </div>
      </div>
    </div>
  );
}
