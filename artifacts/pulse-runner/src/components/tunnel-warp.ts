/**
 * Shared manifold deformation for the tunnel. Pure and deterministic.
 * Each depth slice (fixed z) maps (x,y) through an affine, orientation-preserving
 * transform: rotation * [[sx, sh],[shy, sy]] plus an offset. z is never changed.
 * z >= WARP_SAFE_Z is an exact identity (approach / hit region).
 */
export const WARP_SAFE_Z = -6;
const RAMP = 22;

/** Writes [a,b,c,d,ox,oy]: x' = a x + b y + ox ; y' = c x + d y + oy */
export function warpSliceMatrix(z: number, travel: number, strength: number, m: number[] | Float64Array): number[] | Float64Array {
  if (!(strength > 0) || z >= WARP_SAFE_Z) {
    m[0] = 1; m[1] = 0; m[2] = 0; m[3] = 1; m[4] = 0; m[5] = 0;
    return m;
  }
  const s = strength > 1 ? 1 : strength;
  const u = Math.min(1, (WARP_SAFE_Z - z) / RAMP);
  const k = s * u * u * (3 - 2 * u);
  const p = (z - travel) * 0.055 + travel * 0.01;
  const sx = 1 + 0.14 * k * Math.sin(p * 1.7 + 0.5);
  const sy = 1 - 0.12 * k * Math.sin(p * 1.3 + 2.1);
  const sh = 0.32 * k * Math.sin(p * 1.1 + 2);
  const shy = 0.16 * k * Math.sin(p * 0.9);
  const th = 0.65 * k * Math.sin(p * 0.6 + 0.7);
  const c = Math.cos(th), sn = Math.sin(th);
  m[0] = c * sx - sn * shy;
  m[1] = c * sh - sn * sy;
  m[2] = sn * sx + c * shy;
  m[3] = sn * sh + c * sy;
  m[4] = k * (4.2 * Math.sin(p) + 1.2 * Math.sin(p * 2.3 + 1));
  m[5] = k * (2.4 * Math.sin(p * 0.8 + 1.3) + 0.8 * Math.sin(p * 1.9));
  return m;
}

const SM: number[] = [0, 0, 0, 0, 0, 0];

export function warpTunnelPoint(x: number, y: number, z: number, travel: number, strength: number, out: { x: number; y: number; z: number }) {
  if (!(strength > 0) || z >= WARP_SAFE_Z) {
    out.x = x; out.y = y; out.z = z;
    return out;
  }
  warpSliceMatrix(z, travel, strength, SM);
  out.x = SM[0] * x + SM[1] * y + SM[4];
  out.y = SM[2] * x + SM[3] * y + SM[5];
  out.z = z;
  return out;
}

/** Warp a flat xyz buffer (base -> pos), caching the slice matrix per equal z. */
export function warpPositions(base: ArrayLike<number>, pos: { [i: number]: number }, travel: number, strength: number) {
  let lastZ = NaN;
  for (let i = 0; i < base.length; i += 3) {
    const x = base[i], y = base[i + 1], z = base[i + 2];
    if (z !== lastZ) { warpSliceMatrix(z, travel, strength, SM); lastZ = z; }
    pos[i] = SM[0] * x + SM[1] * y + SM[4];
    pos[i + 1] = SM[2] * x + SM[3] * y + SM[5];
    pos[i + 2] = z;
  }
}

/** Target warp strength in [0,1]; 0 when reduced effects. Callers smooth it. */
export function warpTarget(reduced: boolean, active: boolean, pulse: number, combo01: number, fresh: number) {
  if (reduced) return 0;
  const v = (active ? 0.6 : 0.45) + combo01 * 0.2 + pulse * 0.1 + fresh * 0.1;
  return v < 0 ? 0 : v > 0.9 ? 0.9 : v;
}
