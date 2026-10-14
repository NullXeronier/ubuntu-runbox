import { test, expect, openClockedGame, pressButton, delayBestNotifications } from './fixtures';
import { RunDriver } from './driver';

const key = 'pulse-best:neon-drift:easy';

for (const navigation of ['replay', 'change difficulty'] as const) {
  for (const outcome of ['release', 'reject'] as const) {
    test(`personal best: delayed ${outcome} after ${navigation} cannot affect the next run`, async ({ page, context }, info) => {
      const holder = await context.newPage();
      // The lock holder needs the same origin, not a second animated game.
      await holder.route('**/*', (route) => route.fulfill({
        contentType: 'text/html', body: '<!doctype html><title>Best-save lock holder</title>',
      }));
      await holder.goto('./');
      await holder.evaluate(async (key) => {
        await new Promise<void>((ready) => {
          void navigator.locks.request(key, () => new Promise<void>((release) => {
            Object.assign(window, { releaseBestLock: release });
            ready();
          }));
        });
      }, key);

      // Keep the real Web Lock queue and reject only the old run's storage
      // write, once the lock grants it. No engine state or input is mocked.
      await page.addInitScript(({ key, outcome }) => {
        const nativeSet = Storage.prototype.setItem;
        Object.assign(window, { delayedBestAttempted: false });
        Storage.prototype.setItem = function (name, value) {
          if (this === window.localStorage && name === key) {
            Object.assign(window, { delayedBestAttempted: true });
            if (outcome === 'reject') throw new DOMException('Save denied', 'QuotaExceededError');
          }
          return nativeSet.call(this, name, value);
        };
      }, { key, outcome });
      await openClockedGame(page, info);
      await pressButton(page, info, 'button-difficulty-easy');
      const previous = await RunDriver.start(page, info);
      await previous.hit(0);
      await previous.hit(1);
      await previous.finish();
      await expect(page.getByTestId('text-final-score')).toHaveText('2,000');
      await expect.poll(() => holder.evaluate(async (key) =>
        (await navigator.locks.query()).pending?.filter((lock) => lock.name === key).length, key)).toBe(1);
      expect(await holder.evaluate((key) => localStorage.getItem(key), key)).toBeNull();

      const difficulty = navigation === 'replay' ? 'easy' : 'hard';
      if (navigation === 'change difficulty') {
        await pressButton(page, info, 'button-menu');
        await pressButton(page, info, 'button-difficulty-hard');
      }
      const next = await RunDriver.start(page, info, navigation === 'replay' ? 'button-retry' : 'button-start');
      if (navigation === 'replay') {
        await next.hit(0);
        await expect(page.getByTestId('text-score')).toHaveText('1,000');
        await expect(page.getByTestId('text-countdown')).toHaveCount(0);
      } else {
        // A second results screen is essential: a phase-only guard would pass
        // the playing case but incorrectly update this different generation.
        await next.finish();
        await expect(page.getByTestId('text-final-score')).toHaveText('0');
        await expect.poll(() => holder.evaluate(() =>
          localStorage.getItem('pulse-best:neon-drift:hard'))).toBe('0');
      }
      await expect(page.getByText(`Neon Drift / ${difficulty}`, { exact: true })).toBeVisible();
      await expect(page.getByTestId('text-game-error')).toHaveCount(0);

      await holder.evaluate(() => (window as unknown as { releaseBestLock: () => void }).releaseBestLock());
      await expect.poll(() => page.evaluate(() =>
        (window as unknown as { delayedBestAttempted: boolean }).delayedBestAttempted)).toBe(true);
      await expect.poll(() => holder.evaluate(async (key) => {
        const locks = await navigator.locks.query();
        return [...locks.held ?? [], ...locks.pending ?? []].filter((lock) => lock.name === key).length;
      }, key)).toBe(0);
      // Flush React's render after the async continuation, without advancing
      // far enough to change the new run's score or phase.
      await page.clock.runFor(32);
      expect(await holder.evaluate((key) => localStorage.getItem(key), key))
        .toBe(outcome === 'release' ? '2000' : null);
      await expect(page.getByText(`Neon Drift / ${difficulty}`, { exact: true })).toBeVisible();
      if (navigation === 'replay') {
        await expect(page.getByTestId('panel-results')).toHaveCount(0);
        await expect(page.getByTestId('panel-paused')).toHaveCount(0);
        await expect(page.getByTestId('text-countdown')).toHaveCount(0);
        await expect(page.getByTestId('text-score')).toHaveText('1,000');
        // Gameplay hides game.error; opening pause makes a stale error visible.
        await pressButton(page, info, 'button-pause');
        await expect(page.getByTestId('panel-paused')).toBeVisible();
        await expect(page.getByTestId('text-score')).toHaveText('1,000');
        expect(await holder.evaluate(() => localStorage.getItem('pulse-best:neon-drift:hard'))).toBeNull();
      } else {
        await expect(page.getByTestId('panel-results')).toBeVisible();
        await expect(page.getByTestId('text-final-score')).toHaveText('0');
        await expect(page.getByTestId('text-results-best')).toHaveText('0');
        expect(await holder.evaluate(() => localStorage.getItem('pulse-best:neon-drift:hard'))).toBe('0');
      }
      await expect(page.getByTestId('text-game-error')).toHaveCount(0);
      await holder.close();
    });
  }
}

for (const highFirst of [true, false]) {
  test(`personal best: concurrent saves serialize with ${highFirst ? 'higher' : 'lower'} queued first`, async ({ page, context }, info) => {
    // A third tab holds the real origin lock. Both real runs must finish and
    // queue their saves before it releases; no timing/scheduling luck required.
    const holder = await context.newPage();
    await holder.goto('./');
    await holder.evaluate(async (key) => {
      await new Promise<void>((ready) => {
        void navigator.locks.request(key, () => new Promise<void>((release) => {
          Object.assign(window, { releaseBestLock: release });
          ready();
        }));
      });
    }, key);
    const other = await context.newPage();
    for (const target of [page, other]) await delayBestNotifications(target);
    for (const [target, hits] of [[page, highFirst ? 3 : 1], [other, highFirst ? 1 : 3]] as const) {
      await openClockedGame(target, info);
      await pressButton(target, info, 'button-difficulty-easy');
      const run = await RunDriver.start(target, info);
      for (let i = 0; i < hits; i++) await run.hit(i);
      await run.finish();
      await expect(target.getByTestId('text-final-score')).toHaveText(hits === 3 ? '3,000' : '1,000');
    }
    await expect.poll(() => holder.evaluate(async (key) =>
      (await navigator.locks.query()).pending?.filter((lock) => lock.name === key).length, key)).toBe(2);
    expect(await holder.evaluate((key) => localStorage.getItem(key), key)).toBeNull();
    await holder.evaluate(() => (window as unknown as { releaseBestLock: () => void }).releaseBestLock());
    await expect.poll(() => holder.evaluate((key) => localStorage.getItem(key), key)).toBe('3000');
    await expect.poll(() => holder.evaluate(async (key) => {
      const locks = await navigator.locks.query();
      return [...locks.held ?? [], ...locks.pending ?? []].filter((lock) => lock.name === key).length;
    }, key)).toBe(0);
    // Check after BOTH writers have finished, not just the higher writer.
    expect(await holder.evaluate((key) => localStorage.getItem(key), key)).toBe('3000');
    await page.bringToFront();
    await page.reload();
    await pressButton(page, info, 'button-difficulty-easy');
    await expect(page.getByTestId('text-best')).toContainText('3,000');
    await other.close();
    await holder.close();
  });
}

for (const mode of ['missing', 'rejected', 'read denied'] as const) {
  test(`personal best: ${mode} safe saving retains session results and the existing best`, async ({ page }, info) => {
    await page.addInitScript(({ key, mode }) => {
      localStorage.setItem(key, '5000');
      if (mode === 'missing') Object.defineProperty(navigator, 'locks', { value: undefined });
      if (mode === 'rejected') Object.defineProperty(navigator, 'locks', {
        value: { request: () => Promise.reject(new Error('Lock access denied')) },
      });
      if (mode === 'read denied') {
        const get = Storage.prototype.getItem;
        Storage.prototype.getItem = function (name) {
          if (name === key) throw new DOMException('Read denied', 'SecurityError');
          return get.call(this, name);
        };
      }
    }, { key, mode });
    await openClockedGame(page, info);
    await pressButton(page, info, 'button-difficulty-easy');
    const run = await RunDriver.start(page, info);
    await run.hit(0);
    await run.finish();
    await expect(page.getByTestId('text-final-score')).toHaveText('1,000');
    await expect(page.getByTestId('text-results-best')).toHaveText(mode === 'read denied' ? '1,000' : '5,000');
    await expect(page.getByTestId('badge-new-first-run')).toBeVisible();
    await expect(page.getByTestId('text-game-error')).toHaveText(
      'Your score is shown below, but this browser could not save your personal best.');
    // A clean tab can read storage even when the game tab's reads are denied.
    const reader = await page.context().newPage();
    await reader.goto('./');
    expect(await reader.evaluate((key) => localStorage.getItem(key), key)).toBe('5000');
    await reader.close();
  });
}
