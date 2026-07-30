/** Shared constants — colors, labels, and config values */

export const F1_RED = '#dc2626';

// Deliberately duplicated from the backend's GENERIC_BRIEFING_ERROR (backend/api/errors.py):
// when the request itself fails there is no response to fetch it from.
export const GENERIC_BRIEFING_ERROR =
  'Something went wrong generating this briefing. Please try again.';
export const F1_DARK_BG = '#09090b';

export const STEP_LABELS: Record<string, string> = {
  resolving: 'Resolving race...',
  planning: 'Planning data gathering...',
  gathering: 'Gathering race data...',
  synthesizing: 'Generating briefing...',
  complete: 'Done',
  error: 'Error',
};
