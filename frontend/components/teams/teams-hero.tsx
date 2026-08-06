'use client';

import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { BlurFade } from '@/components/ui/blur-fade';
import { TextAnimate } from '@/components/ui/text-animate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DotPattern } from '@/components/ui/dot-pattern';
import { TEAMS, SEASON } from '@/data/teams-data';
import { teamSectionId } from '@/hooks/use-team-navigation';
import { paletteFor, withAlpha } from '@/lib/team-utils';

interface TeamsHeroProps {
  /** Jump to a team section. Called with the first team by the primary CTA. */
  onSelectTeam: (teamId: string) => void;
  reducedMotion: boolean;
}

export function TeamsHero({ onSelectTeam, reducedMotion }: TeamsHeroProps) {
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });

  // Four depths moving at four rates. Hooks run either way; only the styles are conditional, so
  // reduced motion gets a completely static hero rather than a fast one.
  const dotsY = useTransform(scrollYProgress, [0, 1], ['0%', '35%']);
  const glowY = useTransform(scrollYProgress, [0, 1], ['0%', '60%']);
  const ghostY = useTransform(scrollYProgress, [0, 1], ['0%', '90%']);
  const contentY = useTransform(scrollYProgress, [0, 1], ['0%', '-25%']);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const ribbonX = useTransform(scrollYProgress, [0, 1], ['0%', '-8%']);

  const parallax = (style: Record<string, unknown>) => (reducedMotion ? undefined : style);

  return (
    <section
      ref={heroRef}
      aria-labelledby="teams-hero-title"
      className="relative flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center overflow-hidden bg-zinc-950 pb-24 pt-10"
    >
      {/* Depth 1 — dot field */}
      <motion.div className="absolute inset-0" style={parallax({ y: dotsY })} aria-hidden="true">
        <DotPattern className="absolute inset-0 opacity-30 [mask-image:radial-gradient(ellipse_at_center,white_20%,transparent_75%)]" />
      </motion.div>

      {/* Depth 2 — ambient glows */}
      <motion.div className="absolute inset-0" style={parallax({ y: glowY })} aria-hidden="true">
        <div
          className="absolute -bottom-32 -left-32 h-[600px] w-[600px] rounded-full opacity-[0.09]"
          style={{ background: '#dc2626', filter: 'blur(120px)' }}
        />
        <div
          className="absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full opacity-[0.05]"
          style={{ background: '#38bdf8', filter: 'blur(110px)' }}
        />
      </motion.div>

      {/* Depth 3 — oversized season numeral behind the title */}
      <motion.span
        className="pointer-events-none absolute select-none text-[34vw] font-black leading-none tracking-tighter text-white/[0.03]"
        style={parallax({ y: ghostY })}
        aria-hidden="true"
      >
        {SEASON}
      </motion.span>

      {/* Depth 4 — the actual content */}
      <motion.div
        className="relative z-10 flex flex-col items-center gap-6 px-6 text-center"
        style={parallax({ y: contentY, opacity: contentOpacity })}
      >
        <BlurFade delay={0.1} inView>
          <Badge
            variant="outline"
            className="border-zinc-700 bg-zinc-900/60 text-zinc-300 backdrop-blur-sm"
          >
            {SEASON} FIA Formula One World Championship
          </Badge>
        </BlurFade>

        {/* The visible lockup is decorative; the single accessible name lives on the h1. */}
        <h1 id="teams-hero-title" className="sr-only">
          {`${SEASON} Formula One Constructors`}
        </h1>
        <div aria-hidden="true">
          <TextAnimate
            as="p"
            accessible={false}
            animation={reducedMotion ? 'fadeIn' : 'slideUp'}
            by="word"
            duration={0.5}
            startOnView
            once
            className="mb-2 text-sm font-medium uppercase tracking-[0.45em] text-zinc-500 md:text-base"
          >
            {`${SEASON} Formula One`}
          </TextAnimate>

          <TextAnimate
            accessible={false}
            animation={reducedMotion ? 'fadeIn' : 'blurInUp'}
            by="character"
            duration={0.8}
            startOnView
            once
            className="text-[clamp(3rem,11vw,8.5rem)] font-black uppercase leading-[0.85] tracking-[0.06em] text-white"
          >
            CONSTRUCTORS
          </TextAnimate>
        </div>

        <TextAnimate
          as="p"
          animation={reducedMotion ? 'fadeIn' : 'blurInUp'}
          by="word"
          delay={0.35}
          duration={0.6}
          startOnView
          once
          className="max-w-xl text-balance text-base font-light text-zinc-400 md:text-lg"
        >
          Every team on the grid — drivers, power units, bases, and titles — with each car rendered
          in 3D.
        </TextAnimate>

        <BlurFade delay={reducedMotion ? 0 : 0.65} inView>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <Button
              size="lg"
              className="gap-2 bg-f1-red text-white hover:bg-f1-red/90"
              onClick={() => onSelectTeam(TEAMS[0]!.id)}
            >
              {`Explore ${TEAMS.length} Constructors`}
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="gap-2 text-zinc-400 hover:bg-zinc-900 hover:text-white"
              asChild
            >
              <a href="#grid-comparison">Compare the grid</a>
            </Button>
          </div>
        </BlurFade>
      </motion.div>

      {/* Livery ribbon — eleven colors, eleven anchors, doubling as the page's table of contents */}
      <motion.nav
        aria-label="Jump to a constructor"
        className="absolute inset-x-0 bottom-0 z-10 px-4 pb-6"
        style={parallax({ x: ribbonX })}
      >
        <ul className="mx-auto flex max-w-5xl items-end gap-1.5">
          {TEAMS.map((team, i) => {
            const palette = paletteFor(team.color);
            return (
              <motion.li
                key={team.id}
                className="min-w-0 flex-1"
                initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scaleY: 0.2 }}
                animate={{ opacity: 1, scaleY: 1 }}
                transition={
                  reducedMotion
                    ? { duration: 0.2, delay: 0.2 }
                    : { duration: 0.5, delay: 0.9 + i * 0.045, ease: [0.16, 1, 0.3, 1] }
                }
                style={{ transformOrigin: 'bottom' }}
              >
                <a
                  href={`#${teamSectionId(team.id)}`}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                    e.preventDefault();
                    onSelectTeam(team.id);
                  }}
                  className="group block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                  style={{ ['--tw-ring-color' as string]: palette.ring }}
                >
                  <span
                    className="block h-1.5 w-full rounded-full transition-all duration-300 group-hover:h-3.5 group-focus-visible:h-3.5"
                    style={{
                      backgroundColor: team.color,
                      boxShadow: `0 0 18px ${withAlpha(team.color, 0.45)}`,
                    }}
                  />
                  <span className="mt-2 block truncate text-center text-[9px] uppercase tracking-widest text-zinc-600 transition-colors duration-300 group-hover:text-zinc-300 group-focus-visible:text-zinc-300 sm:text-[10px]">
                    {team.shortName}
                  </span>
                </a>
              </motion.li>
            );
          })}
        </ul>
      </motion.nav>

      {/* Scroll cue */}
      {!reducedMotion && (
        <motion.div
          className="absolute bottom-24 left-1/2 -translate-x-1/2 text-zinc-600"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5, duration: 0.6 }}
          aria-hidden="true"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
          >
            <ChevronDown size={24} />
          </motion.div>
        </motion.div>
      )}

      {/* Bottom fade into the first section */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-zinc-950 to-transparent"
        aria-hidden="true"
      />
    </section>
  );
}
