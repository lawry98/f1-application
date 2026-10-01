"""Capture a live briefing as a saved, fact-checked example for the frontend.

When a live briefing cannot run — the cost guard refuses, the deadline passes, the backend is
down — ``/briefing`` offers the visitor a saved example for the race instead. This produces
them:

    cd backend && set -a && source .env && set +a
    .venv/bin/python scripts/capture_briefing_example.py --query "Singapore Grand Prix"

It runs the real graph the way ``/api/briefing/stream`` does — the same initial state, the same
two stream modes, a ``RunBudget`` with the route's deadline — and keeps, beside the prose, the
minimal tool data the checks in ``briefing_checks.py`` need (``evidence``). Each run spends two
Gemini requests, so mind the daily quota.

An example that fails a check is **never** written to ``frontend/data/briefing-examples/``, and
captured prose is never edited: recapture it, or drop the race. ``--reject-dir`` keeps a failed
capture, with its failures, for diagnosis. ``index.json`` is rewritten from every example file on
each write, so it cannot drift from them.

Not collected by pytest (``testpaths = ["tests"]``); ``tests/test_capture_briefing_example.py``
covers everything but the live run.
"""

import argparse
import asyncio
import json
import logging
import re
import subprocess
import sys
import threading
import time
from collections.abc import Callable, Iterable
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

BACKEND = Path(__file__).resolve().parent.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from agent.budget import RunBudget
from api.routes import initial_state
from scripts.briefing_checks import check_example, norm

logger = logging.getLogger(__name__)

EXAMPLES_DIR = BACKEND.parent / "frontend" / "data" / "briefing-examples"
SCHEMA = 1
FIRST_SEASON = 1950
# Waits before each retry of a refused calendar request.
HISTORY_BACKOFF_SECONDS = (5, 15, 30)

# Statuses OpenF1 and FastF1 give a car with no classified place that the checks name as such.
STATUSES = {"DNF", "DNS", "DSQ"}

FORM_LINE = re.compile(r"^([A-Z]{3}) (.+?), .+?: (.+) \| (-?\d+(?:\.\d+)?) pts\b")


class CaptureError(Exception):
    """The run produced nothing that could become an example."""


def slug(text: str) -> str:
    """The frontend's ``locationSlug`` rule: accents stripped, lowercase, hyphens."""
    return re.sub(r"[^a-z0-9]+", "-", norm(text).lower()).strip("-")


def example_id(race_info: dict[str, Any]) -> str:
    return f"{race_info['year']}-{race_info['round']:02d}-{slug(race_info['name'])}"


def display_name(full_name: str) -> tuple[str, str]:
    """``"Kimi ANTONELLI"`` → ``("Kimi Antonelli", "Antonelli")``; a plain name keeps its case.

    OpenF1 capitalises the surname, which is also how to find it: the surname is the run of
    capitalised words, or the last word when nothing is capitalised.
    """
    words = full_name.split()
    capitalised = [w for w in words if len(w) > 1 and w.isupper()]
    surname_words = capitalised or words[-1:]
    readable = " ".join(w.title() if w in capitalised else w for w in words)
    return readable, " ".join(w.title() if w in capitalised else w for w in surname_words)


def parse_form_line(line: str) -> dict[str, Any] | None:
    """One ``get_driver_form`` line → its code, name, finishes in order, and points."""
    match = FORM_LINE.match(line)
    if not match:
        return None
    finishes = []
    for part in match.group(3).split(", "):
        label, _, result = part.rpartition(" ")
        finishes.append((label, result))
    return {
        "code": match.group(1),
        "name": match.group(2),
        "finishes": finishes,
        "points": float(match.group(4)),
    }


async def run_briefing(agent: Any, query: str, deadline_seconds: float) -> dict[str, Any]:
    """Run the graph as ``/api/briefing/stream`` does and keep each node's output.

    The SSE route forwards only tool names and success flags; the tools' data rides on the
    ``tool_executor`` update, which is where the evidence comes from.
    """
    loop = asyncio.get_running_loop()
    budget = RunBudget(cancel=threading.Event(), deadline=time.monotonic() + deadline_seconds)
    timer = loop.call_later(deadline_seconds, budget.cancel.set)
    run: dict[str, Any] = {
        "race_info": None,
        "tasks": [],
        "tool_results": [],
        "briefing": None,
        "truncated": False,
    }
    try:
        stream = agent.astream(
            initial_state(query),
            config={"configurable": {"budget": budget}},
            stream_mode=["updates", "custom"],
        )
        async for mode, payload in stream:
            if mode != "updates":
                continue
            node = next(iter(payload), None)
            data = payload.get(node) or {}
            if node == "resolver":
                if not data.get("race_info"):
                    raise CaptureError(data.get("briefing") or "the race did not resolve")
                run["race_info"] = data["race_info"]
            elif node == "planner":
                run["tasks"] = list(data.get("tasks", []))
            elif node == "tool_executor":
                run["tool_results"] = list(data.get("tool_results", []))
            elif node == "synthesizer":
                run["briefing"] = data.get("briefing")
                run["truncated"] = bool(data.get("briefing_truncated"))
    finally:
        timer.cancel()
        budget.cancel.set()
    if not run["briefing"]:
        raise CaptureError("the run produced no briefing")
    return run


def _position(row: dict[str, Any]) -> int | str:
    position = row.get("Position")
    if isinstance(position, int | float) and position == position and position > 0:
        return int(position)
    status = str(row.get("Status") or "")
    return status if status in STATUSES else "DNF"


def _form_result(result: str) -> int | str:
    return int(result[1:]) if result.startswith("P") and result[1:].isdigit() else result


def build_evidence(
    race_info: dict[str, Any],
    tool_plan: list[str],
    tool_results: list[dict[str, Any]],
    season: list[dict[str, Any]],
    event_for: Callable[[int, str, str | None], dict[str, str] | None],
    other_venues: list[str],
) -> dict[str, Any]:
    """The tool data the checks read, and nothing else, in one shape per kind of fact.

    ``season`` is this race's season from FastF1, testing excluded: ``name``, ``location``,
    ``round``, ``date`` (race day, ISO) and ``format``. ``event_for`` names the Grand Prix a
    tool's label means — OpenF1 labels a race by circuit ("Hungaroring"), FastF1 by event.
    """
    data = {r["tool_name"]: r["data"] for r in tool_results if r["success"]}
    roster: dict[str, dict[str, str]] = {}

    def meet(code: str, full_name: str | None) -> None:
        if code and full_name and code not in roster:
            name, surname = display_name(full_name)
            roster[code] = {"code": code, "name": name, "surname": surname}

    track = None
    if "get_track_info" in data:
        info = data["get_track_info"]
        circuit = info.get("circuit") or {}
        track = {
            "circuit": circuit.get("name"),
            "length_km": circuit.get("length_km"),
            "first_grand_prix": circuit.get("first_grand_prix"),
            "event_format": info.get("event_format"),
        }

    standings = None
    if "get_championship_standings" in data:
        table = data["get_championship_standings"]
        standings = {
            "year": table["year"],
            "races_completed": table["races_completed"],
            "drivers": [
                {k: row[k] for k in ("position", "driver", "driver_code", "team", "points")}
                for row in table["drivers"]
            ],
            "constructors": [
                {k: row[k] for k in ("position", "team", "points")} for row in table["constructors"]
            ],
        }
        for row in table["drivers"]:
            meet(row["driver_code"], row["driver"])

    results: list[dict[str, Any]] = []
    if "get_recent_top_finishers" in data:
        top = data["get_recent_top_finishers"]
        named = event_for(top["year"], top["last_race"], top.get("race_date"))
        results.append(
            {
                "source": "get_recent_top_finishers",
                "year": top["year"],
                "event": named["event"] if named else top["last_race"],
                "location": named["location"] if named else top["last_race"],
                "depth": 10,
                "positions": {r["driver_code"]: r["position"] for r in top["top_finishers"]},
            }
        )
        for row in top["top_finishers"]:
            meet(row["driver_code"], row.get("driver"))

    circuit_results = data.get("get_recent_race_results") or {}
    if circuit_results.get("results"):
        results.append(
            {
                "source": "get_recent_race_results",
                "year": circuit_results["year"],
                "event": circuit_results["event"],
                "location": race_info["location"],
                "depth": 10,
                "positions": {r["Abbreviation"]: _position(r) for r in circuit_results["results"]},
            }
        )

    for winner in (data.get("get_circuit_winners") or {}).get("recent_winners", []):
        if "driver_code" not in winner:
            continue
        results.append(
            {
                "source": "get_circuit_winners",
                "year": winner["year"],
                "event": winner["event"],
                "location": race_info["location"],
                "depth": 1,
                "positions": {winner["driver_code"]: 1},
            }
        )
        meet(winner["driver_code"], winner.get("driver"))

    form = None
    if "get_driver_form" in data:
        window = []
        for label in data["get_driver_form"]["grands_prix"]:
            year, _, short = label.partition(" ")
            named = event_for(int(year), short, None)
            window.append(
                {
                    "year": int(year),
                    "short": short,
                    "event": named["event"] if named else short,
                    "location": named["location"] if named else short,
                    "positions": {},
                }
            )
        drivers: dict[str, dict[str, Any]] = {}
        for line in data["get_driver_form"]["drivers"]:
            parsed = parse_form_line(line)
            if not parsed:
                continue
            at = 0
            for short, result in parsed["finishes"]:
                while at < len(window) and window[at]["short"] != short:
                    at += 1
                if at < len(window):
                    window[at]["positions"][parsed["code"]] = _form_result(result)
                    at += 1
            drivers[parsed["code"]] = {
                "results": [result for _, result in parsed["finishes"]],
                "points": parsed["points"],
            }
            meet(parsed["code"], parsed["name"])
        form = {
            "grands_prix": [f"{gp['year']} {gp['event']}" for gp in window],
            "drivers": drivers,
        }
        for gp in window:
            results.append(
                {
                    "source": "get_driver_form",
                    "year": gp["year"],
                    "event": gp["event"],
                    "location": gp["location"],
                    "depth": None,
                    "positions": gp["positions"],
                }
            )

    if "get_race_weather" not in tool_plan:
        weather: dict[str, Any] = {"status": "not_gathered"}
    elif "get_race_weather" not in data:
        weather = {"status": "error"}
    else:
        forecast = data["get_race_weather"]
        sessions = []
        for session in forecast.get("sessions") or []:
            slot = session.get("forecast") or {}
            sessions.append(
                {
                    "name": session["name"],
                    "start": session["start"],
                    "temperature_c": slot.get("temperature_c"),
                    "rain_probability": slot.get("rain_probability"),
                    "wind_speed_ms": slot.get("wind_speed_ms"),
                    "description": slot.get("description"),
                }
            )
        weather = {
            "status": forecast.get("status"),
            "available_from": forecast.get("available_from"),
            "sessions": sessions,
        }

    news = [
        {"title": article.get("title"), "url": article.get("url")}
        for article in (data.get("search_f1_news") or {}).get("articles", [])
    ]

    race_day = race_info["date"][:10]
    this = next((row for row in season if row["name"] == race_info["name"]), None)
    ahead = [row for row in season if row["date"] >= race_day]
    season_counts = {
        "rounds": len(season),
        "remaining_grands_prix": len(ahead),
        "remaining_sprints": sum(1 for row in ahead if "sprint" in row["format"]),
        "this_weekend_sprint": bool(this and "sprint" in this["format"]),
    }
    later = (
        []
        if race_info["is_upcoming"]
        else [row["name"] for row in season if row["date"] > race_day]
    )

    return {
        "track": track,
        "season": season_counts,
        "standings": standings,
        "drivers": list(roster.values()),
        "results": results,
        "form": form,
        "weather": weather,
        "other_venues": other_venues,
        "later_events": later,
        "news": news,
    }


def other_venues_for(
    race_info: dict[str, Any],
    history: Iterable[tuple[str, str]],
    circuit_for: Callable[[str], tuple[str, str] | None],
) -> list[str]:
    """Every other place a Grand Prix of this name was held, and its circuit's name.

    ``history`` is ``(event name, location)`` for every season's calendar. A location that
    resolves to this race's own circuit is a respelling ("Monaco", "Monte Carlo"), not another
    venue.
    """
    venues: list[str] = []
    for event, location in history:
        if event != race_info["name"] or norm(location) == norm(race_info["location"]):
            continue
        circuit = circuit_for(location)
        if circuit and circuit[0] == race_info["track_id"]:
            continue
        for term in (location, circuit[1] if circuit else None):
            if term and term not in venues:
                venues.append(term)
    return venues


def summary(example: dict[str, Any]) -> dict[str, Any]:
    race = example["race_info"]
    return {
        "id": example["id"],
        "event": race["name"],
        "year": race["year"],
        "round": race["round"],
        "circuit": race["circuit_name"],
        "captured_at": example["captured_at"],
        "as_of": race["as_of"],
        "is_upcoming": race["is_upcoming"],
    }


def _dump(value: Any) -> str:
    return json.dumps(value, indent=2, ensure_ascii=False) + "\n"


def write_example(example: dict[str, Any], out_dir: Path) -> Path:
    """Write one example and rebuild ``index.json`` from every example file beside it."""
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{example['id']}.json"
    path.write_text(_dump(example), encoding="utf-8")
    rows = [
        summary(json.loads(p.read_text(encoding="utf-8")))
        for p in sorted(out_dir.glob("*.json"))
        if p.name != "index.json"
    ]
    (out_dir / "index.json").write_text(
        _dump(sorted(rows, key=lambda row: row["id"])), encoding="utf-8"
    )
    return path


# --- the live parts -----------------------------------------------------------------------------


def _season_rows(year: int) -> list[dict[str, Any]]:
    from tools.schedule_cache import get_schedule

    rows = []
    for _, event in get_schedule(year).iterrows():
        if int(event["RoundNumber"]) == 0:
            continue
        rows.append(
            {
                "name": str(event["EventName"]),
                "location": str(event["Location"]),
                "round": int(event["RoundNumber"]),
                "date": str(event["EventDate"])[:10],
                "format": str(event["EventFormat"]),
            }
        )
    return rows


def _event_lookup(as_of: str) -> Callable[[int, str, str | None], dict[str, str] | None]:
    """Name the Grand Prix a tool's label means: by race day, by event name, or through
    OpenF1's circuit short name and its race's start."""
    from tools.cutoff import parse_utc
    from tools.openf1_races import completed_races

    seasons: dict[int, list[dict[str, Any]]] = {}
    cutoff = parse_utc(as_of)

    def by_day(rows: list[dict[str, Any]], day: str) -> dict[str, Any] | None:
        wanted = date.fromisoformat(day)
        for row in rows:
            if abs((date.fromisoformat(row["date"]) - wanted).days) <= 1:
                return row
        return None

    def lookup(year: int, label: str, day: str | None) -> dict[str, str] | None:
        rows = seasons.setdefault(year, _season_rows(year))
        row = by_day(rows, day) if day else None
        if row is None:
            name = label.replace(" GP", " Grand Prix")
            row = next((r for r in rows if r["name"] == name), None)
        if row is None:
            race = next(
                (r for r in completed_races(year, cutoff) if r.get("circuit_short_name") == label),
                None,
            )
            row = by_day(rows, race["date_start"][:10]) if race else None
        return {"event": row["name"], "location": row["location"]} if row else None

    return lookup


def _venue_history(event_name: str, last_year: int) -> list[tuple[str, str]]:
    """``(event name, location)`` for every edition of ``event_name`` since 1950.

    Seasons before 2018 come from Jolpica's Ergast mirror, which refuses a burst of requests,
    so they are paced and retried. The FastF1 cache (enabled in :func:`capture`) keeps every
    calendar after the first run, so this is ~40s once and instant after.
    """
    import fastf1

    history = []
    for year in range(FIRST_SEASON, last_year + 1):
        for wait in (*HISTORY_BACKOFF_SECONDS, None):
            try:
                schedule = fastf1.get_event_schedule(year, include_testing=False)
                break
            except Exception as exc:
                if wait is None:
                    raise CaptureError(f"no {year} calendar for the venue check: {exc}") from exc
                time.sleep(wait)
        for _, event in schedule.iterrows():
            if str(event["EventName"]) == event_name:
                history.append((event_name, str(event["Location"])))
    return history


def _circuit_for(location: str) -> tuple[str, str] | None:
    from tools.circuit_winners import circuit_id_for_location, circuit_record

    circuit_id = circuit_id_for_location(location)
    record = circuit_record(circuit_id) if circuit_id else None
    return (circuit_id, record["name"]) if record else None


def _commit() -> str:
    head = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"], cwd=BACKEND, capture_output=True, text=True
    ).stdout.strip()
    dirty = subprocess.run(
        ["git", "status", "--porcelain", "--", "."], cwd=BACKEND, capture_output=True, text=True
    ).stdout.strip()
    return f"{head}-dirty" if dirty else head


def capture(query: str, out_dir: Path, reject_dir: Path | None) -> bool:
    import fastf1

    from agent.graph import agent
    from config import BRIEFING_DEADLINE_SECONDS, FASTF1_CACHE_DIR
    from tools.openf1_client import clear as clear_openf1_cache
    from tools.schedule_cache import clear as clear_schedule_cache

    # As main.py does for the app.
    Path(FASTF1_CACHE_DIR).mkdir(parents=True, exist_ok=True)
    fastf1.Cache.enable_cache(FASTF1_CACHE_DIR)

    try:
        run = asyncio.run(run_briefing(agent, query, BRIEFING_DEADLINE_SECONDS))
    finally:
        # What the route's `finish()` does: the caches dedupe within one run only.
        clear_schedule_cache()
        clear_openf1_cache()

    race_info = run["race_info"]
    order = {name: rank for rank, name in enumerate(run["tasks"])}
    tool_results = sorted(run["tool_results"], key=lambda r: order.get(r["tool_name"], len(order)))
    season = _season_rows(race_info["year"])
    venues = other_venues_for(
        race_info, _venue_history(race_info["name"], race_info["year"]), _circuit_for
    )
    example = {
        "schema": SCHEMA,
        "id": example_id(race_info),
        "query": query,
        "captured_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "backend_commit": _commit(),
        "race_info": race_info,
        "tool_plan": run["tasks"],
        "tools": [{"tool": r["tool_name"], "success": r["success"]} for r in tool_results],
        "evidence": build_evidence(
            race_info, run["tasks"], tool_results, season, _event_lookup(race_info["as_of"]), venues
        ),
        "briefing": {"content": run["briefing"], "truncated": run["truncated"]},
        "checks": {"passed": [], "flagged": []},
    }
    result = check_example(example)
    example["checks"] = {"passed": result["passed"], "flagged": result["flagged"]}

    print(f"\n{example['id']}  as_of {race_info['as_of']}  tools {len(tool_results)}")
    for entry in result["passed"]:
        print(f"  pass  {entry['check']}: {entry['detail']}")
    for entry in result["flagged"]:
        print(f"  flag  [{entry['section']}] {entry['claim']}  ({entry['reason']})")
    for entry in result["failed"]:
        print(f"  FAIL  {entry['check']}: {entry['detail']}")

    if result["failed"]:
        if reject_dir:
            reject_dir.mkdir(parents=True, exist_ok=True)
            stamp = example["captured_at"].replace(":", "")
            rejected = {**example, "checks": result}
            (reject_dir / f"{example['id']}-{stamp}.json").write_text(_dump(rejected), "utf-8")
        print("  -> not written: recapture it or drop the race")
        return False
    print(f"  -> wrote {write_example(example, out_dir).relative_to(BACKEND.parent)}")
    return True


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--query", action="append", required=True, help="repeatable")
    parser.add_argument("--out-dir", type=Path, default=EXAMPLES_DIR)
    parser.add_argument("--reject-dir", type=Path, default=None)
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")

    ok = True
    for query in args.query:
        try:
            ok = capture(query, args.out_dir, args.reject_dir) and ok
        except CaptureError as exc:
            print(f"\n{query}: capture failed: {exc}")
            ok = False
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
