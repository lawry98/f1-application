import type { Metadata } from 'next';
import { BriefingChat } from '@/components/briefing/briefing-chat';
import { DotPattern } from '@/components/ui/dot-pattern';
import { LandingNav } from '@/components/landing/landing-nav';

export const metadata: Metadata = {
  title: 'Race Briefing',
  description:
    'Generate an AI-powered F1 race weekend briefing for any Grand Prix. Powered by Claude AI and LangGraph.',
};

export default function BriefingPage() {
  return (
    <div className="min-h-screen bg-zinc-950">
      <LandingNav />

      {/* Page header */}
      <div className="border-b border-zinc-800/60 bg-zinc-950 pt-14">
        <div className="container mx-auto max-w-7xl px-4 py-8">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-f1-red">
            AI Agent
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white">Race Weekend Briefing</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Enter any Grand Prix name and receive a comprehensive AI-generated briefing.
          </p>
        </div>
      </div>

      {/* Briefing chat */}
      <div className="relative">
        <DotPattern className="text-zinc-800/30" />
        <div className="container relative mx-auto max-w-7xl px-4 py-10">
          <BriefingChat />
        </div>
      </div>
    </div>
  );
}
