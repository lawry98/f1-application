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
