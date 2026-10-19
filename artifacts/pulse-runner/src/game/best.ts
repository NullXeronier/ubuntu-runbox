// IndexedDB is authoritative. Web Locks alone do not make Chromium's per-tab
// localStorage caches coherent. Keep the legacy key as a compatibility mirror
// and import its maximum on every save; never delete an existing player's best.
const DATABASE = "pulse-personal-bests";
const STORE = "scores";

export const bestKey = (trackId: string, difficulty: string) =>
  `pulse-best:${trackId}:${difficulty}`;

export function readLegacyBest(key: string, requireReadable = false): number {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return 0;
    const score = Number(value);
    if (value.trim() === "" || !Number.isFinite(score) || score < 0) {
      throw new Error("Unreadable legacy personal best");
    }
    return score;
  } catch (error) {
    if (requireReadable) throw error;
    return 0;
  }
}

function storedScore(value: unknown): number {
  if (value === undefined) return 0;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("Unreadable personal best");
  }
  return value;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // A missing/denied API rejects rather than silently using unsafe storage.
    const request = indexedDB.open(DATABASE, 1);
    let blocked = false;
    request.onblocked = () => {
      blocked = true;
      reject(new Error("Personal-best storage is blocked by another page"));
    };
    request.onupgradeneeded = () => {
      if (blocked) request.transaction?.abort();
      else request.result.createObjectStore(STORE);
    };
    request.onerror = () => reject(request.error ?? new Error("Personal-best storage could not open"));
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else {
        // Never hold a connection open across operations or block future upgrades.
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      }
    };
  });
}

export async function loadBest(key: string): Promise<number> {
  const legacy = readLegacyBest(key, true);
  const db = await openDatabase();
  try {
    return await new Promise<number>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readonly");
      const request = transaction.objectStore(STORE).get(key);
      let best = legacy;
      let failure: unknown;
      request.onsuccess = () => {
        try { best = Math.max(legacy, storedScore(request.result)); }
        catch (error) { failure = error; transaction.abort(); }
      };
      transaction.oncomplete = () => resolve(best);
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error("Personal-best read aborted"));
    });
  } finally {
    db.close();
  }
}

export async function persistBest(key: string, candidate: number): Promise<number> {
  if (!Number.isFinite(candidate) || candidate < 0) throw new Error("Invalid personal best");
  if (!navigator.locks?.request) throw new Error("Safe cross-tab saving is unavailable");
  // Firefox can report a rejected LockGrantedCallback promise as uncaught even
  // when the request's rejection is handled by saveBest. Fulfill the native
  // callback with an outcome, then reject on the caller-owned promise instead.
  const outcome = await navigator.locks.request(key, { mode: "exclusive" }, async () => {
    try {
      return { ok: true as const, best: await persistLockedBest(key, candidate) };
    } catch (error) {
      return { ok: false as const, error };
    }
  });
  if (!outcome.ok) throw outcome.error;
  return outcome.best;
}

async function persistLockedBest(key: string, candidate: number): Promise<number> {
  // Preserve unreadable legacy data, even when IndexedDB is accessible.
  const legacy = readLegacyBest(key, true);
  const db = await openDatabase();
  try {
    return await new Promise<number>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE);
      const request = store.get(key);
      let best = 0;
      let failure: unknown;
      request.onsuccess = () => {
        try {
          best = Math.max(candidate, legacy, storedScore(request.result));
          store.put(best, key);
          // Throwing here aborts the pending IDB write too. A later IDB abort
          // may leave this mirror higher, but never destroys the old best.
          localStorage.setItem(key, String(best));
        } catch (error) {
          failure = error;
          transaction.abort();
        }
      };
      // Keep the Web Lock until COMMIT, not merely until put() succeeds.
      transaction.oncomplete = () => resolve(best);
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error("Personal-best save aborted"));
    });
  } finally {
    db.close();
  }
}
