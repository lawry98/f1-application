---
status: accepted
---

# Serve Truncated Briefings rather than failing the request

The synthesizer streams its prose out as Deltas while it writes. When the LLM iteration dies
partway, the prose already written is worth reading, so `synthesizer_node` catches the exception
and returns what it has with `briefing_truncated: True` instead of propagating. Truncation is a
property of the Briefing, not a Step — a Truncated run still reports `current_step: "complete"`.

This extends the error-as-value discipline the Tools already follow to the last node in the
pipeline that still raised. Nothing in the pipeline now raises.

## The invariant we gave up

Before this change, a terminal `briefing` event meant *the Briefing is complete*. It no longer
does; it means *this is the whole Briefing we have*, complete or not, and the `truncated` field
says which. Anything reading the terminal event as a completeness signal is now wrong.

## Considered options

**A new `truncated` Step.** Rejected. `routes.py` 500s on `current_step == "error"` and the
frontend renders Steps as a linear progress track, so a sixth Step would have to be threaded
through both, and every existing `== "complete"` check would silently start missing truncated
runs. Truncation is orthogonal to *where the pipeline got to*: the pipeline got to the end either
way. Keeping the Step set closed also keeps `error` meaning exactly "Resolution failed".

**Emitting an `error` event alongside the truncated `briefing`.** Rejected more firmly. It would
contradict `current_step: "complete"`, and `use-briefing.ts` pipes error text into a red ❌ banner
— a provider exception in alarm styling directly above perfectly readable prose reads as
"everything broke". The marker belongs *after* the prose, calm, and it is the `truncated` field's
job. `BriefingCard` renders it as a quiet line beneath the briefing, separated by a rule.

**Letting the sync `/api/briefing` endpoint keep propagating.** Rejected. The node owns
truncation, so the transport stays a dumb translator and *both* endpoints get the behaviour for
free. `agent.ainvoke()` would otherwise have no partial to return at all.

## The ≥1 Delta rule

A synthesis that produced no prose at all is **not** Truncated — there is no Briefing to deliver.
It emits `error` and no `briefing` event. Truncation describes an unfinished deliverable, and
zero prose is not an unfinished deliverable; it is an absent one.

## Consequences

**The terminal `briefing` event now rests on a weaker justification.** It was originally kept
because it was emitted *iff* the Briefing was complete. That is gone. It survives as a
reconciliation anchor instead: `lib/api.ts` silently swallows malformed frames, so without a
terminal full-content event a dropped Delta would corrupt the rendered document undetectably.
That is a real job, but a smaller one — do not defend the event on completeness grounds.

**A bare `except` around an LLM call followed by `current_step = "complete"` looks like a
swallowed bug.** It is not. This ADR is the thing to read before "fixing" it.

**Both LLM-calling nodes now degrade, but on different terms.** The planner degrades
unconditionally — any failure falls back to `DEFAULT_TOOLS`, because a fallback plan always
exists (see `test_planner_degrades_to_default_tools_when_the_llm_call_fails`, and ADR-0001, which
made that change when a free-tier 429 became normal operation). The synthesizer has no fallback
prose to fall back *to*, so it degrades only once the stream has produced some: with prose in
hand it truncates, with none it raises. The asymmetry is in what each node can substitute when
the model is unavailable, not in whether it is allowed to.

**Real streaming introduced a schedule-cache interleaving hazard**, and this ADR is where it is
recorded rather than fixed. `finally: clear_schedule_cache()` used to be safe by accident — the
whole graph completed inside an executor before the first yield. It no longer does. A client
disconnect during *gathering* fires the cleanup while tool threads are still calling
`get_schedule()` against a wiped cache, causing pointless re-fetches and confusing logs for a
request nobody is listening to. Not a correctness bug — `dict.clear()` under the GIL will not
corrupt a concurrent read, the read just misses — and arguably no worse than today's
run-everything-anyway. Fixing it means decoupling the cache's lifetime from the generator's,
which is a separate design.
