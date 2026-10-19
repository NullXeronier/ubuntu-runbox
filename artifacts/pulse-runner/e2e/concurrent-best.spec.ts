import {
  test, expect, openClockedGame, pressButton, delayBestNotifications,
  holdBestLock, openStoragePage, checkRenderer, assertTrustedLaneInput,
} from './fixtures';
import { RunDriver } from './driver';
import { databaseBest } from './best-database';

const key = 'pulse-best:neon-drift:easy';

for (const navigation of ['replay', 'change difficulty'] as const) {
  for (const outcome of ['release', 'reject'] as const) {
    test(`personal best: delayed ${outcome} after ${navigation} cannot affect the next run`, async ({ page, context }, info) => {
      const holder = await holdBestLock(context, key);

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
      expect(await databaseBest(holder, key)).toBe(outcome === 'release' ? 2000 : undefined);
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
    // A lightweight third tab holds the real origin lock. Both game tabs stay
    // alive with pending saves; only the non-playing holder omits the renderer.
    const holder = await holdBestLock(context, key);
    const other = await context.newPage();
    for (const target of [page, other]) await delayBestNotifications(target);
    let queued = 0;
    for (const [target, hits] of [[page, highFirst ? 3 : 1], [other, highFirst ? 1 : 3]] as const) {
      await openClockedGame(target, info);
      await pressButton(target, info, 'button-difficulty-easy');
      const run = await RunDriver.start(target, info);
      for (let i = 0; i < hits; i++) await run.hit(i);
      await run.finish();
      await expect(target.getByTestId('text-final-score')).toHaveText(hits === 3 ? '3,000' : '1,000');
      await assertTrustedLaneInput(target, info);
      await checkRenderer(target, info, `queued-${hits}-hits`, true);
      // Prove the requested ordering, not just the final queue length. Saves
      // cannot finish while the holder owns the exclusive native Web Lock.
      queued++;
      await expect.poll(() => holder.evaluate(async (key) =>
        (await navigator.locks.query()).pending?.filter((lock) => lock.name === key).length, key)).toBe(queued);
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
    expect(await databaseBest(holder, key)).toBe(3000);
    await page.bringToFront();
    await page.reload();
    await pressButton(page, info, 'button-difficulty-easy');
    await expect(page.getByTestId('text-best')).toContainText('3,000');
    await checkRenderer(page, info, 'saved-best-reload', true);
    await other.close();
    await holder.close();
  });
}

for (const closedTab of ['waiting writer', 'lock holder'] as const) {
  for (const highFirst of [true, false]) {
    test(`personal best: closing ${closedTab} with ${highFirst ? 'higher' : 'lower'} queued first drains surviving saves`, async ({ page, context }, info) => {
      const holder = await holdBestLock(context, key);
      const other = await context.newPage();
      // Keep the fixture's page alive through teardown: its fatal-error guard
      // includes errors collected from ALL tabs, even the one we close.
      for (const target of [other, page]) await delayBestNotifications(target);
      const survivorScore = highFirst ? 1000 : 3000;
      let queued = 0;
      for (const [target, hits] of [[other, highFirst ? 3 : 1], [page, highFirst ? 1 : 3]] as const) {
        await openClockedGame(target, info);
        await pressButton(target, info, 'button-difficulty-easy');
        const run = await RunDriver.start(target, info);
        for (let i = 0; i < hits; i++) await run.hit(i);
        await run.finish();
        await expect(target.getByTestId('text-final-score')).toHaveText(hits === 3 ? '3,000' : '1,000');
        await assertTrustedLaneInput(target, info);
        await checkRenderer(target, info, `before-close-${hits}-hits`, true);
        queued++;
        await expect.poll(() => holder.evaluate(async (key) =>
          (await navigator.locks.query()).pending?.filter((lock) => lock.name === key).length, key)).toBe(queued);
      }
      const locks = () => page.evaluate(async (key) => {
        const snapshot = await navigator.locks.query();
        return {
          held: (snapshot.held ?? []).filter((lock) => lock.name === key),
          pending: (snapshot.pending ?? []).filter((lock) => lock.name === key),
        };
      }, key);
      const beforeClose = await locks();
      expect(beforeClose.held).toHaveLength(1);
      expect(beforeClose.held[0]!.mode).toBe('exclusive');
      expect(beforeClose.pending).toHaveLength(2);
      expect(beforeClose.pending.map((lock) => lock.mode)).toEqual(['exclusive', 'exclusive']);
      expect(new Set([...beforeClose.held, ...beforeClose.pending].map((lock) => lock.clientId)).size).toBe(3);
      expect(await holder.evaluate((key) => localStorage.getItem(key), key)).toBeNull();
      expect(await databaseBest(holder, key)).toBeUndefined();

      if (closedTab === 'waiting writer') {
        // The FIRST waiter is canceled by native page destruction. The second
        // must remain queued behind the same holder, without committing early.
        await other.close();
        await expect.poll(locks).toEqual({
          held: beforeClose.held,
          pending: [beforeClose.pending[1]],
        });
        expect(await holder.evaluate((key) => localStorage.getItem(key), key)).toBeNull();
        expect(await databaseBest(holder, key)).toBeUndefined();
        await holder.evaluate(() => (window as unknown as { releaseBestLock: () => void }).releaseBestLock());
      } else {
        // Do NOT call releaseBestLock: destroying the holder must release the
        // native lock and unblock both real game writers on its own.
        await holder.close();
      }
      await expect.poll(locks).toEqual({ held: [], pending: [] });
      const maximum = closedTab === 'waiting writer' ? survivorScore : 3000;
      // A fresh storage reader avoids mistaking a tab-local mirror cache or a
      // storage-event repair for a committed maximum after the queue drains.
      const reader = await openStoragePage(context);
      expect(await databaseBest(reader, key)).toBe(maximum);
      expect(await reader.evaluate((key) => localStorage.getItem(key), key)).toBe(String(maximum));
      await page.clock.runFor(32);
      await expect(page.getByTestId('text-final-score')).toHaveText(survivorScore.toLocaleString('en-US'));
      await expect(page.getByTestId('text-results-best')).toHaveText(maximum.toLocaleString('en-US'));
      for (const target of [page, other]) {
        if (!target.isClosed()) await expect(target.getByTestId('text-game-error')).toHaveCount(0);
      }
      await checkRenderer(page, info, 'surviving-writer-drained', true);
      await page.reload();
      await pressButton(page, info, 'button-difficulty-easy');
      await expect(page.getByTestId('text-best')).toContainText(maximum.toLocaleString('en-US'));
      expect(await databaseBest(page, key)).toBe(maximum);
      expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(String(maximum));
      await expect(page.getByTestId('text-game-error')).toHaveCount(0);
      await checkRenderer(page, info, 'surviving-writer-reload', true);
      await reader.close();
      if (!other.isClosed()) await other.close();
      if (!holder.isClosed()) await holder.close();
    });
  }
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
    const reader = await openStoragePage(page.context());
    expect(await reader.evaluate((key) => localStorage.getItem(key), key)).toBe('5000');
    await reader.close();
  });
}
