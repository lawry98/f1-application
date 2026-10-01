"""A briefing run's budget: the deadline and cancel signal the graph's nodes check.

The nodes are synchronous and run on worker threads, so nothing on the event loop can stop
one — cancelling the request's task only stops *waiting* for it. A Gemini stream left running
behind a closed tab is still paid for. So the route hands every run a :class:`RunBudget`
through its ``RunnableConfig`` (``config["configurable"]["budget"]``), and each node checks it
at the points where it is about to spend: before an LLM call, before submitting a tool, and
between streamed chunks.

The route sets ``cancel`` when the deadline passes and when the client goes away. A node does
not rely on the timer alone: :meth:`RunBudget.stopped` also reads the clock, so a worker thread
notices a passed deadline whether or not the event loop has got round to the timer.

This module is below the API layer on purpose — ``agent/`` never imports from ``api/``.
"""

import math
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any


class BriefingStoppedError(Exception):
    """The run was stopped — deadline or hang-up — before the synthesizer had any prose.

    With prose in hand the synthesizer returns it as a truncated briefing instead (ADR-0002);
    this is the "no prose, so the failure travels" half of that rule.
    """


@dataclass(frozen=True)
class RunBudget:
    cancel: threading.Event
    # A reading of ``clock``, not wall time.
    deadline: float
    clock: Callable[[], float] = field(default=time.monotonic)

    def remaining(self) -> float:
        return max(0.0, self.deadline - self.clock())

    def stopped(self) -> bool:
        return self.cancel.is_set() or self.remaining() == 0

    def stop_reason(self) -> str:
        """For logs: why a stopped run stopped."""
        return "deadline" if self.remaining() == 0 else "cancelled"


def budget_from(config: Any) -> RunBudget:
    """The run's budget, or an unlimited one for a run that was handed none.

    Tests drive nodes without a config, and so would any caller that predates the guard;
    both keep the old unbounded behaviour rather than failing.
    """
    budget = ((config or {}).get("configurable") or {}).get("budget")
    if isinstance(budget, RunBudget):
        return budget
    return RunBudget(cancel=threading.Event(), deadline=math.inf)
