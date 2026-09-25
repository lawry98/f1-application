#!/usr/bin/env node
/**
 * Proves the browser harness still catches the defects it exists for.
 *
 * For each entry in browser/mutations/mutants.json: apply the patch, rebuild, run the named
 * specs, and require every title in `mustFail` to fail. Then reverse the patch. A mutant is
 * "killed" only if *those tests* failed. A red run caused by something else (the server did
 * not start, an unrelated spec) does not count, because that is a fake kill.
 *
 *   node scripts/run-mutants.mjs            # every mutant
 *   node scripts/run-mutants.mjs 03 05      # by patch-name prefix
 *
 * Exit 0 only if every selected mutant was killed. Outcomes other than `killed`:
 *   survived     the harness passed with the defect in place: coverage is gone
 *   stale        the patch no longer applies: regenerate it (browser/mutations/README.md)
 *   build-failed the mutant does not compile: the patch needs adapting, not deleting
 *   error        the run itself is not trustworthy (a global Playwright error, or no readable
 *                report — e.g. the webServer never booted): says nothing about the mutant
 *
 * Outside CI it rebuilds the clean tree at the end, so the next `pnpm test:browser` does not
 * run against the last mutant's bundle.
 *
 * `classifyMutant` is exported so it can be exercised directly, against a hand-built report,
 * without running the driver logic below it: everything past the `isMain` guard only runs when
 * this file is executed as a script, not when it is imported.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Classifies one mutant's run from its Playwright JSON report.
 *
 * `killed` only if every `mustFail` title genuinely executed and failed — a title that never ran
 * (skipped, interrupted, or simply absent from the report) does not count as a kill, and neither
 * does a report carrying a top-level `errors` entry. That entry is how a global failure shows up
 * (the webServer never booted, a global setup crashed): every test can fail identically for a
 * reason that has nothing to do with the mutant, which would otherwise read as every `mustFail`
 * title failing "for the right reason."
 */
export function classifyMutant(report, mustFail) {
  const globalErrors = report.errors ?? [];
  if (globalErrors.length > 0) {
    return { outcome: 'error', detail: `global error: ${globalErrors[0]?.message ?? 'unknown'}` };
  }

  /** title -> the status of its last executed attempt (retries overwrite earlier attempts). */
  const executed = new Map();
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const results = test.results ?? [];
        const last = results[results.length - 1];
        if (last) executed.set(spec.title, last.status);
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites ?? []) walk(suite);

  const ran = (status) => status === 'failed' || status === 'timedOut';
  const failed = [...executed.entries()].filter(([, status]) => ran(status)).map(([title]) => title);
  const missing = mustFail.filter((title) => !ran(executed.get(title)));

  return missing.length === 0
    ? { outcome: 'killed', detail: `failed: ${failed.length}` }
    : { outcome: 'survived', detail: `still passing: ${missing.join(' | ')}` };
}

const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: frontend, encoding: 'utf8' }).trim();
  const mutationsDir = path.join(frontend, 'browser', 'mutations');
  const all = JSON.parse(readFileSync(path.join(mutationsDir, 'mutants.json'), 'utf8'));

  const prefixes = process.argv.slice(2);
  const selected = prefixes.length ? all.filter((m) => prefixes.some((p) => m.patch.startsWith(p))) : all;
  if (selected.length === 0) {
    console.error(`run-mutants: no mutant matches ${prefixes.join(', ')}`);
    process.exit(2);
  }

  const git = (args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  const run = (cmd, args, env = {}) =>
    spawnSync(cmd, args, { cwd: frontend, stdio: 'inherit', env: { ...process.env, ...env } }).status;

  if (git(['status', '--porcelain']).trim() !== '') {
    console.error('run-mutants: the working tree is dirty; commit or set work aside first.');
    process.exit(2);
  }

  const scratch = mkdtempSync(path.join(tmpdir(), 'run-mutants-'));
  const results = [];

  for (const mutant of selected) {
    const patch = path.join(mutationsDir, mutant.patch);
    console.log(`\n=== ${mutant.patch}\n    ${mutant.reintroduces}\n`);
    try {
      git(['apply', '--check', patch]);
    } catch {
      results.push({ patch: mutant.patch, outcome: 'stale', detail: 'git apply --check failed' });
      continue;
    }
    git(['apply', patch]);
    try {
      if (run('pnpm', ['build']) !== 0) {
        results.push({ patch: mutant.patch, outcome: 'build-failed', detail: '' });
        continue;
      }
      const reportPath = path.join(scratch, `${mutant.patch}.json`);
      run('pnpm', ['exec', 'playwright', 'test', ...mutant.specs, '--retries=0', '--reporter=line,json'], {
        PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath,
      });
      try {
        const report = JSON.parse(readFileSync(reportPath, 'utf8'));
        results.push({ patch: mutant.patch, ...classifyMutant(report, mutant.mustFail) });
      } catch (err) {
        results.push({ patch: mutant.patch, outcome: 'error', detail: `no readable report: ${err.message}` });
      }
    } finally {
      git(['apply', '-R', patch]);
    }
  }

  console.log('\n');
  console.table(results);

  if (!process.env.CI) {
    console.log('Rebuilding the unmutated tree so .next matches the source again.');
    if (run('pnpm', ['build']) !== 0) {
      console.error('run-mutants: the clean-tree rebuild failed; .next may not match source. Run `pnpm build` manually.');
      process.exit(1);
    }
  }

  process.exit(results.every((r) => r.outcome === 'killed') ? 0 : 1);
}
