import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { game } from '@/game/engine';

export const LANE_COLORS = ['#ff2e9a', '#ffd23f', '#22e6ff', '#7dff5a'];
const LANE_X = (l: number) => (l - 1.5) * 1.7;
const SPEED = 16;
const AHEAD = 3.2;
const RINGS = 36;
const GAP = 3.2;
const POOL = 90;

function World({ intensity }: { intensity: { v: number } }) {
  const rings = useRef<THREE.Group>(null);
  const notes = useRef<THREE.Group>(null);
  const flashes = useRef<THREE.Group>(null);
  const ship = useRef<THREE.Group>(null);
  const dist = useRef(0);
  const sx = useRef(0);
  const ringGeo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(11, 7, 0.1)), []);
  const noteGeo = useMemo(() => new THREE.BoxGeometry(1.4, 0.35, 0.7), []);
  const noteMats = useMemo(() => LANE_COLORS.map((c) => new THREE.MeshBasicMaterial({ color: c })), []);
  const flashMats = useMemo(() => LANE_COLORS.map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })), []);
  const ringMat = useMemo(() => new THREE.LineBasicMaterial({ color: '#8a5cff', transparent: true }), []);

  useFrame((state, dt) => {
    dt = Math.min(dt, 0.05);
    const snap = game.getSnapshot();
    const active = snap.phase === 'playing' || snap.phase === 'countdown';
    const boost = active ? 1 + Math.min(snap.combo, 60) / 40 : 0.7;
    const sinceHit = (performance.now() - snap.lastHitAt) / 1000;
    const kick = active ? Math.max(0, 1 - sinceHit * 4) * 0.5 : 0;
    const spd = snap.phase === 'paused' ? 0 : SPEED * (boost + kick);
    dist.current += spd * dt;
    const off = dist.current % GAP;
    const tcol = new THREE.Color(game.getSnapshot().track.color);
    ringMat.color.lerp(tcol, 0.05);
    ringMat.opacity = 0.9;
    if (rings.current) {
      rings.current.children.forEach((c, i) => {
        c.position.z = -i * GAP + off + 2;
        const s = 1 + Math.sin(i * 0.35 - dist.current * 0.12) * 0.06;
        c.scale.set(s, s, 1);
        c.rotation.z = Math.sin(dist.current * 0.01 + i * 0.05) * 0.12;
      });
    }
    // notes
    const t = game.getTime();
    const list = snap.phase === 'playing' || snap.phase === 'countdown' || snap.phase === 'paused' ? game.getNotes() : [];
    let n = 0;
    const grp = notes.current;
    if (grp) {
      for (let i = 0; i < list.length && n < POOL; i++) {
        const nt = list[i];
        if (nt.status !== 'pending') continue;
        const d = nt.time - t;
        if (d > AHEAD || d < -0.25) continue;
        const m = grp.children[n++] as THREE.Mesh;
        m.visible = true;
        m.material = noteMats[nt.lane];
        m.position.set(LANE_X(nt.lane), 0.25, -d * SPEED);
        const sc = d > AHEAD - 0.5 ? (AHEAD - d) / 0.5 : 1;
        m.scale.setScalar(Math.max(0.01, sc));
      }
      for (let i = n; i < POOL; i++) grp.children[i].visible = false;
    }
    // flashes
    if (flashes.current) {
      flashes.current.children.forEach((c, l) => {
        const m = c as THREE.Mesh;
        const lit = snap.lastLane === l ? Math.max(0, 1 - sinceHit * 3.5) : 0;
        flashMats[l].opacity = 0.12 + lit * 0.85;
        m.scale.set(1 + lit * 0.25, 1, 1 + lit * 2);
      });
    }
    // ship
    if (ship.current) {
      const tx = active && snap.lastLane !== null ? LANE_X(snap.lastLane) : Math.sin(state.clock.elapsedTime * 0.8) * 2.2;
      sx.current += (tx - sx.current) * Math.min(1, dt * 12);
      ship.current.position.x = sx.current;
      ship.current.position.y = 0.6 + Math.sin(state.clock.elapsedTime * 3) * 0.06;
      ship.current.rotation.z = (tx - sx.current) * -0.4;
    }
    const cam = state.camera as THREE.PerspectiveCamera;
    const fov = 70 + (active ? Math.max(0, 1 - sinceHit * 5) * 5 + Math.min(snap.combo, 50) / 12 : 0);
    cam.fov += (fov - cam.fov) * 0.2;
    cam.position.x += (sx.current * 0.35 - cam.position.x) * 0.1;
    cam.updateProjectionMatrix();
    intensity.v = boost;
  });

  return (
    <>
      <fog attach="fog" args={['#0b0718', 18, 62]} />
      <group ref={rings}>
        {Array.from({ length: RINGS }, (_, i) => (
          <lineSegments key={i} geometry={ringGeo} material={ringMat} position={[0, 2.2, -i * GAP]} />
        ))}
      </group>
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -30]}>
        <planeGeometry args={[7.4, 80]} />
        <meshBasicMaterial color="#120a2a" />
      </mesh>
      {[0, 1, 2, 3].map((l) => (
        <mesh key={l} rotation={[-Math.PI / 2, 0, 0]} position={[LANE_X(l), 0.01, -30]}>
          <planeGeometry args={[1.5, 80]} />
          <meshBasicMaterial color={LANE_COLORS[l]} transparent opacity={0.08} depthWrite={false} />
        </mesh>
      ))}
      {[-3.4, -1.7, 0, 1.7, 3.4].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.02, -30]}>
          <planeGeometry args={[0.04, 80]} />
          <meshBasicMaterial color="#b9a6ff" transparent opacity={0.5} />
        </mesh>
      ))}
      {/* hit plane */}
      <group ref={flashes}>
        {[0, 1, 2, 3].map((l) => (
          <mesh key={l} rotation={[-Math.PI / 2, 0, 0]} position={[LANE_X(l), 0.04, 0]} material={flashMats[l]}>
            <planeGeometry args={[1.5, 0.9]} />
          </mesh>
        ))}
      </group>
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7, 0.07]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <group ref={notes}>
        {Array.from({ length: POOL }, (_, i) => (
          <mesh key={i} geometry={noteGeo} material={noteMats[0]} visible={false} />
        ))}
      </group>
      <group ref={ship} position={[0, 0.6, 1.8]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.35, 1.3, 4]} />
          <meshBasicMaterial color="#f4ecff" />
        </mesh>
        <mesh position={[0, 0, 0.7]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.18, 1.2, 4]} />
          <meshBasicMaterial color="#ff2e9a" transparent opacity={0.6} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>
    </>
  );
}

export function Scene() {
  const intensity = useRef({ v: 1 });
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 2.3, 4.2], fov: 70, near: 0.1, far: 120, rotation: [-0.2, 0, 0] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => gl.setClearColor('#0b0718')}
    >
      <World intensity={intensity.current} />
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
