import type { Metadata } from 'next';
import { BriefingChat } from '@/components/briefing/briefing-chat';
import { TopoBackground } from '@/components/candy/topo-background';
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

      <div className="border-b border-zinc-800/60 bg-zinc-950 pt-14">
        <div className="container mx-auto max-w-7xl px-4 py-8">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-f1-red">
            AI Agent
          </p>
          <h1 className="mt-1 text-2xl font-bold text-ink">Race Weekend Briefing</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Enter any Grand Prix name and receive a comprehensive AI-generated briefing.
          </p>
        </div>
      </div>

      {/*
        Topographic contours rather than the dot grid. A dot grid reads as scaffolding — the
        background of a tool that is not finished — where contour lines read as a map, which is
        what this page is producing.
      */}
      <div className="relative overflow-hidden">
        <TopoBackground className="text-zinc-500" />
        <div className="container relative mx-auto max-w-7xl px-4 py-10">
          <BriefingChat />
        </div>
      </div>
    </div>
  );
}
