'use client';

import { useState, useEffect } from 'react';
import { getRaces } from '@/lib/api';
import type { Race } from '@/types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface RaceSelectorProps {
  onSelectRace: (raceName: string) => void;
  /** Whether a briefing is generating. Locks every button so a run cannot be discarded. */
  disabled?: boolean;
  /** The race whose briefing is on screen, marked so the user keeps their bearings. */
  activeRace?: string;
}

export function RaceSelector({ onSelectRace, disabled = false, activeRace }: RaceSelectorProps) {
  const [races, setRaces] = useState<Race[]>([]);
  const [loading, setLoading] = useState(true);
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    async function fetchRaces() {
      try {
        const raceData = await getRaces(currentYear);
        // An event happening today is still upcoming, so compare against start of today.
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const upcoming = raceData.filter((race) => new Date(race.date) >= today).slice(0, 6);
        setRaces(upcoming);
      } catch (error) {
        console.error('Failed to fetch races:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchRaces();
  }, [currentYear]);

  if (loading) {
    return (
      <div className="mb-4">
        <p className="mb-2 text-sm text-zinc-500">Quick select:</p>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-9 w-32 bg-zinc-800" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <p className="mb-2 text-sm text-zinc-500">Quick select upcoming races:</p>
      <div className="flex flex-wrap gap-2">
        {races.map((race) => (
          <Button
            key={race.name}
            variant="outline"
            size="sm"
            onClick={() => onSelectRace(race.name)}
            disabled={disabled}
            className={cn(
              // hover:border-red-600 (not hover:border-f1-red — same color, #dc2626 both ways):
              // "border-f1-red" must appear only on the active button, or the marker's
              // substring assertion in race-selector.test.tsx can't tell active from hover.
              'bg-zinc-800 text-white hover:border-red-600 hover:bg-zinc-700',
              race.name === activeRace ? 'border-f1-red' : 'border-zinc-700',
            )}
          >
            {race.name}
          </Button>
        ))}
      </div>
    </div>
  );
}
