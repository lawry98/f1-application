import { Zap, Eye, Database, TrendingUp, Cloud, Layers } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BlurFade } from '@/components/ui/blur-fade';

const FEATURES = [
  {
    icon: Zap,
    title: 'Live Streaming Briefing',
    description:
      'Watch the briefing generate word-by-word via server-sent events. No waiting for a full response — intelligence streams to you the moment it is ready.',
  },
  {
    icon: Eye,
    title: 'Tool Trace Transparency',
    description:
      'See exactly which tools the AI agent executed, in what order, and whether each succeeded. No black box — full visibility into every data-gathering step.',
  },
  {
    icon: Database,
    title: 'Historical F1 Telemetry',
    description:
      'Powered by FastF1: lap times, race results, track profiles, qualifying data, and circuit records going back decades — all available without an API key.',
  },
  {
    icon: TrendingUp,
    title: 'Driver & Team Form',
    description:
      'Current championship standings, recent race pace, and head-to-head driver context synthesised into every briefing. Know who is peaking before qualifying.',
  },
  {
    icon: Cloud,
    title: 'Race Weather Forecast',
    description:
      'OpenWeather integration pulls the race-weekend forecast for the correct circuit location — temperature, humidity, wind, and conditions that could shape strategy.',
  },
  {
    icon: Layers,
    title: 'Interactive Car Anatomy',
    description:
      'Scroll through 192 high-res animation frames to reveal what is hidden inside a 2024 F1 car — from carbon bodywork to the V6 turbo-hybrid power unit.',
  },
] as const;

export function LandingFeatures() {
  return (
    <section
      id="features"
      className="border-t border-zinc-800 bg-zinc-950 py-24"
      aria-labelledby="features-heading"
    >
      <div className="container mx-auto max-w-7xl px-4">
        {/* Section header */}
        <BlurFade inView delay={0} direction="up">
          <div className="mb-16 max-w-2xl">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-f1-red">
              What you get
            </p>
            <h2
              id="features-heading"
              className="text-3xl font-bold tracking-tight text-white lg:text-4xl"
            >
              Everything for a complete race weekend picture
            </h2>
            <p className="mt-4 text-lg text-zinc-400">
              One query. Multiple sources. One authoritative briefing.
            </p>
          </div>
        </BlurFade>

        {/* Feature grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, description }, i) => (
            <BlurFade key={title} inView delay={0.05 * i} direction="up">
              <Card className="group h-full border-zinc-800 bg-zinc-900/60 transition-colors hover:border-zinc-700 hover:bg-zinc-900">
                <CardHeader className="space-y-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 transition-colors group-hover:border-f1-red/30 group-hover:bg-f1-red/5">
                    <Icon className="h-5 w-5 text-f1-red" aria-hidden="true" />
                  </div>
                  <div className="space-y-2">
                    <CardTitle className="text-base font-semibold text-white">{title}</CardTitle>
                    <CardDescription className="text-sm leading-relaxed text-zinc-400">
                      {description}
                    </CardDescription>
                  </div>
                </CardHeader>
              </Card>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  );
}
