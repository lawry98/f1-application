'use client';

import ReactMarkdown from 'react-markdown';

interface BriefingCardProps {
  race: string;
  briefing: string;
}

export default function BriefingCard({ race, briefing }: BriefingCardProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 shadow-xl">
      <div className="mb-6 pb-4 border-b border-zinc-800">
        <h2 className="text-2xl font-bold text-white">
          🏁 {race}
        </h2>
        <p className="text-zinc-500 text-sm mt-1">
          Race Weekend Briefing
        </p>
      </div>
      
      <div className="prose prose-invert prose-zinc max-w-none">
        <ReactMarkdown
          components={{
            h1: ({ children }) => (
              <h1 className="text-3xl font-bold text-white mb-4 mt-6">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-2xl font-bold text-f1-red mb-3 mt-6">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-xl font-semibold text-white mb-2 mt-4">
                {children}
              </h3>
            ),
            p: ({ children }) => (
              <p className="text-zinc-300 mb-4 leading-relaxed">
                {children}
              </p>
            ),
            ul: ({ children }) => (
              <ul className="list-disc list-inside text-zinc-300 mb-4 space-y-1">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal list-inside text-zinc-300 mb-4 space-y-1">
                {children}
              </ol>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-white">
                {children}
              </strong>
            ),
            em: ({ children }) => (
              <em className="italic text-zinc-400">
                {children}
              </em>
            ),
          }}
        >
          {briefing}
        </ReactMarkdown>
      </div>
    </div>
  );
}
