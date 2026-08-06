'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { motion, useInView, useScroll, useTransform } from 'motion/react';
import { Expand } from 'lucide-react';

import { BlurFade } from '@/components/ui/blur-fade';
import { TextAnimate } from '@/components/ui/text-animate';
import { NumberTicker } from '@/components/ui/number-ticker';
import { Button } from '@/components/ui/button';
import { paletteFor, teamColorButtonStyle, withAlpha, type TeamPalette } from '@/lib/team-utils';
import { SEASON, type Driver, type Team } from '@/data/teams-data';
import { teamSectionId } from '@/hooks/use-team-navigation';

interface DriverCardProps {
  driver: Driver;
  team: Team;
  palette: TeamPalette;
  index: number;
  reducedMotion: boolean;
}

/**
 * One driver. The four facts always sit in the same four places — number top-left, nationality
 * top-right, name bottom-left, code bottom-right — so the eye can compare across all 22 drivers
 * without re-reading the layout.
 */
function DriverCard({ driver, team, palette, index, reducedMotion }: DriverCardProps) {
  return (
    <motion.article
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 24, clipPath: 'inset(12% 0 0 0)' }}
      whileInView={{ opacity: 1, y: 0, clipPath: 'inset(0% 0 0 0)' }}
      viewport={{ once: true, margin: '-60px' }}
      transition={
        reducedMotion
          ? { duration: 0.2 }
          : { duration: 0.7, delay: index * 0.12, ease: [0.16, 1, 0.3, 1] }
      }
      className="group relative flex min-h-[13rem] flex-col justify-between overflow-hidden rounded-xl border bg-zinc-900/50 p-4 transition-colors duration-300"
      style={{ borderColor: withAlpha(team.color, 0.22) }}
    >
      {/* Top accent bar */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ backgroundColor: team.color }}
      />

      {driver.image ? (
        <>
          <Image
            src={driver.image}
            alt=""
            fill
            sizes="(min-width: 1280px) 20rem, (min-width: 640px) 40vw, 90vw"
            className="object-cover object-top"
          />
          {/* Two-stop scrim: dark enough at both text anchors to hold contrast, untinted so the
              face and suit detail survive. */}
          <span
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(to bottom, rgb(9 9 11 / 0.75) 0%, rgb(9 9 11 / 0.25) 38%, rgb(9 9 11 / 0.55) 68%, rgb(9 9 11 / 0.92) 100%)',
            }}
          />
        </>
      ) : (
        <>
          {/* Typographic stand-in for the portrait: the car number, oversized and clipped. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-2 bottom-2 select-none text-[6.5rem] font-black leading-none text-white/[0.05] transition-transform duration-500 group-hover:scale-105"
          >
            {driver.number}
          </span>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background: `radial-gradient(120% 90% at 100% 100%, ${withAlpha(team.color, 0.16)}, transparent 65%)`,
            }}
          />
        </>
      )}

      {/* Top row — number, nationality */}
      <div className="relative z-10 flex items-start justify-between gap-3">
        <span className="font-mono text-xs tracking-widest text-zinc-300">
          <span className="sr-only">Car number </span>
          {`#${driver.number}`}
        </span>
        <span className="truncate text-right text-[10px] uppercase tracking-[0.15em] text-zinc-400">
          {driver.nationality}
        </span>
      </div>

      {/* Bottom row — name, code */}
      <div className="relative z-10 flex items-end justify-between gap-3">
        <h4 className="text-balance text-lg font-bold leading-tight text-white">{driver.name}</h4>
        <span
          className="flex-shrink-0 rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-widest"
          style={{
            color: palette.text,
            borderColor: palette.border,
            backgroundColor: palette.surface,
          }}
        >
          <span className="sr-only">Driver code </span>
          {driver.shortCode}
        </span>
      </div>
    </motion.article>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-[0.15em] text-zinc-500">{label}</dt>
      <dd className="mt-1 text-sm text-zinc-200">{children}</dd>
    </div>
  );
}

interface TeamSectionProps {
  team: Team;
  index: number;
  total: number;
  isActive: boolean;
  onInspect: () => void;
  reducedMotion: boolean;
}

export function TeamSection({
  team,
  index,
  total,
  isActive,
  onInspect,
  reducedMotion,
}: TeamSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const headerInView = useInView(headerRef, { once: true, margin: '-80px 0px' });
  const palette = paletteFor(team.color);
  const cta = teamColorButtonStyle(team);
  const sectionId = teamSectionId(team.id);
  const seasons = SEASON - team.firstEntry + 1;

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  });
  const glowY = useTransform(scrollYProgress, [0, 1], ['-18%', '18%']);
  const wordmarkX = useTransform(scrollYProgress, [0, 1], ['12%', '-12%']);
  const parallax = (style: Record<string, unknown>) => (reducedMotion ? undefined : style);

  return (
    <section
      ref={sectionRef}
      id={sectionId}
      aria-labelledby={`${sectionId}-title`}
      className="relative isolate scroll-mt-[6.5rem] overflow-hidden bg-zinc-950 lg:scroll-mt-16"
    >
      {/* Section boundary. The hairline is neutral so it never reads as the previous team's
          trailing rule; the color arrives with this section's own wash, below it. */}
      <div aria-hidden="true" className="h-px w-full bg-zinc-900" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-56"
        style={{
          background: `linear-gradient(to bottom, ${withAlpha(team.color, 0.14)}, transparent)`,
        }}
      />

      {/* Ambient glow, anchored behind the heading rather than floating in dead space */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[15%] top-[6%] h-[26rem] w-[26rem] rounded-full will-change-transform"
        style={{
          backgroundColor: team.color,
          filter: 'blur(120px)',
          ...(parallax({ y: glowY }) ?? {}),
        }}
        initial={{ opacity: 0.12 }}
        animate={{ opacity: isActive ? 0.3 : 0.1 }}
        transition={reducedMotion ? { duration: 0 } : { duration: 0.7, ease: 'easeOut' }}
      />

      {/* Oversized wordmark for depth */}
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-6 right-0 select-none whitespace-nowrap text-[13vw] font-black uppercase leading-none tracking-tighter text-white/[0.022]"
        style={parallax({ x: wordmarkX })}
      >
        {team.shortName}
      </motion.span>

      <div className="relative z-10 mx-auto flex max-w-3xl flex-col gap-8 px-6 py-20 lg:px-10 xl:py-24">
        {/* Identity */}
        <div ref={headerRef} className="flex items-start gap-4">
          <motion.span
            aria-hidden="true"
            className="mt-2 flex-shrink-0 rounded-full"
            initial={{ height: 0 }}
            animate={headerInView ? { height: 56 } : { height: 0 }}
            transition={
              reducedMotion ? { duration: 0 } : { duration: 0.6, ease: 'easeOut', delay: 0.1 }
            }
            style={{
              width: 4,
              backgroundColor: team.color,
              boxShadow: `0 0 20px ${withAlpha(team.color, 0.6)}`,
            }}
          />

          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span
                className="rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em]"
                style={{
                  color: palette.text,
                  borderColor: palette.border,
                  backgroundColor: palette.surface,
                }}
              >
                {`Team ${String(index + 1).padStart(2, '0')} of ${total}`}
              </span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                Grid order
              </span>
            </div>

            <h2 id={`${sectionId}-title`} className="sr-only">
              {team.name}
            </h2>
            <div aria-hidden="true">
              <TextAnimate
                accessible={false}
                animation={reducedMotion ? 'fadeIn' : 'slideUp'}
                by="word"
                startOnView
                once
                className="text-4xl font-black uppercase leading-[0.95] tracking-tight text-white md:text-5xl"
              >
                {team.shortName}
              </TextAnimate>
            </div>

            <BlurFade delay={reducedMotion ? 0 : 0.12} inView>
              <p className="mt-2 text-xs uppercase tracking-[0.18em] text-zinc-500">{team.name}</p>
              <p className="mt-4 max-w-xl text-pretty text-base leading-relaxed text-zinc-400">
                {team.tagline}
              </p>
            </BlurFade>
          </div>
        </div>

        {/* Facts */}
        <BlurFade delay={reducedMotion ? 0 : 0.18} inView>
          <dl
            className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-5 sm:grid-cols-4"
            style={{ borderLeft: `3px solid ${team.color}` }}
          >
            <Fact label="Base">{team.base}</Fact>
            <Fact label="Power unit">{team.powerUnit}</Fact>
            <Fact label="First entry">
              {team.firstEntry}
              <span className="ml-1 text-xs text-zinc-500">
                {seasons > 1 ? `· ${seasons} seasons` : '· debut season'}
              </span>
            </Fact>
            <Fact label="Constructors' titles">
              {team.championships === 0 ? (
                <span className="text-zinc-400">None yet</span>
              ) : reducedMotion ? (
                // NumberTicker counts up on a spring; that is continuous motion, so it is opted
                // out of rather than merely sped up.
                team.championships
              ) : (
                <NumberTicker value={team.championships} className="text-sm text-zinc-200" />
              )}
            </Fact>
            {team.championshipPosition !== undefined && (
              <Fact label={`${SEASON} standing`}>{`P${team.championshipPosition}`}</Fact>
            )}
            {team.points !== undefined && (
              <Fact label={`${SEASON} points`}>{`${team.points} pts`}</Fact>
            )}
          </dl>
        </BlurFade>

        {/* Drivers */}
        <div>
          <h3 className="mb-3 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            {`${SEASON} driver lineup`}
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {team.drivers.map((driver, i) => (
              <DriverCard
                key={driver.id}
                driver={driver}
                team={team}
                palette={palette}
                index={i}
                reducedMotion={reducedMotion}
              />
            ))}
          </div>
        </div>

        {/* Below xl the sticky viewer is not mounted, so each section carries the 3D entry point */}
        <BlurFade delay={reducedMotion ? 0 : 0.24} inView className="xl:hidden">
          <Button
            onClick={onInspect}
            className="gap-2 font-medium transition-opacity hover:opacity-90"
            style={cta.style}
          >
            <Expand className="h-4 w-4" />
            {`Inspect the ${team.shortName} car in 3D`}
          </Button>
        </BlurFade>
      </div>
    </section>
  );
}
