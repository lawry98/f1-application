# Mutants

Each patch puts back one defect CLAUDE.md records as having shipped green. `mutants.json` pairs
it with the tests that must fail. `pnpm test:browser:mutants` proves that they still do.

A mutant that **survives** means the harness has stopped covering that class. Fix the spec, not
the manifest.

A **stale** patch means the code it edits has moved. Regenerate it; never delete it:

```bash
# from the repo root, on a clean tree
$EDITOR frontend/<the file named in the patch>     # reintroduce the defect by hand
git diff -- frontend/<file> > frontend/browser/mutations/<same name>.patch
git checkout -- frontend/<file>
cd frontend && pnpm test:browser:mutants <prefix>
```
