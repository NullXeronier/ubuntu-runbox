import { useCallback, useEffect, useRef, useState } from 'react';
import { SlidersHorizontal, X, RotateCcw, Play, Square, Volume2 } from 'lucide-react';
import { game } from '@/game/engine';
import { SynthMusic } from '@/game/audio';
import {
  MIN_TIMING_OFFSET_MS, MAX_TIMING_OFFSET_MS, DEFAULT_TIMING_OFFSET_MS, CALIBRATION_BEATS, CALIBRATION_INTERVAL,
  CALIBRATION_DURATION, MIN_CALIBRATION_TAPS, calibratedTime, calibrationBeatAt, suggestTimingOffset,
} from '@/game/timing';

const clampOffset = (v: number) => Math.min(MAX_TIMING_OFFSET_MS, Math.max(MIN_TIMING_OFFSET_MS, Math.round(Number.isFinite(v) ? v : 0)));
const fmt = (v: number) => `${v > 0 ? '+' : ''}${v} ms`;

type Phase = 'idle' | 'starting' | 'running' | 'done';

export function CalibrationError({ message }: { message: string | null }) {
  if (!message) return null;
  return <div role="alert" className="mono mt-3 border border-red-400 bg-red-950/70 p-3 text-xs" data-testid="text-timing-error">{message}</div>;
}

function Dialog({ offset, error, volume, onClose }: { offset: number; error: string | null; volume: number; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const audioRef = useRef<SynthMusic | null>(null);
  const rafRef = useRef(0);
  const token = useRef(0);
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const runningRef = useRef(false);
  const startingRef = useRef(false);
  const tapRef = useRef<HTMLButtonElement>(null);
  const taps = useRef(new Map<number, number>());
  const [phase, setPhase] = useState<Phase>('idle');
  const [pulse, setPulse] = useState(0);
  const [beat, setBeat] = useState(-1);
  const [samples, setSamples] = useState<number[]>([]);
  const [status, setStatus] = useState('Press Start, then tap on each click you hear.');
  const [audioError, setAudioError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const muted = volume === 0;

  const halt = useCallback((next: Phase | null) => {
    token.current++;
    runningRef.current = false;
    startingRef.current = false;
    cancelAnimationFrame(rafRef.current);
    try { audioRef.current?.stop(); } catch { /* already stopped */ }
    setPulse(0);
    if (next) setPhase(next);
  }, []);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => {
      halt(null);
      const audio = audioRef.current;
      audioRef.current = null;
      // Cleanup must not keep an unused audio device open across dialog visits.
      void audio?.dispose().catch(() => {});
    };
  }, [halt]);

  useEffect(() => { audioRef.current?.setVolume(volume); }, [volume]);

  useEffect(() => {
    const off = () => {
      if (runningRef.current || startingRef.current) {
        halt('idle');
        setStatus('Stopped because the window lost focus. Start again when ready.');
      }
    };
    const vis = () => { if (document.hidden) off(); };
    window.addEventListener('blur', off);
    document.addEventListener('visibilitychange', vis);
    return () => { window.removeEventListener('blur', off); document.removeEventListener('visibilitychange', vis); };
  }, [halt]);

  const loop = useCallback((id: number) => {
    const audio = audioRef.current;
    if (!audio || id !== token.current) return;
    const raw = audio.getTime();
    if (raw > CALIBRATION_DURATION + 0.3) {
      halt('done');
      setStatus(taps.current.size >= MIN_CALIBRATION_TAPS ? 'Finished. Review the suggestion below.' : 'Finished. Not enough taps for a suggestion; adjust manually or retry.');
      return;
    }
    const ct = calibratedTime(raw, offsetRef.current);
    const idx = Math.round(ct / CALIBRATION_INTERVAL);
    const inRange = idx >= 0 && idx < CALIBRATION_BEATS;
    setPulse(inRange ? Math.max(0, 1 - Math.abs(ct - idx * CALIBRATION_INTERVAL) / 0.18) : 0);
    if (inRange && Math.abs(ct - idx * CALIBRATION_INTERVAL) < 0.4) setBeat(idx);
    rafRef.current = requestAnimationFrame(() => loop(id));
  }, [halt]);

  const start = async () => {
    halt(null);
    taps.current.clear();
    setSamples([]); setBeat(-1); setApplied(false); setAudioError(null);
    startingRef.current = true;
    setPhase('starting'); setStatus('Starting audio...');
    const id = token.current;
    try {
      const audio = audioRef.current ?? (audioRef.current = new SynthMusic());
      audio.setVolume(volume);
      await audio.prepare();
      if (id !== token.current) return;
      audio.startCalibration();
      startingRef.current = false;
      runningRef.current = true;
      setPhase('running');
      setStatus('Tap the pad or press Space on each click you hear.');
      rafRef.current = requestAnimationFrame(() => {
        if (id !== token.current) return;
        tapRef.current?.focus({ preventScroll: true });
        loop(id);
      });
    } catch (e) {
      if (id !== token.current) return;
      halt('idle');
      setAudioError(e instanceof Error ? e.message : 'Audio could not start.');
      setStatus('Audio unavailable. You can still adjust the offset manually.');
    }
  };

  const tap = () => {
    const audio = audioRef.current;
    if (!runningRef.current || !audio) { setStatus('Start the exercise first.'); return; }
    const raw = audio.getTime();
    if (raw < 0) { setStatus('Too early. Wait for the first click.'); return; }
    const idx = calibrationBeatAt(raw);
    if (idx === null) { setStatus('That tap was not near a click. Try the next one.'); return; }
    if (taps.current.has(idx)) { setStatus('Already counted a tap for that click.'); return; }
    taps.current.set(idx, (raw - idx * CALIBRATION_INTERVAL) * 1000);
    const list = Array.from(taps.current.values());
    setSamples(list);
    setStatus(`Tap ${list.length} recorded.`);
  };

  const suggestion = samples.length >= MIN_CALIBRATION_TAPS ? suggestTimingOffset(samples) : null;
  const set = (v: number) => { setApplied(false); game.setTimingOffset(clampOffset(v)); };

  return (
    <dialog
      ref={ref}
      aria-labelledby="calib-title"
      data-calibration
      data-testid="modal-calibration"
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onKeyDown={(e) => {
        e.stopPropagation();
        const t = e.target as HTMLElement;
        if (e.code === 'Space' && !e.repeat && t === ref.current) { e.preventDefault(); tap(); }
      }}
      onClick={(e) => {
        if (e.target !== ref.current) return;
        const bounds = e.currentTarget.getBoundingClientRect();
        if (e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom) onClose();
      }}
      className="panel m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto bg-[#120b2a] p-6 text-white backdrop:bg-black/70"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 id="calib-title" className="disp text-2xl font-bold">Timing calibration</h2>
        <button data-testid="button-close-calibration" aria-label="Close calibration" onClick={onClose}><X /></button>
      </div>
      <p className="mb-3 text-sm text-white/75">Optional. This nudges note timing by hand or from your taps. It cannot measure or guarantee your hardware latency, and results vary by device and headphones.</p>
      <CalibrationError message={error} />
      {audioError && <div role="alert" className="mono mt-3 border border-red-400 bg-red-950/70 p-3 text-xs" data-testid="text-calibration-audio-error">{audioError}</div>}

      <div className="mt-4 text-center">
        <div className="mono text-[10px] tracking-widest text-white/60">CURRENT OFFSET</div>
        <div className="disp text-5xl font-bold text-[#22e6ff]" data-testid="text-timing-offset" aria-live="polite">{fmt(offset)}</div>
        <div className="mono mt-1 text-[10px] text-white/60" data-testid="text-timing-state">{error ? 'Applied now, but NOT saved in this browser.' : 'Applied now and saved.'}</div>
      </div>
      <label htmlFor="calib-range" className="mono mt-3 block text-[10px] text-white/60">Offset ({MIN_TIMING_OFFSET_MS} to {MAX_TIMING_OFFSET_MS} ms)</label>
      <div className="flex items-center gap-2">
        <button data-testid="button-offset-down" aria-label="Decrease offset by 1 ms" className="panel px-3 py-1" onClick={() => set(offset - 1)}>-</button>
        <input id="calib-range" data-testid="input-timing-offset" type="range" min={MIN_TIMING_OFFSET_MS} max={MAX_TIMING_OFFSET_MS} step={1} value={offset} aria-valuetext={fmt(offset)} onChange={(e) => set(Number(e.target.value))} className="w-full accent-[#ff2e9a]" />
        <button data-testid="button-offset-up" aria-label="Increase offset by 1 ms" className="panel px-3 py-1" onClick={() => set(offset + 1)}>+</button>
      </div>
      <p className="mono mt-2 text-[11px] text-white/70">Positive values delay notes and judgments, as if audio arrives late. Negative values advance them. Raise it if you hit late; lower it if you hit early.</p>
      <button data-testid="button-offset-reset" className="mono mt-2 inline-flex items-center gap-1 border border-white/25 px-3 py-1 text-xs hover:bg-white/10" onClick={() => set(DEFAULT_TIMING_OFFSET_MS)}><RotateCcw size={14} /> Reset to {DEFAULT_TIMING_OFFSET_MS} ms</button>

      <div className="mt-5 border-t border-white/15 pt-4">
        <h3 className="disp text-lg font-bold">Tap exercise</h3>
        <p className="mono text-[11px] text-white/65">{CALIBRATION_BEATS} clicks, one every {CALIBRATION_INTERVAL}s. Tapping is optional. Practice results never affect scores or quests.</p>
        <div className="mt-3 flex items-center gap-3">
          <div aria-hidden="true" className="h-12 w-12 shrink-0 rounded-full border-2 border-[#ffd23f]" style={{ background: `rgba(255,210,63,${pulse})`, transform: `scale(${1 + pulse * 0.2})` }} data-testid="visual-calibration-pulse" />
          <div className="mono text-xs text-white/75">Click {Math.max(0, beat + 1)} / {CALIBRATION_BEATS}<br />Taps {samples.length}</div>
          {phase === 'running' || phase === 'starting'
            ? <button data-testid="button-calibration-stop" className="disp ml-auto inline-flex items-center gap-1 border border-white/25 px-3 py-2 font-bold uppercase hover:bg-white/10" onClick={() => { halt('idle'); setStatus('Stopped.'); }}><Square size={14} /> Stop</button>
            : <button data-testid="button-calibration-start" disabled={muted} className="disp ml-auto inline-flex items-center gap-1 bg-[#ff2e9a] px-3 py-2 font-bold uppercase text-[#0b0718] disabled:opacity-40" onClick={() => void start()}><Play size={14} /> {phase === 'done' ? 'Retry' : 'Start'}</button>}
        </div>
        {muted && <button data-testid="button-calibration-unmute" className="mono mt-2 inline-flex items-center gap-1 border border-white/25 px-3 py-1 text-xs hover:bg-white/10" onClick={() => game.setVolume(0.7)}><Volume2 size={14} /> Sound is muted. Unmute to start</button>}
        <button
          ref={tapRef}
          data-testid="button-calibration-tap"
          disabled={phase !== 'running'}
          onPointerDown={(e) => { e.preventDefault(); tap(); }}
          onKeyDown={(e) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) tap(); } }}
          onClick={(e) => { if (e.detail === 0) tap(); }}
          style={{ touchAction: 'none' }}
          className="disp mt-3 h-16 w-full border-2 border-[#22e6ff] bg-[#22e6ff]/10 text-xl font-bold uppercase text-[#22e6ff] disabled:opacity-40"
        >Tap on the click</button>
        <p className="mono mt-2 text-xs text-white/80" role="status" data-testid="text-calibration-status">{status}</p>
        {suggestion !== null && phase !== 'running' && (
          <div className="mt-3 border border-[#ffd23f]/60 p-3">
            <div className="mono text-xs">Suggested offset from {samples.length} taps: <b data-testid="text-suggested-offset">{fmt(suggestion)}</b></div>
            <button data-testid="button-apply-suggestion" className="disp mt-2 bg-[#ffd23f] px-3 py-1 font-bold uppercase text-[#0b0718]" onClick={() => { set(suggestion); setApplied(true); }}>Apply suggestion</button>
            {applied && <span className="mono ml-2 text-xs text-[#ffd23f]">Applied.</span>}
          </div>
        )}
      </div>
      <div className="mt-5 flex justify-end">
        <button data-testid="button-calibration-done" className="disp border border-white/25 px-5 py-2 font-bold uppercase hover:bg-white/10" onClick={onClose}>Done</button>
      </div>
    </dialog>
  );
}

export function CalibrationEntry({ offset, error, volume }: { offset: number; error: string | null; volume: number }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => { setOpen(false); requestAnimationFrame(() => btn.current?.focus()); }, []);
  return (
    <div className="flex flex-wrap items-center gap-2" data-hotkey-skip>
      <button ref={btn} data-testid="button-calibration" onClick={() => setOpen(true)} className="mono inline-flex items-center gap-2 border border-white/25 px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-white/10">
        <SlidersHorizontal size={14} /> Timing calibration (optional) <span className="text-[#22e6ff]" data-testid="text-timing-summary">{fmt(offset)}</span>
      </button>
      {open && <Dialog offset={offset} error={error} volume={volume} onClose={close} />}
    </div>
  );
}
