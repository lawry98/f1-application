"""Tests for the per-run budget: the cancel event and deadline the nodes check."""

import math
import threading

from agent.budget import RunBudget, budget_from
from tests.factories import FakeClock


def make_budget(clock: FakeClock, seconds: float = 90) -> RunBudget:
    return RunBudget(cancel=threading.Event(), deadline=clock() + seconds, clock=clock)


def test_a_run_without_a_budget_is_never_stopped():
    """Nodes driven by tests, or by any caller that passes no config, run unbounded as before."""
    for config in (None, {}, {"configurable": {}}):
        budget = budget_from(config)
        assert not budget.stopped()
        assert budget.remaining() == math.inf


def test_the_budget_handed_in_through_the_config_is_the_one_returned():
    budget = make_budget(FakeClock())

    assert budget_from({"configurable": {"budget": budget}}) is budget


def test_remaining_counts_down_with_the_clock_and_stops_at_zero():
    clock = FakeClock()
    budget = make_budget(clock, seconds=90)

    clock.advance(30)
    assert budget.remaining() == 60

    clock.advance(100)
    assert budget.remaining() == 0


def test_a_passed_deadline_stops_the_run_even_before_anyone_sets_the_event():
    """The event is set by a timer on the event loop; a node in a worker thread must not
    depend on that timer having fired to notice the deadline."""
    clock = FakeClock()
    budget = make_budget(clock, seconds=90)
    assert not budget.stopped()

    clock.advance(90)

    assert budget.stopped()
    assert budget.stop_reason() == "deadline"


def test_setting_the_event_stops_the_run_and_reads_as_cancelled():
    budget = make_budget(FakeClock())

    budget.cancel.set()

    assert budget.stopped()
    assert budget.stop_reason() == "cancelled"
