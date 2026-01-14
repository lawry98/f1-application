'use client';

import { useState, useEffect } from 'react';
import { getRaces } from '@/lib/api';

interface Race {
  name: string;
  location: string;
  country: string;
  date: string;
  round: number | null;
}

interface RaceSelectorProps {
  onSelectRace: (raceName: string) => void;
}

export default function RaceSelector({ onSelectRace }: RaceSelectorProps) {
  const [races, setRaces] = useState<Race[]>([]);
  const [loading, setLoading] = useState(true);
  const currentYear = 2025;

  useEffect(() => {
    async function fetchRaces() {
      try {
        const raceData = await getRaces(currentYear);
        const upcoming = raceData.filter((race) => {
          const raceDate = new Date(race.date);
          return raceDate >= new Date();
        }).slice(0, 6);
        setRaces(upcoming);
      } catch (error) {
        console.error('Failed to fetch races:', error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchRaces();
  }, []);

  if (loading) {
    return (
      <div className="mb-4">
        <p className="text-zinc-500 text-sm mb-2">Quick select:</p>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-9 w-32 bg-zinc-800 animate-pulse rounded-lg"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <p className="text-zinc-500 text-sm mb-2">Quick select upcoming races:</p>
      <div className="flex flex-wrap gap-2">
        {races.map((race) => (
          <button
            key={race.name}
            onClick={() => onSelectRace(race.name)}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm transition-colors border border-zinc-700 hover:border-f1-red"
          >
            {race.name}
          </button>
        ))}
      </div>
    </div>
  );
}
