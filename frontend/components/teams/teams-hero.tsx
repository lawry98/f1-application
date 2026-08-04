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
import { TeamMonogramTile } from './team-monogram-tile';

interface TeamsHeroProps {
  onSelectTeam: (id: string) => void;
}

export function TeamsHero({ onSelectTeam }: TeamsHeroProps) {
  const reducedMotion = useReducedMotion();

  return (
    // `min-h-[calc(100vh-3.5rem)]`, not `min-h-screen`. The 3.5rem site nav sits above this
    // section in normal flow, so a 100vh hero pushes its own last 56px below the fold — and
    // everything anchored to the section's bottom edge with it. The livery wall's hover
    // wordmark sits at `bottom-5` and is 30px tall, so it landed 6px past the viewport at
    // *every* window height and could never be seen; the scroll cue and the bottom gradient
    // fade were clipped with it. `components/landing/landing-hero.tsx` already subtracts the
    // nav for the same reason, and teams-page-client.tsx's asides use the same 3.5rem.
    <section className="relative flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center overflow-hidden bg-zinc-950">
      {/* Dot pattern background */}
      <DotPattern className="absolute inset-0 opacity-30 [mask-image:radial-gradient(ellipse_at_center,white_20%,transparent_75%)]" />

      {/* Ambient glow — below `lg` only, where the livery wall is hidden (eleven columns
          at ~34px each is unusable) so the hero would otherwise be flat colour-less
          DotPattern behind the mobile logo grid. A single blurred layer, gated off at
          `lg` so it never stacks with the wall's own colour wash. */}
      <div
        className="pointer-events-none absolute -bottom-32 -left-32 h-[600px] w-[600px] rounded-full opacity-[0.07] lg:hidden"
        style={{ background: '#dc2626', filter: 'blur(120px)' }}
        aria-hidden="true"
      />

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

      {/* Bottom gradient fade — hints at content below. Placed before the clickable-columns
          layer, not after it, on purpose: both are position:absolute with no explicit
          z-index (or `z-0`, which stacks identically to `auto`), so within that shared
          level painting follows DOM order. Sequenced after it, this gradient painted on
          top of every descendant of that layer — including the `lg` hover reveal's real
          wordmark at `bottom-5`, which sits inside this band (0–112px from the bottom) and
          rendered dim grey instead of near-white on hover. Ahead of it in DOM, the gradient
          still paints over the decorative dot pattern and livery wall behind it, but now
          sits below the interactive layer, so the reveal it hovers above stays undimmed. */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-28 bg-gradient-to-t from-zinc-950 to-transparent"
        aria-hidden="true"
      />

      {/* Clickable columns. Separate from the decorative layer above so those visual
          columns can stay aria-hidden while these carry the accessible names.

          ONE set of buttons, laid out responsively — full-height columns at lg and up,
          a four-across logo grid below. Rendering a second `lg:hidden` set instead would
          put 22 buttons in the DOM under jsdom, where no media query applies, and every
          getByRole in the test would throw on multiple matches.

          Placed after Content in DOM order so keyboard/screen-reader users reach the
          Badge, title, and "Explore Constructors" CTA — the eye's primary path — before
          the eleven "Jump to …" columns. `z-0` keeps it below Content's `z-10`
          stacking context, so the CTA stays on top and clickable even though this layer
          is `inset-0` and paints after it. */}
      <div
        className={cn(
          'absolute inset-x-0 bottom-16 z-0 grid grid-cols-4 justify-items-center gap-3 px-6',
          // No `lg:bottom-auto` here. It was a leftover from the mobile `bottom-16`, and inside
          // the `lg` block it is emitted *after* `inset-0`, so it won. That left the container
          // `top:0; bottom:auto; height:auto` around `h-full` children whose only content is
          // absolutely positioned — a 0px-tall flex line, i.e. eleven invisible zero-size
          // buttons and a livery wall that could not be hovered or clicked on any desktop.
          'lg:inset-0 lg:flex lg:gap-0 lg:px-0',
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
            {/* Two marks, one button. Below `lg` the grid shows all eleven at once, four
                across, so wordmarks are directly comparable — and `object-contain`
                letterboxing makes Aston Martin draw at 42% of the box height next to
                McLaren's 59% at *every* size, which is the disparity the monogram tile
                exists to remove. At `lg` and up only one mark is visible at a time, revealed
                on hover against a full-height column, so the real wordmark reads better and
                has nothing to be compared against.

                CSS visibility on two spans, not two `TEAMS.map`s of buttons: a second button
                set would put 22 buttons in the DOM under jsdom, where no media query applies,
                and every getByRole in the hero tests would throw on multiple matches. */}
            <span className="relative flex justify-center lg:hidden">
              <TeamMonogramTile team={team} size={36} />
            </span>
            <span className="absolute bottom-5 left-0 right-0 hidden justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100 lg:flex">
              <TeamLogo team={team} size={30} />
            </span>
          </button>
        ))}
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
    </section>
  );
}
