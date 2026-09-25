# Mutants

Each patch puts back one defect CLAUDE.md records as having shipped green. `mutants.json` pairs
it with the tests that must fail. `pnpm test:browser:mutants` proves that they still do.

A mutant that **survives** means the harness has stopped covering that class. Fix the spec, not
the manifest.

The runner first builds the clean tree and runs the selected mutants' specs once. If that
**baseline fails** it runs no mutant: a spec already red on the clean tree would fake every kill.

**Mutant 01's `mustFail` doesn't include `a flush control on base takes the red ring`.** That test
stays in `focus-rings.spec.ts` as a guard on the "flush" ring colour itself, but it can't prove
"is `lib/` in `content`": `focus-visible:ring-f1-red` is also written literally in
`components/tyres/acts/tyre-archive.tsx` and `source-list.tsx`, both still inside `content` even
with the mutation applied, so that rule is generated either way. Only `focus-visible:ring-ink`,
which appears nowhere outside `lib/focus.ts`, actually goes missing under this mutation.

A **stale** patch means the code it edits has moved. Regenerate it; never delete it:

```bash
# from the repo root, on a clean tree
$EDITOR frontend/<the file named in the patch>     # reintroduce the defect by hand
git diff -- frontend/<file> > frontend/browser/mutations/<same name>.patch
git checkout -- frontend/<file>
cd frontend && pnpm test:browser:mutants <prefix>
```
