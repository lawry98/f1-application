"""The capture script's own logic: everything but the live Gemini run it wraps.

The run itself is driven through the route suite's ``FakeAgent``, so the script consumes the
graph's stream exactly as ``/api/briefing/stream`` does.
"""

import asyncio
import json

import pytest

from agent.budget import RunBudget
from scripts.capture_briefing_example import (
    CaptureError,
    build_evidence,
    display_name,
    example_id,
    other_venues_for,
    parse_form_line,
    run_briefing,
    write_example,
)
from tests.api.test_routes import FakeAgent, successful_steps
from tests.factories import make_race_info

MONACO = {
    **make_race_info(),
    "name": "Monaco Grand Prix",
    "year": 2026,
    "round": 6,
    "track_id": "mc-1929",
    "circuit_name": "Circuit de Monaco",
    "location": "Monte Carlo",
    "date": "2026-06-07 00:00:00",
    "is_upcoming": False,
    "as_of": "2026-06-05T11:30:00+00:00",
}

SEASON = [
    {
        "name": "Canadian Grand Prix",
        "location": "Montréal",
        "round": 5,
        "date": "2026-05-24",
        "format": "sprint_qualifying",
    },
    {
        "name": "Monaco Grand Prix",
        "location": "Monte Carlo",
        "round": 6,
        "date": "2026-06-07",
        "format": "conventional",
    },
    {
        "name": "Barcelona Grand Prix",
        "location": "Barcelona",
        "round": 7,
        "date": "2026-06-14",
        "format": "conventional",
    },
    {
        "name": "British Grand Prix",
        "location": "Silverstone",
        "round": 8,
        "date": "2026-07-05",
        "format": "sprint_qualifying",
    },
]

FORM_LINE = (
    "ANT Kimi ANTONELLI, Mercedes: Shanghai P1, Montreal P1 | 50 pts, avg P1.0, 0 DNF, 2/2 races"
)


def tool(name: str, data: dict) -> dict:
    return {"tool_name": name, "success": "error" not in data, "data": data, "cached": False}


MONACO_TOOLS = [
    tool(
        "get_track_info",
        {
            "grand_prix": "Monaco Grand Prix",
            "event_format": "conventional",
            "circuit": {"name": "Circuit de Monaco", "length_km": 3.337, "first_grand_prix": 1929},
        },
    ),
    tool(
        "get_championship_standings",
        {
            "year": 2026,
            "races_completed": 5,
            "drivers": [
                {
                    "position": 1,
                    "driver": "Kimi ANTONELLI",
                    "driver_code": "ANT",
                    "team": "Mercedes",
                    "points": 131.0,
                },
            ],
            "constructors": [{"position": 1, "team": "Mercedes", "points": 219.0}],
        },
    ),
    tool(
        "get_recent_top_finishers",
        {
            "year": 2026,
            "last_race": "Montreal",
            "race_date": "2026-05-24",
            "top_finishers": [
                {
                    "position": 1,
                    "driver": "Kimi ANTONELLI",
                    "driver_code": "ANT",
                    "team": "Mercedes",
                    "points": 25.0,
                },
                {
                    "position": 2,
                    "driver": "Lewis HAMILTON",
                    "driver_code": "HAM",
                    "team": "Ferrari",
                    "points": 18.0,
                },
            ],
        },
    ),
    tool(
        "get_recent_race_results",
        {
            "year": 2025,
            "event": "Monaco Grand Prix",
            "round": 8,
            "results": [
                {"Position": 1, "Abbreviation": "NOR", "Status": "Finished"},
                {"Position": None, "Abbreviation": "STR", "Status": "DNF"},
            ],
        },
    ),
    tool(
        "get_circuit_winners",
        {
            "circuit": "Circuit de Monaco",
            "recent_winners": [
                {
                    "year": 2025,
                    "event": "Monaco Grand Prix",
                    "driver": "Lando Norris",
                    "driver_code": "NOR",
                    "team": "McLaren",
                },
            ],
        },
    ),
    tool(
        "get_driver_form",
        {
            "seasons": [2026],
            "grands_prix": ["2026 Shanghai", "2026 Montreal"],
            "drivers": [FORM_LINE],
        },
    ),
]


def event_for(year: int, label: str, date: str | None) -> dict | None:
    known = {
        "Montreal": {"event": "Canadian Grand Prix", "location": "Montréal"},
        "Shanghai": {"event": "Chinese Grand Prix", "location": "Shanghai"},
    }
    return known.get(label)


def test_the_id_is_year_round_and_event_slug() -> None:
    assert example_id(MONACO) == "2026-06-monaco-grand-prix"
    assert example_id({**MONACO, "name": "São Paulo Grand Prix", "round": 20}) == (
        "2026-20-sao-paulo-grand-prix"
    )


def test_display_names_title_case_openf1s_capitalised_surname() -> None:
    assert display_name("Kimi ANTONELLI") == ("Kimi Antonelli", "Antonelli")
    assert display_name("Lando Norris") == ("Lando Norris", "Norris")


def test_a_form_line_parses_into_its_finishes_and_points() -> None:
    assert parse_form_line(FORM_LINE) == {
        "code": "ANT",
        "name": "Kimi ANTONELLI",
        "finishes": [("Shanghai", "P1"), ("Montreal", "P1")],
        "points": 50.0,
    }
    assert parse_form_line("not a form line") is None


def test_run_briefing_reads_the_stream_the_way_the_route_does() -> None:
    agent = FakeAgent(steps=successful_steps())

    run = asyncio.run(run_briefing(agent, "Monaco", deadline_seconds=90))

    assert agent.stream_modes == [["updates", "custom"]]
    assert agent.states[0]["race_query"] == "Monaco"
    assert run["race_info"]["name"] == make_race_info()["name"]
    assert run["tasks"] == ["get_track_info", "search_f1_news"]
    assert [r["tool_name"] for r in run["tool_results"]] == ["get_track_info", "search_f1_news"]
    assert run["tool_results"][0]["data"] == {"length_km": 3.3}
    assert run["briefing"] == "## Monaco\n\nTight."
    assert run["truncated"] is False


def test_run_briefing_passes_a_budget_like_the_route() -> None:
    seen = []

    class Recording(FakeAgent):
        async def astream(self, state, config=None, stream_mode=None):
            seen.append(config)
            async for item in super().astream(state, config, stream_mode):
                yield item

    asyncio.run(run_briefing(Recording(steps=successful_steps()), "Monaco", deadline_seconds=90))

    assert isinstance(seen[0]["configurable"]["budget"], RunBudget)


def test_an_unresolved_race_is_a_capture_error() -> None:
    steps = [{"resolver": {"race_info": None, "current_step": "error", "briefing": "No race"}}]

    with pytest.raises(CaptureError, match="No race"):
        asyncio.run(run_briefing(FakeAgent(steps=steps), "Atlantis", deadline_seconds=90))


def test_a_run_with_no_briefing_is_a_capture_error() -> None:
    with pytest.raises(CaptureError, match="no briefing"):
        asyncio.run(run_briefing(FakeAgent(steps=successful_steps()[:3]), "Monaco", 90))


def evidence() -> dict:
    return build_evidence(
        MONACO,
        tool_plan=[r["tool_name"] for r in MONACO_TOOLS],
        tool_results=MONACO_TOOLS,
        season=SEASON,
        event_for=event_for,
        other_venues=[],
    )


def test_evidence_keeps_the_track_and_the_standings_table() -> None:
    built = evidence()

    assert built["track"] == {
        "circuit": "Circuit de Monaco",
        "length_km": 3.337,
        "first_grand_prix": 1929,
        "event_format": "conventional",
    }
    assert built["standings"]["races_completed"] == 5
    assert built["standings"]["drivers"][0]["driver_code"] == "ANT"


def test_evidence_turns_every_result_source_into_one_shape() -> None:
    results = evidence()["results"]

    assert results[0] == {
        "source": "get_recent_top_finishers",
        "year": 2026,
        "event": "Canadian Grand Prix",
        "location": "Montréal",
        "depth": 10,
        "positions": {"ANT": 1, "HAM": 2},
    }
    assert results[1]["source"] == "get_recent_race_results"
    assert results[1]["positions"] == {"NOR": 1, "STR": "DNF"}
    assert results[1]["location"] == "Monte Carlo"
    assert results[2] == {
        "source": "get_circuit_winners",
        "year": 2025,
        "event": "Monaco Grand Prix",
        "location": "Monte Carlo",
        "depth": 1,
        "positions": {"NOR": 1},
    }
    form_entries = [r for r in results if r["source"] == "get_driver_form"]
    assert [r["event"] for r in form_entries] == ["Chinese Grand Prix", "Canadian Grand Prix"]
    assert form_entries[0]["depth"] is None
    assert form_entries[1]["positions"] == {"ANT": 1}


def test_evidence_keeps_each_drivers_form_in_order() -> None:
    form = evidence()["form"]

    assert form["grands_prix"] == ["2026 Chinese Grand Prix", "2026 Canadian Grand Prix"]
    assert form["drivers"] == {"ANT": {"results": ["P1", "P1"], "points": 50.0}}


def test_evidence_names_every_driver_once_with_a_readable_name() -> None:
    drivers = {d["code"]: d for d in evidence()["drivers"]}

    assert drivers["ANT"] == {"code": "ANT", "name": "Kimi Antonelli", "surname": "Antonelli"}
    assert drivers["HAM"]["surname"] == "Hamilton"
    assert drivers["NOR"]["name"] == "Lando Norris"


def test_evidence_counts_what_is_left_of_the_season_from_this_race() -> None:
    assert evidence()["season"] == {
        "rounds": 4,
        "remaining_grands_prix": 3,
        "remaining_sprints": 1,
        "this_weekend_sprint": False,
    }


def test_a_past_race_lists_the_events_run_after_it() -> None:
    assert evidence()["later_events"] == ["Barcelona Grand Prix", "British Grand Prix"]
    upcoming = build_evidence(
        {**MONACO, "is_upcoming": True},
        tool_plan=[],
        tool_results=[],
        season=SEASON,
        event_for=event_for,
        other_venues=[],
    )
    assert upcoming["later_events"] == []


def test_weather_not_in_the_plan_is_not_gathered() -> None:
    assert evidence()["weather"] == {"status": "not_gathered"}


def test_a_forecast_keeps_each_sessions_numbers() -> None:
    forecast = tool(
        "get_race_weather",
        {
            "status": "ok",
            "sessions": [
                {
                    "name": "Race",
                    "start": "2026-10-04T07:00:00+00:00",
                    "forecast": {
                        "temperature_c": 31.3,
                        "rain_probability": 88.0,
                        "wind_speed_ms": 2.9,
                        "conditions": "Rain",
                        "description": "light rain",
                    },
                },
                {"name": "Practice 1", "start": "2026-10-02T04:30:00+00:00", "forecast": None},
            ],
        },
    )
    built = build_evidence(
        MONACO,
        tool_plan=["get_race_weather"],
        tool_results=[forecast],
        season=SEASON,
        event_for=event_for,
        other_venues=[],
    )

    assert built["weather"] == {
        "status": "ok",
        "available_from": None,
        "sessions": [
            {
                "name": "Race",
                "start": "2026-10-04T07:00:00+00:00",
                "temperature_c": 31.3,
                "rain_probability": 88.0,
                "wind_speed_ms": 2.9,
                "description": "light rain",
            },
            {
                "name": "Practice 1",
                "start": "2026-10-02T04:30:00+00:00",
                "temperature_c": None,
                "rain_probability": None,
                "wind_speed_ms": None,
                "description": None,
            },
        ],
    }


def test_news_keeps_titles_and_links_only() -> None:
    news = tool(
        "search_f1_news",
        {"articles": [{"title": "Preview", "url": "https://example.test/a", "content": "long"}]},
    )
    built = build_evidence(
        MONACO,
        tool_plan=["search_f1_news"],
        tool_results=[news],
        season=SEASON,
        event_for=event_for,
        other_venues=[],
    )

    assert built["news"] == [{"title": "Preview", "url": "https://example.test/a"}]


def test_other_venues_are_the_names_earlier_editions_were_held_under() -> None:
    history = [
        ("Bahrain Grand Prix", "Sakhir"),
        ("Bahrain Grand Prix", "Kuala Lumpur"),
        ("Malaysian Grand Prix", "Kuala Lumpur"),
    ]
    circuits = {
        "Sakhir": ("bh-2004", "Bahrain International Circuit"),
        "Kuala Lumpur": ("my-1999", "Sepang International Circuit"),
    }

    venues = other_venues_for(
        {**MONACO, "name": "Bahrain Grand Prix", "track_id": "my-1999", "location": "Kuala Lumpur"},
        history,
        circuits.get,
    )

    assert venues == ["Sakhir", "Bahrain International Circuit"]


def test_a_respelt_location_of_the_same_circuit_is_not_another_venue() -> None:
    history = [("Monaco Grand Prix", "Monaco"), ("Monaco Grand Prix", "Monte Carlo")]
    circuits = {
        "Monaco": ("mc-1929", "Circuit de Monaco"),
        "Monte Carlo": ("mc-1929", "Circuit de Monaco"),
    }

    assert other_venues_for(MONACO, history, circuits.get) == []


def test_writing_an_example_rewrites_the_index_from_every_file(tmp_path) -> None:
    first = {
        "schema": 1,
        "id": "2026-06-monaco-grand-prix",
        "race_info": MONACO,
        "captured_at": "2026-10-01T17:00:00+00:00",
    }
    second = {
        **first,
        "id": "2026-17-singapore-grand-prix",
        "race_info": {**MONACO, "name": "Singapore Grand Prix", "round": 17, "is_upcoming": True},
    }

    write_example(second, tmp_path)
    write_example(first, tmp_path)

    index = json.loads((tmp_path / "index.json").read_text(encoding="utf-8"))
    assert [row["id"] for row in index] == [
        "2026-06-monaco-grand-prix",
        "2026-17-singapore-grand-prix",
    ]
    assert index[0] == {
        "id": "2026-06-monaco-grand-prix",
        "event": "Monaco Grand Prix",
        "year": 2026,
        "round": 6,
        "circuit": "Circuit de Monaco",
        "captured_at": "2026-10-01T17:00:00+00:00",
        "as_of": "2026-06-05T11:30:00+00:00",
        "is_upcoming": False,
    }
    assert (
        json.loads((tmp_path / "2026-06-monaco-grand-prix.json").read_text())["id"] == first["id"]
    )


def test_a_graph_failure_is_a_capture_error_that_names_it() -> None:
    agent = FakeAgent(raises=RuntimeError("read timed out"))

    with pytest.raises(CaptureError, match="RuntimeError: read timed out"):
        asyncio.run(run_briefing(agent, "Monaco", deadline_seconds=90))
