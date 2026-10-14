import { CALIBRATION_BEATS, CALIBRATION_INTERVAL } from "./timing";

export interface MusicTrack {
  id: string;
  bpm: number;
  duration: number;
}

/**
 * Original, deterministic electronic music. Audio and note judgments share
 * AudioContext.currentTime, so rendering frame rate cannot change the beat.
 */
export class SynthMusic {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private sources = new Set<AudioScheduledSourceNode>();
  private track: MusicTrack | null = null;
  private origin = 0;
  private nextStep = 0;
  private frozenTime = 0;
  private running = false;
  private volume = 0.65;

  async prepare() {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: "interactive" });
      this.master = this.context.createGain();
      this.master.gain.value = this.volume * 0.55;
      this.compressor = this.context.createDynamicsCompressor();
      this.compressor.threshold.value = -15;
      this.compressor.knee.value = 12;
      this.compressor.ratio.value = 5;
      this.master.connect(this.compressor);
      this.compressor.connect(this.context.destination);
      this.noise = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
      const data = this.noise.getChannelData(0);
      let seed = 19;
      for (let i = 0; i < data.length; i++) {
        seed = (seed * 16807) % 2147483647;
        data[i] = (seed / 2147483647) * 2 - 1;
      }
    }
    const context = this.context;
    await context.resume();
    if (context.state !== "running") {
      throw new Error("Sound could not start. Tap Start again to enable audio.");
    }
  }

  getTime = () =>
    this.running && this.context ? this.context.currentTime - this.origin : this.frozenTime;

  start(track: MusicTrack) {
    this.stop();
    if (!this.context) throw new Error("Audio must be enabled before starting.");
    this.track = track;
    const beat = 60 / track.bpm;
    this.frozenTime = -4 * beat;
    this.origin = this.context.currentTime + 4 * beat;
    this.nextStep = -16;
    this.running = true;
    this.schedule();
    this.timer = setInterval(() => this.schedule(), 25);
  }

  /** A separate SynthMusic instance runs this optional exercise, never the song. */
  startCalibration() {
    this.stop();
    if (!this.context || this.context.state !== "running") {
      throw new Error("Enable sound before starting the timing exercise.");
    }
    this.track = null;
    this.frozenTime = -1;
    this.origin = this.context.currentTime + 1;
    this.running = true;
    for (let beat = 0; beat < CALIBRATION_BEATS; beat++) {
      this.tone(this.origin + beat * CALIBRATION_INTERVAL, beat === 0 ? 1200 : 800, 0.045, 0.35);
    }
  }

  pause() {
    this.frozenTime = this.getTime();
    this.running = false;
    this.clearScheduled();
  }

  async resume() {
    await this.prepare();
    if (!this.context || !this.track) return;
    this.origin = this.context.currentTime - this.frozenTime;
    this.nextStep = Math.ceil(this.frozenTime / (60 / this.track.bpm / 4));
    this.running = true;
    this.schedule();
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stop() {
    this.running = false;
    this.frozenTime = 0;
    this.clearScheduled();
  }

  /** Release the exercise's private audio device when its dialog is closed. */
  async dispose() {
    this.stop();
    const context = this.context;
    this.context = null;
    this.master = null;
    this.compressor = null;
    this.noise = null;
    this.track = null;
    if (context && context.state !== "closed") await context.close();
  }

  setVolume(value: number) {
    this.volume = Math.min(1, Math.max(0, value));
    if (this.context && this.master) {
      this.master.gain.setTargetAtTime(this.volume * 0.55, this.context.currentTime, 0.02);
    }
  }

  private clearScheduled() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // A source that has already ended needs no further cleanup.
      }
    }
    this.sources.clear();
  }

  private retain<T extends AudioScheduledSourceNode>(source: T): T {
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      source.disconnect();
    };
    return source;
  }

  private tone(
    time: number,
    frequency: number,
    duration: number,
    volume: number,
    type: OscillatorType = "sine",
    endFrequency?: number,
  ) {
    const context = this.context;
    if (!context || !this.master) return;
    const oscillator = this.retain(context.createOscillator());
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, time + duration * 0.85);
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(volume, time + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
    oscillator.onended = () => {
      this.sources.delete(oscillator);
      oscillator.disconnect();
      envelope.disconnect();
    };
  }

  private percussion(time: number, duration: number, volume: number, highpass: number) {
    const context = this.context;
    if (!context || !this.master || !this.noise) return;
    const source = this.retain(context.createBufferSource());
    source.buffer = this.noise;
    const filter = context.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = highpass;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(volume, time);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.master);
    source.start(time);
    source.stop(time + duration + 0.01);
    source.onended = () => {
      this.sources.delete(source);
      source.disconnect();
      filter.disconnect();
      envelope.disconnect();
    };
  }

  private schedule() {
    const context = this.context;
    const track = this.track;
    if (!context || !track || !this.running) return;
    const stepDuration = 60 / track.bpm / 4;
    const horizon = context.currentTime + 0.14;
    // Skip missed audio events after browser throttling rather than bursting.
    const minimumStep = Math.ceil((context.currentTime - this.origin - 0.02) / stepDuration);
    this.nextStep = Math.max(this.nextStep, minimumStep);
    while (this.origin + this.nextStep * stepDuration < horizon) {
      const step = this.nextStep++;
      const songTime = step * stepDuration;
      if (songTime >= track.duration) break;
      const time = Math.max(context.currentTime + 0.001, this.origin + songTime);
      if (step < 0) {
        if (step % 4 === 0) this.tone(time, step === -4 ? 1200 : 800, 0.06, 0.25);
        continue;
      }
      const beat = Math.floor(step / 4);
      const bar = Math.floor(beat / 4);
      const roots = track.id === "midnight-circuit" ? [45, 41, 48, 43] : track.id === "overdrive" ? [40, 40, 43, 38] : [45, 48, 41, 43];
      const root = roots[Math.floor(bar / 4) % 4]!;
      const frequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
      const section = Math.floor(bar / 8) % 3;

      // A steady four-on-the-floor beat provides an unambiguous timing cue.
      if (step % 4 === 0) {
        this.tone(time, 145, 0.23, 0.85, "sine", 39);
        this.tone(time, frequency(root - 12), stepDuration * 2.8, 0.22, "triangle");
      }
      if (step % 8 === 4) {
        this.percussion(time, 0.13, 0.22, 1200);
        this.tone(time, 170, 0.07, 0.1, "triangle");
      }
      if (step % 2 === 0) {
        this.percussion(time, step % 8 === 6 ? 0.1 : 0.035, step % 4 === 0 ? 0.07 : 0.11, 7500);
      }
      // Harmonic progression, bass pulse, and arpeggio vary by track.
      if (step % 16 === 0) {
        [0, 7, 12, 15].forEach((interval) =>
          this.tone(time, frequency(root + interval), stepDuration * 15, 0.038, "triangle"),
        );
      }
      if (step % 2 === 0) {
        const arp = track.id === "overdrive" ? [0, 12, 7, 15, 0, 19, 7, 12] : [0, 7, 12, 15, 12, 7, 19, 15];
        const interval = arp[Math.floor(step / 2) % arp.length]!;
        this.tone(time, frequency(root + 12 + interval), stepDuration * 1.3, section === 1 ? 0.065 : 0.043, "triangle");
      }
      if (section !== 0 && step % 8 === 0) {
        const lead = [12, 15, 19, 22, 19, 15, 12, 7][Math.floor(step / 8) % 8]!;
        this.tone(time, frequency(root + lead), stepDuration * 5, 0.055, "sine");
      }
    }
  }
}
