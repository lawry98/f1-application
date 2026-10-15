import os from 'node:os';

import type { CDPSession, Page, TestInfo } from '@playwright/test';

/**
 * DIAGNOSTIC ONLY — not for merge. Wraps a sweep that may hang in CI, and when it has not
 * finished after `watchdogMs`, works out which of three things is true before the test timeout
 * erases the evidence:
 *
 * 1. rAF stalled, main thread alive — the page's own heartbeat keeps logging after the stall.
 * 2. Main thread busy in JS — `Debugger.pause` lands and returns the stack it interrupted.
 * 3. Main thread blocked outside JS — neither heartbeats nor `Debugger.pause` come back.
 *
 * Per-process CPU over two seconds says which process (renderer, GPU, browser) is burning time.
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
  'benchmark',
  'v8.execute',
  'loading',
];

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
    if (m.text().startsWith('[sweep]')) lines.push(`${stamp()} ${m.text()}`);
  });
  page.on('crash', () => lines.push(`${stamp()} PAGE CRASHED`));

  const browser = page.context().browser();
  const cdp: CDPSession = await page.context().newCDPSession(page);
  await cdp.send('Debugger.enable');
  const browserCdp = browser ? await browser.newBrowserCDPSession() : null;

  const header: string[] = [
    `worker=${testInfo.workerIndex} parallel=${testInfo.parallelIndex} retry=${testInfo.retry} repeat=${testInfo.repeatEachIndex}`,
    `browser=${browser?.version()} cpus=${os.cpus().length} load=${os.loadavg().map((l) => l.toFixed(2)).join('/')} free=${(os.freemem() / 2 ** 30).toFixed(2)}G/${(os.totalmem() / 2 ** 30).toFixed(2)}G`,
  ];
  if (browserCdp) {
    const info = (await browserCdp.send('SystemInfo.getInfo')) as {
      gpu: { featureStatus: Record<string, string>; devices: { vendorString: string; deviceString: string }[] };
    };
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
  const report: string[] = [...header, `STALLED: sweep not finished after ${watchdogMs}ms`];
  report.push(
    `node: load=${os.loadavg().map((l) => l.toFixed(2)).join('/')} free=${(os.freemem() / 2 ** 30).toFixed(2)}G`,
  );

  if (browserCdp) {
    const before = (await within(3000, browserCdp.send('SystemInfo.getProcessInfo'))) as
      | { processInfo: ProcessInfo[] }
      | 'timed out';
    await sleep(2000);
    const after = (await within(3000, browserCdp.send('SystemInfo.getProcessInfo'))) as
      | { processInfo: ProcessInfo[] }
      | 'timed out';
    if (before !== 'timed out' && after !== 'timed out') {
      const prev = new Map(before.processInfo.map((p) => [p.id, p.cpuTime]));
      report.push(
        'cpu over 2s: ' +
          after.processInfo
            .map((p) => `${p.type}#${p.id}=${(p.cpuTime - (prev.get(p.id) ?? 0)).toFixed(2)}s`)
            .join(' '),
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
    const top = pausedAt.callFrames[0];
    if (top) {
      const src = (await within(3000, cdp.send('Debugger.getScriptSource', { scriptId: top.location.scriptId }))) as
        | { scriptSource: string }
        | 'timed out';
      if (src !== 'timed out') {
        const line = src.scriptSource.split('\n')[top.location.lineNumber] ?? '';
        const c = top.location.columnNumber ?? 0;
        report.push(`    top frame source: …${line.slice(Math.max(0, c - 300), c)}⟦HERE⟧${line.slice(c, c + 300)}…`);
      }
    }
    await within(3000, cdp.send('Debugger.resume'));
  }

  // Does forcing a frame (a screenshot) unstick it?
  const shot = await within(5000, page.screenshot({ timeout: 4500 }).then((b) => b, (e: unknown) => String(e)));
  if (Buffer.isBuffer(shot)) {
    report.push('page.screenshot: produced a frame');
    await testInfo.attach('stall-screenshot.png', { body: shot, contentType: 'image/png' });
  } else report.push(`page.screenshot: ${shot}`);
  const late = await within(3000, running.then(() => 'sweep finished after the screenshot'));
  report.push(`after screenshot: ${late === 'timed out' ? 'still hung' : late}`);

  if (chromeTrace && browser) {
    const trace = await within(10_000, browser.stopTracing());
    if (trace === 'timed out') report.push('chrome trace: stopTracing timed out');
    else await testInfo.attach('chrome-trace.json', { body: trace, contentType: 'application/json' });
  }

  report.push('page log:', ...lines);
  const text = report.join('\n');
  await testInfo.attach('sweep-stall.txt', { body: text, contentType: 'text/plain' });
  throw new Error(`invisible-text sweep stalled\n${text}`);
}
