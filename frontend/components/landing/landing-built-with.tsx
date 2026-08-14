import { BlurFadeReduced } from '@/components/candy/blur-fade-reduced';

const TECH_STACK = [
  { label: 'FastF1', note: 'Telemetry & results' },
  { label: 'LangGraph', note: 'Agent orchestration' },
  { label: 'Gemini 3.6 Flash', note: 'Synthesis & analysis' },
  { label: 'OpenWeather', note: 'Weather forecasts' },
  { label: 'Tavily', note: 'News & web search' },
  { label: 'Next.js 14', note: 'Frontend framework' },
] as const;

export function LandingBuiltWith() {
  return (
    // No `bg-*`: `app/page.tsx` wraps every landing section in a `LandingSectionTheme` that owns
    // the surface colour, and a background here would paint over it. This strip's tone is `base`,
    // which is the same #09090B the `bg-zinc-950` here used to paint — a rename, not a change.
    <section className="border-y border-zinc-800/60 py-12" aria-label="Built with">
      <div className="container mx-auto max-w-7xl px-4">
        <BlurFadeReduced inView delay={0} direction="up">
          <p className="mb-8 text-center text-xs font-semibold uppercase tracking-widest text-zinc-400">
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
                  <span className="hidden text-xs text-zinc-400 sm:block">&middot; {note}</span>
                </div>
              </li>
            ))}
          </ul>
        </BlurFadeReduced>
      </div>
    </section>
  );
}
