/** F1 domain types — mirrors backend TypedDicts in agent/state.py */

export interface RaceInfo {
  name: string;
  year: number;
  circuit_id: string;
  location: string;
  country: string;
  date: string;
  is_upcoming: boolean;
  historical_year: number;
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
