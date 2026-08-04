'use client';

import { useRef, useEffect } from 'react';
import { motion, useInView } from 'motion/react';
import { Expand } from 'lucide-react';

import { BlurFade } from '@/components/ui/blur-fade';
import { TextAnimate } from '@/components/ui/text-animate';
import { NumberTicker } from '@/components/ui/number-ticker';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { teamColorButtonStyle } from '@/lib/team-utils';
import { type Team } from '@/data/teams-data';
import { DriverPortrait } from './driver-portrait';
import { TeamLogo } from './team-logo';

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

  // IntersectionObserver for active team tracking — tuned for content-driven height
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) onActivate(team.id);
      },
      { threshold: 0.25, rootMargin: '-15% 0px -35% 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [team.id, onActivate]);

  const blobOnRight = index % 2 === 0;
  const ctaStyle = teamColorButtonStyle(team);

  return (
    <section
      ref={sectionRef}
      id={`team-${team.id}`}
      className="relative overflow-hidden bg-zinc-950"
    >
      {/* Top separator */}
      <div className="h-px w-full" style={{ backgroundColor: team.color, opacity: 0.4 }} />

      {/* Ambient glow blob — alternates position for visual variety */}
      <motion.div
        className="pointer-events-none absolute will-change-transform"
        style={{
          width: '40vw',
          height: '40vw',
          borderRadius: '50%',
          backgroundColor: team.color,
          filter: 'blur(120px)',
          top: '10%',
          ...(blobOnRight ? { right: '-20%' } : { left: '-20%' }),
        }}
        animate={{ opacity: isActive ? 1 : 0 }}
        transition={reducedMotion ? { duration: 0 } : { duration: 0.6 }}
        initial={{ opacity: 0 }}
      />

      {/* Oversized monogram bleeding off the leading edge. Decorative only. */}
      <span
        data-testid="team-watermark"
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute top-8 select-none text-[14rem] font-black leading-none text-white opacity-[0.035]',
          blobOnRight ? '-left-10' : '-right-10',
        )}
      >
        {team.shortName.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase()}
      </span>

      {/* Content grid — fixed layout: left info, right drivers */}
      <div className="relative z-10 flex flex-col gap-8 px-6 py-20 lg:flex-row lg:items-center lg:gap-12 lg:px-12">
        {/* Left: team info */}
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
              <p className="mb-2 text-xs uppercase tracking-[0.2em] text-zinc-500">Constructor</p>
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
                <p className="text-xs uppercase tracking-[0.15em] text-zinc-500">Base</p>
                <p className="mt-1 text-sm text-zinc-200">{team.base}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.15em] text-zinc-500">Power Unit</p>
                <p className="mt-1 text-sm text-zinc-200">{team.powerUnit}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.15em] text-zinc-500">First Entry</p>
                <p className="mt-1 text-sm text-zinc-200">{team.firstEntry}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.15em] text-zinc-500">Championships</p>
                <p className="mt-1 text-sm text-zinc-200">
                  {team.championships > 0 ? (
                    <>
                      <NumberTicker value={team.championships} className="text-sm text-zinc-200" />
                      {' WCC'}
                    </>
                  ) : (
                    '—'
                  )}
                </p>
              </div>
            </div>
          </BlurFade>

          {/* Mobile-only inspect button — visible when sticky car viewer is hidden */}
          <BlurFade delay={reducedMotion ? 0 : 0.25} inView className="lg:hidden">
            <Button
              onClick={onInspect}
              className={cn('gap-2 font-medium', ctaStyle.className)}
              style={ctaStyle.style}
            >
              <Expand className="h-4 w-4" />
              Inspect in 3D
            </Button>
          </BlurFade>
        </div>

        {/* Right: driver portraits */}
        <div className="flex flex-col gap-4 lg:w-[340px] xl:w-[380px]">
          <div className="flex gap-3">
            {team.drivers.map((driver, i) => (
              <BlurFade
                key={driver.id}
                delay={reducedMotion ? 0 : 0.1 * i}
                inView
                className="min-w-0 flex-1"
              >
                <DriverPortrait
                  driver={driver}
                  team={team}
                  priority={index === 0}
                  className="aspect-[3/4] w-full"
                />
              </BlurFade>
            ))}
          </div>

          <BlurFade delay={reducedMotion ? 0 : 0.3} inView>
            <div className="flex items-center gap-3 pt-2">
              <TeamLogo team={team} size={20} />
              <span className="text-xs uppercase tracking-[0.15em] text-zinc-500">{team.name}</span>
            </div>
          </BlurFade>
        </div>
      </div>
    </section>
  );
}
