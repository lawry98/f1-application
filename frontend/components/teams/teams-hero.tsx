'use client';

import { useReducedMotion, motion } from 'motion/react';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { BlurFade } from '@/components/ui/blur-fade';
import { TextAnimate } from '@/components/ui/text-animate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DotPattern } from '@/components/ui/dot-pattern';
import { cn } from '@/lib/utils';
import { TEAMS } from '@/data/teams-data';
import { TeamLogo } from './team-logo';

interface TeamsHeroProps {
  onSelectTeam: (id: string) => void;
}

export function TeamsHero({ onSelectTeam }: TeamsHeroProps) {
  const reducedMotion = useReducedMotion();

  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-zinc-950">
      {/* Dot pattern background */}
      <DotPattern className="absolute inset-0 opacity-30 [mask-image:radial-gradient(ellipse_at_center,white_20%,transparent_75%)]" />

      {/* Livery wall — one column per constructor, hidden on small viewports where
          eleven columns would be ~34px each. */}
      <div className="pointer-events-none absolute inset-0 hidden lg:flex" aria-hidden="true">
        {TEAMS.map((team, i) => (
          <motion.div
            key={team.id}
            className="relative flex-1 origin-bottom"
            initial={reducedMotion ? { opacity: 1 } : { opacity: 0, transform: 'scaleY(0)' }}
            animate={{ opacity: 1, transform: 'scaleY(1)' }}
            transition={
              reducedMotion
                ? { duration: 0 }
                : { type: 'spring', duration: 0.6, bounce: 0, delay: i * 0.06 }
            }
            style={{
              background: `linear-gradient(to top, ${team.color}22, transparent 65%)`,
            }}
          >
            <span
              className="absolute bottom-0 left-0 right-0 h-1"
              style={{ backgroundColor: team.color }}
            />
          </motion.div>
        ))}
      </div>

      {/* Clickable columns. Separate from the decorative layer above so those visual
          columns can stay aria-hidden while these carry the accessible names.

          ONE set of buttons, laid out responsively — full-height columns at lg and up,
          a four-across logo grid below. Rendering a second `lg:hidden` set instead would
          put 22 buttons in the DOM under jsdom, where no media query applies, and every
          getByRole in the test would throw on multiple matches. */}
      <div
        className={cn(
          'absolute inset-x-0 bottom-16 grid grid-cols-4 justify-items-center gap-3 px-6',
          'lg:inset-0 lg:bottom-auto lg:flex lg:gap-0 lg:px-0',
        )}
      >
        {TEAMS.map((team) => (
          <button
            key={team.id}
            onClick={() => onSelectTeam(team.id)}
            aria-label={`Jump to ${team.shortName}`}
            className={cn(
              'group relative transition-transform duration-150 active:scale-[0.96]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 lg:focus-visible:ring-inset',
              'lg:h-full lg:flex-1 lg:active:scale-100',
            )}
          >
            {/* Hover wash — lg only, where there is a column to wash. */}
            <span
              aria-hidden="true"
              className="absolute inset-0 hidden opacity-0 transition-opacity duration-200 group-hover:opacity-100 lg:block"
              style={{ background: `linear-gradient(to top, ${team.color}44, transparent 70%)` }}
            />
            {/* Always visible below lg; revealed on hover at lg and up. */}
            <span className="relative flex justify-center lg:absolute lg:bottom-5 lg:left-0 lg:right-0 lg:opacity-0 lg:transition-opacity lg:duration-200 lg:group-hover:opacity-100">
              <TeamLogo team={team} size={30} />
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-6 px-6 text-center">
        <BlurFade delay={0.1} inView>
          <Badge variant="outline" className="border-zinc-600 text-zinc-400">
            2026 Season · 11 Constructors
          </Badge>
        </BlurFade>

        <TextAnimate
          as="h1"
          animation={reducedMotion ? 'fadeIn' : 'blurInUp'}
          by="character"
          duration={0.8}
          startOnView
          once
          className="text-[clamp(3.5rem,12vw,9rem)] font-black uppercase leading-none tracking-[0.15em] text-white"
        >
          THE GRID
        </TextAnimate>

        <TextAnimate
          as="p"
          animation={reducedMotion ? 'fadeIn' : 'blurInUp'}
          by="word"
          delay={0.4}
          duration={0.6}
          startOnView
          once
          className="max-w-md text-lg font-light uppercase tracking-widest text-zinc-400"
        >
          2026 F1 Constructor Profiles
        </TextAnimate>

        <BlurFade delay={reducedMotion ? 0 : 0.8} inView>
          <Button
            size="lg"
            className="mt-4 gap-2 bg-f1-red text-white hover:bg-f1-red/90"
            onClick={() =>
              document.getElementById(`team-${TEAMS[0]!.id}`)?.scrollIntoView({
                behavior: reducedMotion ? 'auto' : 'smooth',
                block: 'start',
              })
            }
          >
            Explore Constructors
            <ChevronRight className="h-4 w-4" />
          </Button>
        </BlurFade>
      </div>

      {/* Scroll cue */}
      {!reducedMotion && (
        <motion.div
          className="absolute bottom-10 left-1/2 -translate-x-1/2 text-zinc-500"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4, duration: 0.6 }}
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
          >
            <ChevronDown size={28} />
          </motion.div>
        </motion.div>
      )}

      {/* Bottom gradient fade — hints at content below */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-28 bg-gradient-to-t from-zinc-950 to-transparent"
        aria-hidden="true"
      />
    </section>
  );
}
