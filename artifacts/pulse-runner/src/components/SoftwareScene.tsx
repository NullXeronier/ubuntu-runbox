import { useEffect, useRef } from 'react';
import { game } from '@/game/engine';

const COLORS = ['#ff2e9a', '#ffd23f', '#22e6ff', '#7dff5a'];
const SPEED = 16;
const AHEAD = 3.2;
const GAP = 3.2;
const RINGS = 30;

export function SoftwareScene() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    let w = 0, h = 0, id = 0, dist = 0, sx = 0, last = performance.now();
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    const laneX = (l: number) => (l - 1.5) * 1.7;

    const frame = (now: number) => {
      id = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.05); last = now;
      const snap = game.getSnapshot();
      const active = snap.phase === 'playing' || snap.phase === 'countdown';
      const sinceHit = (now - snap.lastHitAt) / 1000;
      const boost = active ? 1 + Math.min(snap.combo, 60) / 40 : 0.7;
      const kick = active ? Math.max(0, 1 - sinceHit * 4) * 0.5 : 0;
      dist += snap.phase === 'paused' ? 0 : SPEED * (boost + kick) * dt;
      const tx = active && snap.lastLane !== null ? laneX(snap.lastLane) : Math.sin(now / 1250) * 2.2;
      sx += (tx - sx) * Math.min(1, dt * 12);
      const camX = sx * 0.35;
      const f = Math.min(w, h * 1.4) * (0.62 + (active ? Math.max(0, 1 - sinceHit * 5) * 0.04 : 0));
      const cx = w / 2, cy = h * 0.42, camY = 2.3, camZ = 4.2;
      const P = (x: number, y: number, z: number) => {
        const d = camZ - z;
        return d <= 0.2 ? null : [cx + ((x - camX) * f) / d, cy - ((y - camY) * f) / d + h * 0.12, d] as const;
      };
      const fade = (d: number) => Math.max(0, Math.min(1, 1 - (d - 8) / 60));

      ctx.fillStyle = '#0b0718'; ctx.fillRect(0, 0, w, h);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.5);
      g.addColorStop(0, snap.track.color + '44'); g.addColorStop(1, 'transparent');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

      // rings far to near
      const off = dist % GAP;
      ctx.lineWidth = 1.5;
      for (let i = RINGS - 1; i >= 0; i--) {
        const z = -i * GAP + off + 2;
        const a = P(-5.5, 0, z), b = P(5.5, 4.4, z);
        if (!a || !b) continue;
        ctx.globalAlpha = fade(a[2]);
        ctx.strokeStyle = snap.track.color;
        ctx.strokeRect(a[0], b[1], b[0] - a[0], a[1] - b[1]);
      }
      ctx.globalAlpha = 1;
      // floor + lanes
      const zf = -80, zn = 3;
      for (let l = 0; l < 4; l++) {
        const x = laneX(l), q = [P(x - 0.75, 0, zf), P(x + 0.75, 0, zf), P(x + 0.75, 0, zn), P(x - 0.75, 0, zn)];
        if (q.some((p) => !p)) continue;
        const lit = snap.lastLane === l && active ? Math.max(0, 1 - sinceHit * 3.5) : 0;
        ctx.globalAlpha = 0.1 + lit * 0.25;
        ctx.fillStyle = COLORS[l];
        ctx.beginPath(); q.forEach((p, i) => (i ? ctx.lineTo(p![0], p![1]) : ctx.moveTo(p![0], p![1]))); ctx.fill();
      }
      ctx.globalAlpha = 0.5; ctx.strokeStyle = '#b9a6ff'; ctx.lineWidth = 1;
      for (const x of [-3.4, -1.7, 0, 1.7, 3.4]) {
        const a = P(x, 0, zf), b = P(x, 0, zn);
        if (a && b) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
      }
      ctx.globalAlpha = 1;
      // hit pads
      for (let l = 0; l < 4; l++) {
        const x = laneX(l), a = P(x - 0.75, 0, 0.45), b = P(x + 0.75, 0, -0.45);
        if (!a || !b) continue;
        const lit = snap.lastLane === l && active ? Math.max(0, 1 - sinceHit * 3.5) : 0;
        ctx.fillStyle = COLORS[l]; ctx.globalAlpha = 0.15 + lit * 0.8;
        ctx.fillRect(a[0], b[1], b[0] - a[0], a[1] - b[1]);
      }
      ctx.globalAlpha = 1;
      const l1 = P(-3.5, 0.05, 0), l2 = P(3.5, 0.05, 0);
      if (l1 && l2) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(l1[0], l1[1]); ctx.lineTo(l2[0], l2[1]); ctx.stroke(); }
      // notes far to near
      if (snap.phase !== 'idle' && snap.phase !== 'results') {
        const t = game.getTime();
        const vis = game.getNotes().filter((n) => n.status === 'pending' && n.time - t <= AHEAD && n.time - t >= -0.25).sort((a, b) => b.time - a.time);
        for (const n of vis) {
          const z = -(n.time - t) * SPEED;
          const a = P(laneX(n.lane) - 0.7, 0.1, z + 0.35), b = P(laneX(n.lane) + 0.7, 0.45, z - 0.35);
          if (!a || !b) continue;
          const d = n.time - t;
          ctx.globalAlpha = d > AHEAD - 0.5 ? (AHEAD - d) / 0.5 : 1;
          ctx.fillStyle = COLORS[n.lane];
          ctx.shadowColor = COLORS[n.lane]; ctx.shadowBlur = 12;
          ctx.fillRect(a[0], b[1], b[0] - a[0], Math.max(3, a[1] - b[1]));
        }
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      }
      // ship
      const sp = P(sx, 0.6, 1.8);
      if (sp) {
        const s = f / sp[2];
        ctx.fillStyle = '#f4ecff';
        ctx.beginPath(); ctx.moveTo(sp[0], sp[1] - s * 0.5); ctx.lineTo(sp[0] + s * 0.4, sp[1] + s * 0.3); ctx.lineTo(sp[0], sp[1] + s * 0.15); ctx.lineTo(sp[0] - s * 0.4, sp[1] + s * 0.3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,46,154,.6)';
        ctx.beginPath(); ctx.moveTo(sp[0] - s * 0.12, sp[1] + s * 0.25); ctx.lineTo(sp[0] + s * 0.12, sp[1] + s * 0.25); ctx.lineTo(sp[0], sp[1] + s * 0.7); ctx.fill();
      }
    };
    id = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(id); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} className="h-full w-full" data-testid="canvas-software" />;
}
