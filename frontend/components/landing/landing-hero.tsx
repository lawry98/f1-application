import Link from 'next/link';
import { ChevronRight, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DotPattern } from '@/components/ui/dot-pattern';
import { cn } from '@/lib/utils';

export function LandingHero() {
  return (
    <section className="relative flex min-h-[calc(100vh-3.5rem)] items-center overflow-hidden bg-zinc-950 pt-14">
      {/* Background dot pattern */}
      <DotPattern className="text-zinc-800/25" width={20} height={20} cr={0.8} />

      {/* Ambient glows */}
      <div
        className="pointer-events-none absolute -left-32 top-1/3 h-[700px] w-[700px] -translate-y-1/2 rounded-full bg-red-600/[0.08] blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-red-600/5 blur-3xl"
        aria-hidden="true"
      />

      <div className="container relative mx-auto max-w-7xl px-4 py-20 lg:py-28">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_440px] lg:gap-16 xl:grid-cols-[1fr_500px]">
          {/* Left column: copy + CTAs */}
          <div className="space-y-8">
            <Badge variant="outline" className="border-zinc-700 bg-zinc-900/80 text-zinc-300">
              <Zap className="mr-1.5 h-3 w-3 text-f1-red" aria-hidden="true" />
              Gemini 3.6 Flash &middot; LangGraph &middot; FastF1
            </Badge>

            <div className="space-y-5">
              <h1 className="text-5xl font-bold leading-[1.08] tracking-tight text-ink lg:text-6xl xl:text-7xl">
                Race weekend intel, <span className="text-f1-red">before the lights</span> go out.
              </h1>
              <p className="max-w-lg text-lg leading-relaxed text-zinc-400">
                Type any Grand Prix and our AI agent gathers track telemetry, driver form, weather
                forecasts, and live news — synthesized into a structured race weekend briefing by
                Claude AI.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                asChild
                size="lg"
                className="bg-f1-red text-white hover:bg-red-700 focus-visible:ring-f1-red"
              >
                <Link href="/briefing">
                  Generate a Briefing
                  <ChevronRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white focus-visible:ring-zinc-600"
              >
                <Link href="/teardown">Explore Car Anatomy</Link>
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-6 border-t border-zinc-800 pt-6 text-sm text-zinc-500">
              <span>Multi-source data</span>
              <span className="h-1 w-1 rounded-full bg-zinc-700" aria-hidden="true" />
              <span>Real-time streaming</span>
              <span className="h-1 w-1 rounded-full bg-zinc-700" aria-hidden="true" />
              <span>Tool trace transparency</span>
            </div>
          </div>

          {/* Right column: briefing preview card */}
          <div className="hidden lg:block">
            <HeroBriefingPreview />
          </div>
        </div>
      </div>

      {/* Bottom gradient fade */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-28 bg-gradient-to-t from-zinc-950 to-transparent"
        aria-hidden="true"
      />
    </section>
  );
}

function HeroBriefingPreview() {
  const tools: Array<{ label: string; ok: boolean }> = [
    { label: 'Track telemetry', ok: true },
    { label: 'Driver form', ok: true },
    { label: 'Weather forecast', ok: true },
    { label: 'News search', ok: true },
  ];

  return (
    <div className="relative select-none">
      {/* Outer glow */}
      <div
        className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-red-600/20 via-transparent to-transparent blur-xl"
        aria-hidden="true"
      />

      <div className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/95 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-f1-red">
              Race Briefing
            </p>
            <h3 className="font-semibold text-ink">Monaco Grand Prix</h3>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-1 text-[11px] font-medium text-green-400">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400" aria-hidden="true" />
            Ready
          </span>
        </div>

        {/* Content rows */}
        <div className="divide-y divide-zinc-800/50 px-5">
          <PreviewRow
            label="Track"
            primary="Circuit de Monaco · 3.337 km"
            secondary="78 laps · Monte Carlo, Monaco"
          />
          <PreviewRow
            label="Weather"
            primary="Partly cloudy · 22°C"
            secondary="Humidity 45% · Wind 12 km/h SW"
          />
          <PreviewRow
            label="Championship Lead"
            primary="Max Verstappen · Red Bull Racing"
            secondary="312 pts · +67 over Leclerc"
          />
          <PreviewRow
            label="Fastest Lap Record"
            primary="Lewis Hamilton · 1:12.909"
            secondary="Set during the 2021 Grand Prix"
          />
        </div>

        {/* Tool trace */}
        <div className="border-t border-zinc-800 bg-zinc-950/50 px-5 py-3">
          <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Agent tool trace
          </p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            {tools.map(({ label, ok }) => (
              <div key={label} className="flex items-center gap-2">
                <span
                  className={cn(
                    'h-1.5 w-1.5 flex-shrink-0 rounded-full',
                    ok ? 'bg-green-500' : 'bg-red-500',
                  )}
                  aria-hidden="true"
                />
                <span className="text-[11px] text-zinc-400">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewRow({
  label,
  primary,
  secondary,
}: {
  label: string;
  primary: string;
  secondary: string;
}) {
  return (
    <div className="py-3">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        {label}
      </p>
      <p className="text-sm text-zinc-200">{primary}</p>
      <p className="text-sm text-zinc-500">{secondary}</p>
    </div>
  );
}
