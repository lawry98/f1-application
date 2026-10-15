import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';

import type { CDPSession, Page, TestInfo } from '@playwright/test';

/**
 * DIAGNOSTIC ONLY — not for merge. Wraps a sweep that may hang in CI, and when it has not
 * finished after `watchdogMs`, works out what the renderer is stuck on before the test timeout
 * erases the evidence: page-side progress (relayed through a worker, so a blocked main thread
 * cannot hold it back), per-process CPU, `Debugger.pause`, in-flight requests, a direct probe of
 * the server, and on Linux every renderer thread's kernel wait channel, kernel stack and a gdb
 * backtrace.
 */

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function within<T>(ms: number, work: Promise<T>): Promise<T | 'timed out'> {
  return Promise.race([work, sleep(ms).then(() => 'timed out' as const)]);
}

interface ProcessInfo {
  type: string;
  id: number;
  cpuTime: number;
}

const TRACE_CATEGORIES = [
  '-*',
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.frame',
  'toplevel',
  'blink',
  'cc',
  'gpu',
  'viz',
  'renderer.scheduler',
  'disabled-by-default-cc.debug.scheduler.frames',
  'disabled-by-default-cc.debug.scheduler',
  'benchmark',
  'v8.execute',
  'loading',
];

const read = (p: string) => {
  try {
    return readFileSync(p, 'utf8');
  } catch (e) {
    return `<${(e as NodeJS.ErrnoException).code}>`;
  }
};

const sh = (cmd: string, args: string[], timeout = 20_000) => {
  try {
    return execFileSync(cmd, args, { timeout, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 2 ** 20 });
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message: string };
    return `${err.stdout ?? ''}\n<${cmd} failed: ${err.message.split('\n')[0]} ${err.stderr ?? ''}>`;
  }
};

/** Linux only: each thread's name, state and kernel wait channel; kernel stacks for the interesting ones. */
function nativeThreads(pid: number, label: string, detail: boolean): { summary: string[]; full: string[] } {
  const summary: string[] = [];
  const full: string[] = [`==== ${label} pid ${pid}`];
  if (!existsSync(`/proc/${pid}/task`)) return { summary: [`${label}#${pid}: no /proc entry`], full };
  const groups = new Map<string, number>();
  for (const tid of readdirSync(`/proc/${pid}/task`)) {
    const base = `/proc/${pid}/task/${tid}`;
    const comm = read(`${base}/comm`).trim();
    const stat = read(`${base}/stat`);
    const state = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0];
    const wchan = read(`${base}/wchan`).trim() || '-';
    const syscall = read(`${base}/syscall`).trim().split(' ')[0];
    const key = `${comm.replace(/\d+$/, '#')} ${state} ${wchan} sys=${syscall}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
    full.push(`  ${tid} ${comm} ${state} wchan=${wchan} syscall=${read(`${base}/syscall`).trim()}`);
    const interesting = detail && (tid === String(pid) || /Compositor|ChildIOT|IOThread|Font|VizCompositor|GpuMain|CrGpuMain/.test(comm));
    if (interesting) {
      const kstack = sh('sudo', ['-n', 'cat', `${base}/stack`], 5000).trim();
      full.push(kstack.split('\n').map((l) => `      k: ${l}`).join('\n'));
      summary.push(`  ${label} ${tid} ${comm} ${state} wchan=${wchan} syscall=${syscall} kstack=${kstack.split('\n').slice(0, 4).map((l) => l.replace(/^\[<[0-9a-f]+>\] /, '')).join(' < ')}`);
    }
  }
  summary.push(`  ${label}#${pid} threads: ` + [...groups].map(([k, n]) => `${n}×(${k})`).join(' | '));
  return { summary, full };
}

function gdbBacktrace(pid: number): string {
  if (!existsSync('/usr/bin/gdb')) return '<no gdb>';
  return sh('sudo', ['-n', 'gdb', '-p', String(pid), '-batch', '-nx', '-ex', 'set pagination off', '-ex', 'info threads', '-ex', 'thread apply all bt 40'], 60_000);
}

/** The threads that matter most from a gdb dump: main, compositor, IO, and anything not parked in a futex/poll. */
function gdbHighlights(dump: string): string[] {
  const out: string[] = [];
  for (const block of dump.split(/\n(?=Thread \d+ )/)) {
    const head = block.split('\n')[0] ?? '';
    if (!/^Thread \d+ /.test(head)) continue;
    const name = /"([^"]+)"/.exec(head)?.[1] ?? '';
    if (!/CrRendererMain|Compositor|Chrome_ChildIOT|chrome-headless|CrGpuMain|VizCompositor/.test(name)) continue;
    out.push(`  ${head.slice(0, 120)}`);
    for (const f of block.split('\n').slice(1, 16)) out.push(`      ${f.trim().slice(0, 200)}`);
  }
  return out;
}

/** The last events on each named thread of interest in a Chrome trace. */
function traceTail(json: string, pidHint: number[]): string[] {
  const out: string[] = [];
  try {
    const parsed = JSON.parse(json) as { traceEvents?: { ph: string; name: string; pid: number; tid: number; ts: number; dur?: number; args?: { name?: string } & Record<string, unknown> }[] };
    const events = parsed.traceEvents ?? [];
    const names = new Map<string, string>();
    for (const e of events) if (e.ph === 'M' && e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args?.name ?? '');
    const wanted = [...names].filter(([k, n]) => /CrRendererMain|Compositor$|VizCompositor|CrGpuMain|CrBrowserMain/.test(n) && (pidHint.length === 0 || true) && k);
    // The renderer's compositor: what tile/activation work it did last, with the args cc attaches.
    const rendererCompositor = [...names].find(([, n]) => n === 'Compositor')?.[0];
    const cc = events
      .filter((e) => `${e.pid}:${e.tid}` === rendererCompositor && /TileManager|Activat|PrepareTiles|Checker|ImageDecode|Commit|PendingTree|RasterTask|ReadyTo/.test(e.name))
      .sort((a, b) => a.ts - b.ts);
    out.push(`  renderer compositor tile/activation/commit events: ${cc.length}; last 40:`);
    for (const e of cc.slice(-40)) {
      const a = e.args && Object.keys(e.args).length ? ` ${JSON.stringify(e.args).slice(0, 300)}` : '';
      out.push(`      ${e.ph} ${e.name} ts=${e.ts} dur=${e.dur ?? ''}${a}`);
    }
    for (const [key, name] of wanted) {
      const evs = events.filter((e) => `${e.pid}:${e.tid}` === key && e.ph !== 'M').sort((a, b) => a.ts - b.ts);
      if (evs.length === 0) continue;
      const lastTs = evs[evs.length - 1]!.ts;
      out.push(`  trace ${name} (${key}) last ${Math.min(12, evs.length)} of ${evs.length}, last ts=${lastTs}:`);
      for (const e of evs.slice(-12)) out.push(`      ${e.ph} ${e.name} ts=${e.ts} dur=${e.dur ?? ''}`);
      const open: string[] = [];
      for (const e of evs) {
        if (e.ph === 'B') open.push(e.name);
        else if (e.ph === 'E') open.pop();
      }
      if (open.length) out.push(`      OPEN B-slices: ${open.join(' > ')}`);
      if (/Compositor$/.test(name)) {
        const stateful = evs.filter((e) => e.args && JSON.stringify(e.args).length > 40);
        for (const e of stateful.slice(-2)) out.push(`      args of ${e.name} ts=${e.ts}: ${JSON.stringify(e.args).slice(0, 4000)}`);
      }
    }
  } catch (e) {
    out.push(`  trace parse failed: ${String(e)}`);
  }
  return out;
}

export async function diagnoseSweep<T>(
  page: Page,
  testInfo: TestInfo,
  sweep: () => Promise<T>,
  { watchdogMs = 20_000, chromeTrace = false }: { watchdogMs?: number; chromeTrace?: boolean } = {},
): Promise<T> {
  const t0 = Date.now();
  const lines: string[] = [];
  const stamp = () => `+${String(Date.now() - t0).padStart(6)}ms`;
  page.on('console', (m) => {
    if (m.text().startsWith('[sweep] ')) lines.push(`${stamp()} ${m.text()}`);
  });
  page.on('worker', (w) =>
    w.on('console', (m) => {
      if (m.text().startsWith('[sweep-w] ')) lines.push(`${stamp()} ${m.text()}`);
    }),
  );
  page.on('crash', () => lines.push(`${stamp()} PAGE CRASHED`));
  const inflight = new Map<string, number>();
  page.on('request', (r) => inflight.set(r.url(), Date.now()));
  const settle = (r: { url(): string }) => inflight.delete(r.url());
  page.on('requestfinished', settle);
  page.on('requestfailed', settle);

  const browser = page.context().browser();
  const cdp: CDPSession = await page.context().newCDPSession(page);
  await cdp.send('Debugger.enable');
  const browserCdp = browser ? await browser.newBrowserCDPSession() : null;

  const header: string[] = [
    `at=${new Date().toISOString()} worker=${testInfo.workerIndex} parallel=${testInfo.parallelIndex} retry=${testInfo.retry} repeat=${testInfo.repeatEachIndex}`,
    `browser=${browser?.version()} cpus=${os.cpus().length} load=${os.loadavg().map((l) => l.toFixed(2)).join('/')} free=${(os.freemem() / 2 ** 30).toFixed(2)}G/${(os.totalmem() / 2 ** 30).toFixed(2)}G`,
  ];
  if (browserCdp) {
    const info = (await browserCdp.send('SystemInfo.getInfo')) as {
      gpu: { featureStatus: Record<string, string>; devices: { vendorString: string; deviceString: string }[] };
      commandLine: string;
    };
    const disables = info.commandLine.match(/--disable-features=\S+/g) ?? [];
    header.push(`cmdline: ${disables.length}× --disable-features; SpeculativeImageDecodes ${disables.some((d) => d.includes('SpeculativeImageDecodes')) ? 'DISABLED' : 'default'}; no-mfba=${info.commandLine.includes('--disable-main-frame-before-activation')} no-checker=${info.commandLine.includes('--disable-checker-imaging')} headless-shell=${info.commandLine.includes('headless-shell')}`);
    const fs = info.gpu.featureStatus;
    header.push(
      `gpu: compositing=${fs.gpu_compositing} raster=${fs.rasterization} webgl=${fs.webgl} device=${info.gpu.devices.map((d) => `${d.vendorString}/${d.deviceString}`).join(';')}`,
    );
  }

  if (chromeTrace && browser) await browser.startTracing(page, { categories: TRACE_CATEGORIES });

  const running = sweep();
  const first = await Promise.race([
    running.then((value) => ({ done: true as const, value })),
    sleep(watchdogMs).then(() => ({ done: false as const })),
  ]);

  if (first.done) {
    if (chromeTrace && browser) await within(10_000, browser.stopTracing());
    await testInfo.attach('sweep-log.txt', { body: [...header, ...lines].join('\n'), contentType: 'text/plain' });
    return first.value;
  }

  // ---- Stalled. Gather everything before the test timeout does.
  const report: string[] = [...header, `STALLED at ${new Date().toISOString()}: sweep not finished after ${watchdogMs}ms`];
  const full: string[] = [];
  report.push(
    `node: load=${os.loadavg().map((l) => l.toFixed(2)).join('/')} free=${(os.freemem() / 2 ** 30).toFixed(2)}G`,
  );
  report.push(
    `in-flight requests: ${[...inflight].map(([u, at]) => `${u.replace(/^https?:\/\/[^/]+/, '')} (${Date.now() - at}ms)`).join(', ') || 'none'}`,
  );
  const base = new URL(page.url()).origin;
  for (const path of ['/_next/image?url=%2Fdrivers%2Ffernando-alonso.png&w=384&q=75', '/teams']) {
    const s = Date.now();
    const res = await within(
      8000,
      fetch(base + path).then(
        async (r) => `${r.status} ${(await r.arrayBuffer()).byteLength}B`,
        (e: unknown) => String(e),
      ),
    );
    report.push(`server probe ${path}: ${res} in ${Date.now() - s}ms`);
  }

  let pids: ProcessInfo[] = [];
  if (browserCdp) {
    const before = (await within(3000, browserCdp.send('SystemInfo.getProcessInfo'))) as
      | { processInfo: ProcessInfo[] }
      | 'timed out';
    await sleep(2000);
    const after = (await within(3000, browserCdp.send('SystemInfo.getProcessInfo'))) as
      | { processInfo: ProcessInfo[] }
      | 'timed out';
    if (before !== 'timed out' && after !== 'timed out') {
      pids = after.processInfo;
      const prev = new Map(before.processInfo.map((p) => [p.id, p.cpuTime]));
      report.push(
        'cpu over 2s: ' +
          after.processInfo.map((p) => `${p.type}#${p.id}=${(p.cpuTime - (prev.get(p.id) ?? 0)).toFixed(2)}s`).join(' '),
      );
    } else report.push(`cpu: getProcessInfo ${before === 'timed out' ? 'before' : 'after'} timed out`);
  }

  interface Paused {
    reason: string;
    callFrames: { functionName: string; url: string; location: { scriptId: string; lineNumber: number; columnNumber?: number } }[];
  }
  const paused = new Promise<Paused>((resolve) => cdp.once('Debugger.paused', resolve));
  void cdp.send('Debugger.pause').catch((e: unknown) => report.push(`Debugger.pause rejected: ${String(e)}`));
  const pausedAt = await within(4000, paused);
  if (pausedAt === 'timed out') {
    report.push('Debugger.pause: no pause within 4s — main thread not running JS (blocked natively?)');
  } else {
    report.push(`Debugger.pause landed (reason=${pausedAt.reason}); stack:`);
    for (const f of pausedAt.callFrames.slice(0, 25)) {
      report.push(`    at ${f.functionName || '(anonymous)'} ${f.url}:${f.location.lineNumber + 1}:${(f.location.columnNumber ?? 0) + 1}`);
    }
    await within(3000, cdp.send('Debugger.resume'));
  }

  // Native state, Linux only. Renderers in full; GPU and browser summarised.
  if (process.platform === 'linux' && pids.length > 0) {
    report.push('native threads:');
    for (const p of pids) {
      if (!/renderer|GPU|browser/i.test(p.type)) continue;
      const { summary, full: f } = nativeThreads(p.id, p.type, true);
      report.push(...summary);
      full.push(...f);
    }
    for (const p of pids.filter((q) => /renderer/i.test(q.type))) {
      const dump = gdbBacktrace(p.id);
      full.push(`==== gdb renderer ${p.id}`, dump);
      report.push(`gdb renderer#${p.id}:`, ...gdbHighlights(dump));
    }
    const gpu = pids.find((q) => q.type === 'GPU');
    if (gpu) {
      const dump = gdbBacktrace(gpu.id);
      full.push(`==== gdb GPU ${gpu.id}`, dump);
      report.push(`gdb GPU#${gpu.id}:`, ...gdbHighlights(dump));
    }
  }

  if (chromeTrace && browser) {
    const trace = await within(10_000, browser.stopTracing());
    if (trace === 'timed out') report.push('chrome trace: stopTracing timed out');
    else {
      await testInfo.attach('chrome-trace.json', { body: trace, contentType: 'application/json' });
      report.push(...traceTail(trace.toString('utf8'), pids.map((p) => p.id)));
    }
  }

  // Does forcing a frame (a screenshot) unstick it?
  const shot = await within(5000, page.screenshot({ timeout: 4500 }).then((b) => b, (e: unknown) => String(e)));
  report.push(Buffer.isBuffer(shot) ? 'page.screenshot: produced a frame' : `page.screenshot: ${shot}`);
  const late = await within(3000, running.then(() => 'sweep finished after the screenshot'));
  report.push(`after screenshot: ${late === 'timed out' ? 'still hung' : late}`);

  report.push('page log:', ...lines);
  const text = report.join('\n');
  await testInfo.attach('sweep-stall.txt', { body: text, contentType: 'text/plain' });
  await testInfo.attach('sweep-native.txt', { body: full.join('\n'), contentType: 'text/plain' });
  throw new Error(`invisible-text sweep stalled\n${text}`);
}
