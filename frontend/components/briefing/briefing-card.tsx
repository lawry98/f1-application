'use client';

import ReactMarkdown from 'react-markdown';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BlurFade } from '@/components/ui/blur-fade';

interface BriefingCardProps {
  race: string;
  briefing: string;
  /** Whether synthesis stopped partway, leaving the prose unfinished. */
  truncated?: boolean;
}

export function BriefingCard({ race, briefing, truncated }: BriefingCardProps) {
  return (
    <BlurFade delay={0.1} inView>
      <Card className="border-zinc-800 bg-zinc-900 shadow-xl">
        <CardHeader className="border-b border-zinc-800">
          <CardTitle className="text-2xl font-bold text-white">🏁 {race}</CardTitle>
          <p className="text-sm text-zinc-500">Race Weekend Briefing</p>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="prose prose-invert prose-zinc max-w-none">
            <ReactMarkdown
              components={{
                h1: ({ children }) => (
                  <h1 className="mb-4 mt-6 text-3xl font-bold text-white">{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 className="mb-3 mt-6 text-2xl font-bold text-f1-red">{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="mb-2 mt-4 text-xl font-semibold text-white">{children}</h3>
                ),
                p: ({ children }) => (
                  <p className="mb-4 leading-relaxed text-zinc-300">{children}</p>
                ),
                ul: ({ children }) => (
                  <ul className="mb-4 list-inside list-disc space-y-1 text-zinc-300">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="mb-4 list-inside list-decimal space-y-1 text-zinc-300">
                    {children}
                  </ol>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold text-white">{children}</strong>
                ),
                em: ({ children }) => <em className="italic text-zinc-400">{children}</em>,
              }}
            >
              {briefing}
            </ReactMarkdown>
          </div>

          {/*
            Deliberately calm, and deliberately *after* the prose: the briefing
            above is worth reading, and an alarm at the top would say otherwise.
            The alternative — an `error` event in the red banner — was rejected
            in ADR-0002.
          */}
          {truncated && (
            <p className="mt-6 border-t border-zinc-800 pt-4 text-sm italic text-zinc-500">
              This briefing stopped early — the rest could not be generated.
            </p>
          )}
        </CardContent>
      </Card>
    </BlurFade>
  );
}
