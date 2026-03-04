import { BlurFade } from '@/components/ui/blur-fade';
import { cn } from '@/lib/utils';

const STEPS = [
  {
    number: '01',
    title: 'Enter your race',
    description:
      'Type any Grand Prix name — "Monaco", "Silverstone 2023", "Japanese GP" — or pick from the upcoming race calendar. The agent handles fuzzy matching and historical queries.',
  },
  {
    number: '02',
    title: 'Agent plans & executes',
    description:
      'A LangGraph agent resolves the race, determines which data sources are relevant, and executes tools in sequence: track profile, race results, driver standings, weather, and news.',
  },
  {
    number: '03',
    title: 'Claude synthesizes',
    description:
      'Claude Sonnet 4 reads all gathered data and synthesizes it into a structured, insightful briefing — not a data dump, but coherent analysis calibrated for the race weekend ahead.',
  },
  {
    number: '04',
    title: 'Your briefing, ready',
    description:
      'Receive track context, driver form, weather forecast, championship standings, and strategic outlook — all in one structured document. Streamed live as it generates.',
  },
] as const;

export function LandingHowItWorks() {
  return (
    <section id="how-it-works" className="bg-zinc-950 py-24" aria-labelledby="how-it-works-heading">
      <div className="container mx-auto max-w-7xl px-4">
        {/* Section header */}
        <BlurFade inView delay={0} direction="up">
          <div className="mb-16 max-w-2xl">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-f1-red">
              How it works
            </p>
            <h2
              id="how-it-works-heading"
              className="text-3xl font-bold tracking-tight text-white lg:text-4xl"
            >
              From query to briefing in seconds
            </h2>
            <p className="mt-4 text-lg text-zinc-400">
              Four steps. One pipeline. Powered by LangGraph and Claude AI.
            </p>
          </div>
        </BlurFade>

        {/* Steps */}
        <div className="relative">
          {/* Connecting line (desktop) */}
          <div
            className="absolute left-[2.25rem] top-8 hidden h-[calc(100%-4rem)] w-px bg-gradient-to-b from-f1-red/40 via-zinc-800 to-transparent lg:block"
            aria-hidden="true"
          />

          <div className="space-y-10">
            {STEPS.map(({ number, title, description }, i) => (
              <BlurFade key={number} inView delay={0.1 * i} direction="up">
                <div className="flex gap-6 lg:gap-8">
                  {/* Step number */}
                  <div className="flex-shrink-0">
                    <div
                      className={cn(
                        'flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-xl border text-lg font-bold tabular-nums',
                        i === 0
                          ? 'border-f1-red/50 bg-f1-red/10 text-f1-red'
                          : 'border-zinc-800 bg-zinc-900 text-zinc-500',
                      )}
                      aria-hidden="true"
                    >
                      {number}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="pb-2 pt-3">
                    <h3 className="mb-2 text-xl font-semibold text-white">{title}</h3>
                    <p className="max-w-2xl text-base leading-relaxed text-zinc-400">
                      {description}
                    </p>
                  </div>
                </div>
              </BlurFade>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
