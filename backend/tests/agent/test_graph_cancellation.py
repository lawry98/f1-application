"""How each node honours the run's budget — the deadline, and a cancel from a closed tab.

The point of all of it is spend, so the assertions are about what was *called*: an LLM call
that never happened, a tool that was never submitted, a stream that stopped being read. Time is
a hand-driven clock; a tool that must outlive the deadline blocks on an event the test releases
afterwards, so nothing here sleeps.
"""

import logging
import threading
from typing import Any

import pytest
from google.genai import errors as genai_errors
from langgraph.graph import END, StateGraph

from agent import graph as graph_module
from agent.budget import BriefingStoppedError, RunBudget
from agent.graph import planner_node, synthesizer_node, tool_executor_node
from agent.prompts import DEFAULT_TOOLS
from agent.state import AgentState
from config import TOOL_FANOUT_TIMEOUT_SECONDS
from tests.factories import FakeClock, make_llm, make_race_info, make_state, make_tool


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def budget(clock) -> RunBudget:
    return RunBudget(cancel=threading.Event(), deadline=clock() + 90, clock=clock)


def run_node(node: Any, name: str, state: dict, budget: RunBudget) -> tuple[list[dict], dict]:
    """Run one node inside a one-node graph, with the budget in its config, streamed.

    Run on a worker thread joined with a timeout, so a node that waits for a blocked tool
    fails the test instead of hanging the suite.
    """
    workflow = StateGraph(AgentState)
    workflow.add_node(name, node)
    workflow.set_entry_point(name)
    workflow.add_edge(name, END)

    written: list[dict] = []
    update: dict = {}
    failure: list[BaseException] = []

    def drive() -> None:
        try:
            for mode, payload in workflow.compile().stream(
                state,
                config={"configurable": {"budget": budget}},
                stream_mode=["updates", "custom"],
            ):
                if mode == "custom":
                    written.append(payload)
                else:
                    update.update(payload.get(name, {}))
        except BaseException as exc:
            failure.append(exc)

    thread = threading.Thread(target=drive)
    thread.start()
    thread.join(timeout=5)
    assert not thread.is_alive(), f"{name} did not return; it is waiting on something"
    if failure:
        raise failure[0]
    return written, update


class BlockedTool:
    """A tool stuck on the network until the test lets it go."""

    def __init__(self, name: str) -> None:
        self.name = name
        self.release = threading.Event()
        self.started = threading.Event()

    def invoke(self, args: dict) -> dict:
        self.started.set()
        self.release.wait(timeout=10)
        return {"late": True}


class ClockTool:
    """A tool that finishes at once, moving the clock (or cancelling) as it does."""

    def __init__(self, name: str, on_invoke: Any) -> None:
        self.name = name
        self.on_invoke = on_invoke
        self.calls: list[dict] = []

    def invoke(self, args: dict) -> dict:
        self.calls.append(args)
        self.on_invoke()
        return {"ok": True}


def fanout_state(*tasks: str) -> dict:
    return make_state(race_info=make_race_info(), tasks=list(tasks))


def synth_state() -> dict:
    return make_state(
        race_info=make_race_info(),
        tool_results=[{"tool_name": "get_track_info", "success": True, "data": {"len": 3.3}}],
    )


# ── Planner ──────────────────────────────────────────────────────────────────


def test_a_stopped_run_plans_with_the_defaults_and_never_calls_the_llm(monkeypatch, budget):
    llm = make_llm('["get_track_info"]')
    monkeypatch.setattr(graph_module, "llm", llm)
    budget.cancel.set()

    result = planner_node(
        make_state(race_info=make_race_info()), {"configurable": {"budget": budget}}
    )

    assert result["tasks"] == DEFAULT_TOOLS
    assert llm.calls == []


def test_a_running_budget_leaves_the_planner_alone(monkeypatch, budget):
    llm = make_llm('["get_track_info"]')
    monkeypatch.setattr(graph_module, "llm", llm)

    result = planner_node(
        make_state(race_info=make_race_info()), {"configurable": {"budget": budget}}
    )

    assert result["tasks"] == ["get_track_info"]
    assert len(llm.calls) == 1


# ── Tool fan-out ─────────────────────────────────────────────────────────────


def test_a_tool_still_running_at_the_deadline_is_reported_as_timed_out(monkeypatch, clock, budget):
    slow = BlockedTool("get_track_info")
    fast = ClockTool("search_f1_news", lambda: clock.advance(90))
    monkeypatch.setattr(graph_module, "all_tools", [slow, fast])

    try:
        written, update = run_node(
            tool_executor_node,
            "tool_executor",
            fanout_state("get_track_info", "search_f1_news"),
            budget,
        )
    finally:
        slow.release.set()

    by_name = {tr["tool_name"]: tr for tr in update["tool_results"]}
    assert by_name["search_f1_news"]["success"] is True
    assert by_name["get_track_info"]["success"] is False
    assert by_name["get_track_info"]["data"] == {"error": "timed out"}
    # The chip for the straggler resolves too, rather than spinning forever.
    assert {"kind": "tool_result", "tool": "get_track_info", "success": False, "cached": False} in (
        written
    )
    assert update["current_step"] == "synthesizing"


def test_the_fanout_stops_waiting_at_its_own_cap_well_inside_the_deadline(
    monkeypatch, clock, budget
):
    """A hung FastF1 load must not eat the synthesizer's share of the deadline."""
    slow = BlockedTool("get_track_info")
    fast = ClockTool("search_f1_news", lambda: clock.advance(TOOL_FANOUT_TIMEOUT_SECONDS))
    monkeypatch.setattr(graph_module, "all_tools", [slow, fast])

    try:
        _, update = run_node(
            tool_executor_node,
            "tool_executor",
            fanout_state("get_track_info", "search_f1_news"),
            budget,
        )
    finally:
        slow.release.set()

    assert budget.remaining() > 0
    by_name = {tr["tool_name"]: tr["data"] for tr in update["tool_results"]}
    assert by_name["get_track_info"] == {"error": "timed out"}


def test_a_cancel_mid_fanout_returns_without_waiting_for_the_rest(monkeypatch, budget):
    slow = BlockedTool("get_track_info")
    fast = ClockTool("search_f1_news", budget.cancel.set)
    monkeypatch.setattr(graph_module, "all_tools", [slow, fast])

    try:
        _, update = run_node(
            tool_executor_node,
            "tool_executor",
            fanout_state("get_track_info", "search_f1_news"),
            budget,
        )
    finally:
        slow.release.set()

    by_name = {tr["tool_name"]: tr["data"] for tr in update["tool_results"]}
    assert by_name["get_track_info"] == {"error": "timed out"}


def test_a_stopped_run_submits_no_tools_at_all(monkeypatch, budget):
    tool = make_tool("get_track_info", {"ok": True})
    monkeypatch.setattr(graph_module, "all_tools", [tool])
    budget.cancel.set()

    written, update = run_node(
        tool_executor_node, "tool_executor", fanout_state("get_track_info"), budget
    )

    assert tool.calls == []
    assert update["tool_results"][0]["data"] == {"error": "cancelled"}
    assert written == [
        {"kind": "tool_result", "tool": "get_track_info", "success": False, "cached": False}
    ]


def test_tools_queued_behind_a_full_pool_are_never_started_once_the_run_stops(monkeypatch, budget):
    """`with ThreadPoolExecutor` would wait for every queued tool on exit; the node shuts the
    pool down with cancel_futures, so a tool still in the queue never runs."""
    monkeypatch.setattr(graph_module, "EXECUTOR_MAX_WORKERS", 1)
    monkeypatch.setattr(graph_module, "CANCEL_POLL_SECONDS", 0.01)
    blocker = BlockedTool("get_track_info")
    queued = make_tool("search_f1_news", {"ok": True})
    canceller = threading.Thread(target=lambda: blocker.started.wait(5) and budget.cancel.set())
    monkeypatch.setattr(graph_module, "all_tools", [blocker, queued])

    canceller.start()
    try:
        _, update = run_node(
            tool_executor_node,
            "tool_executor",
            fanout_state("get_track_info", "search_f1_news"),
            budget,
        )
    finally:
        blocker.release.set()
        canceller.join(5)

    assert queued.calls == []
    assert {tr["tool_name"] for tr in update["tool_results"]} == {
        "get_track_info",
        "search_f1_news",
    }


def test_a_stopped_fanout_says_so_in_the_log(monkeypatch, clock, budget, caplog):
    slow = BlockedTool("get_track_info")
    fast = ClockTool("search_f1_news", lambda: clock.advance(90))
    monkeypatch.setattr(graph_module, "all_tools", [slow, fast])

    with caplog.at_level(logging.WARNING, logger="agent.graph"):
        try:
            run_node(
                tool_executor_node,
                "tool_executor",
                fanout_state("get_track_info", "search_f1_news"),
                budget,
            )
        finally:
            slow.release.set()

    assert "get_track_info" in caplog.text
    assert "deadline" in caplog.text


# ── Synthesizer ──────────────────────────────────────────────────────────────


def test_a_run_stopped_before_synthesis_never_calls_the_llm(monkeypatch, budget):
    llm = make_llm(chunks=["never"])
    monkeypatch.setattr(graph_module, "llm", llm)
    budget.cancel.set()

    with pytest.raises(BriefingStoppedError):
        run_node(synthesizer_node, "synthesizer", synth_state(), budget)

    assert llm.calls == []


def test_a_cancel_mid_stream_stops_reading_and_serves_the_prose_as_truncated(monkeypatch, budget):
    """ADR-0002's path, reached by a cancel instead of a provider failure: prose in hand is a
    truncated briefing with the step still "complete"."""

    def cancel_while_waiting_for_the_third(index: int) -> None:
        if index == 2:
            budget.cancel.set()

    llm = make_llm(
        chunks=["a", "b", "c", "d", "e"], before_chunk=cancel_while_waiting_for_the_third
    )
    monkeypatch.setattr(graph_module, "llm", llm)

    written, update = run_node(synthesizer_node, "synthesizer", synth_state(), budget)

    assert update["briefing"] == "abc"
    assert update["briefing_truncated"] is True
    assert update["current_step"] == "complete"
    assert [w["content"] for w in written] == ["a", "b", "c"]
    assert llm.chunks_served == 3
    assert llm.stream_closed


def test_the_deadline_passing_mid_stream_stops_it_the_same_way(monkeypatch, clock, budget):
    def deadline_passes(index: int) -> None:
        if index == 1:
            clock.advance(90)

    llm = make_llm(chunks=["a", "b", "c"], before_chunk=deadline_passes)
    monkeypatch.setattr(graph_module, "llm", llm)

    _, update = run_node(synthesizer_node, "synthesizer", synth_state(), budget)

    assert update["briefing"] == "ab"
    assert update["briefing_truncated"] is True
    assert llm.stream_closed


def test_a_stop_with_no_prose_yet_raises_as_a_failure_before_prose_does(monkeypatch, budget):
    """Metadata-only chunks carry no prose, so the ≥1 Delta rule still applies."""

    def cancel_after_two_empty_chunks(index: int) -> None:
        if index == 1:
            budget.cancel.set()

    llm = make_llm(chunks=["", "", "never"], before_chunk=cancel_after_two_empty_chunks)
    monkeypatch.setattr(graph_module, "llm", llm)

    with pytest.raises(BriefingStoppedError):
        run_node(synthesizer_node, "synthesizer", synth_state(), budget)

    assert llm.stream_closed


def test_a_stopped_synthesis_says_why_in_the_log(monkeypatch, clock, budget, caplog):
    llm = make_llm(chunks=["a", "b"], before_chunk=lambda i: i == 1 and clock.advance(90))
    monkeypatch.setattr(graph_module, "llm", llm)

    with caplog.at_level(logging.WARNING, logger="agent.graph"):
        run_node(synthesizer_node, "synthesizer", synth_state(), budget)

    assert "Synthesizer stopped" in caplog.text
    assert "deadline" in caplog.text


def test_a_synthesis_inside_its_budget_is_untouched(monkeypatch, budget):
    llm = make_llm(chunks=["all ", "of it"])
    monkeypatch.setattr(graph_module, "llm", llm)

    _, update = run_node(synthesizer_node, "synthesizer", synth_state(), budget)

    assert update["briefing"] == "all of it"
    assert update["briefing_truncated"] is False
    assert not budget.cancel.is_set()


# ── Synthesizer: a 503 before the first chunk ────────────────────────────────


class ClockedEvent(threading.Event):
    """A cancel event whose timed wait moves the fake clock on instead of sleeping."""

    def __init__(self, clock: FakeClock) -> None:
        super().__init__()
        self._clock = clock

    def wait(self, timeout: float | None = None) -> bool:
        if timeout is not None and not self.is_set():
            self._clock.advance(timeout)
        return self.is_set()


@pytest.fixture
def waiting_budget(clock) -> RunBudget:
    """The run's budget, with the synthesizer's wait before a retry spent on the fake clock."""
    return RunBudget(cancel=ClockedEvent(clock), deadline=clock() + 90, clock=clock)


def overloaded() -> genai_errors.ServerError:
    return genai_errors.ServerError(503, {"error": {"code": 503, "status": "UNAVAILABLE"}})


@pytest.mark.parametrize(
    ("elapsed", "calls"),
    [
        # 32s left: the 2s wait and a whole 30s read still end by the deadline.
        (58.0, 2),
        # 31.5s left: a retry's read could outlast the run, so the 503 ends it.
        (58.5, 1),
    ],
    ids=["fits", "does-not-fit"],
)
def test_a_503_is_retried_only_while_the_wait_and_another_read_fit_the_deadline(
    monkeypatch, clock, waiting_budget, elapsed, calls
):
    """The SDK's retry cannot be held to the deadline, so the synthesizer makes its own,
    and only when it adds no term to config.py's worst case."""
    clock.advance(elapsed)
    llm = make_llm(raises=overloaded())
    monkeypatch.setattr(graph_module, "llm", llm)

    with pytest.raises(genai_errors.ServerError):
        run_node(synthesizer_node, "synthesizer", synth_state(), waiting_budget)

    assert len(llm.calls) == calls


def test_a_hang_up_while_gemini_answers_503_costs_no_second_call(monkeypatch, waiting_budget):
    llm = make_llm(
        chunks=["never"],
        stream_raises_after=0,
        stream_error=overloaded(),
        before_chunk=lambda _index: waiting_budget.cancel.set(),
    )
    monkeypatch.setattr(graph_module, "llm", llm)

    with pytest.raises(BriefingStoppedError):
        run_node(synthesizer_node, "synthesizer", synth_state(), waiting_budget)

    assert len(llm.calls) == 1
