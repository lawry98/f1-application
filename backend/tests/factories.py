"""Builders for the FastF1-shaped data structures the app consumes.

Only the columns the application actually reads are reproduced. The full FastF1
schedule frame is much wider; adding columns nothing consumes would be fixture
surface with no test value.

The one non-obvious constraint: ``EventDate`` must be a real ``datetime64`` series,
not a column of Python ``date`` objects. ``f1_data_tools`` and ``fastf1_tools`` both
reach for ``schedule["EventDate"].dt.date``, and ``.dt`` only exists on datetime-typed
series — a plain-object column raises ``AttributeError`` at runtime while looking
perfectly reasonable in a fixture.

The ``SessionN`` / ``SessionNDateUtc`` pairs are the resolver's source for a weekend's sessions
and its ``as_of`` cutoff. FastF1 serves the UTC column tz-naive, so the fixtures do too.
"""

import threading
from datetime import timedelta
from typing import Any

import pandas as pd
from requests.structures import CaseInsensitiveDict

SESSION_SLOTS = 5

SCHEDULE_COLUMNS = [
    "RoundNumber",
    "Country",
    "Location",
    "OfficialEventName",
    "EventDate",
    "EventName",
    "EventFormat",
    *(
        column
        for n in range(1, SESSION_SLOTS + 1)
        for column in (f"Session{n}", f"Session{n}DateUtc")
    ),
]


def conventional_sessions(race_day: str) -> list[tuple[str, str]]:
    """A conventional weekend's five sessions, in UTC, around a race day's 13:00 start.

    FP1 is two days earlier at 11:30 — the European-afternoon slot most of the calendar uses —
    so a past event's ``as_of`` in these fixtures is ``race_day - 2 days, 11:30 UTC``.
    """
    day = pd.Timestamp(race_day)

    def at(days_before: int, hh_mm: str) -> str:
        return f"{(day - timedelta(days=days_before)).date()} {hh_mm}"

    return [
        ("Practice 1", at(2, "11:30")),
        ("Practice 2", at(2, "15:00")),
        ("Practice 3", at(1, "10:30")),
        ("Qualifying", at(1, "14:00")),
        ("Race", at(0, "13:00")),
    ]


def make_schedule(events: list[dict[str, Any]]) -> pd.DataFrame:
    """Build a FastF1-shaped event schedule.

    Args:
        events: One dict per event. Requires ``name`` and ``date``; ``location``,
            ``country``, ``round``, ``format`` and ``official_name`` are optional
            and default to something plausible. ``sessions`` is a list of
            ``(name, "YYYY-MM-DD HH:MM" UTC)`` pairs and defaults to
            ``conventional_sessions(date)``; pass ``[]`` for a row FastF1 carries no
            session times for, as it does for older seasons.

    Returns:
        DataFrame with SCHEDULE_COLUMNS, a datetime64 ``EventDate`` and tz-naive UTC
        datetime64 ``SessionNDateUtc`` columns.
    """
    rows = []
    for index, event in enumerate(events, start=1):
        name = event["name"]
        row = {
            "RoundNumber": event.get("round", index),
            "Country": event.get("country", "Testland"),
            "Location": event.get("location", "Testville"),
            "OfficialEventName": event.get("official_name", f"FORMULA 1 {name.upper()}"),
            "EventDate": event["date"],
            "EventName": name,
            "EventFormat": event.get("format", "conventional"),
        }
        sessions = event.get("sessions", conventional_sessions(event["date"]))
        for slot in range(1, SESSION_SLOTS + 1):
            session = sessions[slot - 1] if slot <= len(sessions) else (None, None)
            row[f"Session{slot}"], row[f"Session{slot}DateUtc"] = session
        rows.append(row)

    frame = pd.DataFrame(rows, columns=SCHEDULE_COLUMNS)
    frame["EventDate"] = pd.to_datetime(frame["EventDate"])
    for slot in range(1, SESSION_SLOTS + 1):
        frame[f"Session{slot}DateUtc"] = pd.to_datetime(frame[f"Session{slot}DateUtc"])
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


def make_llm(
    content: str = "[]",
    raises: Exception | None = None,
    chunks: list[str] | None = None,
    stream_raises_after: int | None = None,
    before_chunk: Any = None,
):
    """Build a stand-in for the module-level ``ChatGoogleGenerativeAI`` client.

    The planner calls ``.invoke(messages)``; the synthesizer calls ``.stream(messages)``.
    Both read ``.text`` off what they get back.

    ``.content`` is modelled the way Gemini 3 actually returns it — a *list of content
    blocks*, not a string — while ``.text`` flattens to the string the graph wants. Keeping
    both faithful is the point: a fake that returned a plain ``.content`` string would let
    ``response.content`` pass in tests and then hand the API a list in production, which is
    exactly the bug this shape exists to prevent. Real ``AIMessageChunk``s behave the same
    way, so streamed chunks carry the block shape too.

    Args:
        content: Text ``.invoke()`` returns, and the default single ``.stream()`` chunk.
        raises: If given, both ``.invoke()`` and ``.stream()`` raise it immediately.
        chunks: Successive ``.stream()`` chunks. Defaults to ``[content]``. Their
            concatenation is what a complete streamed briefing comes to.
        stream_raises_after: If given, ``.stream()`` raises after yielding this many
            chunks. ``0`` models a failure before any prose exists.
        before_chunk: If given, called with each chunk's index just before that chunk is
            produced — the moment a real stream is waiting on the network, which is where a
            deadline or a hang-up lands.

    The fake records ``chunks_served`` (how far the consumer read) and ``stream_closed``
    (whether it let go of the stream), which is how a test sees that a stopped synthesis
    stopped *reading* rather than merely stopped *forwarding*.
    """

    class _FakeResponse:
        def __init__(self, text: str) -> None:
            self.content = [{"type": "text", "text": text}]
            self.text = text

    class _FakeLLM:
        def __init__(self) -> None:
            self.calls: list[Any] = []
            self.chunks_served = 0
            self.stream_closed = False

        def invoke(self, messages: Any) -> _FakeResponse:
            self.calls.append(messages)
            if raises is not None:
                raise raises
            return _FakeResponse(content)

        def stream(self, messages: Any):
            self.calls.append(messages)
            if raises is not None:
                raise raises
            try:
                for index, chunk in enumerate(chunks if chunks is not None else [content]):
                    if before_chunk is not None:
                        before_chunk(index)
                    if stream_raises_after is not None and index >= stream_raises_after:
                        raise RuntimeError("stream died mid-iteration")
                    self.chunks_served += 1
                    yield _FakeResponse(chunk)
                if stream_raises_after is not None:
                    raise RuntimeError("stream died mid-iteration")
            except GeneratorExit:
                self.stream_closed = True
                raise

    return _FakeLLM()


def make_session(results_rows: list[dict[str, Any]]):
    """Build a stand-in for a FastF1 ``Session``.

    The tools only touch ``.load(...)`` and ``.results`` (a DataFrame), so that is the
    whole surface worth doubling. ``loads`` records the kwargs each ``load`` call got,
    letting tests pin that telemetry/weather/messages stay disabled.
    """
    frame = pd.DataFrame(results_rows)

    class _FakeSession:
        def __init__(self) -> None:
            self.results = frame
            self.loads: list[dict[str, Any]] = []

        def load(self, **kwargs: Any) -> None:
            self.loads.append(kwargs)

    return _FakeSession()


def make_state(**overrides: Any) -> dict[str, Any]:
    """Build an AgentState dict with sensible defaults, overridable per test."""
    state: dict[str, Any] = {
        "race_query": "monaco",
        "race_info": None,
        "tasks": [],
        "tool_results": [],
        "briefing": None,
        "briefing_truncated": False,
        "current_step": "resolving",
    }
    state.update(overrides)
    return state


def make_race_info(**overrides: Any) -> dict[str, Any]:
    """Build a resolved race-info dict with sensible defaults, overridable per test.

    The default is an upcoming Monaco Grand Prix briefed on 2025-05-01, so ``as_of`` is that
    day's start in UTC. ``sessions`` mirrors ``conventional_sessions`` for the race day.
    """
    info: dict[str, Any] = {
        "name": "Monaco Grand Prix",
        "year": 2025,
        "round": 3,
        "circuit_id": "monaco_grand_prix",
        "track_id": "mc-1929",
        "circuit_name": "Circuit de Monaco",
        "circuit_length_m": 3337,
        "location": "Monaco",
        "country": "Monaco",
        "date": "2025-05-25 00:00:00",
        "is_upcoming": True,
        "as_of": "2025-05-01T00:00:00+00:00",
        "sessions": [
            {"name": "Practice 1", "start": "2025-05-23T11:30:00+00:00"},
            {"name": "Practice 2", "start": "2025-05-23T15:00:00+00:00"},
            {"name": "Practice 3", "start": "2025-05-24T10:30:00+00:00"},
            {"name": "Qualifying", "start": "2025-05-24T14:00:00+00:00"},
            {"name": "Race", "start": "2025-05-25T13:00:00+00:00"},
        ],
    }
    info.update(overrides)
    return info


# OpenF1's real answer past its 3 req/s ceiling, captured live on 2026-09-30.
OPENF1_RATE_LIMITED = {
    "detail": "Rate limit exceeded. Max 3 requests/second.",
    "error": "Too Many Requests",
}


def make_openf1_get(
    routes: dict[str, Any],
    status_code: int = 200,
    throttled: dict[str, int] | None = None,
    *,
    by_year: bool = False,
):
    """Build a stand-in for ``requests.get`` against OpenF1.

    Args:
        routes: Endpoint name (the last path segment, e.g. ``"sessions"``) → JSON payload.
        status_code: Status every response reports.
        throttled: Endpoint → how many of its first calls answer HTTP 429 with
            ``Retry-After: 1``, as OpenF1 does to a fan-out that bursts past 3 req/s.
        by_year: Serve only the rows whose ``date_start`` falls in the request's ``year``
            param, as OpenF1 does. Off by default, where every year gets the whole payload —
            which is what most fixtures here, all one season, were written against. A test
            that crosses a season boundary needs it on.

    The returned callable records each call as ``{"url": ..., "params": ...}`` on ``.calls``,
    which is what lets tests assert the request *count* — the range-query pattern's whole
    value is that five races cost one request, and only a call count can pin that.
    An endpoint missing from ``routes`` is a test-authoring mistake, so it raises rather
    than quietly returning an empty list.
    """

    class _FakeGet:
        def __init__(self) -> None:
            self.calls: list[dict[str, Any]] = []

        def __call__(self, url: str, params: dict[str, Any] | None = None, **kwargs: Any):
            self.calls.append({"url": url, "params": params or {}})
            endpoint = url.rstrip("/").rsplit("/", 1)[-1]
            if endpoint not in routes:
                raise AssertionError(
                    f"make_openf1_get has no payload for '{endpoint}'. "
                    f"Known endpoints: {sorted(routes)}"
                )
            if remaining_429s.get(endpoint, 0) > 0:
                remaining_429s[endpoint] -= 1
                return _FakeOpenF1Response(OPENF1_RATE_LIMITED, 429, {"retry-after": "1"})
            payload = routes[endpoint]
            year = (params or {}).get("year")
            if by_year and year is not None and isinstance(payload, list):
                payload = [row for row in payload if row.get("date_start", "")[:4] == str(year)]
            return _FakeOpenF1Response(payload, status_code)

    remaining_429s = dict(throttled or {})
    return _FakeGet()


class _FakeOpenF1Response:
    """Stand-in for a ``requests.Response`` — only status_code, headers and json() are
    consumed. ``headers`` is case-insensitive, as a real response's is: OpenF1 serves
    ``retry-after`` lower-cased.
    """

    def __init__(
        self, payload: Any, status_code: int, headers: dict[str, str] | None = None
    ) -> None:
        self.status_code = status_code
        self.headers = CaseInsensitiveDict(headers or {})
        self._payload = payload

    def json(self) -> Any:
        return self._payload


class FakeClock:
    """A clock a test moves by hand — for anything timed in hours, where sleeping is no option.

    Callable like ``time.time``/``time.monotonic``, which is the whole seam the guard and the
    run budget take.
    """

    def __init__(self, now: float = 1_000_000.0) -> None:
        self.now = now

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


def make_openf1_sequence(statuses: list[int], payload: Any, headers: dict[str, str] | None = None):
    """A ``requests.get`` stand-in answering the Nth call with ``statuses[N]`` (the last repeats).

    Records ``.calls`` like ``make_openf1_get``. ``headers`` go on every non-200 response, which
    is where a 429's Retry-After lives.
    """

    class _SequenceGet:
        def __init__(self) -> None:
            self.calls: list[dict[str, Any]] = []
            self._lock = threading.Lock()

        def __call__(self, url: str, params: dict[str, Any] | None = None, **kwargs: Any):
            with self._lock:
                index = len(self.calls)
                self.calls.append({"url": url, "params": params or {}})
            status = statuses[min(index, len(statuses) - 1)]
            return _FakeOpenF1Response(
                payload if status == 200 else {"detail": "error"},
                status,
                None if status == 200 else headers,
            )

    return _SequenceGet()
