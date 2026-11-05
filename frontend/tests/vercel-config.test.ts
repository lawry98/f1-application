import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guards for files only Vercel reads, so nothing else in the suite would notice an edit to them.
// Why each value is what it is: docs/adr/0005-deploy-on-fly-and-vercel.md and the deployment
// spec's "Revalidated 2026-10-13" section (R3, R4).

const FRONTEND = resolve(__dirname, '..');
const readJson = (file: string) => JSON.parse(readFileSync(resolve(FRONTEND, file), 'utf8'));
const vercel = readJson('vercel.json');
const pkg = readJson('package.json');

/** mise.toml's `[tools]` entries that are plain `name = "version"` strings, names bare or quoted. */
function miseTools(): Record<string, string> {
  const tools: Record<string, string> = {};
  let table = '';
  for (const line of readFileSync(resolve(FRONTEND, '../mise.toml'), 'utf8').split('\n')) {
    const [, header] = /^\s*\[([^\]]+)\]/.exec(line) ?? [];
    const [, name, version] = /^\s*"?([^"=\s]+)"?\s*=\s*"([^"]*)"/.exec(line) ?? [];
    if (header) table = header.trim();
    else if (name && version !== undefined && table === 'tools') tools[name] = version;
  }
  return tools;
}

/** The ignoreCommand's exit status: Vercel skips the build on 0 and builds on 1. */
function ignoreCommandExit(vercelEnv?: string): number | null {
  const env = { ...process.env };
  delete env.VERCEL_ENV;
  if (vercelEnv !== undefined) env.VERCEL_ENV = vercelEnv;
  return spawnSync('sh', ['-c', vercel.ignoreCommand], { env }).status;
}

describe('vercel.json', () => {
  it('creates production deployments from main and no preview deployments at all', () => {
    // `**`, not `*`: minimatch's `*` matches neither `lc/…` nor `dependabot/…/…` (spec R4).
    expect(vercel.git?.deploymentEnabled).toStrictEqual({ '**': false, main: true });
  });

  it('has an ignoreCommand that builds a production deployment', () => {
    expect(ignoreCommandExit('production')).toBe(1);
  });

  it.each(['preview', 'development'])('has an ignoreCommand that skips a %s deployment', (env) => {
    expect(ignoreCommandExit(env)).toBe(0);
  });

  it('has an ignoreCommand that fails closed when VERCEL_ENV is not exposed', () => {
    // On purpose: with system env vars unexposed even production is skipped, and the wizard
    // checks that setting (spec R4).
    expect(ignoreCommandExit()).toBe(0);
    expect(ignoreCommandExit('')).toBe(0);
  });
});

describe('the toolchain Vercel reads matches the one mise pins for CI and dev', () => {
  const tools = miseTools();

  it('pins the same pnpm in packageManager', () => {
    expect(/^pnpm@([^+]+)/.exec(pkg.packageManager)?.[1]).toBe(tools['npm:pnpm']);
  });

  it("asks for mise's Node major in engines.node", () => {
    expect(pkg.engines?.node).toBe(`${tools.node?.split('.')[0]}.x`);
  });
});
