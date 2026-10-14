import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Target, Zap } from 'lucide-react';
import { game } from '@/game/engine';
import type { MissionProgress } from '@/game/missions';

export type MissionView = MissionProgress;

const fmt = (n: number) => n.toLocaleString();
const pct = (m: MissionView) => (m.completed ? 100 : Math.min(100, (m.current / Math.max(1, m.target)) * 100));

export function MissionError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <div role="status" className="mono mt-3 border border-[#ffd23f]/60 bg-[#2a2006]/80 p-2 text-xs text-[#ffd23f]" data-testid="text-mission-error">
      {message}
    </div>
  );
}

export function MissionBoard({ missions }: { missions: MissionView[] }) {
  const done = missions.filter((m) => m.completed).length;
  return (
    <section className="panel p-4" data-testid="panel-missions" aria-label="Quests">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="disp flex items-center gap-2 text-lg font-bold text-[#22e6ff]"><Target size={18} /> QUESTS</h2>
        <span className="mono text-[10px] tracking-widest text-white/60" data-testid="text-missions-count">{done} / {missions.length} COMPLETE</span>
      </div>
      <ul className="space-y-2">
        {missions.map((m) => (
          <li key={m.id} data-testid={`mission-${m.id}`} className="border p-2.5" style={{ borderColor: m.completed ? '#7dff5a88' : 'rgba(255,255,255,.14)', background: m.completed ? 'rgba(125,255,90,.07)' : 'rgba(255,255,255,.03)' }}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="disp text-base font-bold leading-tight">{m.title}</div>
                <div className="mono text-[11px] leading-snug text-white/70">{m.description}</div>
              </div>
              {m.completed ? (
                <span className="mono flex shrink-0 items-center gap-1 bg-[#7dff5a] px-1.5 py-0.5 text-[10px] font-bold text-[#070514]" data-testid={`badge-complete-${m.id}`}><Check size={11} /> DONE</span>
              ) : (
                <span className="mono shrink-0 text-[11px] text-white/80" data-testid={`text-target-${m.id}`}>{fmt(m.current)} / {fmt(m.target)}</span>
              )}
            </div>
            <div className="mt-2 h-1 bg-white/10"><div className="h-full" style={{ width: `${pct(m)}%`, background: m.completed ? '#7dff5a' : '#22e6ff' }} /></div>
            {m.completed && <div className="mono mt-1 text-[10px] text-white/50">Target {fmt(m.target)}</div>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MissionResults({ missions }: { missions: MissionView[] }) {
  return (
    <div className="my-4" data-testid="panel-results-missions">
      <div className="mono mb-2 text-[10px] tracking-widest text-white/60">QUESTS</div>
      <ul className="space-y-1.5">
        {missions.map((m) => {
          const fresh = m.completedThisRun;
          return (
            <li key={m.id} data-testid={`result-mission-${m.id}`} className="flex items-center justify-between gap-2 border px-2.5 py-1.5" style={{ borderColor: fresh ? '#ffd23f' : m.completed ? '#7dff5a66' : 'rgba(255,255,255,.14)', background: fresh ? 'rgba(255,210,63,.1)' : 'transparent' }}>
              <div className="min-w-0">
                <div className="disp text-sm font-bold leading-tight">{m.title}</div>
                <div className="mono text-[10px] text-white/60">{m.completed ? `Target ${fmt(m.target)}` : `${fmt(m.current)} / ${fmt(m.target)}`}</div>
              </div>
              {fresh ? (
                <span className="mono shrink-0 bg-[#ffd23f] px-1.5 py-0.5 text-[10px] font-bold text-[#070514]" data-testid={`badge-new-${m.id}`}>NEWLY EARNED</span>
              ) : m.completed ? (
                <span className="mono shrink-0 border border-[#7dff5a] px-1.5 py-0.5 text-[10px] text-[#7dff5a]" data-testid={`badge-earned-${m.id}`}>ALREADY EARNED</span>
              ) : (
                <span className="mono shrink-0 text-[10px] text-white/50">INCOMPLETE</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function MissionHud({ missions, storageError }: { missions: MissionView[]; storageError: string | null | undefined }) {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<{ key: number; title: string } | null>(null);
  const announced = useRef<Set<string> | null>(null);
  if (announced.current === null) announced.current = new Set(missions.filter((m) => m.completedThisRun).map((m) => m.id));
  const seq = useRef(0);

  useEffect(() => {
    const set = announced.current!;
    const newlyEarned: string[] = [];
    for (const m of missions) {
      if (m.completedThisRun) {
        if (!set.has(m.id)) { set.add(m.id); newlyEarned.push(m.title); }
      } else set.delete(m.id);
    }
    if (newlyEarned.length) {
      seq.current += 1;
      setToast({ key: seq.current, title: newlyEarned.join(' + ') });
    } else if (!missions.some((m) => m.completedThisRun)) {
      setToast(null);
    }
  }, [missions]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const next = missions.find((m) => !m.completed && m.current > 0) ??
    missions.find((m) => !m.completed && m.id !== 'first-run') ??
    missions.find((m) => !m.completed) ?? null;
  return (
    <div className="pointer-events-auto mt-2 max-w-[15rem] sm:max-w-xs" data-testid="hud-missions">
      <button
        data-hotkey-skip
        data-testid="button-toggle-missions"
        aria-expanded={open}
        aria-controls="hud-mission-list"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 border border-[#22e6ff]/40 bg-[#070514]/70 px-2 py-1 text-left"
      >
        <Target size={13} className="shrink-0 text-[#22e6ff]" />
        {next ? (
          <span className="min-w-0 flex-1">
            <span className="mono block truncate text-[10px] text-white/80" data-testid="text-focus-mission">{next.title} {fmt(next.current)}/{fmt(next.target)}</span>
            <span className="block h-0.5 bg-white/10"><span className="block h-full bg-[#22e6ff]" style={{ width: `${pct(next)}%` }} /></span>
          </span>
        ) : (
          <span className="mono flex-1 text-[10px] text-[#7dff5a]">ALL QUESTS COMPLETE</span>
        )}
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>
      {open && (
        <ul id="hud-mission-list" className="mt-1 space-y-1 border border-white/15 bg-[#070514]/85 p-2" data-testid="list-hud-missions">
          {missions.map((m) => (
            <li key={m.id} className="mono flex justify-between gap-2 text-[10px]" style={{ color: m.completed ? '#7dff5a' : 'rgba(255,255,255,.8)' }}>
              <span className="truncate">{m.title}</span>
              <span className="shrink-0">{m.completed ? 'DONE' : `${fmt(m.current)}/${fmt(m.target)}`}</span>
            </li>
          ))}
        </ul>
      )}
      <div aria-live="polite" className="min-h-0">
        {toast && (
          <div key={toast.key} className="toast-anim mono mt-1 flex items-center gap-1.5 border border-[#ffd23f] bg-[#2a2006]/90 px-2 py-1 text-[11px] font-bold text-[#ffd23f]" data-testid="toast-mission">
            <Zap size={12} /> QUEST COMPLETE: {toast.title}
          </div>
        )}
      </div>
      {storageError && <div className="mono mt-1 text-[9px] text-[#ffd23f]/80" data-testid="text-hud-mission-error">Quest save failed</div>}
    </div>
  );
}

export function EffectsToggle({ on }: { on: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      data-hotkey-skip
      data-testid="switch-reduced-effects"
      onClick={() => game.setReducedEffects(!on)}
      className="mono flex items-center gap-2 border border-white/25 px-3 py-1.5 text-xs hover:bg-white/10"
    >
      <span className="relative inline-block h-3.5 w-7 border border-white/40" style={{ background: on ? '#22e6ff' : 'transparent' }}>
        <span className="absolute top-0 h-full w-3 bg-white" style={{ left: on ? 'calc(100% - 12px)' : 0 }} />
      </span>
      REDUCED EFFECTS {on ? 'ON' : 'OFF'}
    </button>
  );
}
