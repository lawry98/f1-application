# Tool Trace Cache Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The briefing's Tool Trace shows which Tool results came from the result cache rather than a live fetch, on screen and to a screen reader.

**Architecture:** The backend already sends `cached` on every `tool_result`. The hook forwards it into `ToolResult`; `ToolTrace` adds a header count and a per-row `Cached` chip (visual, `aria-hidden`) while the row's existing `sr-only` outcome run gains ", from cache". A new captured SSE fixture (`cached.sse`) feeds the parser, hook and browser tests.

**Tech Stack:** Next.js 16 / React 19 / Tailwind, Vitest + RTL (jsdom), Playwright 1.63, FastAPI + pytest (fixture generator only).

**Spec:** `docs/superpowers/specs/2026-10-13-tool-trace-cache-visibility-design.md`

> **Superseded in the final review:** the chip moved onto the label line (not the row's last column) and `cached.sse` serves `get_championship_standings` as the cached tool, not `get_track_info` — the longest cacheable id truncated at 375px beside the chip. The spec is current; the tasks below are as executed before that fix.

## Global Constraints

- Frontend is **pnpm** via `mise exec -- pnpm …`; never npm. Backend venv is `backend/.venv`.
- `.sse` fixtures are real captured bytes: only `backend/scripts/dump_sse_fixtures.py` writes them. Never hand-edit.
- Chip text: `Cached`. Header suffix: `, N cached` (only when N ≥ 1). Screen-reader outcome: `Succeeded, from cache` / `Failed, from cache` when `cached === true`, else `Succeeded` / `Failed`.
- Only `cached === true` counts or renders; `undefined` and `false` render identically to today.
- Chip classes: `shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-[11px] font-medium text-zinc-300` — **no `bg-*`** (its glyphs must sit on the row composite the trace is already judged against).
- Chip is `aria-hidden="true"`; it is not a control (no tabindex, no `title`).
- Never use `sm:text-base` (theme colour token collision). Never `position or 0`-style guesses — not relevant here, just don't add backend behaviour.
- Browser runs only on **:3124** through an untracked temp config; never touch :3100.
- Gemini budget is 0: no live briefing runs.
- Commit after each task; `git push` after each commit (the SD500 volume can eject).
- `git add` explicit paths only — never `git add -A` (the temp Playwright config must stay untracked).

## Review Focus

1. **Every row cached** (a repeat briefing of a race whose plan had only cacheable tools) → header reads `N tools executed, N cached`, every row has a chip. Pinned in Task 2 (`counts every row when every result came from the cache`).
2. **`cached` absent on every row** (a saved example's `tools`, or an older server) → header and rows byte-identical to today, no "0 cached". Pinned in Task 2 (`leaves the header and rows as they were when no result came from the cache`), for both `undefined` and `false`.
3. **Narrow phone width (375px)** → chip must not push the row sideways or hide the raw id; page must not scroll horizontally. Pinned in Task 4 (both widths, and a `scrollWidth <= clientWidth` check).
4. **A failed result flagged cached** (impossible today, possible if the backend changes) → the visible chip and the spoken outcome must agree (`Failed, from cache`), never contradict. Pinned in Task 2 (`keeps the spoken outcome and the chip in agreement for a cached failure`).
5. **The trace still streaming** (header counts while tools land, before `complete`) → the count updates with each `tool_result`; the laurel branch renders the same string. Pinned in Task 2 (`says the same header with and without the laurel`).

---

### Task 1: Capture a cached run and carry the flag into the trace state

**Files:**
- Modify: `backend/scripts/dump_sse_fixtures.py` (the `main()` function)
- Create (generated): `frontend/tests/fixtures/cached.sse`
- Modify: `frontend/tests/fixtures/README.md` (the SSE section)
- Modify: `frontend/tests/sse.ts:1-5`
- Modify: `frontend/browser/support/api-mocks.ts:50` (`sseFixture`'s name union)
- Modify: `frontend/types/f1.ts:31-34` (`ToolResult`)
- Modify: `frontend/hooks/use-briefing.ts:183-185`
- Test: `frontend/tests/api.test.ts`, `frontend/tests/use-briefing.test.tsx`

**Interfaces:**
- Produces: `ToolResult { tool: string; success: boolean; cached?: boolean }` (exported from `@/types` via `types/f1.ts`); fixture name `'cached.sse'` accepted by `fixture()`/`fixtureText()` in `tests/sse.ts` and by `sseFixture()` in `browser/support/api-mocks.ts`. `cached.sse` contains exactly two `tool_result` events: `{"tool": "get_track_info", "success": true, "cached": true}` then `{"tool": "search_f1_news", "success": false, "cached": false}`.

- [ ] **Step 1: Add the capture to the generator**

In `backend/scripts/dump_sse_fixtures.py`, at the end of `main()`, after the `truncated.sse` dump:

```python
    # A repeat briefing for the same race: the track profile was served from the result cache
    # (ADR-0003) and the news search ran live — news is never cached — failing as it does in the
    # clean run. Everything else is the clean run, so a test can tell the two apart by `cached`.
    cached_steps = successful_steps()
    cached_steps[2]["tool_executor"]["tool_results"][0]["cached"] = True
    dump(FakeAgent(steps=cached_steps, deltas=successful_deltas()), "cached.sse")
```

- [ ] **Step 2: Regenerate and check only the new file appears**

Run: `cd backend && .venv/bin/python scripts/dump_sse_fixtures.py && cd .. && git status --short frontend/tests/fixtures && grep -n '"cached"' frontend/tests/fixtures/cached.sse`
Expected: `?? frontend/tests/fixtures/cached.sse` only (clean.sse and truncated.sse unchanged — if either shows `M`, stop: the generator drifted and that is a separate problem). grep shows `get_track_info … "cached": true` and `search_f1_news … "cached": false`.

- [ ] **Step 3: Register the fixture in both harnesses**

`frontend/tests/sse.ts` top becomes:

```ts
import cachedSse from './fixtures/cached.sse?raw';
import cleanSse from './fixtures/clean.sse?raw';
import truncatedSse from './fixtures/truncated.sse?raw';

const FIXTURES = { 'cached.sse': cachedSse, 'clean.sse': cleanSse, 'truncated.sse': truncatedSse };
```

`frontend/browser/support/api-mocks.ts` line 50:

```ts
export function sseFixture(name: 'cached.sse' | 'clean.sse' | 'truncated.sse'): string {
```

In `frontend/tests/fixtures/README.md`, change the first sentence of the SSE section from "`clean.sse` and `truncated.sse` are" to "`clean.sse`, `truncated.sse` and `cached.sse` are", and add after the regenerate code block:

```markdown
`cached.sse` is the clean run with `get_track_info` served from the result cache — the shape of
a repeat briefing for the same race — so the tool trace's cache marking is tested against bytes
the route really serves.
```

- [ ] **Step 4: Write the failing parser test**

Append inside the `describe.each(CHUNK_SIZES, …)` block in `frontend/tests/api.test.ts` (after `preserves newlines inside delta content`):

```ts
  it('carries each tool result’s cached flag as the route serves it', async () => {
    // `cached.sse` is a repeat run: the track profile came from the result cache, the news
    // search ran live. Both values are pinned, so a parser that defaulted the flag either way
    // fails on one of them.
    const events = await collect('cached.sse', chunkSize);

    expect(events.filter((e) => e.type === 'tool_result').map((e) => e.data)).toEqual([
      { tool: 'get_track_info', success: true, cached: true },
      { tool: 'search_f1_news', success: false, cached: false },
    ]);
  });
```

- [ ] **Step 5: Write the failing hook test**

Append inside `describe('other events', …)` in `frontend/tests/use-briefing.test.tsx`, after the first `it`:

```ts
  it('keeps each tool’s cached flag in the trace, as the route served it', async () => {
    // The real repeat-run bytes rather than hand-built frames: the flag has to survive from the
    // wire into `toolTrace`, and the hook used to rebuild each entry from `tool` and `success`
    // alone, dropping it. `toStrictEqual` because `toEqual` treats a missing key as `undefined`
    // and would pass a dropped `cached: false`.
    const feed = new ChunkFeed();
    const { result, submit } = start(feed);
    await submit('Monaco');

    feed.push(fixtureText('cached.sse'));
    feed.close();
    await settle();

    expect(result.current.toolTrace).toStrictEqual([
      { tool: 'get_track_info', success: true, cached: true },
      { tool: 'search_f1_news', success: false, cached: false },
    ]);
  });
```

- [ ] **Step 6: Run both, see the hook test fail**

Run: `cd frontend && mise exec -- pnpm vitest run tests/api.test.ts tests/use-briefing.test.tsx`
Expected: the api test PASSES already (the parser forwards the payload whole — that is fine, it pins the fixture contract); the hook test FAILS: received entries lack `cached`.

- [ ] **Step 7: Add the field and forward it**

`frontend/types/f1.ts`, replace the `ToolResult` interface:

```ts
export interface ToolResult {
  tool: string;
  success: boolean;
  /**
   * Whether this result was served from the backend's result cache (ADR-0003) rather than fetched
   * on this run. Absent is no claim either way — a saved example's capture records none, and the
   * visit showing it fetched nothing — so only `true` is ever rendered.
   */
  cached?: boolean;
}
```

`frontend/hooks/use-briefing.ts`, the `tool_result` branch:

```ts
          } else if (event.type === 'tool_result') {
            tools.push({
              tool: event.data.tool,
              success: event.data.success,
              cached: event.data.cached,
            });
            setToolTrace([...tools]);
```

- [ ] **Step 8: Run the touched suites**

Run: `cd frontend && mise exec -- pnpm vitest run tests/api.test.ts tests/use-briefing.test.tsx`
Expected: all PASS. (The older `surfaces the race name…` test uses `toEqual`, which ignores the now-present `cached: undefined`; leave it.)

- [ ] **Step 9: Typecheck and commit**

Run: `cd frontend && mise exec -- pnpm typecheck`
Expected: no errors.

```bash
git add backend/scripts/dump_sse_fixtures.py frontend/tests/fixtures/cached.sse frontend/tests/fixtures/README.md frontend/tests/sse.ts frontend/browser/support/api-mocks.ts frontend/types/f1.ts frontend/hooks/use-briefing.ts frontend/tests/api.test.ts frontend/tests/use-briefing.test.tsx
git commit -m "feat(briefing): keep each tool result's cached flag in the trace state"
git push
```

---

### Task 2: Render the cache provenance in the tool trace

**Files:**
- Modify: `frontend/components/briefing/tool-trace.tsx` (heading, row, doc comment)
- Test: `frontend/tests/tool-trace.test.tsx`

**Interfaces:**
- Consumes: `ToolResult.cached?: boolean` from Task 1.
- Produces: header text `Agent Tool Trace (N tools executed, M cached)` when M ≥ 1; a `<span aria-hidden="true">Cached</span>` chip as the last child of each cached `<li>`; the row's `sr-only` run text `<Outcome>, from cache` for cached rows. Task 4's browser spec relies on all three.

- [ ] **Step 1: Write the failing tests**

In `frontend/tests/tool-trace.test.tsx`, change the RTL import to include `within`:

```ts
import { fireEvent, render, screen, within } from '@testing-library/react';
```

Below the `TOOLS` constant add:

```ts
/**
 * A repeat run: one cacheable tool served from the result cache, one fetched live, one failed
 * live. Counts asserted below are derived from it, never restated.
 */
const CACHED_TOOLS: ToolResult[] = [
  { tool: 'get_track_info', success: true, cached: true },
  { tool: 'get_circuit_winners', success: true, cached: false },
  { tool: 'search_f1_news', success: false, cached: false },
];

const cachedCount = (tools: ToolResult[]): number => tools.filter((t) => t.cached === true).length;
```

Append a new `describe` at the end of the file:

```ts
describe('ToolTrace cache provenance', () => {
  it('says how many results came from the cache, in the name of the toggle', () => {
    // The trace opens collapsed, so the header is the only place a reader sees provenance
    // without clicking — and it is the button's accessible name, so a screen reader hears it on
    // the collapsed control too.
    render(<ToolTrace tools={CACHED_TOOLS} />);

    expect(
      screen.getByRole('button', {
        name: `Agent Tool Trace (${CACHED_TOOLS.length} tools executed, ${cachedCount(CACHED_TOOLS)} cached)`,
      }),
    ).toBeInTheDocument();
  });

  it('counts every row when every result came from the cache', () => {
    const all = CACHED_TOOLS.map((t) => ({ ...t, success: true, cached: true }));
    render(<ToolTrace tools={all} />);
    expand();

    expect(
      screen.getByRole('button', {
        name: `Agent Tool Trace (${all.length} tools executed, ${all.length} cached)`,
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Cached')).toHaveLength(all.length);
  });

  it.each([
    ['absent', TOOLS],
    ['false', TOOLS.map((t) => ({ ...t, cached: false }))],
  ])(
    'leaves the header and rows as they were when no result came from the cache (cached %s)',
    (_, tools) => {
      // No "0 cached" on every first briefing, and no claim at all where the flag is absent — a
      // saved example's tools carry none, and its visit fetched nothing.
      render(<ToolTrace tools={tools} />);
      expect(screen.getByRole('button').textContent).toBe(
        `Agent Tool Trace (${tools.length} tools executed)▶`,
      );
      expand();
      expect(screen.queryByText('Cached')).toBeNull();
      expect(screen.queryByText(/from cache/)).toBeNull();
    },
  );

  it('marks exactly the cached rows with a Cached chip', () => {
    render(<ToolTrace tools={CACHED_TOOLS} />);
    expand();

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(CACHED_TOOLS.length);
    CACHED_TOOLS.forEach((tool, i) => {
      const chip = within(rows[i]!).queryByText('Cached', { exact: true });
      if (tool.cached === true) expect(chip, `${tool.tool} is cached`).not.toBeNull();
      else expect(chip, `${tool.tool} was fetched live`).toBeNull();
    });
  });

  it('tells a screen reader in the row’s one outcome run, and hides the chip that restates it', () => {
    /*
     * One accessible outcome per row, read label → outcome → raw id: "Track profile, Succeeded,
     * from cache, get_track_info". An accessible chip at the row's end would be read after the
     * raw id, split from the outcome it qualifies — so the chip is `aria-hidden` and the `sr-only`
     * run says it, the same split the status marks already make.
     */
    render(<ToolTrace tools={CACHED_TOOLS} />);
    expand();

    const [cached, live, failed] = screen.getAllByRole('listitem');
    expect(within(cached!).getByText('Succeeded, from cache')).toHaveClass('sr-only');
    expect(within(live!).getByText('Succeeded')).toHaveClass('sr-only');
    expect(within(failed!).getByText('Failed')).toHaveClass('sr-only');

    const chip = within(cached!).getByText('Cached', { exact: true });
    expect(chip.closest('[aria-hidden="true"]')).not.toBeNull();
    // Not a control: nothing to focus, so no ring to prove.
    expect(chip.closest('button, a, [tabindex]')).toBeNull();
  });

  it('keeps the spoken outcome and the chip in agreement for a cached failure', () => {
    // A cache hit is always a success today (`_invoke_with_cache` stores only successes), but
    // the trace renders what the server said; if the two ever disagree on screen and in speech,
    // one of them is lying.
    render(<ToolTrace tools={[{ tool: 'get_track_info', success: false, cached: true }]} />);
    expand();

    expect(screen.getByText('Failed, from cache')).toHaveClass('sr-only');
    expect(screen.getByText('Cached', { exact: true })).toBeInTheDocument();
  });

  it('says the same header with and without the laurel', () => {
    const { unmount } = render(<ToolTrace tools={CACHED_TOOLS} />);
    const streaming = screen.getByRole('button').textContent;
    unmount();
    render(<ToolTrace tools={CACHED_TOOLS} complete />);

    expect(screen.getByRole('button').textContent).toBe(streaming);
    expect(streaming).toContain(`, ${cachedCount(CACHED_TOOLS)} cached)`);
  });

  it('paints the chip on the row composite, and keeps it readable there', () => {
    render(<ToolTrace tools={CACHED_TOOLS} complete />);
    expand();
    const chip = screen.getByText('Cached', { exact: true });

    // The premise of judging it at ROW_BACKDROP: a fill of its own would be a fourth layer, and
    // measuring the right colour against the wrong background is the failure CLAUDE.md records.
    expect(Array.from(chip.classList).filter((c) => c.startsWith('bg-'))).toEqual([]);

    const neutrals = restingTextNeutrals(screen.getByRole('button').parentElement!);
    // Header label + chevron, each row's label and raw id, and one chip per cached row.
    expect(neutrals).toHaveLength(2 + 2 * CACHED_TOOLS.length + cachedCount(CACHED_TOOLS));
    for (const { hex, text } of neutrals) {
      expect(
        contrastRatio(hex, ROW_BACKDROP),
        `"${text}" at ${hex} over the row wash`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });
});
```

Note on `textContent` in the `it.each`: the button's text is the heading plus the `▶` chevron (collapsed). If the existing markup puts whitespace between them, use `toBe` against what `textContent` really yields on the *unchanged* component — check with one quick run before Step 3; the assertion's point is "exactly today's string", so pin today's.

- [ ] **Step 2: Run, see them fail**

Run: `cd frontend && mise exec -- pnpm vitest run tests/tool-trace.test.tsx`
Expected: the `it.each` header test PASSES (today's behaviour); every other new test FAILS (no suffix, no chip, no ", from cache").

- [ ] **Step 3: Implement in `tool-trace.tsx`**

Replace the `heading` construction:

```tsx
  /*
   * Only `true` counts. `cached` is absent where no claim can be made — a saved example's capture
   * records none — and "0 cached" on every first briefing would be noise, so the suffix appears
   * only when at least one result was served from the cache.
   */
  const cachedCount = tools.filter((tool) => tool.cached === true).length;

  // Built once and rendered through one of two branches, so the string is provably identical
  // whether or not the laurel is there — a completed run must not silently re-word its own header.
  const heading = (
    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-300">
      Agent Tool Trace ({tools.length} tools executed
      {cachedCount > 0 && `, ${cachedCount} cached`})
    </span>
  );
```

JSX whitespace check: a line break between `executed` and `{cachedCount…}` collapses to nothing in JSX (a newline with only whitespace between text and an expression is removed), so this renders `executed, 1 cached)` and `executed)`. Verify via the tests, not by eye.

In the row, replace the `sr-only` span and add the chip after the `<div className="min-w-0 flex-1">…</div>`:

```tsx
                <span className="sr-only">
                  {tool.success ? 'Succeeded' : 'Failed'}
                  {tool.cached === true && ', from cache'}
                </span>
```

```tsx
              </div>
              {tool.cached === true && (
                /*
                 * Served from the result cache (ADR-0003) rather than fetched on this run. A
                 * picture of what the `sr-only` run above already says, so `aria-hidden` — read at
                 * the row's end it would follow the raw id, split from the outcome it qualifies.
                 * No fill on purpose: its glyphs sit on the row wash every run here is judged
                 * against, and `zinc-300` clears 4.5:1 there with room. Live rows carry no chip:
                 * the hit is the exception worth reading, and a "Live" chip on every first briefing
                 * would teach the reader to ignore this one.
                 */
                <span
                  aria-hidden="true"
                  className="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-[11px] font-medium text-zinc-300"
                >
                  Cached
                </span>
              )}
            </li>
```

Note: `sr-only`'s two children render as adjacent text nodes, so `getByText('Succeeded, from cache')` matches (RTL joins an element's text). Do **not** put a space between them.

Update the `ToolTrace` doc comment: append one paragraph after the "Contrast…" paragraph:

```
 * **Cache provenance.** A row served from the result cache carries a `Cached` chip and its
 * outcome run says ", from cache"; the header counts them. Only `cached === true` is rendered —
 * absent is no claim, which is what a saved example's tools carry.
```

- [ ] **Step 4: Run the file**

Run: `cd frontend && mise exec -- pnpm vitest run tests/tool-trace.test.tsx`
Expected: all PASS, old and new.

- [ ] **Step 5: Whole frontend unit suite, lint, typecheck**

Run: `cd frontend && mise exec -- pnpm typecheck && mise exec -- pnpm lint && mise exec -- pnpm test`
Expected: all green. If `briefing-chat.test.tsx` or `landing-hero.test.tsx` pinned the old header string with a regex that the clean fixture still satisfies, nothing changes there (clean.sse has no cached rows).

- [ ] **Step 6: Commit**

```bash
git add frontend/components/briefing/tool-trace.tsx frontend/tests/tool-trace.test.tsx
git commit -m "feat(briefing): mark cached tool results in the trace, and count them in its header"
git push
```

---

### Task 3: Docs

**Files:**
- Modify: `README.md` (the `tool_result carries cached` bullet, ~line 299)
- Modify: `CONTEXT.md` (the **Tool Trace** entry)

- [ ] **Step 1: README**

Replace:

```
- `tool_result` carries `cached`, saying whether that tool's payload came from the result cache
  or a live fetch. Nothing in the UI renders it yet — the field exists so the transport stays
  honest about provenance
```

with:

```
- `tool_result` carries `cached`, saying whether that tool's payload came from the result cache
  or a live fetch. The tool trace marks each cached row `Cached` (its screen-reader outcome reads
  "Succeeded, from cache") and counts them in its header; a row without the mark was fetched on
  this run
```

- [ ] **Step 2: CONTEXT.md**

Replace:

```
**Tool Trace** — the record of which Tools ran and whether each succeeded, surfaced to the
user. Deliberately excludes the data the Tools returned.
```

with:

```
**Tool Trace** — the record of which Tools ran, whether each succeeded, and whether its result
came from the cache rather than a live fetch, surfaced to the user. Deliberately excludes the
data the Tools returned.
```

- [ ] **Step 3: Commit**

```bash
git add README.md CONTEXT.md
git commit -m "docs: the tool trace now renders each result's cache provenance"
git push
```

---

### Task 4: Browser proof — the chip paints, reads and fits

**Files:**
- Create: `frontend/browser/tool-trace-cache.spec.ts`
- Temp, untracked, never committed: `frontend/playwright.port-3124.tmp.config.ts`

**Interfaces:**
- Consumes: `sseFixture('cached.sse')`, `mockBriefingStreams` (Task 1); header text, chip and `sr-only` wording (Task 2).

- [ ] **Step 1: Temp config on :3124**

`frontend/playwright.port-3124.tmp.config.ts`:

```ts
import base from './playwright.config';

export default {
  ...base,
  use: { ...base.use, baseURL: 'http://localhost:3124' },
  webServer: { ...base.webServer, command: 'pnpm start --port 3124', url: 'http://localhost:3124' },
};
```

Confirm `git status --short` shows it as `??` and never stage it.

- [ ] **Step 2: Write the spec**

`frontend/browser/tool-trace-cache.spec.ts`:

```ts
import AxeBuilder from '@axe-core/playwright';

import { mockBriefingStreams, sseFixture } from './support/api-mocks';
import { AA_SMALL_TEXT, expectContrast } from './support/contrast';
import { findInvisibleText } from './support/invisible-text';
import { waitForMotionToSettle } from './support/motion';
import { waitForMain } from './support/page-content';
import { expect, test } from './support/test';

const WCAG_A_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * A repeat briefing, as the route serves it (`cached.sse`): the track profile came from the
 * result cache, the news search ran live. jsdom can see that the chip exists and is `zinc-300`;
 * only a browser can see what is actually behind its glyphs — the row wash over the panel wash
 * over the topo texture — and whether a 375px row still fits it.
 */
for (const width of [375, 1440]) {
  test(`a repeat briefing at ${width}px marks the cached tool, says how many, and the chip reads`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockBriefingStreams(page, [sseFixture('cached.sse')]);
    await page.goto('/briefing');
    await waitForMain(page);
    await page.getByLabel('Circuit name').fill('Monaco');
    await page.getByRole('button', { name: 'Generate', exact: true }).click();

    const toggle = page.getByRole('button', {
      name: 'Agent Tool Trace (2 tools executed, 1 cached)',
      exact: true,
    });
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const list = page.locator(`[id="${await toggle.getAttribute('aria-controls')}"]`);
    const cachedRow = list.getByRole('listitem').filter({ hasText: 'get_track_info' });
    const liveRow = list.getByRole('listitem').filter({ hasText: 'search_f1_news' });
    const chip = cachedRow.getByText('Cached', { exact: true });
    await expect(chip).toBeVisible();
    await expect(liveRow.getByText('Cached', { exact: true })).toHaveCount(0);

    // What a screen reader gets: the outcome run says it, the chip that restates it is hidden.
    const tree = await list.ariaSnapshot();
    expect(tree).toContain('Succeeded, from cache');
    expect(tree).not.toContain('Cached');

    await list.scrollIntoViewIfNeeded();
    await waitForMotionToSettle(page);

    // The chip must not widen a phone-width row past the viewport.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'horizontal page scroll').toBeLessThanOrEqual(0);

    // Page-wide sweeps before `expectContrast`, which hides and restores glyphs.
    const invisible = await findInvisibleText(page);
    expect(invisible.map((t) => `"${t.text}" ${t.color} on ${t.backdrop}`)).toEqual([]);
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG_A_AA).analyze();
    expect(
      violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    ).toEqual([]);

    await expectContrast(chip, {
      atLeast: AA_SMALL_TEXT,
      site: 'tool trace Cached chip over the row wash on the topo page',
    });
  });
}
```

- [ ] **Step 3: Prove it red without Task 2**

Never `git stash` (the stash stack is shared with other sessions). Instead, with `<task1-sha>` from `git log --oneline` (Task 1's commit):

```bash
cd frontend
git checkout <task1-sha> -- components/briefing/tool-trace.tsx
mise exec -- pnpm build
mise exec -- pnpm exec playwright test -c playwright.port-3124.tmp.config.ts browser/tool-trace-cache.spec.ts
git checkout HEAD -- components/briefing/tool-trace.tsx
```

Expected: FAIL at the toggle (no button named "…, 1 cached)"). Record the failure line.

Then prove the contrast assertion bites: temporarily change the chip's `text-zinc-300` to `text-zinc-600`, rebuild, run the spec, expect FAIL in `expectContrast` with a ratio under 4.5 named "tool trace Cached chip…", then `git checkout HEAD -- frontend/components/briefing/tool-trace.tsx`. Record the failure line. `git status` must show the component clean afterwards.

- [ ] **Step 4: Green on the real tree**

Run: `cd frontend && mise exec -- pnpm build && mise exec -- pnpm exec playwright test -c playwright.port-3124.tmp.config.ts browser/tool-trace-cache.spec.ts browser/focus-rings.spec.ts`
Expected: both widths PASS; the tool-trace toggle ring test in `focus-rings.spec.ts` still PASSES (its name regex `^Agent Tool Trace` is unaffected).

- [ ] **Step 5: Commit**

```bash
git add frontend/browser/tool-trace-cache.spec.ts
git commit -m "test(browser): the tool trace's Cached chip paints, reads and fits at 375 and 1440"
git push
```

---

## After the tasks (controller, not a subagent)

- Full local CI: `ruff check .`, `ruff format --check .`, `pytest` (backend); `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` (frontend); the whole browser suite on the :3124 config.
- `git fetch && git merge origin/main`; if `lc/example-briefings` landed, add a test that a saved example's trace renders no chip and no count (decision 8), and confirm `example.tools` carries no `cached`.
- Delete the temp config before finishing; it must never be committed.
