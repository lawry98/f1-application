"""Dump normalised circuit outlines from FastF1 telemetry to static JSON.

Why a script and not an endpoint
--------------------------------
Track geometry never changes, and getting it costs a FastF1 telemetry load — the slowest
thing FastF1 does. Serving it from an endpoint would pay that cost on every request for data
that was fixed the day the circuit was built. So this runs by hand, commits its output, and
nothing in the app imports it.

Nothing here is LLM-callable and nothing here is imported by the API. It is a developer
script, alongside ``dump_sse_fixtures.py``.

Usage
-----
    cd backend
    .venv/bin/python scripts/dump_circuit_geometry.py --out ../frontend/data/circuits

    # A single circuit, for a quick check:
    .venv/bin/python scripts/dump_circuit_geometry.py --out /tmp/x --only monza

Output
------
One ``<circuit_id>.json`` per circuit::

    {"circuit_id": "monza", "name": "Italian Grand Prix", "year": 2024,
     "points": [[x, y], ...], "corners": [{"n": 1, "x": .., "y": ..}, ...]}

``points`` and ``corners`` are normalised into a 0..1 box that **preserves the circuit's
aspect ratio**: the longer axis spans the full 0..1 and the shorter one is centred within it.
Normalising each axis independently would stretch Monza's long straights into something
squarer and lose the very thing that makes a circuit recognisable.
"""

from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path

import fastf1

logger = logging.getLogger(__name__)

#: Circuits worth having, as (slug, season, event name). Deliberately a small hand-picked set
#: rather than a whole calendar: these are the shapes a reader recognises, which is what the
#: texture and the briefing header need.
CIRCUITS: list[tuple[str, int, str]] = [
    ("monza", 2024, "Italian Grand Prix"),
    ("monaco", 2024, "Monaco Grand Prix"),
    ("spa", 2024, "Belgian Grand Prix"),
    ("silverstone", 2024, "British Grand Prix"),
    ("suzuka", 2024, "Japanese Grand Prix"),
    ("zandvoort", 2024, "Dutch Grand Prix"),
    ("interlagos", 2024, "São Paulo Grand Prix"),
    ("hungaroring", 2024, "Hungarian Grand Prix"),
]

#: Enough to keep every corner, few enough to keep the committed JSON and the SVG path small.
MAX_POINTS = 300


def normalise(
    xs: list[float], ys: list[float]
) -> tuple[list[float], list[float], float, float, float]:
    """Scale into 0..1 on the longer axis, centring the shorter one. Aspect ratio preserved."""
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    span = max(max_x - min_x, max_y - min_y) or 1.0

    # Centre the shorter axis inside the unit box rather than stretching it to fill.
    pad_x = (span - (max_x - min_x)) / 2
    pad_y = (span - (max_y - min_y)) / 2

    return (
        [((x - min_x) + pad_x) / span for x in xs],
        [((y - min_y) + pad_y) / span for y in ys],
        min_x - pad_x,
        min_y - pad_y,
        span,
    )


def downsample(values: list, limit: int) -> list:
    """Every nth item, keeping the first. A racing line is dense and evenly sampled in time."""
    if len(values) <= limit:
        return values
    step = len(values) / limit
    return [values[int(i * step)] for i in range(limit)]


def dump_circuit(slug: str, year: int, event: str, out_dir: Path) -> None:
    session = fastf1.get_session(year, event, "Q")
    # Telemetry is the whole point of this load, so unlike the tools' `load_race_session` it
    # cannot be switched off. Weather and messages still can.
    session.load(laps=True, telemetry=True, weather=False, messages=False)

    lap = session.laps.pick_fastest()
    telemetry = lap.get_telemetry()

    xs = downsample(telemetry["X"].tolist(), MAX_POINTS)
    ys = downsample(telemetry["Y"].tolist(), MAX_POINTS)
    norm_x, norm_y, off_x, off_y, span = normalise(xs, ys)

    corners = []
    try:
        info = session.get_circuit_info()
        for _, corner in info.corners.iterrows():
            corners.append(
                {
                    "n": int(corner["Number"]),
                    "x": round((float(corner["X"]) - off_x) / span, 4),
                    "y": round((float(corner["Y"]) - off_y) / span, 4),
                }
            )
    except Exception:
        # Corner markers are decoration; an outline without them is still useful.
        logger.warning("no corner data for %s", slug)

    payload = {
        "circuit_id": slug,
        "name": event,
        "year": year,
        # strict: the two lists come from the same downsample, so a length mismatch is a bug
        # rather than something to silently truncate.
        "points": [[round(x, 4), round(y, 4)] for x, y in zip(norm_x, norm_y, strict=True)],
        "corners": corners,
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{slug}.json"
    path.write_text(json.dumps(payload) + "\n")
    logger.info("%s: %d points, %d corners -> %s", slug, len(payload["points"]), len(corners), path)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True, type=Path, help="output directory")
    parser.add_argument("--only", help="one circuit slug, for a quick check")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    fastf1.Cache.enable_cache(Path("cache"))

    wanted = [c for c in CIRCUITS if args.only is None or c[0] == args.only]
    if not wanted:
        raise SystemExit(f"no circuit matching {args.only!r}")

    for slug, year, event in wanted:
        try:
            dump_circuit(slug, year, event, args.out)
        except Exception as exc:
            # One unavailable session should not lose the circuits that did work.
            logger.error("%s failed: %s", slug, exc)


if __name__ == "__main__":
    main()
