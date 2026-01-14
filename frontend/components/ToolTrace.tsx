'use client';

import { useState } from 'react';

interface ToolResult {
  tool: string;
  success: boolean;
  summary?: string;
}

interface ToolTraceProps {
  tools: ToolResult[];
}

export default function ToolTrace({ tools }: ToolTraceProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (tools.length === 0) return null;

  return (
    <div className="mt-6 border border-zinc-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 bg-zinc-900 hover:bg-zinc-800 transition-colors flex items-center justify-between"
      >
        <span className="text-sm font-medium text-zinc-300">
          🔧 Agent Tool Trace ({tools.length} tools executed)
        </span>
        <span className="text-zinc-500">
          {isExpanded ? '▼' : '▶'}
        </span>
      </button>
      
      {isExpanded && (
        <div className="p-4 bg-zinc-900/50 space-y-2">
          {tools.map((tool, index) => (
            <div
              key={index}
              className="flex items-start gap-3 p-3 bg-zinc-800/50 rounded border border-zinc-700"
            >
              <span className="text-lg">
                {tool.success ? '✅' : '❌'}
              </span>
              <div className="flex-1">
                <h4 className="font-mono text-sm text-zinc-300 mb-1">
                  {tool.tool}
                </h4>
                {tool.summary && (
                  <p className="text-xs text-zinc-500 font-mono">
                    {tool.summary}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
