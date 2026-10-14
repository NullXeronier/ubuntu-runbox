import { CylinderGeometry } from "three";

/** Shared world layout keeps the software and WebGL hit targets aligned. */
export const TUNNEL_RADIUS = 4;
export const LANE_STEP = 0.34;
export const CAMERA_Y = -2.1;
export const CAMERA_Z = 8.5;
export const CAMERA_FOV = 72;
export const CAMERA_PITCH = -0.06;

export const NOTE_SPEED = 16;
export const laneAngle = (lane: number) => (lane - 1.5) * LANE_STEP;

/** Both renderers cross the hit line at the same calibrated judgment time. */
export const notePositionZ = (noteTime: number, noteClock: number) => -(noteTime - noteClock) * NOTE_SPEED;
export function laneStripGeometry(lane: number, length: number, radius: number, width: number, heightSegments = 1) {
  // A +PI/2 rotation around X maps CylinderGeometry's (sin(a), y, cos(a))
  // into the same bottom arc (sin(a), -cos(a), z) occupied by notes.
  return new CylinderGeometry(radius, radius, length, 6, heightSegments, true, laneAngle(lane) - width / 2, width);
}

export function projectionScale(height: number, fov = CAMERA_FOV) {
  return height / (2 * Math.tan(fov * Math.PI / 360));
}

export const NOTE_LOOKAHEAD = 3.2;
