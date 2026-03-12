'use client';

import { useRef, useEffect } from 'react';
import { motion, useInView } from 'motion/react';

import { BlurFade } from '@/components/ui/blur-fade';
import { TextAnimate } from '@/components/ui/text-animate';
import { NumberTicker } from '@/components/ui/number-ticker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { type Team, type Driver } from '@/data/teams-data';

interface DriverCardProps {
  driver: Driver;
  teamColor: string;
  index: number;
  reducedMotion: boolean;
}

function DriverCard({ driver, teamColor, index, reducedMotion }: DriverCardProps) {
  return (
    <BlurFade delay={reducedMotion ? 0 : 0.1 * index} inView>
      <motion.div
        whileHover={reducedMotion ? {} : { y: -4 }}
        transition={{ duration: 0.2 }}
        className="h-full"
      >
        <Card className="relative overflow-hidden border-zinc-800 bg-zinc-900/60 p-0">
          {/* Top accent bar */}
          <div className="h-[3px] w-full" style={{ backgroundColor: teamColor }} />

          <div className="relative p-5">
            {/* Ghost number */}
            <span
              className="pointer-events-none absolute right-3 top-1 select-none text-8xl font-black text-white"
              style={{ opacity: 0.06, lineHeight: 1 }}
            >
              {driver.number}
            </span>

            {/* Driver info */}
            <div className="relative z-10 space-y-3">
              <div>
                <p className="text-xs uppercase tracking-[0.15em] text-zinc-500">
                  Driver {driver.shortCode}
                </p>
                <p className="mt-1 text-xl font-bold text-white">{driver.name}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs">
                  #{driver.number}
                </Badge>
                <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs">
                  {driver.nationality}
                </Badge>
              </div>
            </div>
          </div>
        </Card>
      </motion.div>
    </BlurFade>
  );
}

interface TeamSectionProps {
  team: Team;
  index: number;
  isActive: boolean;
  onActivate: (id: string) => void;
  onInspect: () => void;
  reducedMotion: boolean;
}

export function TeamSection({
  team,
  index,
  isActive,
  onActivate,
  onInspect,
  reducedMotion,
}: TeamSectionProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isContentInView = useInView(contentRef, { once: true, margin: '-80px 0px' });

  // IntersectionObserver for active team tracking
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) onActivate(team.id);
      },
      { threshold: 0.4, rootMargin: '-10% 0px -40% 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [team.id, onActivate]);

  const isEven = index % 2 === 0;

  return (
    <section
      ref={sectionRef}
      id={`team-${team.id}`}
      className="relative min-h-screen overflow-hidden bg-zinc-950"
    >
      {/* Top separator */}
      <div
        className="h-px w-full"
        style={{ backgroundColor: team.color, opacity: 0.4 }}
      />

      {/* Ambient glow blob */}
      <motion.div
        className="pointer-events-none absolute will-change-transform"
        style={{
          width: '60vw',
          height: '60vw',
          borderRadius: '50%',
          backgroundColor: team.color,
          filter: 'blur(120px)',
          top: '10%',
          ...(isEven ? { right: '-20%' } : { left: '-20%' }),
        }}
        animate={{ opacity: isActive ? 1 : 0 }}
        transition={reducedMotion ? { duration: 0 } : { duration: 0.6 }}
        initial={{ opacity: 0 }}
      />

      {/* Content grid */}
      <div
        className={`relative z-10 flex min-h-screen flex-col gap-8 px-6 py-16 lg:flex-row lg:items-center lg:gap-12 lg:px-12 ${
          isEven ? '' : 'lg:flex-row-reverse'
        }`}
      >
        {/* Left/right: team info */}
        <div ref={contentRef} className="flex flex-col gap-6 lg:flex-1">
          {/* Vertical accent bar + team name */}
          <div className="flex items-start gap-4">
            <motion.div
              className="mt-1 flex-shrink-0 rounded-full"
              initial={{ scaleY: 0, height: 0 }}
              animate={
                isContentInView
                  ? { scaleY: 1, height: reducedMotion ? 40 : 48 }
                  : { scaleY: 0, height: 0 }
              }
              transition={
                reducedMotion ? { duration: 0 } : { duration: 0.5, ease: 'easeOut', delay: 0.1 }
              }
              style={{ width: 4, backgroundColor: team.color, transformOrigin: 'top' }}
            />

            <div className="min-w-0 flex-1">
              <p className="mb-2 text-xs uppercase tracking-[0.2em] text-zinc-600">Constructor</p>
              <TextAnimate
                as="h2"
                animation={reducedMotion ? 'fadeIn' : 'slideUp'}
                by="word"
                startOnView
                once
                className="text-4xl font-black uppercase leading-tight tracking-tight text-white md:text-5xl lg:text-6xl"
                style={{ color: 'white' }}
              >
                {team.shortName}
              </TextAnimate>
            </div>
          </div>

          {/* Tagline */}
          <BlurFade delay={reducedMotion ? 0 : 0.15} inView>
            <p className="max-w-sm text-base leading-relaxed text-zinc-400">{team.tagline}</p>
          </BlurFade>

          {/* Meta info */}
          <BlurFade delay={reducedMotion ? 0 : 0.2} inView>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.15em] text-zinc-600">Base</p>
                <p className="mt-1 text-sm text-zinc-300">{team.base}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.15em] text-zinc-600">Power Unit</p>
                <p className="mt-1 text-sm text-zinc-300">{team.powerUnit}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.15em] text-zinc-600">First Entry</p>
                <p className="mt-1 text-sm text-zinc-300">{team.firstEntry}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.15em] text-zinc-600">
                  Championships
                </p>
                <p className="mt-1 text-sm text-zinc-300">
                  {team.championships > 0 ? (
                    <>
                      <NumberTicker
                        value={team.championships}
                        className="text-sm text-zinc-300"
                      />
                      {' WCC'}
                    </>
                  ) : (
                    '—'
                  )}
                </p>
              </div>
            </div>
          </BlurFade>

          {/* Mobile-only inspect button */}
          <BlurFade delay={reducedMotion ? 0 : 0.25} inView className="lg:hidden">
            <Button
              variant="outline"
              onClick={onInspect}
              className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-white"
              style={{ borderColor: team.color }}
            >
              Inspect in 3D ↗
            </Button>
          </BlurFade>
        </div>

        {/* Right/left: driver cards */}
        <div className="flex flex-col gap-4 lg:w-[340px] xl:w-[380px]">
          {team.drivers.map((driver, i) => (
            <DriverCard
              key={driver.id}
              driver={driver}
              teamColor={team.color}
              index={i}
              reducedMotion={reducedMotion}
            />
          ))}

          {/* Team color chip */}
          <BlurFade delay={reducedMotion ? 0 : 0.3} inView>
            <div className="flex items-center gap-3 pt-2">
              <div
                className="h-3 w-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: team.color }}
              />
              <span className="text-xs uppercase tracking-[0.15em] text-zinc-600">
                {team.name}
              </span>
            </div>
          </BlurFade>
        </div>
      </div>
    </section>
  );
}
