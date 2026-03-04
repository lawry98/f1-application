import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BlurFade } from '@/components/ui/blur-fade';
import { DotPattern } from '@/components/ui/dot-pattern';

export function LandingCtaBand() {
  return (
    <section className="relative overflow-hidden bg-zinc-950 py-28" aria-labelledby="cta-heading">
      {/* Background */}
      <DotPattern className="text-zinc-800/20" width={20} height={20} cr={0.8} />
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden="true"
      >
        <div className="bg-red-600/8 h-[600px] w-[600px] rounded-full blur-3xl" />
      </div>

      <div className="container relative mx-auto max-w-4xl px-4 text-center">
        <BlurFade inView delay={0} direction="up">
          <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-f1-red">
            Ready to get started?
          </p>
          <h2
            id="cta-heading"
            className="mb-6 text-4xl font-bold tracking-tight text-white lg:text-5xl"
          >
            Your race weekend briefing, one click away.
          </h2>
          <p className="mx-auto mb-10 max-w-xl text-lg text-zinc-400">
            No setup, no account required. Enter any Grand Prix name and receive a comprehensive
            AI-generated briefing in seconds.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
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
        </BlurFade>
      </div>
    </section>
  );
}
