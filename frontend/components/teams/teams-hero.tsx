'use client';

import { useReducedMotion, motion } from 'motion/react';
import { ChevronDown } from 'lucide-react';

import { BlurFade } from '@/components/ui/blur-fade';
import { TextAnimate } from '@/components/ui/text-animate';
import { Badge } from '@/components/ui/badge';
import { DotPattern } from '@/components/ui/dot-pattern';

export function TeamsHero() {
  const reducedMotion = useReducedMotion();

  return (
    <section
      id="teams-hero"
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-zinc-950"
    >
      {/* Dot pattern background */}
      <DotPattern className="absolute inset-0 opacity-30 [mask-image:radial-gradient(ellipse_at_center,white_20%,transparent_75%)]" />

      {/* Ambient glow blobs */}
      <div
        className="pointer-events-none absolute -bottom-32 -left-32 h-[600px] w-[600px] rounded-full opacity-[0.07]"
        style={{ background: '#dc2626', filter: 'blur(120px)' }}
      />
      <div
        className="pointer-events-none absolute -right-32 -top-32 h-[500px] w-[500px] rounded-full opacity-[0.04]"
        style={{ background: '#52525b', filter: 'blur(100px)' }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-6 px-6 text-center">
        <BlurFade delay={0.1} inView>
          <Badge variant="outline" className="border-zinc-700 text-zinc-400">
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
          className="max-w-md text-lg font-light tracking-widest text-zinc-400 uppercase"
        >
          2026 F1 Constructor Profiles
        </TextAnimate>
      </div>

      {/* Scroll cue */}
      {!reducedMotion && (
        <motion.div
          className="absolute bottom-10 left-1/2 -translate-x-1/2 text-zinc-600"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4, duration: 0.6 }}
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
          >
            <ChevronDown size={24} />
          </motion.div>
        </motion.div>
      )}
    </section>
  );
}
