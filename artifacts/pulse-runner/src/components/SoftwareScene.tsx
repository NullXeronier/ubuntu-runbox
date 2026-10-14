import { useEffect, useRef } from 'react';
import { game } from '@/game/engine';
import { TUNNEL_RADIUS as R, LANE_STEP as STEP, laneAngle as laneA, CAMERA_Y as camY, CAMERA_Z as camZ, CAMERA_FOV, CAMERA_PITCH, projectionScale } from './tunnel-layout';
import { warpTunnelPoint, warpTarget } from './tunnel-warp';

const COLORS = ['#ff2e9a', '#ffd23f', '#22e6ff', '#7dff5a'];
const SPEED = 16;
const AHEAD = 3.2;
const GAP = 3.4;
const RINGS = 22;
const SEG = 5;
const PTS = 7;
const rnd = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export function SoftwareScene() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    let w = 0, h = 0, id = 0, dist = 0, sa = 0, last = performance.now();
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    const out = [0, 0, 0];
    const wp = { x: 0, y: 0, z: 0 };
    let wsm = 0;

    const frame = (now: number) => {
      id = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.05); last = now;
      const snap = game.getSnapshot();
      const reduced = snap.reducedEffects;
      const active = snap.phase === 'playing' || snap.phase === 'countdown';
      const sinceHit = snap.lastHitAt > 0 ? (now - snap.lastHitAt) / 1000 : 99;
      const fresh = active && !reduced && snap.lastJudge !== 'MISS' ? Math.max(0, 1 - sinceHit * 4) : 0;
      const combo01 = active ? Math.min(snap.combo, 60) / 60 : 0;
      const boost = active ? (reduced ? 1 : 1 + Math.min(snap.combo, 60) / 40) : 0.7;
      dist += snap.phase === 'paused' ? 0 : SPEED * (boost + fresh * 0.5) * dt;
      const t = game.getTime();
      let pulse = 0;
      if (!reduced && snap.phase !== 'paused') {
        const ph = active ? (((t * snap.track.bpm / 60) % 1) + 1) % 1 : (now / 625) % 1;
        pulse = Math.pow(1 - ph, 3) * (active ? 1 : 0.5);
      }
      const ta = active && snap.lastLane !== null ? laneA(snap.lastLane) : reduced ? 0 : Math.sin(dist * 0.07) * 0.5;
      sa += (ta - sa) * Math.min(1, dt * 12);
      const camX = reduced ? 0 : Math.sin(sa) * 0.5;
      const f = projectionScale(h, CAMERA_FOV + (reduced ? 0 : fresh * 4 + combo01 * 5));
      const cx = w / 2, cy = h / 2;
      const pitchCos = Math.cos(-CAMERA_PITCH), pitchSin = Math.sin(-CAMERA_PITCH);
      const tw = warpTarget(reduced, active, pulse, combo01, fresh);
      if (reduced) wsm = 0;
      else if (snap.phase !== 'paused') wsm += (tw - wsm) * Math.min(1, dt * 3);
      const ws = wsm < 0.001 ? 0 : wsm;
      const P = (x: number, y: number, z: number) => {
        warpTunnelPoint(x, y, z, dist, ws, wp);
        x = wp.x; y = wp.y;
        const dy = y - camY, dz = camZ - z;
        const d = dz * pitchCos - dy * pitchSin;
        if (d <= 0.2) return false;
        out[0] = cx + ((x - camX) * f) / d; out[1] = cy - ((dy * pitchCos + dz * pitchSin) * f) / d; out[2] = d;
        return true;
      };
      const fade = (d: number) => Math.max(0, Math.min(1, 1 - (d - 8) / 60));
      const col = snap.track.color;

      ctx.globalAlpha = 1; ctx.fillStyle = '#070514'; ctx.fillRect(0, 0, w, h);
      // vanishing core
      const cr = Math.max(w, h) * (0.35 + pulse * 0.03);
      let gx = cx, gy = cy;
      if (P(0, 0, -75)) { gx = out[0]; gy = out[1]; }
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, cr);
      g.addColorStop(0, col + (combo01 > 0.5 ? '66' : '44')); g.addColorStop(1, 'transparent');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

      // rotating segmented hoops far to near
      const off = dist % GAP;
      ctx.lineCap = 'round';
      for (let i = RINGS - 1; i >= 0; i--) {
        const z = -i * GAP + off + 1;
        const rot = i * 0.45 + (reduced ? 0 : (i % 2 ? 1 : -1) * dist * (0.02 + (i % 3) * 0.012));
        const rr = R + 0.2 + pulse * 0.05;
        if (!P(0, 0, z)) continue;
        const fd = fade(out[2]);
        ctx.lineWidth = Math.max(1, 0.07 * f / out[2]);
        for (let k = 0; k < SEG; k++) {
          ctx.strokeStyle = (i + k) % 3 === 0 ? col : (i + k) % 3 === 1 ? '#ff2e9a' : '#22e6ff';
          ctx.globalAlpha = Math.min(1, fd * (0.6 + pulse * 0.35 + fresh * 0.2));
          ctx.beginPath();
          for (let p = 0; p <= PTS; p++) {
            const a = rot + (k * Math.PI * 2) / SEG + (p / PTS) * 0.95;
            if (!P(Math.cos(a) * rr, Math.sin(a) * rr, z)) continue;
            if (p) ctx.lineTo(out[0], out[1]); else ctx.moveTo(out[0], out[1]);
          }
          ctx.stroke();
        }
        // circuit ticks
        ctx.strokeStyle = '#22e6ff'; ctx.globalAlpha = fd * (0.35 + pulse * 0.3); ctx.lineWidth = 1;
        ctx.beginPath();
        for (let k = 0; k < 16; k++) {
          const a = rot * 1.5 + (k / 16) * Math.PI * 2, l1 = 0.3 + rnd(k) * 0.6;
          if (!P(Math.cos(a) * (R - 0.05), Math.sin(a) * (R - 0.05), z)) continue;
          ctx.moveTo(out[0], out[1]);
          if (P(Math.cos(a) * (R - l1), Math.sin(a) * (R - l1), z)) ctx.lineTo(out[0], out[1]);
        }
        ctx.stroke();
      }
      // streaks
      if (!reduced) {
        const len = 1.5 + (boost - 0.7) * 4 + fresh * 3;
        ctx.strokeStyle = '#9fe9ff'; ctx.lineWidth = 1; ctx.globalAlpha = 0.35;
        ctx.beginPath();
        for (let i = 0; i < 40; i++) {
          const a = rnd(i) * Math.PI * 2, r = R * (0.35 + rnd(i + 99) * 0.6);
          const z = -((rnd(i + 7) * 80 + dist * (0.8 + rnd(i + 3) * 0.6)) % 80) + 2;
          if (!P(Math.cos(a) * r, Math.sin(a) * r, z)) continue;
          ctx.moveTo(out[0], out[1]);
          if (P(Math.cos(a) * r, Math.sin(a) * r, z - len)) ctx.lineTo(out[0], out[1]);
        }
        ctx.stroke();
      }
      // rails, sampled along depth so they bend with the tube
      ctx.strokeStyle = '#ff2e9a'; ctx.lineWidth = 1; ctx.globalAlpha = 0.18 + pulse * 0.2;
      ctx.beginPath();
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2 + (reduced ? 0 : dist * 0.012);
        let started = false;
        for (let j = 0; j <= 16; j++) {
          if (!P(Math.cos(a) * (R + 0.1), Math.sin(a) * (R + 0.1), 2 - j * 5)) { started = false; continue; }
          if (started) ctx.lineTo(out[0], out[1]); else { ctx.moveTo(out[0], out[1]); started = true; }
        }
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      // lanes (arc strips, near and far edges)
      const zf = -80, zn = 3;
      for (let l = 0; l < 4; l++) {
        const a = laneA(l), lit = snap.lastLane === l && active && snap.lastJudge !== 'MISS' ? Math.max(0, 1 - sinceHit * 3.5) : 0;
        const pts: number[] = [];
        let ok = true;
        const N = 14;
        for (let e = 0; e < 2 && ok; e++) {
          const aa = e === 0 ? a + 0.15 : a - 0.15;
          for (let j = 0; j <= N; j++) {
            const z = e === 0 ? zf + ((zn - zf) * j) / N : zn - ((zn - zf) * j) / N;
            if (!P(Math.sin(aa) * R, -Math.cos(aa) * R, z)) { ok = false; break; }
            pts.push(out[0], out[1]);
          }
        }
        if (!ok) continue;
        ctx.globalAlpha = 0.16 + lit * 0.14 + pulse * 0.05; ctx.fillStyle = COLORS[l];
        ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
        for (let q = 2; q < pts.length; q += 2) ctx.lineTo(pts[q], pts[q + 1]);
        ctx.fill();
        // hit pad
        ctx.globalAlpha = 0.15 + lit * 0.8;
        const q: number[] = [];
        for (const [aa, z] of [[a + 0.15, 0.45], [a - 0.15, 0.45], [a - 0.15, -0.45], [a + 0.15, -0.45]] as [number, number][]) {
          if (P(Math.sin(aa) * R, -Math.cos(aa) * R, z)) q.push(out[0], out[1]);
        }
        if (q.length === 8) { ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(q[2], q[3]); ctx.lineTo(q[4], q[5]); ctx.lineTo(q[6], q[7]); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
      // hit arc
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath();
      for (let p = 0; p <= 12; p++) {
        const aa = -2.02 * STEP + (p / 12) * 4.04 * STEP;
        if (!P(Math.sin(aa) * R, -Math.cos(aa) * R, 0)) continue;
        if (p) ctx.lineTo(out[0], out[1]); else ctx.moveTo(out[0], out[1]);
      }
      ctx.stroke();
      // notes, far to near
      if (snap.phase !== 'idle' && snap.phase !== 'results') {
        const vis = game.getNotes().filter((n) => n.status === 'pending' && n.time - t <= AHEAD && n.time - t >= -0.25).sort((a, b) => b.time - a.time);
        for (const n of vis) {
          const d = n.time - t, z = -d * SPEED, a = laneA(n.lane);
          const sn = Math.sin(a), cs = Math.cos(a);
          // lateral axis (cs, sn), inward axis (-sn, cs)
          const rr = R - 0.2;
          const base = [Math.sin(a) * rr, -Math.cos(a) * rr];
          const c: number[] = [];
          for (const [lat, inw] of [[-0.55, 0], [0.55, 0], [0.55, 0.3], [-0.55, 0.3]]) {
            if (P(base[0] + cs * lat - sn * inw, base[1] + sn * lat + cs * inw, z + 0.35)) c.push(out[0], out[1]);
          }
          if (c.length < 8) continue;
          ctx.globalAlpha = d > AHEAD - 0.5 ? (AHEAD - d) / 0.5 : 1;
          ctx.fillStyle = COLORS[n.lane]; ctx.shadowColor = COLORS[n.lane]; ctx.shadowBlur = 10;
          ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(c[2], c[3]); ctx.lineTo(c[4], c[5]); ctx.lineTo(c[6], c[7]); ctx.closePath(); ctx.fill();
        }
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      }
      // ship
      if (P(Math.sin(sa) * (R - 1), -Math.cos(sa) * (R - 1), 1.8)) {
        const sx = out[0], sy = out[1], s = f / out[2];
        ctx.fillStyle = '#f4ecff';
        ctx.beginPath(); ctx.moveTo(sx, sy - s * 0.5); ctx.lineTo(sx + s * 0.4, sy + s * 0.3); ctx.lineTo(sx, sy + s * 0.15); ctx.lineTo(sx - s * 0.4, sy + s * 0.3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,46,154,.6)';
        ctx.beginPath(); ctx.moveTo(sx - s * 0.12, sy + s * 0.25); ctx.lineTo(sx + s * 0.12, sy + s * 0.25); ctx.lineTo(sx, sy + s * 0.7); ctx.fill();
      }
    };
    id = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(id); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} className="h-full w-full" data-testid="canvas-software" />;
}
