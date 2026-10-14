import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { SynthMusic } from "./audio";
import { RhythmGame, TRACKS, DIFFICULTIES, type Track } from "./engine";
import { MissionTracker } from "./missions";
import {
  TimingPreference, TIMING_STORAGE_KEY, boundedTimingOffset, calibratedTime,
  CALIBRATION_BEATS, CALIBRATION_INTERVAL, calibrationBeatAt, suggestTimingOffset,
} from "./timing";
import { notePositionZ } from "../components/tunnel-layout";

class MemoryStorage {
  values = new Map<string, string>();
  failRead = false;
  failWrite = false;
  getItem(key: string) {
    if (this.failRead) throw new Error("Read denied");
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failWrite) throw new Error("Write denied");
    this.values.set(key, value);
  }
}

class FakeMusic {
  time = 0;
  running = false;
  startedTrack: Track | null = null;
  async prepare() {}
  start(track: Track) {
    this.startedTrack = track;
    this.time = -4 * 60 / track.bpm;
    this.running = true;
  }
  pause() { this.running = false; }
  async resume() { this.running = true; }
  stop() { this.running = false; this.time = 0; }
  getTime = () => this.time;
  setVolume() {}
}

let storage: MemoryStorage;
let now = 1000;
let nextFrame: FrameRequestCallback | null = null;
const originalRaf = globalThis.requestAnimationFrame;
const originalCancel = globalThis.cancelAnimationFrame;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

beforeEach(() => {
  storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  now = 1000;
  nextFrame = null;
  mock.method(performance, "now", () => now);
  globalThis.requestAnimationFrame = (callback) => { nextFrame = callback; return 1; };
  globalThis.cancelAnimationFrame = () => { nextFrame = null; };
});

afterEach(() => {
  mock.restoreAll();
  globalThis.requestAnimationFrame = originalRaf;
  globalThis.cancelAnimationFrame = originalCancel;
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
});

function createRun(offset = 0) {
  const audio = new FakeMusic();
  const game = new RhythmGame({ audio, missions: new MissionTracker(storage), timing: new TimingPreference(storage) });
  game.setTimingOffset(offset);
  const step = (time: number) => {
    audio.time = time;
    now += 100;
    const callback = nextFrame;
    nextFrame = null;
    callback?.(now);
  };
  return { audio, game, step };
}

test("offset sign delays/advances note time and uses bounded integer milliseconds", () => {
  assert.equal(calibratedTime(10.2, 200), 10);
  assert.equal(calibratedTime(9.8, -200), 10);
  assert.equal(calibratedTime(10, 0), 10);
  assert.equal(boundedTimingOffset(3000), 300);
  assert.equal(boundedTimingOffset(-3000), -300);
  assert.equal(boundedTimingOffset(12.6), 13);
  assert.equal(boundedTimingOffset(NaN), 0);
  assert.equal(boundedTimingOffset(Infinity), 0);
});

test("offset defaults to zero, persists, resets and rejects corrupt saved data explicitly", () => {
  const preference = new TimingPreference(storage);
  assert.equal(preference.getOffset(), 0);
  assert.equal(preference.getError(), null);
  preference.set(185);
  assert.equal(new TimingPreference(storage).getOffset(), 185);
  preference.set(999);
  assert.equal(preference.getOffset(), 300);
  preference.set(0);
  assert.equal(storage.getItem(TIMING_STORAGE_KEY), "0");
  assert.equal(new TimingPreference(storage).getOffset(), 0);
  preference.set(-145);
  preference.set(NaN);
  assert.equal(preference.getOffset(), -145);
  for (const corrupt of ["NaN", "Infinity", "301", "-301", "1.5", '""', '"100"', "null", "true", "{}", "[]"]) {
    storage.values.set(TIMING_STORAGE_KEY, corrupt);
    const invalid = new TimingPreference(storage);
    assert.equal(invalid.getOffset(), 0, corrupt);
    assert.ok(invalid.getError(), corrupt);
  }
});

test("blocked reads/writes keep a usable session offset with explicit recoverable warnings", () => {
  storage.failRead = true;
  const preference = new TimingPreference(storage);
  assert.equal(preference.getOffset(), 0);
  assert.match(preference.getError()!, /could not be read/);
  storage.failWrite = true;
  preference.set(220);
  assert.equal(preference.getOffset(), 220);
  assert.match(preference.getError()!, /active for this page.*could not be saved/);
  storage.failRead = false;
  storage.failWrite = false;
  preference.set(-80);
  assert.equal(preference.getError(), null);
  assert.equal(new TimingPreference(storage).getOffset(), -80);
  const missing = new TimingPreference(null);
  missing.set(200);
  assert.equal(missing.getOffset(), 200);
  assert.match(missing.getError()!, /lost on reload/);
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("Denied"); } });
  assert.match(new TimingPreference().getError()!, /could not be read/);
});

test("calibration associates at most eligible click windows and uses a robust tap suggestion", () => {
  assert.equal(calibrationBeatAt(-0.301), null);
  assert.equal(calibrationBeatAt(-0.3), 0);
  assert.equal(calibrationBeatAt(0.3), 0);
  assert.equal(calibrationBeatAt(0.375), null);
  assert.equal(calibrationBeatAt(CALIBRATION_INTERVAL + 0.2), 1);
  assert.equal(calibrationBeatAt((CALIBRATION_BEATS - 1) * CALIBRATION_INTERVAL + 0.3), 7);
  assert.equal(calibrationBeatAt(CALIBRATION_BEATS * CALIBRATION_INTERVAL), null);
  assert.equal(calibrationBeatAt(NaN), null);
  assert.equal(suggestTimingOffset([100, 110, 120]), null);
  assert.equal(suggestTimingOffset([180, 200, 210, -250]), 190);
  assert.equal(suggestTimingOffset([-80, -60, -70, -90, 250]), -70);
  assert.equal(suggestTimingOffset([100, 100, 100, 100, NaN, Infinity, 999]), 100);
});

test("calibrated PERFECT hits and both renderer arrival positions agree for every track/difficulty", async () => {
  for (const offset of [-300, -125, 0, 125, 300]) {
    for (const track of TRACKS) {
      for (const difficulty of DIFFICULTIES) {
        const { game, audio, step } = createRun(offset);
        game.configure(track.id, difficulty);
        const notes = game.getNotes().map((note) => ({ ...note }));
        await game.start();
        assert.equal(audio.startedTrack, track, "audio gets the original tempo/duration");
        assert.equal(audio.getTime(), -4 * 60 / track.bpm, "audio countdown is not shifted");
        assert.deepEqual(game.getNotes(), notes, "calibration never edits beatmaps");
        const note = game.getNotes()[0]!;
        const rawTime = note.time + offset / 1000;
        step(rawTime);
        assert.equal(game.getTime(), rawTime, "public audio clock stays authoritative");
        assert.ok(Math.abs(game.getNoteTime() - note.time) < 1e-10);
        assert.ok(Math.abs(notePositionZ(note.time, game.getNoteTime())) < 1e-10);
        assert.equal(game.hit(note.lane), "PERFECT", `${offset} / ${track.id} / ${difficulty}`);
        assert.equal(game.getSnapshot().score, 1000);
        assert.equal(game.getSnapshot().perfect, 1);
        assert.deepEqual(game.getSnapshot().missions.map((mission) => mission.target), [1, 20, 40, 100000]);
        game.exit();
      }
    }
  }
});

test("GOOD windows and automatic misses shift by exactly the same offset, without widening", async () => {
  for (const offset of [-300, 0, 300]) {
    for (const difficulty of DIFFICULTIES) {
      const { game, step } = createRun(offset);
      game.configure(TRACKS[0]!.id, difficulty);
      await game.start();
      const note = game.getNotes()[0]!;
      step(note.time + offset / 1000 + 0.1);
      assert.equal(game.hit(note.lane), "GOOD");
      assert.equal(game.getSnapshot().score, 650);
      assert.equal(game.getSnapshot().accuracy, 70);
      game.exit();

      const missedRun = createRun(offset);
      missedRun.game.configure(TRACKS[0]!.id, difficulty);
      await missedRun.game.start();
      const first = missedRun.game.getNotes()[0]!;
      const window = { easy: 0.21, normal: 0.16, hard: 0.125 }[difficulty];
      missedRun.step(first.time + offset / 1000 + window - 0.001);
      assert.equal(first.status, "pending");
      missedRun.step(first.time + offset / 1000 + window + 0.001);
      assert.equal(first.status, "missed");
      assert.equal(missedRun.game.getSnapshot().misses, 1);
      missedRun.game.exit();
    }
  }
});

test("pause/resume freezes corrected note positions; resets and track changes retain offset and warnings", async () => {
  const { game, audio, step } = createRun(200);
  storage.failWrite = true;
  game.setTimingOffset(180);
  const warning = game.getSnapshot().timingError;
  assert.ok(warning);
  game.configure(TRACKS[1]!.id, "hard");
  assert.equal(game.getSnapshot().timingError, warning);
  await game.start();
  step(3.2);
  game.pause();
  const position = game.getNoteTime();
  game.setTimingOffset(-300);
  assert.equal(game.getSnapshot().timingOffsetMs, 180, "no mid-run changes");
  assert.equal(game.getNoteTime(), position);
  await game.resume();
  assert.equal(audio.getTime(), 3.2);
  assert.equal(game.getNoteTime(), position);
  assert.equal(game.getSnapshot().timingError, warning);
  await game.restart();
  assert.equal(game.getSnapshot().timingOffsetMs, 180);
  game.exit();
  assert.equal(game.getSnapshot().timingOffsetMs, 180);
  storage.failWrite = false;
  game.setTimingOffset(0);
  assert.equal(game.getSnapshot().timingError, null);
});

test("progress, track end, score rules and mission outcomes stay on the original audio timeline", async () => {
  const results = [];
  for (const offset of [-300, 0, 300]) {
    storage.values.clear();
    const { game, step } = createRun(offset);
    await game.start();
    step(0);
    game.setTimingOffset(100);
    assert.equal(game.getSnapshot().timingOffsetMs, offset);
    for (const note of game.getNotes().slice(0, 40)) {
      step(note.time + offset / 1000);
      assert.equal(game.hit(note.lane), "PERFECT");
    }
    assert.equal(game.getSnapshot().score, 103000);
    assert.deepEqual(game.getSnapshot().missions.map((mission) => mission.completed), [false, true, true, true]);
    step(45);
    assert.equal(game.getSnapshot().elapsed, 45);
    assert.equal(game.getSnapshot().progress, 0.5);
    step(game.getSnapshot().duration - 0.001);
    assert.equal(game.getSnapshot().phase, "playing");
    step(game.getSnapshot().duration);
    const snapshot = game.getSnapshot();
    assert.equal(snapshot.phase, "results");
    assert.equal(snapshot.missions[0]!.completed, true);
    results.push({ score: snapshot.score, misses: snapshot.misses, accuracy: snapshot.accuracy });
    game.setTimingOffset(0);
    assert.equal(game.getSnapshot().timingOffsetMs, 0, "results allow adjustment for the next run");
    game.exit();
  }
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[1], results[2]);
});

test("exercise schedules eight audible clicks on AudioContext time and stop cancels every source", async () => {
  const originalContext = Object.getOwnPropertyDescriptor(globalThis, "AudioContext");
  const parameter = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
  const oscillators: { startAt: number; stopped: number }[] = [];
  class FakeContext {
    currentTime = 10;
    state = "running";
    sampleRate = 100;
    destination = {};
    async resume() {}
    async close() { this.state = "closed"; }
    createGain() { return { gain: parameter(), connect() {}, disconnect() {} }; }
    createDynamicsCompressor() {
      return { threshold: parameter(), knee: parameter(), ratio: parameter(), connect() {} };
    }
    createBuffer() { return { getChannelData: () => new Float32Array(100) }; }
    createOscillator() {
      const record = { startAt: 0, stopped: 0 };
      oscillators.push(record);
      return {
        frequency: parameter(), type: "sine", onended: null, connect() {}, disconnect() {},
        start(time: number) { record.startAt = time; },
        stop(time?: number) { if (time === undefined) record.stopped++; },
      };
    }
  }
  const context = new FakeContext();
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: function () { return context; } });
  try {
    const audio = new SynthMusic();
    await audio.prepare();
    audio.startCalibration();
    assert.equal(audio.getTime(), -1);
    assert.deepEqual(oscillators.map((oscillator) => oscillator.startAt),
      Array.from({ length: CALIBRATION_BEATS }, (_, beat) => 11 + beat * CALIBRATION_INTERVAL));
    context.currentTime = 12;
    assert.equal(audio.getTime(), 1);
    audio.stop();
    assert.equal(audio.getTime(), 0);
    assert.ok(oscillators.every((oscillator) => oscillator.stopped === 1));
    audio.startCalibration();
    assert.equal(audio.getTime(), -1, "retry starts a new clean exercise");
    audio.stop();
    assert.ok(oscillators.every((oscillator) => oscillator.stopped === 1));
    await audio.dispose();
    assert.equal(context.state, "closed");
  } finally {
    if (originalContext) Object.defineProperty(globalThis, "AudioContext", originalContext);
    else Reflect.deleteProperty(globalThis, "AudioContext");
  }
});
