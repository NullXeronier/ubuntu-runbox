import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { MissionTracker, type MissionStorage } from "./missions";
import { RhythmGame, TRACKS, type Track } from "./engine";

class MemoryStorage implements MissionStorage {
  values = new Map<string, string>();
  writes = 0;
  failRead = false;
  failWrite = false;
  getItem(key: string) {
    if (this.failRead) throw new Error("Storage denied");
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failWrite) throw new Error("Storage denied");
    this.writes++;
    this.values.set(key, value);
  }
}

class FakeMusic {
  time = 0;
  running = false;
  async prepare() {}
  start(track: Track) { this.time = -4 * 60 / track.bpm; this.running = true; }
  pause() { this.running = false; }
  async resume() { this.running = true; }
  stop() { this.time = 0; this.running = false; }
  getTime = () => this.time;
  setVolume() {}
}

let now = 1000;
let nextFrame: FrameRequestCallback | null = null;
let frameId = 0;
const originalRaf = globalThis.requestAnimationFrame;
const originalCancel = globalThis.cancelAnimationFrame;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  now = 1000;
  nextFrame = null;
  mock.method(performance, "now", () => now);
  globalThis.requestAnimationFrame = (callback) => { nextFrame = callback; return ++frameId; };
  globalThis.cancelAnimationFrame = () => { nextFrame = null; };
});

afterEach(() => {
  mock.restoreAll();
  globalThis.requestAnimationFrame = originalRaf;
  globalThis.cancelAnimationFrame = originalCancel;
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
});

function createRun() {
  const audio = new FakeMusic();
  const game = new RhythmGame({ audio, missions: new MissionTracker(storage) });
  const step = (time: number) => {
    audio.time = time;
    now += 100;
    const callback = nextFrame;
    nextFrame = null;
    callback?.(now);
  };
  return { game, audio, step };
}

const stats = (patch: Partial<{ maxCombo: number; perfect: number; score: number; finished: boolean }> = {}) =>
  ({ maxCombo: 0, perfect: 0, score: 0, finished: false, ...patch });

test("four missions have the agreed targets and no initial completion", () => {
  const tracker = new MissionTracker(storage);
  assert.deepEqual(tracker.getSnapshot().map((m) => m.target), [1, 20, 40, 100000]);
  assert.ok(tracker.getSnapshot().every((m) => m.current === 0 && !m.completed && !m.completedThisRun));
  assert.equal(storage.writes, 0);
});

test("thresholds use actual stats, clamp values, and complete each badge once", () => {
  const tracker = new MissionTracker(storage);
  tracker.advance(stats({ maxCombo: 19, perfect: 39, score: 99999 }));
  assert.ok(tracker.getSnapshot().every((m) => !m.completed));
  assert.equal(storage.writes, 0);
  tracker.advance(stats({ maxCombo: 20, perfect: 40, score: 100000 }));
  assert.deepEqual(tracker.getSnapshot().map((m) => m.completed), [false, true, true, true]);
  assert.equal(storage.writes, 1);
  tracker.advance(stats({ maxCombo: 999, perfect: 999, score: 999999 }));
  assert.equal(storage.writes, 1);
  assert.deepEqual(tracker.getSnapshot().map((m) => m.current), [0, 20, 40, 100000]);
});

test("completed badges survive reload; fresh runs reset unfinished progress and new flags", () => {
  const tracker = new MissionTracker(storage);
  tracker.advance(stats({ maxCombo: 20, perfect: 12, score: 40000 }));
  tracker.reset();
  assert.deepEqual(tracker.getSnapshot().map((m) => m.current), [0, 20, 0, 0]);
  assert.ok(tracker.getSnapshot().every((m) => !m.completedThisRun));
  const reloaded = new MissionTracker(storage);
  assert.equal(reloaded.getSnapshot()[1]!.completed, true);
  assert.equal(reloaded.getSnapshot()[1]!.completedThisRun, false);
  assert.equal(reloaded.getSnapshot()[2]!.current, 0);
});

test("unfinished missions are per-run, not lifetime counters", () => {
  const tracker = new MissionTracker(storage);
  tracker.advance(stats({ maxCombo: 10, perfect: 25, score: 60000 }));
  tracker.reset();
  tracker.advance(stats({ maxCombo: 10, perfect: 25, score: 60000 }));
  assert.ok(tracker.getSnapshot().every((m) => !m.completed));
  assert.equal(tracker.getSnapshot()[2]!.current, 25);
});

test("finishing a full track is a separate event from reaching any score", () => {
  const tracker = new MissionTracker(storage);
  tracker.advance(stats({ score: 1000000 }));
  assert.equal(tracker.getSnapshot()[0]!.completed, false);
  tracker.advance(stats({ finished: true }));
  assert.equal(tracker.getSnapshot()[0]!.completed, true);
});

test("blocked and corrupt storage report warnings but do not prevent completion", () => {
  storage.failRead = true;
  storage.failWrite = true;
  const tracker = new MissionTracker(storage);
  assert.ok(tracker.getError());
  tracker.advance(stats({ maxCombo: 20 }));
  assert.equal(tracker.getSnapshot()[1]!.completed, true);
  assert.match(tracker.getError()!, /cannot be saved/);
  storage.failRead = false;
  storage.failWrite = false;
  tracker.advance(stats({ perfect: 40 }));
  assert.equal(tracker.getError(), null);
  storage.values.set("pulse-missions", '{"version":1,"completed":["not-a-mission"]}');
  const corrupt = new MissionTracker(storage);
  assert.ok(corrupt.getError());
  assert.ok(corrupt.getSnapshot().every((m) => !m.completed));
});

test("unavailable storage and invalid stats never create fake mission progress", () => {
  const tracker = new MissionTracker(null);
  tracker.advance(stats({ maxCombo: Infinity, perfect: NaN, score: -100 }));
  assert.ok(tracker.getSnapshot().every((m) => m.current === 0 && !m.completed));
  assert.ok(tracker.getError());
});

test("engine real note hits advance combo/perfect/score quests; pause preserves them", async () => {
  const { game, audio, step } = createRun();
  await game.start();
  assert.equal(game.getSnapshot().phase, "countdown");
  step(0);
  for (const note of game.getNotes().slice(0, 40)) {
    step(note.time);
    assert.equal(game.hit(note.lane), "PERFECT");
  }
  const snapshot = game.getSnapshot();
  assert.equal(snapshot.perfect, 40);
  assert.equal(snapshot.maxCombo, 40);
  assert.equal(snapshot.score, 103000);
  assert.deepEqual(snapshot.missions.map((m) => m.completed), [false, true, true, true]);
  const progress = snapshot.missions;
  game.pause();
  assert.equal(audio.running, false);
  assert.equal(game.getSnapshot().phase, "paused");
  assert.deepEqual(game.getSnapshot().missions, progress);
  assert.equal(game.hit(0), null);
  await game.resume();
  assert.equal(audio.running, true);
  assert.deepEqual(game.getSnapshot().missions, progress);
  game.exit();
});

test("restart/quit never count as finishing and reset unfinished run progress", async () => {
  const { game, step } = createRun();
  await game.start();
  step(0);
  for (const note of game.getNotes().slice(0, 5)) {
    step(note.time);
    game.hit(note.lane);
  }
  assert.equal(game.getSnapshot().missions[2]!.current, 5);
  await game.restart();
  assert.ok(game.getSnapshot().missions.every((m) => !m.completed && m.current === 0));
  game.pause();
  game.exit();
  assert.equal(game.getSnapshot().phase, "idle");
  assert.equal(game.getSnapshot().missions[0]!.completed, false);
  game.configure(TRACKS[1]!.id, "hard");
  assert.equal(game.getSnapshot().track.id, TRACKS[1]!.id);
  assert.ok(game.getSnapshot().missions.every((m) => m.current === 0));
});

test("finishing through the audio clock awards first-run and retains bests and badges", async () => {
  const { game, step } = createRun();
  await game.start();
  step(0);
  step(game.getSnapshot().duration);
  assert.equal(game.getSnapshot().phase, "results");
  assert.equal(game.getSnapshot().progress, 1);
  assert.equal(game.getSnapshot().missions[0]!.completedThisRun, true);
  assert.ok(storage.getItem("pulse-best:neon-drift:normal") !== null);
  game.exit();
  assert.equal(game.getSnapshot().missions[0]!.completed, true);
  assert.equal(game.getSnapshot().missions[0]!.completedThisRun, false);
  game.configure(TRACKS[2]!.id, "easy");
  assert.equal(game.getSnapshot().missions[0]!.completed, true);
  const reloaded = new RhythmGame({ audio: new FakeMusic(), missions: new MissionTracker(storage) });
  assert.equal(reloaded.getSnapshot().missions[0]!.completed, true);
});

test("effects preference persists without altering rhythm settings and reports save failures", () => {
  const { game } = createRun();
  const notes = game.getNotes().map((n) => ({ ...n }));
  game.setReducedEffects(true);
  assert.equal(game.getSnapshot().reducedEffects, true);
  assert.deepEqual(game.getNotes(), notes);
  game.configure(TRACKS[1]!.id, "hard");
  assert.equal(game.getSnapshot().reducedEffects, true);
  const reloaded = new RhythmGame({ audio: new FakeMusic(), missions: new MissionTracker(storage) });
  assert.equal(reloaded.getSnapshot().reducedEffects, true);
  storage.failWrite = true;
  game.setReducedEffects(false);
  assert.equal(game.getSnapshot().reducedEffects, false);
  assert.match(game.getSnapshot().error!, /effects preference could not be saved/);
});
