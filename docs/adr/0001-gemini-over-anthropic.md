---
status: accepted
---

# Gemini 3.6 Flash instead of Anthropic Claude

This project is a personal, self-funded F1 briefing agent, and every briefing costs two LLM
calls. Google AI Studio offers a free tier that covers this workload comfortably, so we
replaced `langchain-anthropic` / `claude-sonnet-4` with `langchain-google-genai` /
`gemini-3.6-flash` outright — the app now runs at zero LLM cost.

## Considered options

**A provider abstraction** (an `LLM_PROVIDER` env var selecting Gemini or Anthropic) was
rejected. There are exactly two `llm.invoke()` call sites and no `bind_tools` usage, so the
swap is roughly fifteen lines across three files. An abstraction would cost two dependency
sets, two key-validation paths and a factory to test, permanently, to avoid a change that
takes an afternoon. Reversal is cheap; optionality is not worth its upkeep here.

**Gemini with Anthropic as a runtime fallback** was rejected more firmly. The free tier's
characteristic failure is a 429, and silently failing over to a *paid* provider when the free
one rate-limits is precisely the surprise a hobby project's billing does not want.

**Staying on `gemini-2.5-flash`** would have avoided the content-shape change below. We took
the newer model rather than let a two-line code fix determine the model choice.

## Consequences

**Free-tier prompts and responses may be used by Google to improve their products.** Fine for
public F1 data; this decision would need revisiting before the agent handles anything private.
That is the one genuinely hard-to-reverse part of this choice — the code is easy to change, the
data already sent is not.

**`response.text`, not `response.content`.** Gemini 3 returns content as a list of blocks
rather than a string. Reading `.content` breaks both call sites, and one of them fails
*silently*: the planner's parse raises inside its `try` and degrades to `DEFAULT_TOOLS` on
every request, which looks exactly like a working planner. `make_llm()` in
`tests/factories.py` models the block-list shape deliberately so this cannot regress unnoticed.

**There is no temperature setting at all.** The Claude-era `LLM_TEMPERATURE = 0.7` was first
changed to 1.0 on the strength of Google's guidance that lowering it risks looping and degraded
reasoning — then removed outright once a live run showed `gemini-3.6-flash` warns that it *uses
fixed sampling defaults and ignores the parameter entirely*. Passing it changed nothing and
logged a `UserWarning` on every client construction. Expect someone to try to reintroduce it
for the synthesizer's prose.

**Rate limits are now an expected condition, not an outage** — which forced a behaviour change
the swap did not originally intend. `planner_node` used to call the LLM outside its `try`, so
any API failure surfaced as an HTTP 500. On a paid key that was a rare outage; on a free tier a
429 is normal operation, so the planner now degrades to `DEFAULT_TOOLS` and logs why. The
planner is an optimisation, not a prerequisite — the pipeline produces a briefing without it.

The synthesizer deliberately still fails loudly: without it there is no Briefing to return, so
there is nothing to degrade *to*.
