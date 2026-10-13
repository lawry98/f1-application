# Tool trace: show which results came from the cache

**Date:** 2026-10-13 · **Status:** approved (autonomous run — every decision below was taken by
the agent under the user's pre-approval, with the question, the choice and the reason recorded)

## Goal

The briefing's Tool Trace says which Tool results were served from the result cache
(ADR-0003) rather than fetched live — on screen and to a screen reader.

## What exists

- The backend already sends it. `tool_executor_node` writes `cached` on every `tool_result`
  (`backend/agent/graph.py`), the route forwards it, and `lib/api.ts` types it as
  `cached?: boolean`.
- `hooks/use-briefing.ts` drops it: it pushes `{ tool, success }` into the trace.
  `ToolResult` (`types/f1.ts`) has no field for it.
- A cache hit is always a success — `_invoke_with_cache` stores only successes — and weather and
  news are never cached. A repeat briefing for the same race reports most rows cached; a first one
  reports none.
- README: "Nothing in the UI renders it yet".

## Decisions

| # | Question | Choice | Why |
|---|---|---|---|
| 1 | Mark cached rows only, or label every row live/cached? | Cached rows only. | The cache hit is the exception worth reading. A first briefing would carry a "Live" chip on every row, and weather/news on every briefing — noise that teaches the reader to ignore the chip. In a live run every row carries the flag, so a row without the chip *is* a live fetch. |
| 2 | Summarise? | Yes, in the header: `Agent Tool Trace (6 tools executed, 4 cached)`. Suffix only when ≥ 1 is cached; otherwise the header is unchanged. | The trace opens collapsed, so per-row chips alone are invisible until someone clicks. The header is the toggle's accessible name, so the summary reaches a screen reader on the collapsed button too. "0 cached" on every first briefing is noise. |
| 3 | Wording | Chip: `Cached`. Header: `N cached`. Screen-reader outcome run: `Succeeded, from cache`. | One term on screen ("cached"), matching the README and the `cached` field the trace is a debugging surface for. Spoken, "from cache" says where the data came from more plainly than an adjective does. |
| 4 | Where does the chip sit, and who announces it? | Right edge of the row, `aria-hidden`; the row's existing `sr-only` outcome run carries it (`Succeeded` → `Succeeded, from cache`). | The file's own rule: one accessible outcome run per row, in label → outcome → raw id order, and visible marks that restate it are hidden. An accessible chip at the row's end would be read after the raw id ("…get_track_info, Cached"), split from the outcome it qualifies. |
| 5 | Is the chip a control? | No — plain text, no tooltip, no `title`. | Nothing to do on it; a `title` is not reliably announced. So no focus ring is needed. The toggle's existing ring is untouched. |
| 6 | Chip style, and what is behind its text? | House chip from `landing-hero.tsx`: `rounded-full border border-white/15`, **no fill**, `text-[11px] font-medium text-zinc-300`. | No fill means the glyphs sit on exactly the row composite the trace already judges every run against (`#212124` topo page → 3 % panel wash → 2 % row wash, `#2c2c2f`). One backdrop, no new layer to mis-measure. `zinc-300` clears 4.5:1 there with room. Neutral, not tinted: the word carries the meaning, so no hue is needed and none can fail a colour-blind reader. |
| 7 | What does `cached` look like in state? | `ToolResult.cached?: boolean`, forwarded verbatim from the event. Chip and count iff `cached === true`. | The transport field is optional; absent means "no provenance claim", not "live". A cached failure cannot happen today and gets no special case — the trace renders what the server said. |
| 8 | Saved examples (`lc/example-briefings`, if on main at the final merge) render `ToolTrace` from `example.tools`. What does the chip say there? | Nothing: the captured `tools` carry no `cached`, so no chip and no count. If they ever do, strip it at the example's boundary rather than render it. | An example's provenance is its capture, which its own label states. This visit fetched nothing, so neither "cached" nor "live" is true of it, and the capture run's cache state describes a moment the reader never saw. |
| 9 | Show it in the loader (`briefing-loader.tsx`) too? | No. | The goal names the trace, which is the run's record; the loader is transient. Out of lane. |

## Changes

- `frontend/types/f1.ts` — `ToolResult` gains `cached?: boolean` with a doc comment (absent = no
  claim).
- `frontend/hooks/use-briefing.ts` — forward `event.data.cached`.
- `frontend/components/briefing/tool-trace.tsx` — header suffix, row chip, `sr-only` wording.
- `backend/scripts/dump_sse_fixtures.py` — a third capture, `cached.sse`: the clean run with
  `get_track_info` served from cache (the realistic repeat: a cacheable tool hit, news live and
  failed). Regenerated, never hand-edited.
- `frontend/tests/sse.ts`, `frontend/browser/support/api-mocks.ts` — accept `cached.sse`.
- Docs: README's "Nothing in the UI renders it yet"; CONTEXT.md's Tool Trace entry gains "and
  whether its result came from the cache"; `tests/fixtures/README.md` lists `cached.sse`.

## Tests (each proven red without the change)

- **Vitest, `tool-trace.test.tsx`:** chip on exactly the cached rows; `sr-only` run reads
  `Succeeded, from cache` there and `Succeeded` elsewhere; chip is `aria-hidden`; header suffix
  counts `cached === true` only and is absent at zero and for `cached` undefined; the
  resting-neutral contrast sweep includes the chip (judged at the row composite).
- **Vitest, `api.test.ts`:** `cached.sse` parses to a `tool_result` with `cached: true`.
- **Vitest, `use-briefing.test.tsx`:** the flag survives from the stream into `toolTrace`.
- **Browser, `tool-trace-cache.spec.ts`:** serve `cached.sse` on `/briefing`, generate, expand
  the trace, `waitForMotionToSettle`, then: header summary visible, chip visible on the cached row
  only, `expectContrast(chip, { atLeast: AA_SMALL_TEXT, site })`, axe and `findInvisibleText`
  clean on the expanded panel. Proven red by running it against the tree without the chip and with
  a deliberately low-contrast chip.

## Out of scope

Loader changes; a "Live" label; tooltips; cache age/expiry display; any backend behaviour change.
