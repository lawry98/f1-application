// Deliberately duplicated from the backend's GENERIC_BRIEFING_ERROR (backend/api/errors.py):
// when the request itself fails there is no response to fetch it from.
export const GENERIC_BRIEFING_ERROR =
  'Something went wrong generating this briefing. Please try again.';
