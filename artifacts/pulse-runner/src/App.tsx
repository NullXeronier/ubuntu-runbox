import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Pause, Play, RotateCcw, HelpCircle, Volume2, VolumeX, X, Home } from 'lucide-react';
import { game, TRACKS, DIFFICULTIES, type Lane } from '@/game/engine';
import { MissionBoard, MissionError, MissionHud, MissionResults, EffectsToggle } from '@/components/Missions';
import { CalibrationEntry, CalibrationError } from '@/components/Calibration';
import { Scene, webglAvailable, LANE_COLORS } from '@/components/Scene';
import { SoftwareScene } from '@/components/SoftwareScene';

const KEYS = ['D', 'F', 'J', 'K'];
const KEYMAP: Record<string, Lane> = { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3, ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3 };

function useGame() {
  return useSyncExternalStore(game.subscribe, game.getSnapshot);
}

function useClock(on: boolean) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!on) return;
    let id = 0;
    const loop = () => { setT(game.getTime()); id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [on]);
  return t;
}

function Btn({ children, onClick, tone = 'primary', id, disabled }: { children: React.ReactNode; onClick: () => void; tone?: 'primary' | 'ghost'; id: string; disabled?: boolean }) {
  return (
    <button
      data-testid={id}
      disabled={disabled}
      onClick={onClick}
      className={`disp inline-flex items-center justify-center gap-2 px-6 py-3 text-lg font-bold uppercase tracking-wider transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 disabled:opacity-40 ${
        tone === 'primary' ? 'bg-[#ff2e9a] text-[#0b0718] shadow-[4px_4px_0_#22e6ff] hover:shadow-[6px_6px_0_#22e6ff]' : 'border border-white/25 text-white hover:bg-white/10'
      }`}
      style={{ clipPath: 'polygon(10px 0,100% 0,calc(100% - 10px) 100%,0 100%)' }}
    >
      {children}
    </button>
  );
}

function Help({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="panel rise max-h-[90dvh] w-full max-w-md overflow-y-auto p-6" onClick={(e) => e.stopPropagation()} data-testid="modal-help">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="disp text-2xl font-bold">How to run</h2>
          <button data-testid="button-close-help" onClick={onClose} aria-label="Close"><X /></button>
        </div>
        <p className="mb-4 text-white/75">Colored blocks race down the tunnel. Press the matching lane key the instant a block touches the white line.</p>
        <div className="mb-4 grid grid-cols-4 gap-2">
          {KEYS.map((k, i) => (
            <div key={k} className="py-3 text-center" style={{ background: LANE_COLORS[i] + '22', border: `2px solid ${LANE_COLORS[i]}` }}>
              <div className="disp text-2xl font-bold" style={{ color: LANE_COLORS[i] }}>{k}</div>
              <div className="mono text-[10px] text-white/60">{['LEFT', 'DOWN', 'UP', 'RIGHT'][i]}</div>
            </div>
          ))}
        </div>
        <ul className="mono space-y-1 text-xs text-white/70">
          <li>D F J K or arrow keys, or tap the pads on touch.</li>
          <li>SPACE starts, pauses and resumes. ESC pauses.</li>
          <li>Perfect hits score most. Misses break your combo.</li>
          <li>Long combos raise the multiplier and speed the tunnel.</li>
          <li>Quests: finish a track, chain 20 hits, land 40 perfects, score 100,000. Progress is per run; earned badges are saved in this browser. Quitting does not finish a run.</li>
          <li>Reduced effects calms tunnel rotation, camera motion, particles and pulsing. Notes keep their timing.</li>
        </ul>
      </div>
    </div>
  );
}

function Pads() {
  const [down, setDown] = useState<number | null>(null);
  return (
    <div className="pointer-events-auto grid grid-cols-4 gap-2 px-2 pb-3 sm:mx-auto sm:max-w-xl sm:gap-3" data-testid="touch-pads">
      {KEYS.map((k, i) => (
        <button
          key={k}
          data-testid={`pad-lane-${i}`}
          onPointerDown={(e) => { e.preventDefault(); setDown(i); game.hit(i as Lane); }}
          onPointerUp={() => setDown(null)}
          onPointerLeave={() => setDown(null)}
          className="disp h-20 text-2xl font-bold transition-transform sm:h-24"
          style={{
            color: down === i ? '#0b0718' : LANE_COLORS[i],
            background: down === i ? LANE_COLORS[i] : LANE_COLORS[i] + '1c',
            border: `2px solid ${LANE_COLORS[i]}`,
            transform: down === i ? 'translateY(4px) scale(.97)' : undefined,
            touchAction: 'none',
          }}
        >
          {k}
        </button>
      ))}
    </div>
  );
}

function Hud() {
  const s = useGame();
  const t = useClock(s.phase === 'countdown');
  const beat = 60 / s.track.bpm;
  const cd = Math.max(1, Math.ceil(-t / beat));
  const judgeColor = s.lastJudge === 'PERFECT' ? '#ffd23f' : s.lastJudge === 'GOOD' ? '#22e6ff' : '#ff5470';
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
      <div className="p-3 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="mono text-[10px] uppercase tracking-widest text-white/60">{s.track.title} / {s.difficulty}</div>
            <div key={s.score} className="disp bump text-4xl font-bold sm:text-6xl" data-testid="text-score">{s.score.toLocaleString()}</div>
          </div>
          <div className="pointer-events-auto flex gap-2">
            <button data-testid="button-pause" aria-label="Pause" onClick={() => game.pause()} className="panel p-3 hover:bg-white/10"><Pause size={20} /></button>
          </div>
        </div>
        <div className="mt-3 h-1.5 w-full bg-white/10"><div className="h-full" style={{ width: `${s.progress * 100}%`, background: s.track.color }} data-testid="bar-progress" /></div>
        <MissionHud missions={s.missions} storageError={s.missionError} />
      </div>
      <div className="absolute left-1/2 top-[34%] -translate-x-1/2 text-center">
        {s.phase === 'countdown' && <div key={cd} className="cd-anim disp text-[9rem] font-bold leading-none text-[#ffd23f]" data-testid="text-countdown">{cd}</div>}
        {s.phase === 'playing' && s.lastJudge && (
          <div key={s.lastJudgeAt} className="judge-anim disp text-4xl font-bold sm:text-5xl" style={{ color: judgeColor }} data-testid="text-judge">{s.lastJudge}</div>
        )}
      </div>
      <div>
        <div className="mb-2 flex items-end justify-between px-4 sm:px-6">
          <div>
            <div className="mono text-[10px] tracking-widest text-white/60">COMBO</div>
            <div key={s.combo} className="disp bump text-5xl font-bold text-[#22e6ff]" data-testid="text-combo">{s.combo}</div>
          </div>
          <div className="text-right">
            <div className="mono text-[10px] tracking-widest text-white/60">MULT / ACC</div>
            <div className="disp text-2xl font-bold" data-testid="text-multiplier">x{s.multiplier} <span className="text-white/60">{s.accuracy.toFixed(1)}%</span></div>
          </div>
        </div>
        {s.phase === 'countdown' && <div className="mono mb-2 text-center text-xs text-white/70">Hit D F J K when blocks cross the white line</div>}
        <Pads />
      </div>
    </div>
  );
}

function Menu({ onHelp }: { onHelp: () => void }) {
  const s = useGame();
  const [track, setTrack] = useState(s.track.id);
  const [diff, setDiff] = useState(s.difficulty);
  useEffect(() => { game.configure(track, diff); }, [track, diff]);
  const cur = TRACKS.find((t) => t.id === track) ?? TRACKS[0];
  return (
    <div className="absolute inset-0 overflow-y-auto p-4 pt-16">
      <div className="rise mx-auto my-auto grid w-full max-w-5xl gap-5 pb-6 lg:grid-cols-[1.25fr_1fr]"><div>
        <div className="mono mb-1 text-xs tracking-[.4em] text-[#22e6ff]">RHYTHM RUNNER / 4 LANES</div>
        <h1 className="disp text-6xl font-bold leading-[.9] sm:text-8xl" style={{ textShadow: '4px 4px 0 #ff2e9a' }} data-testid="text-title">PULSE<br />RUNNER</h1>
        <p className="mt-3 max-w-md text-white/75">Fly the tunnel. Hit every beat. The music is the road.</p>
        <div className="panel mt-5 p-4">
          <div className="grid gap-2 sm:grid-cols-3">
            {TRACKS.map((t) => (
              <button key={t.id} data-testid={`button-track-${t.id}`} onClick={() => setTrack(t.id)} className="p-3 text-left transition-transform hover:-translate-y-0.5" style={{ border: `2px solid ${t.id === track ? t.color : 'rgba(255,255,255,.12)'}`, background: t.id === track ? t.color + '22' : 'transparent' }}>
                <div className="disp text-lg font-bold" style={{ color: t.color }}>{t.title}</div>
                <div className="mono text-[10px] text-white/60">{t.artist} / {t.bpm} BPM / {Math.round(t.duration)}s</div>
              </button>
            ))}
          </div>
          <p className="mono mt-3 text-xs text-white/65">{cur.description}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {DIFFICULTIES.map((d) => (
              <button key={d} data-testid={`button-difficulty-${d}`} onClick={() => setDiff(d)} className={`disp px-4 py-1.5 font-semibold uppercase ${d === diff ? 'bg-[#ffd23f] text-[#0b0718]' : 'border border-white/25'}`}>{d}</button>
            ))}
            <div className="mono ml-auto text-xs text-white/70" data-testid="text-best">PERSONAL BEST {s.best > 0 ? s.best.toLocaleString() : '--'}</div>
          </div>
        </div>
        {s.error && <div className="mt-3 border border-red-400 bg-red-950/70 p-3 text-sm" data-testid="text-error">{s.error}</div>}
        <MissionError message={s.missionError} />
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Btn id="button-start" onClick={() => void game.start()}><Play size={20} /> Start run</Btn>
          <Btn id="button-help" tone="ghost" onClick={onHelp}><HelpCircle size={20} /> Help</Btn>
          <span className="mono text-xs text-white/50">or press SPACE</span>
        </div>
        <div className="mt-4"><EffectsToggle on={s.reducedEffects} /></div>
        <div className="mt-3"><CalibrationEntry offset={s.timingOffsetMs} error={s.timingError} volume={s.volume} /></div>
        <CalibrationError message={s.timingError} />
      </div>
      <div className="lg:pt-14"><MissionBoard missions={s.missions} /></div>
      </div>
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return <div className="absolute inset-0 flex overflow-y-auto bg-[#070514]/75 p-4 pb-20"><div className="m-auto flex w-full justify-center">{children}</div></div>;
}

function Stat({ l, v, id }: { l: string; v: string | number; id: string }) {
  return <div><div className="mono text-[10px] tracking-widest text-white/55">{l}</div><div className="disp text-2xl font-bold" data-testid={id}>{v}</div></div>;
}

function Results() {
  const s = useGame();
  const grade = s.accuracy >= 95 ? 'S' : s.accuracy >= 85 ? 'A' : s.accuracy >= 70 ? 'B' : s.accuracy >= 50 ? 'C' : 'D';
  const isBest = s.score > 0 && s.score >= s.best;
  return (
    <Overlay>
      <div className="panel rise w-full max-w-lg p-6" data-testid="panel-results">
        <div className="flex items-center justify-between">
          <div>
            <div className="mono text-xs tracking-widest text-white/60">{s.track.title} / {s.difficulty}</div>
            <div className="disp text-5xl font-bold" data-testid="text-final-score">{s.score.toLocaleString()}</div>
            {isBest && <div className="mono mt-1 text-xs text-[#ffd23f]" data-testid="text-new-best">NEW PERSONAL BEST</div>}
          </div>
          <div className="disp text-8xl font-bold text-[#ff2e9a]" style={{ textShadow: '4px 4px 0 #22e6ff' }} data-testid="text-grade">{grade}</div>
        </div>
        <div className="my-5 grid grid-cols-3 gap-4">
          <Stat l="PERFECT" v={s.perfect} id="text-perfect" />
          <Stat l="GOOD" v={s.good} id="text-good" />
          <Stat l="MISS" v={s.misses} id="text-miss" />
          <Stat l="MAX COMBO" v={s.maxCombo} id="text-maxcombo" />
          <Stat l="ACCURACY" v={`${s.accuracy.toFixed(1)}%`} id="text-accuracy" />
          <Stat l="BEST" v={s.best.toLocaleString()} id="text-results-best" />
        </div>
        <MissionResults missions={s.missions} />
        <MissionError message={s.missionError} />
        {s.error && <div className="mono mt-4 border border-red-400 bg-red-950/70 p-2 text-xs" data-testid="text-game-error">{s.error}</div>}
        <div className="mt-4"><CalibrationEntry offset={s.timingOffsetMs} error={s.timingError} volume={s.volume} /></div>
        <CalibrationError message={s.timingError} />
        <div className="mt-4 flex flex-wrap gap-3">
          <Btn id="button-retry" onClick={() => void game.restart()}><RotateCcw size={18} /> Retry</Btn>
          <Btn id="button-menu" tone="ghost" onClick={() => game.exit()}><Home size={18} /> Tracks</Btn>
        </div>
      </div>
    </Overlay>
  );
}

function Paused() {
  const s = useGame();
  return (
    <Overlay>
      <div className="panel rise p-6 text-center" data-testid="panel-paused">
        <h2 className="disp mb-4 text-5xl font-bold">PAUSED</h2>
        {s.error && <div className="mono mb-4 border border-red-400 bg-red-950/70 p-2 text-xs" data-testid="text-game-error">{s.error}</div>}
        <MissionError message={s.missionError} />
        <div className="mb-4 flex justify-center"><EffectsToggle on={s.reducedEffects} /></div>
        <div className="flex flex-wrap justify-center gap-3">
          <Btn id="button-resume" onClick={() => void game.resume()}><Play size={18} /> Resume</Btn>
          <Btn id="button-restart" tone="ghost" onClick={() => void game.restart()}><RotateCcw size={18} /> Restart</Btn>
          <Btn id="button-quit" tone="ghost" onClick={() => game.exit()}><Home size={18} /> Quit</Btn>
        </div>
      </div>
    </Overlay>
  );
}

function VolumeBar() {
  const s = useGame();
  const [prev, setPrev] = useState(0.7);
  const muted = s.volume === 0;
  return (
    <div className={`panel pointer-events-auto absolute z-[60] flex items-center gap-2 px-3 py-2 ${s.phase === 'paused' ? 'bottom-4 left-1/2 -translate-x-1/2' : 'right-3 top-3'}`} style={{ display: s.phase === 'idle' || s.phase === 'paused' ? 'flex' : 'none' }}>
      <button data-testid="button-mute" aria-label="Mute" onClick={() => { if (muted) game.setVolume(prev); else { setPrev(s.volume); game.setVolume(0); } }}>
        {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>
      <input data-testid="input-volume" aria-label="Volume" type="range" min={0} max={1} step={0.01} value={s.volume} onChange={(e) => game.setVolume(Number(e.target.value))} className="w-24 accent-[#ff2e9a]" />
    </div>
  );
}

function App() {
  const s = useGame();
  const [help, setHelp] = useState(false);
  const helpRef = useRef(false);
  helpRef.current = help;
  const [gl] = useState(() => webglAvailable());

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (document.querySelector('dialog[data-calibration][open]')) return;
      if (e.repeat) return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.closest?.('[data-hotkey-skip]')) && e.code === 'Space') return;
      if (helpRef.current) {
        if (e.code === 'Escape') setHelp(false);
        return;
      }
      const lane = KEYMAP[e.code];
      const ph = game.getSnapshot().phase;
      if (lane !== undefined) {
        if (ph === 'playing') { e.preventDefault(); game.hit(lane); }
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (ph === 'idle') void game.start();
        else if (ph === 'playing' || ph === 'countdown') game.pause();
        else if (ph === 'paused') void game.resume();
        else if (ph === 'results') void game.restart();
      } else if (e.code === 'Escape') {
        if (ph === 'playing' || ph === 'countdown') game.pause();
        setHelp(false);
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []);

  return (
    <div className={`scan relative h-[100dvh] w-full overflow-hidden bg-[#070514] text-white${s.reducedEffects ? ' reduce-fx' : ''}`}>
      {gl ? (
        <div className="absolute inset-0"><Scene /></div>
      ) : (
        <>
          <div className="absolute inset-0"><SoftwareScene /></div>
          <div title="WebGL2 is unavailable in this browser, so a lightweight 2D renderer draws the tunnel. Gameplay is identical." className="mono pointer-events-auto absolute bottom-1 left-2 z-10 text-[10px] uppercase tracking-widest text-white/40" data-testid="text-compat-renderer">Compatibility renderer</div>
        </>
      )}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(11,7,24,.85))]" />
      {s.phase === 'idle' && <Menu onHelp={() => setHelp(true)} />}
      {(s.phase === 'countdown' || s.phase === 'playing' || s.phase === 'paused') && <Hud />}
      {s.phase === 'paused' && <Paused />}
      {s.phase === 'results' && <Results />}
      <VolumeBar />
      {help && <Help onClose={() => setHelp(false)} />}
    </div>
  );
}

export default App;
