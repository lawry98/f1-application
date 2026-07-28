"""Builders for the FastF1-shaped data structures the app consumes.

Only the columns the application actually reads are reproduced. The full FastF1
schedule frame is much wider; adding columns nothing consumes would be fixture
surface with no test value.

The one non-obvious constraint: ``EventDate`` must be a real ``datetime64`` series,
not a column of Python ``date`` objects. ``f1_data_tools`` and ``fastf1_tools`` both
reach for ``schedule["EventDate"].dt.date``, and ``.dt`` only exists on datetime-typed
series — a plain-object column raises ``AttributeError`` at runtime while looking
perfectly reasonable in a fixture.
"""

from typing import Any

import pandas as pd

SCHEDULE_COLUMNS = [
    "RoundNumber",
    "Country",
    "Location",
    "OfficialEventName",
    "EventDate",
    "EventName",
    "EventFormat",
]


def make_schedule(events: list[dict[str, Any]]) -> pd.DataFrame:
    """Build a FastF1-shaped event schedule.

    Args:
        events: One dict per event. Requires ``name`` and ``date``; ``location``,
            ``country``, ``round``, ``format`` and ``official_name`` are optional
            and default to something plausible.

    Returns:
        DataFrame with SCHEDULE_COLUMNS and a datetime64 ``EventDate``.
    """
    rows = []
    for index, event in enumerate(events, start=1):
        name = event["name"]
        rows.append(
            {
                "RoundNumber": event.get("round", index),
                "Country": event.get("country", "Testland"),
                "Location": event.get("location", "Testville"),
                "OfficialEventName": event.get("official_name", f"FORMULA 1 {name.upper()}"),
                "EventDate": event["date"],
                "EventName": name,
                "EventFormat": event.get("format", "conventional"),
            }
        )

    frame = pd.DataFrame(rows, columns=SCHEDULE_COLUMNS)
    frame["EventDate"] = pd.to_datetime(frame["EventDate"])
    return frame


def make_tool(name: str, result: dict[str, Any] | None = None, raises: Exception | None = None):
    """Build a stand-in for a LangChain ``@tool``.

    The graph only ever touches ``.name`` and ``.invoke(...)``, so that is the whole
    surface worth doubling.

    Args:
        name: Value for ``.name``; must match the task string the planner emits.
        result: Payload ``.invoke()`` returns.
        raises: If given, ``.invoke()`` raises this instead.
    """

    class _FakeTool:
        def __init__(self) -> None:
            self.name = name
            self.calls: list[dict[str, Any]] = []

        def invoke(self, args: dict[str, Any]) -> dict[str, Any]:
            self.calls.append(args)
            if raises is not None:
                raise raises
            return result if result is not None else {"ok": True}

    return _FakeTool()


def make_llm(content: str = "[]", raises: Exception | None = None):
    """Build a stand-in for the module-level ``ChatGoogleGenerativeAI`` client.

    The graph only calls ``.invoke(messages)`` and reads ``.text`` off the result.

    ``.content`` is modelled the way Gemini 3 actually returns it — a *list of content
    blocks*, not a string — while ``.text`` flattens to the string the graph wants. Keeping
    both faithful is the point: a fake that returned a plain ``.content`` string would let
    ``response.content`` pass in tests and then hand the API a list in production, which is
    exactly the bug this shape exists to prevent.
    """

    class _FakeResponse:
        def __init__(self, text: str) -> None:
            self.content = [{"type": "text", "text": text}]
            self.text = text

    class _FakeLLM:
        def __init__(self) -> None:
            self.calls: list[Any] = []

        def invoke(self, messages: Any) -> _FakeResponse:
            self.calls.append(messages)
            if raises is not None:
                raise raises
            return _FakeResponse(content)

    return _FakeLLM()


def make_state(**overrides: Any) -> dict[str, Any]:
    """Build an AgentState dict with sensible defaults, overridable per test."""
    state: dict[str, Any] = {
        "messages": [],
        "race_query": "monaco",
        "race_info": None,
        "tasks": [],
        "tool_results": [],
        "briefing": None,
        "current_step": "resolving",
    }
    state.update(overrides)
    return state


def make_race_info(**overrides: Any) -> dict[str, Any]:
    """Build a resolved race-info dict with sensible defaults, overridable per test."""
    info: dict[str, Any] = {
        "name": "Monaco Grand Prix",
        "year": 2025,
        "circuit_id": "monaco_grand_prix",
        "location": "Monaco",
        "country": "Monaco",
        "date": "2025-05-25 00:00:00",
        "is_upcoming": True,
        "historical_year": 2024,
    }
    info.update(overrides)
    return info
