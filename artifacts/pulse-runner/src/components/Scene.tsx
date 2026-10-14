import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { game } from '@/game/engine';
import { TUNNEL_RADIUS as R, LANE_STEP, laneAngle, laneStripGeometry, CAMERA_Y, CAMERA_Z, CAMERA_FOV, CAMERA_PITCH } from './tunnel-layout';

export const LANE_COLORS = ['#ff2e9a', '#ffd23f', '#22e6ff', '#7dff5a'];
const SPEED = 16;
const AHEAD = 3.2;
const RINGS = 26;
const GAP = 3.4;
const POOL = 90;
const STREAKS = 70;
const PARTS = 120;
const LEN = 80;

// deterministic pseudo random so layout is stable
const rnd = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

function World() {
  const rings = useRef<THREE.Group>(null);
  const notes = useRef<THREE.Group>(null);
  const flashes = useRef<THREE.Group>(null);
  const ship = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);
  const rails = useRef<THREE.LineSegments>(null);
  const dist = useRef(0);
  const sa = useRef(0);
  const trackId = useRef('');
  const tcol = useRef(new THREE.Color('#22e6ff'));
  const tmp = useRef(new THREE.Color());

  const res = useMemo(() => {
    const arc = new THREE.TorusGeometry(R + 0.2, 0.035, 5, 10, 0.95);
    const thick = new THREE.TorusGeometry(R + 0.35, 0.07, 5, 10, 0.4);
    const tp: number[] = [];
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2, len = 0.25 + rnd(k) * 0.7, r0 = R - 0.05;
      tp.push(Math.cos(a) * r0, Math.sin(a) * r0, 0, Math.cos(a) * (r0 - len), Math.sin(a) * (r0 - len), 0);
      if (k % 3 === 0) { // circuit elbow
        const b = a + 0.08;
        tp.push(Math.cos(a) * (r0 - len), Math.sin(a) * (r0 - len), 0, Math.cos(b) * (r0 - len), Math.sin(b) * (r0 - len), 0);
      }
    }
    const ticks = new THREE.BufferGeometry();
    ticks.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
    const rp: number[] = [];
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      rp.push(Math.cos(a) * (R + 0.1), Math.sin(a) * (R + 0.1), 2, Math.cos(a) * (R + 0.1), Math.sin(a) * (R + 0.1), -LEN);
    }
    const railGeo = new THREE.BufferGeometry();
    railGeo.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
    const wall = new THREE.CylinderGeometry(R + 0.5, R + 0.5, LEN + 10, 40, 1, true);
    const floorStrips = [0, 1, 2, 3].map((l) => laneStripGeometry(l, LEN + 10, R - 0.02, 0.3));
    const flashGeos = [0, 1, 2, 3].map((l) => laneStripGeometry(l, 1, R - 0.01, 0.31));
    const hitLine = new THREE.TorusGeometry(R - 0.03, 0.03, 4, 20, 4 * LANE_STEP + 0.04);
    const noteGeo = new THREE.BoxGeometry(1.1, 0.3, 0.7);
    const shipGeo = new THREE.ConeGeometry(0.3, 1.2, 4);
    const trailGeo = new THREE.ConeGeometry(0.16, 1.1, 4);
    const coreGeo = new THREE.CircleGeometry(R * 0.7, 32);
    const sp = new Float32Array(STREAKS * 6);
    const streakGeo = new THREE.BufferGeometry();
    streakGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const pp = new Float32Array(PARTS * 3);
    const partGeo = new THREE.BufferGeometry();
    partGeo.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    const lineMat = (c: string, o: number) => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
    const ringMats = [0, 1, 2].map(() => new THREE.MeshBasicMaterial({ color: '#22e6ff', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    return {
      arc, thick, ticks, railGeo, wall, floorStrips, flashGeos, hitLine, noteGeo, shipGeo, trailGeo, coreGeo, streakGeo, partGeo, sp, pp,
      ringMats,
      tickMat: lineMat('#22e6ff', 0.55),
      railMat: lineMat('#ff2e9a', 0.3),
      streakMat: lineMat('#9fe9ff', 0.4),
      partMat: new THREE.PointsMaterial({ color: '#ffd23f', size: 0.09, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
      wallMat: new THREE.MeshBasicMaterial({ color: '#0a0620', side: THREE.BackSide }),
      laneMats: LANE_COLORS.map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide })),
      flashMats: LANE_COLORS.map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })),
      noteMats: LANE_COLORS.map((c) => new THREE.MeshBasicMaterial({ color: c })),
      lineWhite: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
      shipMat: new THREE.MeshBasicMaterial({ color: '#f4ecff' }),
      trailMat: new THREE.MeshBasicMaterial({ color: '#ff2e9a', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending }),
      coreMat: new THREE.MeshBasicMaterial({ color: '#22e6ff', transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    };
  }, []);

  useEffect(() => () => {
    const geos = [res.arc, res.thick, res.ticks, res.railGeo, res.wall, ...res.floorStrips, ...res.flashGeos, res.hitLine, res.noteGeo, res.shipGeo, res.trailGeo, res.coreGeo, res.streakGeo, res.partGeo];
    geos.forEach((g) => g.dispose());
    const mats = [...res.ringMats, res.tickMat, res.railMat, res.streakMat, res.partMat, res.wallMat, ...res.laneMats, ...res.flashMats, ...res.noteMats, res.lineWhite, res.shipMat, res.trailMat, res.coreMat];
    mats.forEach((m) => m.dispose());
  }, [res]);

  useFrame((state, dt) => {
    dt = Math.min(dt, 0.05);
    const snap = game.getSnapshot();
    const reduced = snap.reducedEffects;
    const active = snap.phase === 'playing' || snap.phase === 'countdown';
    const paused = snap.phase === 'paused';
    const now = performance.now();
    const sinceHit = snap.lastHitAt > 0 ? (now - snap.lastHitAt) / 1000 : 99;
    const fresh = active && !reduced && snap.lastJudge !== 'MISS' ? Math.max(0, 1 - sinceHit * 4) : 0;
    const boost = active ? (reduced ? 1 : 1 + Math.min(snap.combo, 60) / 40) : 0.7;
    const spd = paused ? 0 : SPEED * (boost + fresh * 0.5);
    dist.current += spd * dt;
    const d = dist.current;
    const t = game.getTime();
    // beat pulse from audio clock while active; idle time only for preview
    let pulse = 0;
    if (!reduced && !paused) {
      const bps = snap.track.bpm / 60;
      const ph = active ? (((t * bps) % 1) + 1) % 1 : (state.clock.elapsedTime * 1.6) % 1;
      pulse = Math.pow(1 - ph, 3) * (active ? 1 : 0.5);
    }
    const combo01 = active ? Math.min(snap.combo, 60) / 60 : 0;

    if (trackId.current !== snap.track.id) { trackId.current = snap.track.id; tcol.current.set(snap.track.color); }
    res.ringMats[0].color.lerp(tcol.current, 0.06);
    res.ringMats[1].color.set('#ff2e9a');
    res.ringMats[2].color.set('#22e6ff');
    const glow = 0.55 + pulse * 0.35 + fresh * 0.2 + combo01 * 0.1;
    res.ringMats.forEach((m) => { m.opacity = Math.min(1, glow); });
    res.tickMat.opacity = 0.35 + pulse * 0.4 + combo01 * 0.2;
    tmp.current.copy(tcol.current);
    res.tickMat.color.lerp(tmp.current, 0.05);
    res.railMat.opacity = 0.2 + pulse * 0.25 + fresh * 0.2;

    const off = d % GAP;
    if (rings.current) {
      const ch = rings.current.children;
      for (let i = 0; i < ch.length; i++) {
        const g = ch[i];
        g.position.z = -i * GAP + off + 1;
        const dir = i % 2 ? 1 : -1;
        g.rotation.z = i * 0.45 + (reduced ? 0 : dir * d * (0.02 + (i % 3) * 0.012));
        const s = 1 + pulse * 0.025 * (1 - i / ch.length);
        g.scale.set(s, s, 1);
      }
    }
    if (rails.current) rails.current.rotation.z = reduced ? 0 : d * 0.012;

    // streaks and particles (not in reduced)
    res.streakMat.visible = !reduced;
    res.partMat.visible = !reduced;
    if (!reduced) {
      const len = 1.5 + (boost - 0.7) * 4 + fresh * 3;
      for (let i = 0; i < STREAKS; i++) {
        const a = rnd(i) * Math.PI * 2, r = R * (0.35 + rnd(i + 99) * 0.6);
        const z = -(((rnd(i + 7) * LEN + d * (0.8 + rnd(i + 3) * 0.6)) % LEN)) + 2;
        const o = i * 6;
        res.sp[o] = Math.cos(a) * r; res.sp[o + 1] = Math.sin(a) * r; res.sp[o + 2] = z;
        res.sp[o + 3] = res.sp[o]; res.sp[o + 4] = res.sp[o + 1]; res.sp[o + 5] = z - len;
      }
      res.streakGeo.attributes.position.needsUpdate = true;
      const vis = Math.floor(PARTS * (0.35 + combo01 * 0.65));
      for (let i = 0; i < PARTS; i++) {
        const o = i * 3;
        if (i >= vis) { res.pp[o + 2] = 50; continue; }
        const a = rnd(i + 500) * Math.PI * 2 + d * 0.015, r = R * (0.2 + rnd(i + 600) * 0.7);
        res.pp[o] = Math.cos(a) * r; res.pp[o + 1] = Math.sin(a) * r;
        res.pp[o + 2] = -(((rnd(i + 700) * 50 + d * 0.5) % 50)) + 1;
      }
      res.partGeo.attributes.position.needsUpdate = true;
    }

    if (core.current) {
      res.coreMat.color.copy(tcol.current);
      res.coreMat.opacity = 0.25 + pulse * 0.2 + combo01 * 0.15;
    }

    // notes: z derived only from audio time
    const grp = notes.current;
    if (grp) {
      const list = active || paused ? game.getNotes() : [];
      let n = 0;
      for (let i = 0; i < list.length && n < POOL; i++) {
        const nt = list[i];
        if (nt.status !== 'pending') continue;
        const dd = nt.time - t;
        if (dd > AHEAD || dd < -0.25) continue;
        const m = grp.children[n++] as THREE.Mesh;
        const a = laneAngle(nt.lane);
        m.visible = true;
        m.material = res.noteMats[nt.lane];
        m.position.set(Math.sin(a) * (R - 0.2), -Math.cos(a) * (R - 0.2), -dd * SPEED);
        m.rotation.z = a;
        const sc = dd > AHEAD - 0.5 ? (AHEAD - dd) / 0.5 : 1;
        m.scale.setScalar(Math.max(0.01, sc));
      }
      for (let i = n; i < POOL; i++) grp.children[i].visible = false;
    }

    // hit flashes, only for real hits (lastHitAt freshness)
    for (let l = 0; l < 4; l++) {
      const lit = active && snap.lastJudge !== 'MISS' && snap.lastLane === l ? Math.max(0, 1 - sinceHit * 3.5) : 0;
      res.flashMats[l].opacity = 0.12 + lit * 0.8;
      res.laneMats[l].opacity = 0.14 + lit * 0.12 + pulse * 0.05;
    }

    // ship follows lane
    if (ship.current) {
      const ta = active && snap.lastLane !== null ? laneAngle(snap.lastLane) : reduced ? 0 : Math.sin(dist.current * 0.07) * 0.5;
      sa.current += (ta - sa.current) * Math.min(1, dt * 12);
      const a = sa.current, r = R - 1;
      ship.current.position.set(Math.sin(a) * r, -Math.cos(a) * r + (reduced ? 0 : Math.sin(dist.current * 0.2) * 0.04), 1.8);
      ship.current.rotation.z = a;
    }

    const cam = state.camera as THREE.PerspectiveCamera;
    const fov = CAMERA_FOV + (reduced ? 0 : fresh * 4 + combo01 * 5);
    cam.fov += (fov - cam.fov) * 0.2;
    cam.position.x += ((reduced ? 0 : Math.sin(sa.current) * 0.5) - cam.position.x) * 0.1;
    cam.rotation.z = reduced ? 0 : -sa.current * 0.12;
    cam.updateProjectionMatrix();
  });

  return (
    <>
      <fog attach="fog" args={['#070514', 14, 62]} />
      <mesh geometry={res.wall} material={res.wallMat} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -35]} />
      <mesh ref={core} geometry={res.coreGeo} material={res.coreMat} position={[0, 0, -75]} />
      <lineSegments ref={rails} geometry={res.railGeo} material={res.railMat} />
      <group ref={rings}>
        {Array.from({ length: RINGS }, (_, i) => (
          <group key={i} position={[0, 0, -i * GAP]}>
            {[0, 1, 2, 3, 4].map((k) => (
              <mesh key={k} geometry={k === 0 ? res.thick : res.arc} material={res.ringMats[(i + k) % 3]} rotation={[0, 0, (k * Math.PI * 2) / 5]} />
            ))}
            <lineSegments geometry={res.ticks} material={res.tickMat} rotation={[0, 0, i * 0.7]} />
          </group>
        ))}
      </group>
      {[0, 1, 2, 3].map((l) => (
        <mesh key={l} geometry={res.floorStrips[l]} material={res.laneMats[l]} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -35]} />
      ))}
      <group ref={flashes}>
        {[0, 1, 2, 3].map((l) => (
          <mesh key={l} geometry={res.flashGeos[l]} material={res.flashMats[l]} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0]} />
        ))}
      </group>
      <mesh geometry={res.hitLine} material={res.lineWhite} rotation={[0, 0, -Math.PI / 2 - (4 * LANE_STEP + 0.04) / 2]} position={[0, 0, 0]} />
      <group ref={notes}>
        {Array.from({ length: POOL }, (_, i) => (
          <mesh key={i} geometry={res.noteGeo} material={res.noteMats[0]} visible={false} />
        ))}
      </group>
      <lineSegments geometry={res.streakGeo} material={res.streakMat} frustumCulled={false} />
      <points geometry={res.partGeo} material={res.partMat} frustumCulled={false} />
      <group ref={ship} position={[0, -3, 1.8]}>
        <mesh geometry={res.shipGeo} material={res.shipMat} rotation={[-Math.PI / 2, 0, 0]} />
        <mesh geometry={res.trailGeo} material={res.trailMat} position={[0, 0, 0.7]} rotation={[Math.PI / 2, 0, 0]} />
      </group>
    </>
  );
}

export function Scene() {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, CAMERA_Y, CAMERA_Z], fov: CAMERA_FOV, near: 0.1, far: 120, rotation: [CAMERA_PITCH, 0, 0] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => gl.setClearColor('#070514')}
    >
      <World />
    </Canvas>
  );
}

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    const g = c.getContext('webgl2');
    if (!g) return false;
    g.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}
