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
    // Column layout so the textured section below can claim the leftover viewport height.
    // Without it the texture ends where the content ends, which on the empty state left the
    // bottom half of the screen flat black.
    <div className="flex min-h-screen flex-col bg-zinc-950">
      <LandingNav />

      {/*
        One `<main>` around everything below the nav, matching `/teams` and `/credits` — both of
        which axe already scores at zero. Without it this route reported `landmark-one-main` plus
        five orphaned `region` nodes (the header band, the quick-select label, the circuit input,
        and the empty state's heading and instruction), because nothing here was inside a landmark
        at all.

        It has to repeat the column layout rather than being a bare wrapper: the flex-1 below
        belongs to the *flex child*, and interposing a plain `<div>` would leave the textured
        section sized to its content again — the flat-black bottom half the outer comment
        describes. `flex flex-1 flex-col` makes `<main>` both a flex item that grows and a flex
        container that can hand that growth on, so the two children keep the exact box they had.
      */}
      <main className="flex flex-1 flex-col">
        <div className="border-b border-zinc-800/60 bg-zinc-950 pt-14">
          <div className="container mx-auto max-w-7xl px-4 py-8">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-f1-red">
              AI Agent
            </p>
            <h1 className="mt-1 text-2xl font-bold text-ink">Race Weekend Briefing</h1>
            {/*
              `zinc-400`, and the backdrop it is measured against is **bare `zinc-950`** — this
              band is a sibling *above* the topo container below, so nothing is layered over it.
              That makes it the one strip on the route where the page's `#212124` composite does
              not apply, in the generous direction: `zinc-500` is 4.12:1 here against 3.31:1 one
              section down. Still under the 4.5:1 small-text bar either way. `zinc-400` is 7.76:1.
            */}
            <p className="mt-1 text-sm text-zinc-400">
              Enter any Grand Prix name and receive a comprehensive AI-generated briefing.
            </p>
          </div>
        </div>

        {/*
          Topographic contours rather than the dot grid. A dot grid reads as scaffolding — the
          background of a tool that is not finished — where contour lines read as a map, which is
          what this page is producing.
        */}
        <div className="relative flex-1 overflow-hidden">
          <TopoBackground className="text-zinc-300" />
          <div className="container relative mx-auto max-w-7xl px-4 py-10">
            <BriefingChat />
          </div>
        </div>
      </main>
    </div>
  );
}
