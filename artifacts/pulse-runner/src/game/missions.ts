export type MissionId = "first-run" | "combo-20" | "perfect-40" | "score-100k";

export interface MissionDefinition {
  id: MissionId;
  title: string;
  description: string;
  target: number;
}

export interface MissionProgress extends MissionDefinition {
  current: number;
  completed: boolean;
  completedThisRun: boolean;
}

export const MISSION_DEFINITIONS: readonly MissionDefinition[] = [
  { id: "first-run", title: "First Contact", description: "Finish one full track.", target: 1 },
  { id: "combo-20", title: "Chain Reaction", description: "Reach a 20-hit combo in one run.", target: 20 },
  { id: "perfect-40", title: "Precision Protocol", description: "Land 40 perfect hits in one run.", target: 40 },
  { id: "score-100k", title: "Neon Legend", description: "Score 100,000 points in one run.", target: 100_000 },
];

export interface MissionStats {
  maxCombo: number;
  perfect: number;
  score: number;
  finished: boolean;
}

export interface MissionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = "pulse-missions";
const STORAGE_WARNING = "Mission badges cannot be saved in this browser. Progress will remain available for this session.";
const knownIds = new Set<string>(MISSION_DEFINITIONS.map((mission) => mission.id));

function decode(raw: string | null): MissionId[] {
  if (raw === null) return [];
  const saved: unknown = JSON.parse(raw);
  if (!saved || typeof saved !== "object" || !("version" in saved) || saved.version !== 1 ||
    !("completed" in saved) || !Array.isArray(saved.completed) ||
    !saved.completed.every((id: unknown) => typeof id === "string" && knownIds.has(id))) {
    throw new Error("Unrecognized mission data");
  }
  return saved.completed as MissionId[];
}

/** Completed badges survive runs; unfinished progress belongs only to one run. */
export class MissionTracker {
  private completed = new Set<MissionId>();
  private earned = new Set<MissionId>();
  private progress: MissionProgress[] = [];
  private storage: MissionStorage | null = null;
  private error: string | null = null;

  constructor(storage?: MissionStorage | null) {
    try {
      this.storage = storage === undefined ? localStorage : storage;
      if (!this.storage) throw new Error("Storage unavailable");
      this.completed = new Set(decode(this.storage.getItem(STORAGE_KEY)));
    } catch {
      this.error = this.storage
        ? "Saved mission badges could not be read. This session's missions still work; earn a new badge to save again."
        : STORAGE_WARNING;
    }
    this.reset();
  }

  getSnapshot = () => this.progress;
  getError = () => this.error;

  private merge(ids: MissionId[]) {
    for (const id of ids) this.completed.add(id);
    this.progress = this.progress.map((mission) =>
      this.completed.has(mission.id) && !mission.completed
        ? { ...mission, current: mission.target, completed: true }
        : mission);
  }

  private readLatest() {
    try {
      if (this.storage) this.merge(decode(this.storage.getItem(STORAGE_KEY)));
    } catch {
      // A real completion may repair malformed data; never accept part of it.
    }
  }

  private save() {
    this.readLatest();
    try {
      if (!this.storage) throw new Error("Storage unavailable");
      this.storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, completed: [...this.completed] }));
      this.error = null;
    } catch {
      this.error = STORAGE_WARNING;
    }
  }

  /** Reconcile racing writes using both the event and the latest stored union. */
  handleStorage(event: Pick<StorageEvent, "key" | "newValue" | "storageArea">) {
    if (event.key !== STORAGE_KEY || event.storageArea !== this.storage || event.newValue === null) return;
    try {
      const incoming = decode(event.newValue);
      const latest = decode(this.storage!.getItem(STORAGE_KEY));
      this.merge(incoming);
      this.merge(latest);
      // No echo writes when the saved document already contains our badges.
      if ([...this.completed].some((id) => !latest.includes(id))) this.save();
    } catch {
      this.error = "Saved mission badges could not be read. This session's missions still work; earn a new badge to save again.";
    }
  }

  reset() {
    this.earned.clear();
    this.progress = MISSION_DEFINITIONS.map((mission) => ({
      ...mission,
      current: this.completed.has(mission.id) ? mission.target : 0,
      completed: this.completed.has(mission.id),
      completedThisRun: false,
    }));
  }

  advance(stats: MissionStats) {
    let newlyCompleted = false;
    let changed = false;
    const values: Record<MissionId, number> = {
      "first-run": stats.finished ? 1 : 0,
      "combo-20": stats.maxCombo,
      "perfect-40": stats.perfect,
      "score-100k": stats.score,
    };
    // Read only at a completion boundary, not on every hit or animation frame.
    if (this.progress.some((m) => !m.completed && Number.isFinite(values[m.id]) && values[m.id] >= m.target)) {
      this.readLatest();
    }
    const next = this.progress.map((mission) => {
      const raw = values[mission.id];
      const current = this.completed.has(mission.id) ? mission.target :
        Math.max(mission.current, Math.min(mission.target, Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0));
      if (current >= mission.target && !this.completed.has(mission.id)) {
        this.completed.add(mission.id);
        this.earned.add(mission.id);
        newlyCompleted = true;
      }
      const completed = this.completed.has(mission.id);
      const completedThisRun = this.earned.has(mission.id);
      if (current === mission.current && completed === mission.completed && completedThisRun === mission.completedThisRun) return mission;
      changed = true;
      return { ...mission, current, completed, completedThisRun };
    });
    if (changed) this.progress = next;
    // Save only on new completions, never once per note or animation frame.
    if (newlyCompleted) this.save();
  }
}
