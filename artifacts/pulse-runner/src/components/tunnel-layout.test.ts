import assert from "node:assert/strict";
import { test } from "node:test";
import { PerspectiveCamera, Vector3 } from "three";
import { TUNNEL_RADIUS, laneAngle, laneStripGeometry, CAMERA_Y, CAMERA_Z, CAMERA_FOV, CAMERA_PITCH, projectionScale } from "./tunnel-layout";

test("all four Three.js lane strips occupy the same bottom arc as their notes", () => {
  for (let lane = 0; lane < 4; lane++) {
    const radius = TUNNEL_RADIUS - 0.02;
    const geometry = laneStripGeometry(lane, 80, radius, 0.3);
    geometry.rotateX(Math.PI / 2);
    const vertex = new Vector3().fromBufferAttribute(geometry.attributes.position, 3);
    const angle = laneAngle(lane);
    assert.ok(Math.abs(vertex.x - Math.sin(angle) * radius) < 0.00001);
    assert.ok(Math.abs(vertex.y + Math.cos(angle) * radius) < 0.00001);
    assert.ok(vertex.y < 0, "lanes must not be mirrored onto the ceiling");
    geometry.dispose();
  }
});

test("hit targets stay above controls and all note widths fit desktop and phone viewports", () => {
  for (const [width, height] of [[1280, 800], [390, 844], [640, 360]]) {
    for (const camX of [-0.25, 0, 0.25]) {
      const camera = new PerspectiveCamera(CAMERA_FOV, width / height, 0.1, 120);
      camera.position.set(camX, CAMERA_Y, CAMERA_Z);
      camera.rotation.x = CAMERA_PITCH;
      camera.updateMatrixWorld();
      for (let lane = 0; lane < 4; lane++) {
        const angle = laneAngle(lane);
        for (const lateral of [-0.55, 0.55]) {
          const position = new Vector3(
            Math.sin(angle) * (TUNNEL_RADIUS - 0.2) + Math.cos(angle) * lateral,
            -Math.cos(angle) * (TUNNEL_RADIUS - 0.2) + Math.sin(angle) * lateral,
            0,
          ).project(camera);
          const y = (1 - position.y) / 2;
          assert.ok(Math.abs(position.x) < 0.98, `lane ${lane} must fit ${width}x${height}`);
          assert.ok(y > 0.48 && y < 0.72, `target must stay in clear scene area, got ${y}`);
        }
      }
    }
  }
});

test("software projection matches the Three.js camera at the hit target", () => {
  const width = 390, height = 844;
  const camera = new PerspectiveCamera(CAMERA_FOV, width / height, 0.1, 120);
  camera.position.set(0, CAMERA_Y, CAMERA_Z);
  camera.rotation.x = CAMERA_PITCH;
  camera.updateMatrixWorld();
  const f = projectionScale(height);
  for (let lane = 0; lane < 4; lane++) {
    const angle = laneAngle(lane);
    const x = Math.sin(angle) * TUNNEL_RADIUS, y = -Math.cos(angle) * TUNNEL_RADIUS;
    const dy = y - CAMERA_Y, dz = CAMERA_Z;
    const c = Math.cos(-CAMERA_PITCH), s = Math.sin(-CAMERA_PITCH);
    const depth = dz * c - dy * s;
    const softwareX = width / 2 + x * f / depth;
    const softwareY = height / 2 - (dy * c + dz * s) * f / depth;
    const three = new Vector3(x, y, 0).project(camera);
    assert.ok(Math.abs(softwareX - (three.x + 1) * width / 2) < 0.00001);
    assert.ok(Math.abs(softwareY - (1 - three.y) * height / 2) < 0.00001);
  }
});
