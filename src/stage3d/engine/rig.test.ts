import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createRigFlight, MAX_LIFT, type Rig } from "./rig";

const rigAt = (x: number, y: number, z = 1): Rig => ({
  pos: new THREE.Vector3(x, y, z),
  tgt: new THREE.Vector3(x, 0, 0),
  fov: 22,
  ox: 0,
  oy: 0,
  poolX: 0.5,
  poolY: 0.5,
  poolA: 1,
});

describe("the camera rig's flights (acceptance P0-1)", () => {
  it("does not climb when every flight is interrupted mid-arc, bar after bar", () => {
    const rig = createRigFlight(rigAt(0, 5));
    // A warm-up moving along the neck: a new window every 0.6 s, each flight 1.3 s long.
    let peak = 0;
    for (let bar = 0; bar < 40; bar++) {
      rig.fly(rigAt((bar % 5) * 2, 5), 1.3, 0.3, false);
      for (let i = 0; i < 36; i++) {
        rig.step(1 / 60);
        peak = Math.max(peak, rig.shown.pos.y);
      }
      // The flight's own path stays at the shots' height; only the arc lifts.
      expect(rig.base.pos.y).toBeCloseTo(5, 6);
    }
    expect(peak).toBeLessThanOrEqual(5 + MAX_LIFT);
    // Let the last flight land: the camera is back exactly at the shot's height.
    for (let i = 0; i < 200; i++) rig.step(1 / 60);
    expect(rig.flying).toBe(false);
    expect(rig.shown.pos.y).toBeCloseTo(5, 6);
  });

  it("does not ratchet when the same view is asked for again mid-flight", () => {
    const rig = createRigFlight(rigAt(0, 5));
    for (let n = 0; n < 50; n++) {
      rig.fly(rigAt(6, 5), 1.3, 0.3, false);
      for (let i = 0; i < 20; i++) rig.step(1 / 60);
    }
    expect(rig.base.pos.y).toBeCloseTo(5, 6);
    expect(rig.shown.pos.y).toBeLessThan(5 + MAX_LIFT);
    for (let i = 0; i < 200; i++) rig.step(1 / 60);
    expect(rig.shown.pos.distanceTo(new THREE.Vector3(6, 5, 1))).toBeLessThan(1e-6);
  });

  it("lifts on the arc and lands where it was sent", () => {
    const rig = createRigFlight(rigAt(0, 5));
    rig.fly(rigAt(10, 5), 1, 0.3, false);
    for (let i = 0; i < 30; i++) rig.step(1 / 60);
    expect(rig.shown.pos.y).toBeGreaterThan(5.1);
    for (let i = 0; i < 60; i++) rig.step(1 / 60);
    expect(rig.flying).toBe(false);
    expect(rig.shown.pos.x).toBeCloseTo(10, 6);
    expect(rig.shown.pos.y).toBeCloseTo(5, 6);
  });

  it("jumps on an instant flight and follows a refit when idle", () => {
    const rig = createRigFlight(rigAt(0, 5));
    rig.fly(rigAt(3, 7), 1, 0.3, true);
    expect(rig.flying).toBe(false);
    expect(rig.shown.pos.y).toBe(7);
    rig.retarget(rigAt(4, 8));
    expect(rig.shown.pos.x).toBe(4);
  });
});
