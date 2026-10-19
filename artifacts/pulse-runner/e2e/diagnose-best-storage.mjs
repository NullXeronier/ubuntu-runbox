// Standalone isolation of the native cross-tab storage boundary. No app,
// WebGL, seeded scores, storage mocks, sleeps, or retries. A nonzero exit means
// the browser returned stale data despite exclusive Web Lock serialization.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { chromium } from '@playwright/test';

const systemChromium = process.env.PATH?.split(delimiter)
  .map((directory) => join(directory, 'chromium')).find((file) => existsSync(file));
const browser = await chromium.launch({
  executablePath: process.env.PULSE_E2E_CHROMIUM ??
    (process.env.REPL_ID ? systemChromium : undefined),
});
const reports = [];
try {
  for (const clock of [false, true]) {
    for (const suppressNotifications of [false, true]) {
      const context = await browser.newContext();
      // A routed localhost document is a secure same-origin context. No server
      // is needed; the browser's real storage and lock services remain intact.
      await context.route('**/*', (route) => route.fulfill({
        contentType: 'text/html', body: '<!doctype html><title>Native storage isolation</title>',
      }));
      if (suppressNotifications) {
        await context.addInitScript(() =>
          addEventListener('storage', (event) => event.stopImmediatePropagation(), true));
      }
      const [holder, high, low] = await Promise.all([
        context.newPage(), context.newPage(), context.newPage(),
      ]);
      const url = 'http://localhost:25983/';
      for (const page of [holder, high, low]) await page.goto(url);
      if (clock) {
        await context.clock.install();
        await context.clock.pauseAt(await holder.evaluate(() => Date.now() + 100));
      }
      const report = { clock, suppressNotifications, iterations: 0, failed: false };
      for (let i = 0; i < 200; i++) {
        const key = `native-best-isolation:${i}`;
        // Warm caches as real games do when they read the current best.
        for (const page of [holder, high, low]) {
          assert.equal(await page.evaluate((key) => localStorage.getItem(key), key), null);
        }
        await holder.evaluate((key) => new Promise((ready) => {
          void navigator.locks.request(key, { mode: 'exclusive' }, () => new Promise((release) => {
            window.release = release;
            ready();
          }));
        }), key);
        for (const [page, score] of [[high, 3000], [low, 1000]]) {
          await page.evaluate(({ key, score }) => {
            window.save = navigator.locks.request(key, { mode: 'exclusive' }, () => {
              const before = localStorage.getItem(key);
              localStorage.setItem(key, String(Math.max(Number(before), score)));
              return before;
            });
          }, { key, score });
          const pending = await holder.evaluate(async (key) =>
            (await navigator.locks.query()).pending.filter((lock) => lock.name === key).length, key);
          assert.equal(pending, page === high ? 1 : 2);
        }
        await holder.evaluate(() => window.release());
        const reads = await Promise.all([
          high.evaluate(() => window.save), low.evaluate(() => window.save),
        ]);
        const actual = await holder.evaluate((key) => localStorage.getItem(key), key);
        report.iterations = i + 1;
        if (actual !== '3000' || reads[1] !== '3000') {
          const fresh = await context.newPage();
          await fresh.goto(url);
          Object.assign(report, {
            failed: true, reads, actual,
            freshReader: await fresh.evaluate((key) => localStorage.getItem(key), key),
            remainingLocks: await holder.evaluate(async (key) => {
              const locks = await navigator.locks.query();
              return [...locks.held, ...locks.pending].filter((lock) => lock.name === key);
            }, key),
          });
          break;
        }
      }
      reports.push(report);
      await context.close();
    }
  }
  console.log(JSON.stringify({ browser: browser.version(), reports }, null, 2));
  if (reports.some((report) => report.failed)) process.exitCode = 1;
} finally {
  await browser.close();
}
