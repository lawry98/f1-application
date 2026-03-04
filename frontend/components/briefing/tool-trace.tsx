'use client';

import { useState } from 'react';
import type { ToolResult } from '@/types';
import { Badge } from '@/components/ui/badge';

interface ToolTraceProps {
  tools: ToolResult[];
}

export function ToolTrace({ tools }: ToolTraceProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (tools.length === 0) return null;

  return (
    <div className="mt-6 overflow-hidden rounded-lg border border-zinc-800">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between bg-zinc-900 px-4 py-3 transition-colors hover:bg-zinc-800"
        aria-expanded={isExpanded}
      >
        <span className="text-sm font-medium text-zinc-300">
          🔧 Agent Tool Trace ({tools.length} tools executed)
        </span>
        <span className="text-zinc-500">{isExpanded ? '▼' : '▶'}</span>
      </button>

      {isExpanded && (
        <div className="space-y-2 bg-zinc-900/50 p-4">
          {tools.map((tool) => (
            <div
              key={tool.tool}
              className="flex items-start gap-3 rounded border border-zinc-700 bg-zinc-800/50 p-3"
            >
              <Badge
                variant={tool.success ? 'default' : 'destructive'}
                className={
                  tool.success
                    ? 'shrink-0 bg-green-900 text-green-300 hover:bg-green-900'
                    : 'shrink-0'
                }
              >
                {tool.success ? 'OK' : 'FAIL'}
              </Badge>
              <div className="flex-1">
                <h4 className="mb-1 font-mono text-sm text-zinc-300">{tool.tool}</h4>
                {tool.summary && <p className="font-mono text-xs text-zinc-500">{tool.summary}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
