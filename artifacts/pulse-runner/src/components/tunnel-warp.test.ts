import assert from "node:assert/strict";
import { test } from "node:test";
import { warpTunnelPoint, warpPositions, warpSliceMatrix, warpTarget } from "./tunnel-warp";

const point = () => ({ x: 0, y: 0, z: 0 });

test("reduced-effects strength leaves the entire tunnel unchanged", () => {
  const out = point();
  for (const z of [-90, -60, -30, -6, 0, 5]) {
    for (const travel of [0, 50, 9000]) {
      assert.equal(warpTunnelPoint(2.25, -3.75, z, travel, 0, out), out);
      assert.deepEqual(out, { x: 2.25, y: -3.75, z });
    }
  }
});

test("the final six units, hit line and ship are exactly undistorted", () => {
  const out = point();
  for (const z of [-6, -5.999, -3.2, -0.35, 0, 0.35, 1.8, 5]) {
    for (const strength of [0.1, 1, 1.5]) {
      for (const travel of [0, 180, 6000]) {
        warpTunnelPoint(-2.45, -3.65, z, travel, strength, out);
        assert.deepEqual(out, { x: -2.45, y: -3.65, z });
      }
    }
  }
});

test("distortion never changes audio-derived note depth", () => {
  const out = point();
  for (let i = 0; i < 120; i++) {
    const z = -i * 0.8;
    warpTunnelPoint(Math.sin(i) * 4, -Math.cos(i) * 4, z, i * 40, 1.5, out);
    assert.equal(out.z, z);
    assert.ok(Number.isFinite(out.x) && Number.isFinite(out.y));
    assert.ok(Math.abs(out.x) < 32 && Math.abs(out.y) < 32, "deformation must remain bounded");
  }
});

test("depth slices preserve orientation, spacing and coherent ring transforms", () => {
  const origin = point(), xAxis = point(), yAxis = point(), actual = point();
  for (const travel of [0, 12, 70, 400, 10000]) {
    for (const z of [-7, -18, -40, -85]) {
      for (const strength of [0, 0.4, 1, 1.5]) {
        warpTunnelPoint(0, 0, z, travel, strength, origin);
        warpTunnelPoint(1, 0, z, travel, strength, xAxis);
        warpTunnelPoint(0, 1, z, travel, strength, yAxis);
        const xx = xAxis.x - origin.x, xy = xAxis.y - origin.y;
        const yx = yAxis.x - origin.x, yy = yAxis.y - origin.y;
        const determinant = xx * yy - xy * yx;
        assert.ok(determinant > 0.15 && determinant < 4, "a tunnel slice must not fold or collapse");
        warpTunnelPoint(2.2, -3.5, z, travel, strength, actual);
        assert.ok(Math.abs(actual.x - (origin.x + xx * 2.2 - yx * 3.5)) < 0.000001);
        assert.ok(Math.abs(actual.y - (origin.y + xy * 2.2 - yy * 3.5)) < 0.000001);
      }
    }
  }
});

test("the bend fades smoothly into the stable approach zone", () => {
  const before = point(), after = point();
  for (const z of [-85, -35, -15, -6.001, -6]) {
    warpTunnelPoint(3, -4, z, 140, 1.5, before);
    warpTunnelPoint(3, -4, z + 0.001, 140, 1.5, after);
    assert.ok(Math.hypot(after.x - before.x, after.y - before.y) < 0.1);
  }
  warpTunnelPoint(3, -4, -6.001, 140, 1.5, before);
  assert.ok(Math.hypot(before.x - 3, before.y + 4) < 0.001);
});

test("travel drives continuous motion and a paused travel value is deterministic", () => {
  const out = point(), next = point();
  const frozen = { ...warpTunnelPoint(-2, 3, -40, 180, 1, out) };
  warpTunnelPoint(9, 8, -20, 90, 1.5, out);
  warpTunnelPoint(-2, 3, -40, 180, 1, out);
  assert.deepEqual(out, frozen);
  warpTunnelPoint(-2, 3, -40, 180.001, 1, next);
  assert.ok(Math.hypot(next.x - out.x, next.y - out.y) < 0.1);
});

test("normal effects produce a visible manifold bend away from the hit target", () => {
  const out = point();
  let displacement = 0;
  for (const travel of [0, 40, 100]) {
    for (const z of [-18, -35, -60]) {
      warpTunnelPoint(3, 2, z, travel, 1, out);
      displacement = Math.max(displacement, Math.hypot(out.x - 3, out.y - 2));
    }
  }
  assert.ok(displacement > 0.35, "normal mode must visibly bend, not merely change the camera");
});

test("pooled geometry and ring slice matrices use exactly the same warp as notes", () => {
  const base = new Float32Array([1, -4, -40, 2, -3, -40, 0, 4, -20, 2, -3, 0]);
  const buffer = new Float32Array(base.length);
  const original = Float32Array.from(base);
  const expected = point(), matrix = new Float64Array(6);
  warpPositions(base, buffer, 200, 0.8);
  for (let i = 0; i < base.length; i += 3) {
    warpTunnelPoint(base[i], base[i + 1], base[i + 2], 200, 0.8, expected);
    warpSliceMatrix(base[i + 2], 200, 0.8, matrix);
    assert.ok(Math.abs(buffer[i] - expected.x) < 0.000001);
    assert.ok(Math.abs(buffer[i + 1] - expected.y) < 0.000001);
    assert.equal(buffer[i + 2], expected.z);
    assert.ok(Math.abs(matrix[0] * base[i] + matrix[1] * base[i + 1] + matrix[4] - expected.x) < 0.000001);
    assert.ok(Math.abs(matrix[2] * base[i] + matrix[3] * base[i + 1] + matrix[5] - expected.y) < 0.000001);
  }
  assert.deepEqual(base, original, "deformation must not accumulate into source geometry");
  warpPositions(base, buffer, 201, 0);
  assert.deepEqual(buffer, original, "reduced effects must restore the original geometry");
});

test("beat and combo intensity are bounded and reduced effects override every boost", () => {
  assert.equal(warpTarget(true, true, 1, 1, 1), 0);
  assert.ok(warpTarget(false, false, 0, 0, 0) > 0, "idle preview should show the warp");
  const baseline = warpTarget(false, true, 0, 0, 0);
  assert.ok(warpTarget(false, true, 1, 1, 1) > baseline);
  assert.ok(warpTarget(false, true, 100, 100, 100) <= 1);
});
