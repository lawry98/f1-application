# Results

## 01, 02

Date: 2026-09-25
Commit: `496fd3e01ed8963ca459dd0b547eb0e707d1f1e6`
Run: `pnpm test:browser:mutants 01 02`

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
