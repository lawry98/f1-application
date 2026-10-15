/**
 * Saved, fact-checked example briefings — the shapes `briefing-examples/*.json` hold.
 *
 * When a live briefing cannot run (the cost guard refuses, the deadline passes, the backend is
 * down), `/briefing` offers the visitor the saved example for that race, so the demo never
 * dead-ends. Every file is written by `backend/scripts/capture_briefing_example.py` from a real
 * run of the graph, and never by hand: the prose is never edited, and an example that fails a
 * check is recaptured or dropped. `tests/briefing-example-checks.test.ts` re-runs the checks over
 * every file.
 *
 * `index.json` is the points-free view — ids and dates, no prose — and is the only file a module
 * may import statically. Each example loads as its own chunk through `loadBriefingExample`
 * (`lib/briefing-examples.ts`), the way `loadCircuit` loads one outline.
 */

import type { ConstructorStanding, DriverStanding, RaceInfo, ToolResult } from '@/types';

/** One row of `index.json`. */
export interface BriefingExampleSummary {
  /** `<year>-<round>-<event slug>`, e.g. `2026-06-monaco-grand-prix`, and the file's name. */
  id: string;
  event: string;
  year: number;
  round: number;
  circuit: string | null;
  /** When the example was captured, ISO-8601 UTC. What the page's "captured …" date reads. */
  captured_at: string;
  /** The briefing's cutoff: the capture day for an upcoming race, the first session's start for
   *  one already run (ADR-0004). */
  as_of: string;
  is_upcoming: boolean;
}

/** One race's finishing order, from any of the four result tools, in one shape. */
export interface ResultEntry {
  source:
    | 'get_recent_top_finishers'
    | 'get_recent_race_results'
    | 'get_circuit_winners'
    | 'get_driver_form';
  year: number;
  event: string;
  location: string | null;
  /** OpenF1's own label for the race ("Hungaroring"), where the tool gave one. */
  circuit: string | null;
  /** How many places the source lists — 10 for a top ten, 1 for a winner — or null when it
   *  lists every driver, so an absent driver is not evidence of anything. */
  depth: number | null;
  /** Driver code → place, or `DNF` / `DNS` / `DSQ`. */
  positions: Record<string, number | string>;
}

export interface WeatherSessionEvidence {
  name: string;
  start: string;
  temperature_c: number | null;
  rain_probability: number | null;
  wind_speed_ms: number | null;
  description?: string | null;
}

/** The minimal tool data the checks read. Not shown to visitors. */
export interface BriefingEvidence {
  track: {
    circuit: string | null;
    length_km: number | null;
    first_grand_prix: number | null;
    event_format: string | null;
  } | null;
  season: {
    rounds: number;
    /** This race included. */
    remaining_grands_prix: number;
    remaining_sprints: number;
    this_weekend_sprint: boolean;
  } | null;
  standings: {
    year: number;
    races_completed: number;
    drivers: DriverStanding[];
    constructors: ConstructorStanding[];
  } | null;
  drivers: { code: string; name: string; surname: string }[];
  results: ResultEntry[];
  /** The seasons the circuit tools searched. */
  circuit_seasons?: { from: number; to: number } | null;
  searched_years?: number[];
  form: {
    grands_prix: string[];
    drivers: Record<string, { results: string[]; points: number; avg?: number | null }>;
  } | null;
  weather: {
    status: string;
    available_from?: string | null;
    sessions?: WeatherSessionEvidence[] | null;
  } | null;
  /** Every other venue a Grand Prix of this name has been held at, and its circuit's name. */
  other_venues: string[];
  /** For a race already run: the season's events after it, none of which it may mention. */
  later_events: string[];
  news: { title: string | null; url: string | null }[];
}

export interface BriefingCheckPass {
  check: string;
  detail: string;
}

/** A claim the data could not settle, kept for a person to review. */
export interface BriefingCheckFlag {
  check: string;
  section: string;
  claim: string;
  reason: string;
}

export interface BriefingCheckFailure {
  check: string;
  detail: string;
}

export interface BriefingExample {
  schema: 1;
  id: string;
  /** What the capture asked for — the quick-select's event name. */
  query: string;
  captured_at: string;
  /** The backend commit the run came from. */
  backend_commit: string;
  race_info: RaceInfo;
  tool_plan: string[];
  tools: ToolResult[];
  evidence: BriefingEvidence;
  briefing: { content: string; truncated: boolean };
  /** No `failed`: an example with a failure is never written. */
  checks: { passed: BriefingCheckPass[]; flagged: BriefingCheckFlag[] };
}
