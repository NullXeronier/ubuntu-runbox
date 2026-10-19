import type { Page } from '@playwright/test';

/** Inspect (or seed an existing player's record in) the real browser database. */
export async function databaseBest(page: Page, key: string, seed?: number) {
  return page.evaluate(({ key, seed }) => new Promise<number | undefined>((resolve, reject) => {
    const open = indexedDB.open('pulse-personal-bests', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('scores');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const transaction = db.transaction('scores', seed === undefined ? 'readonly' : 'readwrite');
      const store = transaction.objectStore('scores');
      if (seed !== undefined) store.put(seed, key);
      const read = store.get(key);
      transaction.oncomplete = () => { db.close(); resolve(read.result as number | undefined); };
      transaction.onabort = () => { db.close(); reject(transaction.error); };
    };
  }), { key, seed });
}
