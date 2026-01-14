'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { generateBriefing, streamBriefing } from '@/lib/api';
import BriefingCard from './BriefingCard';
import ToolTrace from './ToolTrace';
import RaceSelector from './RaceSelector';

const F1LoadingAnimation = dynamic(() => import('@/components/3d/F1LoadingCar').then(mod => ({ default: mod.F1LoadingAnimation })), {
  ssr: false,
});

interface ToolResult {
  tool: string;
  success: boolean;
  summary?: string;
}

export default function BriefingChat() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [race, setRace] = useState('');
  const [briefing, setBriefing] = useState('');
  const [toolTrace, setToolTrace] = useState<ToolResult[]>([]);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  const handleSubmit = async (searchQuery?: string) => {
    const searchTerm = searchQuery || query;
    
    if (!searchTerm.trim()) return;

    setLoading(true);
    setError('');
    setBriefing('');
    setRace('');
    setToolTrace([]);
    setStatusMessage('');

    try {
      const useStreaming = true;

      if (useStreaming) {
        const stream = streamBriefing(searchTerm);
        const tools: ToolResult[] = [];

        for await (const event of stream) {
          if (event.type === 'status') {
            setStatusMessage(event.data.message || '');
          } else if (event.type === 'race_info') {
            setRace(event.data.name || searchTerm);
          } else if (event.type === 'tool_result') {
            tools.push({
              tool: event.data.tool,
              success: event.data.success,
            });
            setToolTrace([...tools]);
          } else if (event.type === 'briefing') {
            setBriefing(event.data.content);
            setStatusMessage('');
          } else if (event.type === 'error') {
            setError(event.data.message);
          }
        }
      } else {
        const response = await generateBriefing(searchTerm);
        setRace(response.race);
        setBriefing(response.briefing);
        setToolTrace(response.tool_trace);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate briefing');
    } finally {
      setLoading(false);
      setStatusMessage('');
    }
  };

  const handleRaceSelect = (raceName: string) => {
    setQuery(raceName);
    handleSubmit(raceName);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8 bg-zinc-900 border border-zinc-800 rounded-lg p-6 shadow-xl">
        <RaceSelector onSelectRace={handleRaceSelect} />
        
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="Enter race name (e.g., 'Monaco GP 2025', 'Silverstone')"
            className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-f1-red transition-colors"
            disabled={loading}
          />
          <button
            onClick={() => handleSubmit()}
            disabled={loading || !query.trim()}
            className="px-6 py-3 bg-f1-red hover:bg-red-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
          >
            {loading ? 'Generating...' : 'Generate'}
          </button>
        </div>
      </div>

      {loading && !briefing && (
        <F1LoadingAnimation message={statusMessage || "Agent is analyzing race data..."} />
      )}

      {error && (
        <div className="mb-8 bg-red-900/20 border border-red-800 rounded-lg p-4">
          <p className="text-red-400">❌ {error}</p>
        </div>
      )}

      {briefing && (
        <>
          <BriefingCard race={race} briefing={briefing} />
          <ToolTrace tools={toolTrace} />
        </>
      )}

      {!briefing && !loading && !error && (
        <div className="text-center text-zinc-500 py-12">
          <div className="text-6xl mb-4">🏎️</div>
          <p className="text-lg">
            Select a race or enter a Grand Prix to generate your briefing
          </p>
        </div>
      )}
    </div>
  );
}
