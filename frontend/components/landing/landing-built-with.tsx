import { BlurFade } from '@/components/ui/blur-fade';

const TECH_STACK = [
  { label: 'FastF1', note: 'Telemetry & results' },
  { label: 'LangGraph', note: 'Agent orchestration' },
  { label: 'Claude Sonnet 4', note: 'Synthesis & analysis' },
  { label: 'OpenWeather', note: 'Weather forecasts' },
  { label: 'Tavily', note: 'News & web search' },
  { label: 'Next.js 14', note: 'Frontend framework' },
] as const;

export function LandingBuiltWith() {
  return (
    <section className="border-y border-zinc-800/60 bg-zinc-950 py-12" aria-label="Built with">
      <div className="container mx-auto max-w-7xl px-4">
        <BlurFade inView delay={0} direction="up">
          <p className="mb-8 text-center text-xs font-semibold uppercase tracking-widest text-zinc-600">
            Built with
          </p>
          <ul
            className="flex flex-wrap items-center justify-center gap-3"
            role="list"
            aria-label="Technologies used"
          >
            {TECH_STACK.map(({ label, note }) => (
              <li key={label}>
                <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2">
                  <span className="text-sm font-medium text-zinc-300">{label}</span>
                  <span className="hidden text-xs text-zinc-600 sm:block">&middot; {note}</span>
                </div>
              </li>
            ))}
          </ul>
        </BlurFade>
      </div>
    </section>
  );
}
