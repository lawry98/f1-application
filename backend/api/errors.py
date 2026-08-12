"""User-facing error text for API responses.

Internal diagnostics never reach the client. Anything an upstream library or an
unexpected exception produced is logged and replaced with one of the constants
below, because a provider's error payload is neither actionable nor safe to show.

Messages that *are* actionable — "No race found matching 'zandvort'" — are not
here: they are produced by the code that knows the user's input was the problem.
Putting them here would mean routing them through a boundary that cannot tell
the difference, and the whole point of this module is that the boundary does not
have to.

Four constants rather than one because the copy has to match what failed:
"Something went wrong generating this briefing" is wrong for a season calendar
fetch, where no briefing is being generated at all.

This module belongs to the API layer on purpose. Only route handlers replace a
caught exception with fixed text; ``agent/`` and ``tools/`` must not import from
``api/``, and nothing here is needed below that boundary.
"""

GENERIC_BRIEFING_ERROR: str = "Something went wrong generating this briefing. Please try again."

GENERIC_SCHEDULE_ERROR: str = "Could not load the race calendar. Please try again."

GENERIC_STANDINGS_ERROR: str = "Could not load the championship standings. Please try again."

FAILED_TOOL_SUMMARY: str = "Tool failed — see server logs."
