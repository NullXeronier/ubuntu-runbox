export const DEFAULT_TIMING_OFFSET_MS = 0;
export const MIN_TIMING_OFFSET_MS = -300;
export const MAX_TIMING_OFFSET_MS = 300;
export const TIMING_STORAGE_KEY = "pulse-timing-offset-ms";

export const CALIBRATION_BEATS = 8;
export const CALIBRATION_INTERVAL = 0.75;
export const CALIBRATION_DURATION = CALIBRATION_BEATS * CALIBRATION_INTERVAL;
export const MIN_CALIBRATION_TAPS = 4;

export function boundedTimingOffset(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_TIMING_OFFSET_MS;
  return Math.round(Math.max(MIN_TIMING_OFFSET_MS, Math.min(MAX_TIMING_OFFSET_MS, value)));
}

/**
 * Positive offsets accept later taps and delay visible note arrival.
 * Never move the underlying audio clock, beatmap, or music schedule.
 */
export function calibratedTime(audioSeconds: number, offsetMs: number): number {
  return audioSeconds - boundedTimingOffset(offsetMs) / 1000;
}

/** Only associate taps within the supported range with a real exercise click. */
export function calibrationBeatAt(audioSeconds: number): number | null {
  if (!Number.isFinite(audioSeconds)) return null;
  const beat = Math.max(0, Math.round(audioSeconds / CALIBRATION_INTERVAL));
  if (audioSeconds < MIN_TIMING_OFFSET_MS / 1000) return null;
  if (beat < 0 || beat >= CALIBRATION_BEATS) return null;
  const delayMs = (audioSeconds - beat * CALIBRATION_INTERVAL) * 1000;
  return Math.abs(delayMs) <= MAX_TIMING_OFFSET_MS + 1e-7 ? beat : null;
}

/** A median reduces the effect of a single distracted tap; this is not a latency measurement. */
export function suggestTimingOffset(tapDelaysMs: number[]): number | null {
  const samples = tapDelaysMs.filter((value) =>
    Number.isFinite(value) && value >= MIN_TIMING_OFFSET_MS && value <= MAX_TIMING_OFFSET_MS,
  ).sort((a, b) => a - b);
  if (samples.length < MIN_CALIBRATION_TAPS) return null;
  const middle = Math.floor(samples.length / 2);
  return boundedTimingOffset(samples.length % 2
    ? samples[middle]!
    : (samples[middle - 1]! + samples[middle]!) / 2);
}

export interface TimingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): TimingStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export class TimingPreference {
  private offsetMs = DEFAULT_TIMING_OFFSET_MS;
  private error: string | null = null;

  constructor(private storage: TimingStorage | null = browserStorage()) {
    try {
      if (!storage) throw new Error("Storage unavailable");
      const stored = storage.getItem(TIMING_STORAGE_KEY);
      if (stored === null) return;
      const parsed: unknown = JSON.parse(stored);
      if (typeof parsed !== "number" || !Number.isInteger(parsed)
        || parsed < MIN_TIMING_OFFSET_MS || parsed > MAX_TIMING_OFFSET_MS) {
        this.error = "Your saved timing offset was invalid. Using 0 ms; adjust or reset it to save a new preference.";
        return;
      }
      this.offsetMs = parsed;
    } catch {
      this.error = "Your timing preference could not be read. Using 0 ms; changes may only last until you leave this page.";
    }
  }

  getOffset = () => this.offsetMs;
  getError = () => this.error;

  set(value: number) {
    if (!Number.isFinite(value)) return;
    this.offsetMs = boundedTimingOffset(value);
    try {
      if (!this.storage) throw new Error("Storage unavailable");
      this.storage.setItem(TIMING_STORAGE_KEY, String(this.offsetMs));
      this.error = null;
    } catch {
      this.error = "Your timing offset is active for this page, but could not be saved in this browser. It may be lost on reload.";
    }
  }
}
