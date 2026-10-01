/** F1 domain types — mirrors backend TypedDicts in agent/state.py */

/** One session of a race weekend, as FastF1 lists it. `start` is ISO-8601 UTC. */
export interface SessionTime {
  name: string;
  start: string;
}

export interface RaceInfo {
  name: string;
  year: number;
  round: number;
  /** An *event* slug (`italian_grand_prix`), not a circuit — never print it or join on it. */
  circuit_id: string;
  /** The circuit id the location matched (`it-1922`), or null when this app has no file for it. */
  track_id: string | null;
  circuit_name: string | null;
  circuit_length_m: number | null;
  location: string;
  country: string;
  date: string;
  is_upcoming: boolean;
  /**
   * The briefing's cutoff, ISO-8601 UTC: today for an upcoming race, the first session's start for
   * one that has been run — every source stops there (ADR-0004).
   */
  as_of: string;
  sessions: SessionTime[];
}

export interface ToolResult {
  tool: string;
  success: boolean;
}

export interface Race {
  name: string;
  location: string;
  country: string;
  date: string;
  round: number | null;
  /** FastF1's `EventFormat`: `conventional`, `sprint_qualifying`, `sprint_shootout`, `testing`… */
  event_format: string;
  /** FastF1's `OfficialEventName`, or the event name when FastF1 leaves it blank. */
  official_name: string;
}

/** One race win at a circuit, from `GET /api/circuits/{id}/winners`. */
export interface CircuitWinner {
  year: number;
  /** The Grand Prix, which can differ year to year at the same track — and a year can hold two. */
  event: string;
  driver: string;
  driver_code: string;
  team: string;
  /** Total race time as `H:MM:SS.mmm`, or null when FastF1 has none. */
  time: string | null;
}

/**
 * Winners across `from_year`..`to_year` inclusive — the three seasons before the current one.
 * A year the circuit did not host is simply absent; a year whose load failed is listed in
 * `unavailable_years` so the page can say so rather than implying the circuit sat out.
 */
export interface CircuitWinnersResponse {
  circuit_id: string;
  from_year: number;
  to_year: number;
  winners: CircuitWinner[];
  unavailable_years: number[];
}

/**
 * One row of the drivers' table from `GET /api/standings/{year}` — mirrors the dicts
 * `get_championship_standings` builds in `backend/tools/standings_tools.py`.
 *
 * `driver` is OpenF1's `full_name`, surname uppercased ("Kimi ANTONELLI"). `team` is the team
 * the driver raced for in their latest session, spelled as OpenF1 spells it ("Haas F1 Team") —
 * a display string, not a `Team` id.
 */
export interface DriverStanding {
  position: number;
  driver: string;
  driver_code: string;
  team: string;
  points: number;
}

/** One row of the constructors' table. `team` is OpenF1's spelling, as on `DriverStanding`. */
export interface ConstructorStanding {
  position: number;
  team: string;
  points: number;
}
