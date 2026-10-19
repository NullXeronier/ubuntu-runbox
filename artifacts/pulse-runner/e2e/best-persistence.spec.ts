import { test, expect, openClockedGame, pressButton, openStoragePage, checkRenderer, assertTrustedLaneInput } from './fixtures';
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

test('personal best: a malformed authoritative record stays intact without leaking into other score buckets', async ({ page, context }, info) => {
  const reader = await openStoragePage(context);
  const damaged = 'unrecognized';
  const legacy = '5000';
  // Seed only existing score data, once. Reads and writes remain native: no
  // database faults, seeded results/badges, or repair-on-reload init scripts.
  const records = async (seed = false) => {
    // A fresh storage-only document avoids mistaking a stale per-tab
    // localStorage cache for proof that the compatibility mirror is intact.
    if (!seed) await reader.reload();
    return reader.evaluate(({ key, damaged, legacy, seed }) =>
    new Promise<{ canonical: unknown; legacy: string | null }>((resolve, reject) => {
      const open = indexedDB.open('pulse-personal-bests', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('scores');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const transaction = db.transaction('scores', seed ? 'readwrite' : 'readonly');
        const store = transaction.objectStore('scores');
        if (seed) {
          store.put(damaged, key);
          localStorage.setItem(key, legacy);
        }
        const read = store.get(key);
        transaction.oncomplete = () => {
          db.close();
          resolve({ canonical: read.result, legacy: localStorage.getItem(key) });
        };
        transaction.onabort = () => { db.close(); reject(transaction.error); };
      };
    }), { key, damaged, legacy, seed });
  };
  const unchanged = { canonical: damaged, legacy };
  expect(await records(true)).toEqual(unchanged);

  const readWarning = 'Your saved personal best could not be read. Existing scores have not been changed.';
  await openClockedGame(page, info);
  await pressButton(page, info, 'button-difficulty-easy');
  await expect(page.getByTestId('text-error')).toHaveText(readWarning);
  await expect(page.getByTestId('text-best')).toHaveText('PERSONAL BEST 5,000');
  await expect(page.getByTestId('text-missions-count')).toHaveText('0 / 4 COMPLETE');
  expect(await records()).toEqual(unchanged);

  const run = await RunDriver.start(page, info);
  // Beat the legacy best so an unsafe mirror update cannot pass unnoticed.
  for (let index = 0; index < 6; index++) await run.hit(index);
  await expect(page.getByTestId('text-score')).toHaveText('6,000');
  await assertTrustedLaneInput(page, info);
  await run.finish();
  await expect(page.getByTestId('text-final-score')).toHaveText('6,000');
  await expect(page.getByTestId('text-results-best')).toHaveText('6,000');
  await expect(page.getByTestId('badge-new-first-run')).toHaveText('NEWLY EARNED');
  await expect(page.getByTestId('text-game-error')).toHaveText(
    'Your score is shown below, but this browser could not save your personal best.');
  expect(await records()).toEqual(unchanged);
  await checkRenderer(page, info, 'malformed-best-results', true);

  await pressButton(page, info, 'button-menu');
  await expect(page.getByTestId('text-error')).toHaveText(readWarning);
  await expect(page.getByTestId('text-best')).toHaveText('PERSONAL BEST 5,000');
  await expect(page.getByTestId('badge-complete-first-run')).toHaveText('DONE');
  // Change only difficulty, then only track: each key dimension must isolate
  // both the damaged bucket's legacy best and its session-only 6,000 result.
  await pressButton(page, info, 'button-difficulty-hard');
  await expect(page.getByTestId('text-best')).toHaveText('PERSONAL BEST --');
  await expect(page.getByTestId('text-error')).toHaveCount(0);
  await pressButton(page, info, 'button-difficulty-easy');
  await expect(page.getByTestId('text-error')).toHaveText(readWarning);
  await pressButton(page, info, 'button-track-overdrive');
  await expect(page.getByTestId('text-best')).toHaveText('PERSONAL BEST --');
  await expect(page.getByTestId('text-error')).toHaveCount(0);
  await pressButton(page, info, 'button-track-neon-drift');
  await expect(page.getByTestId('text-error')).toHaveText(readWarning);
  await expect(page.getByTestId('text-best')).toHaveText('PERSONAL BEST 5,000');

  await page.reload();
  await pressButton(page, info, 'button-difficulty-easy');
  await expect(page.getByTestId('text-error')).toHaveText(readWarning);
  await expect(page.getByTestId('text-best')).toHaveText('PERSONAL BEST 5,000');
  await expect(page.getByTestId('badge-complete-first-run')).toHaveText('DONE');
  expect(await records()).toEqual(unchanged);
  await checkRenderer(page, info, 'malformed-best-reload', true);
  await reader.close();
});

test('personal best: a malformed legacy record preserves the valid authoritative best and usable results', async ({ page, context }, info) => {
  const reader = await openStoragePage(context);
  const canonical = 5000;
  const damaged = 'unrecognized';
  // Seed existing records only once; do not replace native IndexedDB, Web Locks,
  // or storage methods, and never reseed on reload.
  await databaseBest(reader, key, canonical);
  await reader.evaluate(({ key, damaged }) => localStorage.setItem(key, damaged), { key, damaged });
  const records = async () => {
    // Reload a storage-only document so localStorage's per-tab cache cannot
    // conceal an unsafe mirror write. The database read uses a new transaction.
    await reader.reload();
    return {
      canonical: await databaseBest(reader, key),
      legacy: await reader.evaluate((key) => localStorage.getItem(key), key),
    };
  };
  const unchanged = { canonical, legacy: damaged };
  expect(await records()).toEqual(unchanged);

  const readWarning = 'Your saved personal best could not be read. Existing scores have not been changed.';
  await openClockedGame(page, info);
  await pressButton(page, info, 'button-difficulty-easy');
  await expect(page.getByTestId('text-error')).toHaveText(readWarning);
  await expect(page.getByTestId('text-missions-count')).toHaveText('0 / 4 COMPLETE');
  expect(await records()).toEqual(unchanged);

  const run = await RunDriver.start(page, info);
  // Exceed the valid authoritative best: an unsafe save must not look harmless
  // just because taking the maximum would leave the old number unchanged.
  for (let index = 0; index < 6; index++) await run.hit(index);
  await expect(page.getByTestId('text-score')).toHaveText('6,000');
  await assertTrustedLaneInput(page, info);
  await run.finish();
  await expect(page.getByTestId('text-final-score')).toHaveText('6,000');
  await expect(page.getByTestId('text-results-best')).toHaveText('6,000');
  await expect(page.getByTestId('badge-new-first-run')).toHaveText('NEWLY EARNED');
  await expect(page.getByTestId('text-game-error')).toHaveText(
    'Your score is shown below, but this browser could not save your personal best.');
  expect(await records()).toEqual(unchanged);
  await checkRenderer(page, info, 'malformed-legacy-results', true);

  await pressButton(page, info, 'button-menu');
  await expect(page.getByTestId('text-error')).toHaveText(readWarning);
  await expect(page.getByTestId('badge-complete-first-run')).toHaveText('DONE');
  await page.reload();
  await pressButton(page, info, 'button-difficulty-easy');
  await expect(page.getByTestId('text-error')).toHaveText(readWarning);
  await expect(page.getByTestId('badge-complete-first-run')).toHaveText('DONE');
  expect(await records()).toEqual(unchanged);
  await checkRenderer(page, info, 'malformed-legacy-reload', true);
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
