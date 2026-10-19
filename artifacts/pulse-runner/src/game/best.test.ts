import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { bestKey, loadBest, persistBest, readLegacyBest } from "./best";

const originals = new Map(["indexedDB", "navigator", "localStorage"].map((name) =>
  [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
const key = bestKey("neon-drift", "easy");
let values: Map<string, string>;
let staleReads: boolean;
let deniedReads: boolean;
let deniedWrites: boolean;
let callbackFailures: unknown[];

beforeEach(() => {
  values = new Map();
  callbackFailures = [];
  staleReads = deniedReads = deniedWrites = false;
  const queues = new Map<string, Promise<unknown>>();
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
    locks: { request(name: string, _options: unknown, callback: () => unknown) {
      const next = (queues.get(name) ?? Promise.resolve()).then(async () => {
        try { return await callback(); }
        catch (error) {
          callbackFailures.push(error);
          throw error;
        }
      });
      queues.set(name, next.catch(() => {}));
      return next;
    } },
  } });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem(name: string) {
      if (deniedReads) throw new Error("Read denied");
      return staleReads ? null : values.get(name) ?? null;
    },
    setItem(name: string, value: string) {
      if (deniedWrites) throw new Error("Write denied");
      values.set(name, value);
    },
  } });
});

afterEach(() => {
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  // Node's promise adoption does not reproduce Firefox's native Web Lock
  // reporting. Assert the boundary itself, not just the caller's rejection.
  assert.deepEqual(callbackFailures, [], "Web Lock callbacks must fulfill even when persistence rejects");
});

for (const scores of [[3000, 1000], [1000, 3000]]) {
  test(`atomic best survives stale localStorage reads with ${scores[0]} queued first`, async () => {
    staleReads = true;
    const results = await Promise.all(scores.map((score) => persistBest(key, score)));
    assert.deepEqual(results, [scores[0], 3000]);
    assert.equal(values.get(key), "3000");
    assert.equal(await loadBest(key), 3000);
  });
}

test("legacy scores are preserved and higher later legacy values are merged", async () => {
  values.set(key, "5000");
  assert.equal(await loadBest(key), 5000);
  assert.equal(await persistBest(key, 1000), 5000);
  values.set(key, "9000"); // An older already-open game version.
  assert.equal(await persistBest(key, 2000), 9000);
  staleReads = true;
  assert.equal(await loadBest(key), 9000);
});

test("the authoritative best survives a stale/missing mirror and remains separated by track and difficulty", async () => {
  await persistBest(key, 5000);
  values.set(key, "1000");
  assert.equal(await loadBest(key), 5000);
  assert.equal(await persistBest(bestKey("neon-drift", "hard"), 0), 0);
  assert.equal(await persistBest(bestKey("overdrive", "easy"), 2000), 2000);
  assert.equal(await loadBest(key), 5000);
  assert.equal(await loadBest(bestKey("neon-drift", "hard")), 0);
});

test("a denied legacy read never overwrites either stored best", async () => {
  await persistBest(key, 5000);
  deniedReads = true;
  await assert.rejects(persistBest(key, 6000), /Read denied/);
  assert.equal(values.get(key), "5000");
  deniedReads = false;
  assert.equal(await loadBest(key), 5000);
});

test("malformed legacy scores preserve both records rather than becoming zero", async () => {
  await persistBest(key, 5000);
  for (const damaged of ["unrecognized", "", "  ", "-1", "NaN", "Infinity"]) {
    values.set(key, damaged);
    assert.equal(readLegacyBest(key), 0);
    await assert.rejects(loadBest(key), /Unreadable legacy personal best/);
    await assert.rejects(persistBest(key, 6000), /Unreadable legacy personal best/);
    assert.equal(values.get(key), damaged);
    staleReads = true; // Read only the authoritative record, without its mirror.
    assert.equal(await loadBest(key), 5000);
    staleReads = false;
  }
});

test("missing and zero legacy scores remain valid", async () => {
  assert.equal(await loadBest(key), 0);
  values.set(key, "0");
  assert.equal(await loadBest(key), 0);
  assert.equal(await persistBest(key, 1000), 1000);
});

test("a denied mirror write aborts the authoritative write", async () => {
  await persistBest(key, 5000);
  deniedWrites = true;
  await assert.rejects(persistBest(key, 6000), /Write denied/);
  assert.equal(values.get(key), "5000");
  deniedWrites = false;
  staleReads = true;
  assert.equal(await loadBest(key), 5000);
});

test("an IndexedDB write failure leaves the old score untouched", async () => {
  await persistBest(key, 5000);
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = () => { throw new Error("Database quota exceeded"); };
  try {
    await assert.rejects(persistBest(key, 6000), /Database quota exceeded/);
  } finally {
    IDBObjectStore.prototype.put = put;
  }
  assert.equal(values.get(key), "5000");
  staleReads = true;
  assert.equal(await loadBest(key), 5000);
});

test("missing IndexedDB or Web Locks does not silently downgrade to a localStorage write", async () => {
  values.set(key, "5000");
  const database = indexedDB;
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: undefined });
  await assert.rejects(persistBest(key, 6000));
  assert.equal(values.get(key), "5000");
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: database });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
  await assert.rejects(persistBest(key, 6000), /Safe cross-tab/);
  assert.equal(values.get(key), "5000");
});

for (const fault of ["storage-access", "storage-read", "database-open"] as const) {
  test(`${fault} denial fulfills the lock callback but rejects the save with the original error`, async () => {
    await persistBest(key, 5000);
    const database = indexedDB;
    const storage = localStorage;
    const error = new DOMException(`${fault} denied`, "SecurityError");
    if (fault === "storage-access") {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true, get() { throw error; },
      });
    } else if (fault === "storage-read") {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true, value: { getItem() { throw error; } },
      });
    } else {
      Object.defineProperty(globalThis, "indexedDB", {
        configurable: true, value: { open() { throw error; } },
      });
    }
    await assert.rejects(persistBest(key, 6000), (reason) => reason === error);
    assert.equal(values.get(key), "5000");
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: database });
    staleReads = true;
    assert.equal(await loadBest(key), 5000);
    assert.equal(await persistBest(key, 6000), 6000, "a later save can recover");
  });
}

test("lock request rejection still reaches the caller without writing", async () => {
  await persistBest(key, 5000);
  const error = new DOMException("Lock request denied", "SecurityError");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
    locks: { request() { return Promise.reject(error); } },
  } });
  await assert.rejects(persistBest(key, 6000), (reason) => reason === error);
  assert.equal(values.get(key), "5000");
  staleReads = true;
  assert.equal(await loadBest(key), 5000);
});

test("invalid candidates never write", async () => {
  for (const score of [NaN, Infinity, -1]) await assert.rejects(persistBest(key, score), /Invalid/);
  assert.equal(values.size, 0);
});

test("an unreadable authoritative record is preserved rather than overwritten", async () => {
  await persistBest(key, 5000);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("pulse-personal-bests", 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("scores", "readwrite");
    transaction.objectStore("scores").put("unrecognized", key);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
  });
  db.close();
  await assert.rejects(persistBest(key, 6000), /Unreadable personal best/);
  await assert.rejects(loadBest(key), /Unreadable personal best/);
  assert.equal(values.get(key), "5000");
});
