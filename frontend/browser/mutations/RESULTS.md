# Results

## 01, 02

Date: 2026-09-25
Commit: `8b35f7093e47d471f62604d2dcd5dadc6179b554`
Run: `pnpm test:browser:mutants 01 02` (after fixing the runner's fake-kill/ENOENT/unchecked-rebuild
findings — see below)

```
┌─────────┬────────────────────────────────────┬──────────┬─────────────┐
│ (index) │ patch                              │ outcome  │ detail      │
├─────────┼────────────────────────────────────┼──────────┼─────────────┤
│ 0       │ '01-tailwind-content-no-lib.patch' │ 'killed' │ 'failed: 4' │
│ 1       │ '02-duration-arbitrary.patch'      │ 'killed' │ 'failed: 1' │
└─────────┴────────────────────────────────────┴──────────┴─────────────┘
```

Both mutants `killed`. Under mutant 01, exactly the 4 tests in its (now-scoped) `mustFail` failed:

- `the red-filled hero CTA takes the ink ring`
- `no focusable control on / paints Tailwind's default blue ring`
- `no focusable control on /teams paints Tailwind's default blue ring`
- `no focusable control on /tyres paints Tailwind's default blue ring`

`a flush control on base takes the red ring` passed (1 passed) under mutant 01, as expected — it
is no longer in `mustFail`; see `README.md` for why it stays in the suite as a guard without being
part of this mutant's kill condition.

**First run (2026-09-24) had mutant 01 `survived`.** `mustFail` originally listed both
`the red-filled hero CTA takes the ink ring` and `a flush control on base takes the red ring`. The
second title stayed passing under the mutation because `focus-visible:ring-f1-red` is also written
literally in `components/tyres/acts/tyre-archive.tsx` and `source-list.tsx`, both still inside
`content` with the mutation applied, so that rule is generated regardless of whether `lib/` is
scanned — only `focus-visible:ring-ink`, which appears nowhere outside `lib/focus.ts`, actually
goes missing. `mutants.json`'s `mustFail` for 01 was rescoped to the four titles that genuinely
depend on `lib/` being in `content` (commit `496fd3e`), which is why this run kills cleanly.

**Fix round 1 (2026-09-25, commit `8b35f70`).** Review found the runner itself could fake a kill:
it never checked for a global Playwright failure (webServer never booted, global setup crashed)
before trusting spec-level `ok`, so a uniform infra failure across every test could read as every
`mustFail` title failing "for the right reason." A missing/unparseable JSON report also threw
`ENOENT` out of the mutant loop, aborting the whole run — no table, later mutants skipped, final
rebuild never attempted — and the final clean-tree rebuild's own exit status was never checked.
`classifyMutant` now treats a report's top-level `errors` as its own `error` outcome (checked
first), only counts a title as a kill if it genuinely executed with status `failed`/`timedOut`,
wraps the report read in its own `try`/`catch` so a missing file becomes `error` and the `finally`
patch-revert still runs, and the final rebuild's failure now exits 1 with a clear message. The
table above is the re-run against the fixed runner; both mutants are still `killed`.
