import Link from 'next/link';

const FOOTER_LINKS = [
  { href: '/briefing', label: 'Briefing' },
  { href: '/teardown', label: 'Car Anatomy' },
  { href: '/showcase', label: 'Showcase' },
  { href: '/credits', label: 'Credits' },
] as const;

export function LandingFooter() {
  return (
    <footer className="border-t border-zinc-800 bg-zinc-950" aria-label="Site footer">
      <div className="container mx-auto max-w-7xl px-4 py-10">
        <div className="flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-center">
          {/* Brand */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-f1-red" aria-hidden="true" />
              <span className="text-sm font-semibold text-white">F1 Briefing Agent</span>
            </div>
            <p className="text-xs text-zinc-600">AI-powered race weekend intelligence</p>
          </div>

          {/* Nav links */}
          <nav aria-label="Footer navigation">
            <ul className="flex flex-wrap gap-6" role="list">
              {FOOTER_LINKS.map(({ href, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-sm text-zinc-500 transition-colors hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-f1-red focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="my-8 h-px w-full bg-zinc-800" role="separator" aria-hidden="true" />

        <div className="flex flex-col items-start justify-between gap-3 text-xs text-zinc-600 sm:flex-row sm:items-center">
          <p>
            Data from{' '}
            <a
              href="https://theoehrly.github.io/Fast-F1/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-zinc-400"
            >
              FastF1
            </a>
            {' & '}
            <a
              href="https://openweathermap.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-zinc-400"
            >
              OpenWeather
            </a>
            . F1 car model CC BY 4.0.
          </p>
          <p>Built with Claude Sonnet 4 &middot; Not affiliated with Formula 1 or the FIA.</p>
        </div>
      </div>
    </footer>
  );
}
