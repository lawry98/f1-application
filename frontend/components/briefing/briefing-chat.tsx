'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBriefing } from '@/hooks/use-briefing';
import { BriefingCard } from './briefing-card';
import { BriefingLoader } from './briefing-loader';
import { ToolTrace } from './tool-trace';
import { RaceSelector } from './race-selector';

export function BriefingChat() {
  const {
    query,
    loading,
    race,
    briefing,
    truncated,
    toolTrace,
    error,
    statusMessage,
    step,
    startedAt,
    setQuery,
    submit,
  } = useBriefing();

  const handleRaceSelect = (raceName: string): void => {
    setQuery(raceName);
    submit(raceName);
  };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
        <RaceSelector onSelectRace={handleRaceSelect} disabled={loading} activeRace={query} />

        <div className="flex gap-2">
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Enter a circuit name (e.g., 'Monaco', 'Silverstone', 'Spa')"
            className="flex-1 border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-500 focus-visible:ring-f1-red"
            disabled={loading}
            aria-label="Circuit name"
          />
          <Button
            onClick={() => submit()}
            disabled={loading || !query.trim()}
            className="bg-f1-red font-semibold text-white hover:bg-red-700 disabled:bg-zinc-700"
          >
            {loading ? 'Generating...' : 'Generate'}
          </Button>
        </div>
      </div>

      {loading && !briefing && (
        <BriefingLoader
          race={race}
          step={step}
          statusMessage={statusMessage}
          tools={toolTrace}
          startedAt={startedAt}
        />
      )}

      {error && (
        <div className="mb-8 rounded-lg border border-red-800 bg-red-900/20 p-4" role="alert">
          <p className="text-red-400">❌ {error}</p>
        </div>
      )}

      {briefing && (
        <>
          <BriefingCard race={race} briefing={briefing} truncated={truncated} />
          <ToolTrace tools={toolTrace} />
        </>
      )}

      {!briefing && !loading && !error && (
        <div className="py-12 text-center text-zinc-500">
          <div className="mb-4 text-6xl" aria-hidden="true">
            🏎️
          </div>
          <p className="text-lg">Select a race or enter a Grand Prix to generate your briefing</p>
        </div>
      )}
    </div>
  );
}
