import { SynthMusic } from "./audio";
import { MissionTracker, type MissionProgress } from "./missions";
import { calibratedTime, TimingPreference } from "./timing";

export type Lane = 0 | 1 | 2 | 3;
export type Phase = "idle" | "countdown" | "playing" | "paused" | "results";
export type Difficulty = "easy" | "normal" | "hard";
export type Judge = "PERFECT" | "GOOD" | "MISS";
export interface Note {
  id: number;
  time: number;
  lane: Lane;
  status: "pending" | "hit" | "missed";
}
export interface Track {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  duration: number;
  description: string;
  color: string;
}
export interface GameSnapshot {
  phase: Phase;
  track: Track;
  difficulty: Difficulty;
  elapsed: number;
  duration: number;
  score: number;
  combo: number;
  maxCombo: number;
  hits: number;
  perfect: number;
  good: number;
  misses: number;
  accuracy: number;
  progress: number;
  multiplier: number;
  lastJudge: Judge | null;
  lastJudgeAt: number;
  lastLane: Lane | null;
  lastHitAt: number;
  best: number;
  volume: number;
  error: string | null;
  missions: MissionProgress[];
  missionError: string | null;
  reducedEffects: boolean;
  timingOffsetMs: number;
  timingError: string | null;
}

export const TRACKS: Track[] = [
  { id: "neon-drift", title: "Neon Drift", artist: "PULSE ORIGINALS", bpm: 128, duration: 90, description: "Melodic synths. An endless neon night.", color: "#a98bff" },
  { id: "midnight-circuit", title: "Midnight Circuit", artist: "PULSE ORIGINALS", bpm: 112, duration: 192 * 60 / 112, description: "Deep bass. Find your flow after dark.", color: "#4ce0d2" },
  { id: "overdrive", title: "Overdrive", artist: "PULSE ORIGINALS", bpm: 150, duration: 76.8, description: "Faster beats. No looking back.", color: "#ff7198" },
];
export const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard"];

const hitWindow: Record<Difficulty, number> = { easy: 0.21, normal: 0.16, hard: 0.125 };
const lanePattern: Lane[] = [0, 1, 2, 3, 2, 1, 0, 2, 3, 1, 2, 0, 3, 2, 1, 3];

function makeNotes(track: Track, difficulty: Difficulty): Note[] {
  const notes: Note[] = [];
  const beat = 60 / track.bpm;
  const totalBeats = Math.floor(track.duration / beat) - 2;
  const offset = track.id === "midnight-circuit" ? 3 : track.id === "overdrive" ? 7 : 0;
  for (let b = 4; b < totalBeats; b++) {
    if (difficulty === "easy" && b % 4 === 3) continue;
    const lane = lanePattern[(b - 4 + offset) % lanePattern.length]!;
    notes.push({ id: notes.length, time: b * beat, lane, status: "pending" });
    if ((difficulty === "normal" && b % 8 >= 5) || (difficulty === "hard" && b % 4 !== 3)) {
      notes.push({ id: notes.length, time: (b + 0.5) * beat, lane: ((lane + 1 + b % 2) % 4) as Lane, status: "pending" });
    }
  }
  return notes;
}

function readBest(track: Track, difficulty: Difficulty): number {
  try {
    const score = Number(localStorage.getItem(`pulse-best:${track.id}:${difficulty}`));
    return Number.isFinite(score) && score > 0 ? score : 0;
  } catch {
    return 0;
  }
}

function readReducedEffects(): boolean {
  try {
    const stored = localStorage.getItem("pulse-reduced-effects");
    if (stored === "true" || stored === "false") return stored === "true";
  } catch {
    // The mission tracker exposes storage failures without blocking the game.
  }
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

function initialSnapshot(track = TRACKS[0]!, difficulty: Difficulty = "normal", volume = 0.65, reducedEffects = readReducedEffects()): GameSnapshot {
  return {
    phase: "idle", track, difficulty, elapsed: 0, duration: track.duration,
    score: 0, combo: 0, maxCombo: 0, hits: 0, perfect: 0, good: 0, misses: 0,
    accuracy: 100, progress: 0, multiplier: 1, lastJudge: null,
    lastJudgeAt: 0, lastLane: null, lastHitAt: 0, best: readBest(track, difficulty),
    volume, error: null,
    missions: [], missionError: null, reducedEffects, timingOffsetMs: 0, timingError: null,
  };
}

type GameAudio = Pick<SynthMusic, "prepare" | "start" | "pause" | "resume" | "stop" | "getTime" | "setVolume">;

export class RhythmGame {
  private audio: GameAudio;
  private missions: MissionTracker;
  private timing: TimingPreference;
  private snapshot: GameSnapshot;
  private notes: Note[];
  private listeners = new Set<() => void>();
  private frame: number | null = null;
  private lastPublish = 0;
  private missCursor = 0;
  private starting = false;
  private operation = 0;
  private lastInput: number[] = [-Infinity, -Infinity, -Infinity, -Infinity];

  constructor(options: { audio?: GameAudio; missions?: MissionTracker; timing?: TimingPreference } = {}) {
    this.audio = options.audio ?? new SynthMusic();
    this.missions = options.missions ?? new MissionTracker();
    this.timing = options.timing ?? new TimingPreference();
    this.snapshot = {
      ...initialSnapshot(),
      missions: this.missions.getSnapshot(),
      missionError: this.missions.getError(),
      timingOffsetMs: this.timing.getOffset(),
      timingError: this.timing.getError(),
    };
    this.notes = makeNotes(this.snapshot.track, this.snapshot.difficulty);
    // Background tabs pause instead of silently dropping the player's combo.
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) this.pause();
      });
      window.addEventListener("blur", () => this.pause());
      window.addEventListener("storage", (event) => {
        this.missions.handleStorage(event);
        this.update({});
      });
    }
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  getSnapshot = (): GameSnapshot => this.snapshot;
  getTime = () => this.snapshot.phase === "countdown" || this.snapshot.phase === "playing" || this.snapshot.phase === "paused"
    ? this.audio.getTime() : this.snapshot.elapsed;
  getNoteTime = () => calibratedTime(this.getTime(), this.snapshot.timingOffsetMs);
  getNotes = () => this.notes;

  configure = (trackId: string, difficulty: Difficulty) => {
    if (this.snapshot.phase !== "idle" && this.snapshot.phase !== "results") return;
    const track = TRACKS.find((item) => item.id === trackId);
    if (!track || !DIFFICULTIES.includes(difficulty)) return;
    this.resetRun(track, difficulty);
    this.notes = makeNotes(track, difficulty);
    this.publish();
  };

  start = async () => {
    if (this.starting || !["idle", "results"].includes(this.snapshot.phase)) return;
    this.starting = true;
    const operation = ++this.operation;
    try {
      await this.audio.prepare();
      if (operation !== this.operation) return;
      const { track, difficulty, volume } = this.snapshot;
      this.resetRun(track, difficulty, volume);
      this.notes = makeNotes(track, difficulty);
      this.missCursor = 0;
      this.lastInput.fill(-Infinity);
      this.audio.start(track);
      this.update({ phase: "countdown", elapsed: this.audio.getTime(), error: null });
      this.startFrame();
    } catch (error) {
      this.update({ error: error instanceof Error ? error.message : "Audio could not start. Please try again." });
    } finally {
      this.starting = false;
    }
  };

  pause = () => {
    if (this.snapshot.phase !== "playing" && this.snapshot.phase !== "countdown") return;
    this.audio.pause();
    this.cancelFrame();
    this.update({ phase: "paused", elapsed: this.audio.getTime() });
  };

  resume = async () => {
    if (this.snapshot.phase !== "paused" || this.starting) return;
    this.starting = true;
    const operation = ++this.operation;
    try {
      await this.audio.resume();
      if (operation !== this.operation) {
        this.audio.stop();
        return;
      }
      this.update({ phase: this.audio.getTime() < 0 ? "countdown" : "playing", error: null });
      this.startFrame();
    } catch (error) {
      this.update({ error: error instanceof Error ? error.message : "Audio could not resume." });
    } finally {
      this.starting = false;
    }
  };

  restart = async () => {
    if (this.starting) return;
    this.exit();
    await this.start();
  };

  exit = () => {
    this.operation++;
    this.audio.stop();
    this.cancelFrame();
    this.resetRun(this.snapshot.track, this.snapshot.difficulty);
    this.notes = makeNotes(this.snapshot.track, this.snapshot.difficulty);
    this.publish();
  };

  hit = (lane: Lane): Judge | null => {
    if (this.snapshot.phase !== "playing" || ![0, 1, 2, 3].includes(lane)) return null;
    const now = performance.now();
    if (now - this.lastInput[lane]! < 65) return null;
    this.lastInput[lane] = now;
    const elapsed = this.getNoteTime();
    const window = hitWindow[this.snapshot.difficulty];
    let candidate: Note | undefined;
    let delta = Infinity;
    for (let i = this.missCursor; i < this.notes.length; i++) {
      const note = this.notes[i]!;
      if (note.time > elapsed + window) break;
      if (note.status !== "pending" || note.lane !== lane) continue;
      const difference = Math.abs(note.time - elapsed);
      if (difference <= window && difference < delta) {
        candidate = note;
        delta = difference;
      }
    }
    if (!candidate) {
      this.judgeMiss(lane);
      return "MISS";
    }
    candidate.status = "hit";
    const judge: Judge = delta <= (this.snapshot.difficulty === "easy" ? 0.085 : 0.06) ? "PERFECT" : "GOOD";
    const combo = this.snapshot.combo + 1;
    const multiplier = Math.min(4, 1 + Math.floor(combo / 10));
    const perfect = this.snapshot.perfect + (judge === "PERFECT" ? 1 : 0);
    const good = this.snapshot.good + (judge === "GOOD" ? 1 : 0);
    const hits = perfect + good;
    this.update({
      score: this.snapshot.score + (judge === "PERFECT" ? 1000 : 650) * multiplier,
      combo, maxCombo: Math.max(this.snapshot.maxCombo, combo), hits, perfect, good,
      accuracy: this.accuracy(perfect, good, this.snapshot.misses),
      multiplier, lastJudge: judge, lastJudgeAt: now, lastLane: lane, lastHitAt: now,
    });
    return judge;
  };

  setVolume = (value: number) => {
    if (!Number.isFinite(value)) return;
    const volume = Math.max(0, Math.min(1, value));
    this.audio.setVolume(volume);
    this.update({ volume });
  };

  setReducedEffects = (reducedEffects: boolean) => {
    if (typeof reducedEffects !== "boolean") return;
    let error = this.snapshot.error;
    try {
      localStorage.setItem("pulse-reduced-effects", String(reducedEffects));
      if (error === "Your effects preference could not be saved in this browser.") error = null;
    } catch {
      error = "Your effects preference could not be saved in this browser.";
    }
    this.update({ reducedEffects, error });
  };

  setTimingOffset = (value: number) => {
    // Change between runs only: moving pending notes mid-run can create unfair misses.
    if (!["idle", "results"].includes(this.snapshot.phase) || this.starting || !Number.isFinite(value)) return;
    this.timing.set(value);
    this.update({ timingOffsetMs: this.timing.getOffset(), timingError: this.timing.getError() });
  };

  private resetRun(track: Track, difficulty: Difficulty, volume = this.snapshot.volume) {
    this.missions.reset();
    this.snapshot = {
      ...initialSnapshot(track, difficulty, volume, this.snapshot.reducedEffects),
      missions: this.missions.getSnapshot(),
      missionError: this.missions.getError(),
      timingOffsetMs: this.snapshot.timingOffsetMs,
      timingError: this.snapshot.timingError,
    };
  }

  private accuracy(perfect: number, good: number, misses: number) {
    const total = perfect + good + misses;
    return total ? ((perfect + good * 0.7) / total) * 100 : 100;
  }

  private judgeMiss(lane: Lane) {
    const misses = this.snapshot.misses + 1;
    this.update({
      combo: 0, multiplier: 1, misses, lastJudge: "MISS", lastJudgeAt: performance.now(),
      lastLane: lane, accuracy: this.accuracy(this.snapshot.perfect, this.snapshot.good, misses),
    });
  }

  private tick = (now: number) => {
    if (this.snapshot.phase !== "countdown" && this.snapshot.phase !== "playing") return;
    const elapsed = this.audio.getTime();
    const noteTime = calibratedTime(elapsed, this.snapshot.timingOffsetMs);
    if (elapsed >= 0 && this.snapshot.phase === "countdown") this.update({ phase: "playing" });
    while (this.missCursor < this.notes.length) {
      const note = this.notes[this.missCursor]!;
      if (note.time >= noteTime - hitWindow[this.snapshot.difficulty]) break;
      if (note.status === "pending") {
        note.status = "missed";
        this.judgeMiss(note.lane);
      }
      this.missCursor++;
    }
    if (elapsed >= this.snapshot.duration) {
      this.finish();
      return;
    }
    if (now - this.lastPublish > 32) {
      this.lastPublish = now;
      this.update({ elapsed, progress: Math.max(0, Math.min(1, elapsed / this.snapshot.duration)) });
    }
    this.frame = requestAnimationFrame(this.tick);
  };

  private finish() {
    this.audio.stop();
    this.cancelFrame();
    const best = Math.max(this.snapshot.best, this.snapshot.score);
    let error: string | null = null;
    try {
      localStorage.setItem(`pulse-best:${this.snapshot.track.id}:${this.snapshot.difficulty}`, String(best));
    } catch {
      error = "Your score is shown below, but this browser could not save your personal best.";
    }
    this.update({ phase: "results", elapsed: this.snapshot.duration, progress: 1, best, error });
  }

  private startFrame() {
    this.cancelFrame();
    this.lastPublish = 0;
    this.frame = requestAnimationFrame(this.tick);
  }

  private cancelFrame() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  private update(patch: Partial<GameSnapshot>) {
    const next = { ...this.snapshot, ...patch };
    if (patch.score !== undefined || patch.maxCombo !== undefined || patch.perfect !== undefined || patch.phase === "results") {
      this.missions.advance({
        maxCombo: next.maxCombo, perfect: next.perfect, score: next.score,
        finished: next.phase === "results",
      });
    }
    this.snapshot = { ...next, missions: this.missions.getSnapshot(), missionError: this.missions.getError() };
    this.publish();
  }

  private publish() {
    for (const listener of this.listeners) listener();
  }
}

export const game = new RhythmGame();
