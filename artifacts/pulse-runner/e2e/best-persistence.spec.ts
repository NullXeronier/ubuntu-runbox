import { test, expect, openClockedGame, pressButton, openStoragePage, checkRenderer } from './fixtures';
import { RunDriver } from './driver';
import { databaseBest } from './best-database';

const key = 'pulse-best:neon-drift:easy';

test('personal best: legacy scores merge safely and a stale mirror cannot hide the committed best after reload', async ({ page, context }, info) => {
  const reader = await openStoragePage(context);
  await databaseBest(reader, key, 2000);
  await reader.evaluate((key) => localStorage.setItem(key, '5000'), key);
  await openClockedGame(page, info);
  await pressButton(page, info, 'button-difficulty-easy');
  await expect(page.getByTestId('text-best')).toContainText('5,000');
  const run = await RunDriver.start(page, info);
  await run.hit(0);
  await run.finish();
  await expect.poll(() => databaseBest(reader, key)).toBe(5000);
  await expect(page.getByTestId('text-results-best')).toHaveText('5,000');
  expect(await reader.evaluate((key) => localStorage.getItem(key), key)).toBe('5000');

  // Model an older open version overwriting only the compatibility mirror.
  await reader.evaluate((key) => localStorage.setItem(key, '1000'), key);
  await page.reload();
  await pressButton(page, info, 'button-difficulty-easy');
  await expect(page.getByTestId('text-best')).toContainText('5,000');
  await pressButton(page, info, 'button-difficulty-hard');
  await expect(page.getByTestId('text-best')).toHaveText('PERSONAL BEST --');
  await pressButton(page, info, 'button-track-overdrive');
  await pressButton(page, info, 'button-difficulty-easy');
  await expect(page.getByTestId('text-best')).toHaveText('PERSONAL BEST --');
  await pressButton(page, info, 'button-track-neon-drift');
  await expect(page.getByTestId('text-best')).toContainText('5,000');
  await checkRenderer(page, info, 'authoritative-best-reload', true);
  await reader.close();
});

for (const fault of ['unavailable', 'open denied', 'write denied'] as const) {
  test(`personal best: IndexedDB ${fault} preserves existing scores and shows a save warning`, async ({ page, context }, info) => {
    const reader = await openStoragePage(context);
    await databaseBest(reader, key, 5000);
    await reader.evaluate((key) => localStorage.setItem(key, '5000'), key);
    await page.addInitScript((fault) => {
      if (fault === 'unavailable') Object.defineProperty(window, 'indexedDB', { value: undefined });
      else if (fault === 'open denied') IDBFactory.prototype.open = () => {
        throw new DOMException('Database access denied', 'SecurityError');
      };
      else IDBObjectStore.prototype.put = () => {
        throw new DOMException('Database write denied', 'QuotaExceededError');
      };
    }, fault);
    await openClockedGame(page, info);
    await pressButton(page, info, 'button-difficulty-easy');
    const run = await RunDriver.start(page, info);
    await run.hit(0);
    await run.finish();
    await expect(page.getByTestId('text-final-score')).toHaveText('1,000');
    await expect(page.getByTestId('text-results-best')).toHaveText('5,000');
    await expect(page.getByTestId('badge-new-first-run')).toBeVisible();
    await expect(page.getByTestId('text-game-error')).toHaveText(
      'Your score is shown below, but this browser could not save your personal best.');
    expect(await databaseBest(reader, key)).toBe(5000);
    expect(await reader.evaluate((key) => localStorage.getItem(key), key)).toBe('5000');
    await reader.close();
  });
}
