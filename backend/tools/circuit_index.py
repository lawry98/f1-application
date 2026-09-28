"""Location → circuit id lookup — a plain helper, not an LLM-callable tool.

Reads ``frontend/data/circuits/index.json``, the same map the /circuits geometry uses, so
the backend and the frontend agree on which physical track a location names. Location is
the join key because ``RaceInfo.circuit_id`` is a slug of the *Event* name and so cannot
tell Madrid's Spanish Grand Prix from Barcelona's. The index already aliases the places
FastF1 and the geometry source name differently (Bahrain/Sakhir, Kuala Lumpur/Sepang, …),
so there is no alias table here.
"""

import json
import logging
import re
import unicodedata
from functools import cache
from pathlib import Path

logger = logging.getLogger(__name__)

INDEX_PATH = Path(__file__).resolve().parents[2] / "frontend" / "data" / "circuits" / "index.json"


def location_slug(location: str) -> str:
    """Lowercase, strip accents, collapse everything else to single hyphens.

    Must stay identical to ``slug()`` in ``frontend/scripts/fetch-circuit-geometry.mjs``,
    which wrote the index keys — a drift makes lookups miss silently.
    """
    stripped = unicodedata.normalize("NFD", location)
    stripped = re.sub("[̀-ͯ]", "", stripped).lower()
    return re.sub("[^a-z0-9]+", "-", stripped).strip("-")


@cache
def load_index() -> dict[str, str]:
    """The slugged-location → circuit-id map, or ``{}`` if it cannot be read."""
    try:
        return json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        logger.warning("Circuit index unavailable (%s); matching locations by slug only", exc)
        return {}


def circuit_for_location(location: str) -> str:
    """The circuit id for a location, or the location's own slug when the index lacks it.

    Falling back to the slug keeps a venue the geometry set does not carry yet matching
    itself, rather than matching nothing or reverting to Event-name matching.
    """
    slug = location_slug(location)
    return load_index().get(slug, slug)
