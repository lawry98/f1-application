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
 *
 * Outside CI it rebuilds the clean tree at the end, so the next `pnpm test:browser` does not
 * run against the last mutant's bundle.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

/** Titles of failed tests in a Playwright JSON report. */
function failedTitles(reportPath) {
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const failed = [];
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) if (!spec.ok) failed.push(spec.title);
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites ?? []) walk(suite);
  return failed;
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
    const failed = failedTitles(reportPath);
    const missing = mutant.mustFail.filter((title) => !failed.includes(title));
    results.push({
      patch: mutant.patch,
      outcome: missing.length === 0 ? 'killed' : 'survived',
      detail: missing.length === 0 ? `failed: ${failed.length}` : `still passing: ${missing.join(' | ')}`,
    });
  } finally {
    git(['apply', '-R', patch]);
  }
}

console.log('\n');
console.table(results);

if (!process.env.CI) {
  console.log('Rebuilding the unmutated tree so .next matches the source again.');
  run('pnpm', ['build']);
}

process.exit(results.every((r) => r.outcome === 'killed') ? 0 : 1);
