/**
 * The camera rig and its flights, apart from the renderer so they can be
 * tested without a GL context.
 *
 * A flight eases the rig from where it was to where it is going and lifts the
 * camera on an arc on the way. The arc is drawn on top of the flight's own
 * path and never fed back into it: `base` is the rig without the lift, and a
 * flight that interrupts another starts from `base`. Starting from the lifted
 * rig (acceptance P0-1) made every interrupted flight start a little higher,
 * and the lift itself grows with the distance, so a warm-up that moves along
 * the neck bar by bar ratcheted the camera up until the neck was a sliver.
 */
import * as THREE from "three";

export type Rig = {
  pos: THREE.Vector3;
  tgt: THREE.Vector3;
  fov: number;
  ox: number;
  oy: number;
  poolX: number;
  poolY: number;
  poolA: number;
};

export const SCALARS = ["fov", "ox", "oy", "poolX", "poolY", "poolA"] as const;
export const cloneRig = (s: Rig): Rig => ({ ...s, pos: s.pos.clone(), tgt: s.tgt.clone() });
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** The most an arc lifts the camera, in world units. */
export const MAX_LIFT = 3.4;

export type RigFlight = {
  /** What the camera draws from this frame: `base` plus the arc's lift. */
  readonly shown: Rig;
  /** The rig on the flight's path, without the lift. */
  readonly base: Rig;
  /** Where the rig is going (or is, when no flight is on). */
  readonly to: Rig;
  readonly flying: boolean;
  /** Fly to `to`; `instant` jumps there. */
  fly(to: Rig, dur: number, lift: number, instant: boolean): void;
  /** Replace the destination without a new flight (a refit of the same view). */
  retarget(to: Rig): void;
  /** Advance by `dt` seconds. True while a flight is on. */
  step(dt: number): boolean;
};

export function createRigFlight(start: Rig): RigFlight {
  const shown = cloneRig(start);
  const base = cloneRig(start);
  let from = cloneRig(start);
  let to = cloneRig(start);
  let flight: { t: number; dur: number; lift: number } | null = null;

  const land = () => {
    Object.assign(base, cloneRig(to));
    Object.assign(shown, cloneRig(to));
    flight = null;
  };

  return {
    shown,
    base,
    get to() {
      return to;
    },
    get flying() {
      return flight !== null;
    },
    fly(next, dur, lift, instant) {
      to = cloneRig(next);
      // From the un-lifted rig: the arc is decoration, not a place.
      from = cloneRig(base);
      if (instant) return land();
      const dist = from.pos.distanceTo(to.pos);
      if (dist < 1e-4 && from.tgt.distanceTo(to.tgt) < 1e-4 && Math.abs(from.ox - to.ox) < 0.5 && Math.abs(from.oy - to.oy) < 0.5) return land();
      flight = { t: 0, dur, lift: Math.max(lift, Math.min(MAX_LIFT, dist * 0.2)) };
    },
    retarget(next) {
      to = cloneRig(next);
      if (!flight) land();
    },
    step(dt) {
      if (!flight) return false;
      flight.t = Math.min(1, flight.t + Math.min(dt, 0.1) / flight.dur);
      const e = ease(flight.t);
      base.pos.lerpVectors(from.pos, to.pos, e);
      base.tgt.lerpVectors(from.tgt, to.tgt, e);
      for (const k of SCALARS) base[k] = from[k] + (to[k] - from[k]) * e;
      shown.pos.copy(base.pos);
      shown.pos.y += Math.sin(Math.PI * flight.t) * flight.lift;
      shown.tgt.copy(base.tgt);
      for (const k of SCALARS) shown[k] = base[k];
      if (flight.t >= 1) land();
      return true;
    },
  };
}
