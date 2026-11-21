/**
 * "Pin this shape" (leg c5a1; DESIGN 9.3 `pinShape`, 8 Jam's row): a grip Ask
 * drew on the Jam screen, pinned to that screen with one press, with its
 * receipt and an Undo.
 *
 * The press goes through the same edit the chord sheet's "Pin this one" makes
 * (`useJamSession.editJam({ pinnedShape })`), handed in by `MainWindow` as the
 * door below. Nothing here runs without a press: `pressPinShape` and
 * `pressPinUndo` are called from the receipt's buttons only.
 *
 * - **Refused during a Take** (a Session's, or a jam take being written:
 *   `askTakeNow`), off the Jam screen, with no jam on it, for a player whose
 *   instrument has no neck, and for a grip the neck does not have. A refusal
 *   changes nothing and says why.
 * - **Undo** restores exactly the pin there was before the press, or none, for
 *   `UNDO_MS` (as a confirmed tool change's). Refused during a Take. When the
 *   pin has been changed since (the sheet, another press, another jam on the
 *   stage), Undo leaves it alone and says so: it never takes back a change it
 *   did not make.
 *
 * Not a tool in the registry: the router's prompt is built from the registry,
 * and this is a block's button, which only a drawn grip carries.
 */
import { shapesFor, type Instrument } from "../../jam/chordShapes";
import { parseChordName } from "../../jam/harmony";
import type { Jam } from "../../jam/types";
import type { CoachAction } from "../../coach/blocks/types";
import { line, type Line } from "../../coach/tools/types";
import { UNDO_MS } from "./askTools";

export type JamPin = NonNullable<Jam["pinnedShape"]>;
type PinAction = Extract<CoachAction, { kind: "pinShape" }>;

/** What `MainWindow` hands in: the stage as it is at the press. */
export type JamPinDoor = {
  /** The jam on the Jam screen, or null when the Jam screen is not up or is empty. */
  jamOnScreen: () => Jam | null;
  /** The player's neck, or null (horns and voices have none). */
  neck: () => Instrument | null;
  /** A Take runs, or a jam take is being written. */
  takeNow: () => boolean;
  /** The chord sheet's own edit. */
  setPin: (pin: JamPin | null) => void;
};

export type PinRecord =
  /** `note`: an Undo pressed during a Take, refused; the Undo stays for the rest of its time (review c5a1 L4). */
  | { state: "live"; jamId: string; before: JamPin | null; set: JamPin; until: number; receipt: Line; note?: Line }
  | { state: "gone" | "done"; receipt: Line; note: Line }
  | { state: "refused"; note: Line };

let door: JamPinDoor | null = null;
const records = new Map<string, PinRecord>();
const listeners = new Set<() => void>();
let version = 0;

function tell(): void {
  version += 1;
  for (const fn of [...listeners]) fn();
}

/** Set by `MainWindow` on mount; the returned function clears it. */
export function registerJamPin(next: JamPinDoor | null): () => void {
  door = next;
  return () => {
    if (door === next) door = null;
  };
}

export function subscribePins(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function pinsVersion(): number {
  return version;
}

/** The press's record for a receipt (by its turn id), or null. */
export function pinRecord(key: string): PinRecord | null {
  return records.get(key) ?? null;
}

function samePin(a: JamPin | null | undefined, b: JamPin | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.root === b.root && a.quality === b.quality && a.index === b.index;
}

function refuse(key: string, note: Line): void {
  records.set(key, { state: "refused", note });
  tell();
}

/**
 * The press on "Pin this shape". `key` is the receipt's turn id; `forJam` the
 * id of the jam the grip was drawn on (`ToolDone.forJam`): with another jam on
 * the screen now, the press is refused (review c5a1 L3).
 */
export function pressPinShape(key: string, action: PinAction, now = Date.now(), forJam?: string): void {
  const held = records.get(key);
  if (held && held.state !== "refused") return;
  if (!door) return refuse(key, line("coachTools.why.notNow.here"));
  try {
    if (door.takeNow()) return refuse(key, line("coachTools.why.notNow.take"));
  } catch {
    return refuse(key, line("coachTools.why.notNow.take"));
  }
  const jam = door.jamOnScreen();
  if (!jam) return refuse(key, line("coachTools.why.notNow.here"));
  if (forJam !== undefined && jam.id !== forJam) return refuse(key, line("jam.pin.otherJam"));
  const neck = door.neck();
  if (!neck) return refuse(key, line("jam.pin.noNeck"));
  const chord = parseChordName(action.chord);
  const shapes = chord ? shapesFor(chord.root, chord.quality, { instrument: neck }) : [];
  if (!chord || !shapes[action.shape]) return refuse(key, line("jam.pin.noShape", { chord: action.chord }));
  const set: JamPin = { root: chord.root, quality: chord.quality, index: action.shape };
  const before = jam.pinnedShape ?? null;
  door.setPin(set);
  records.set(key, {
    state: "live",
    jamId: jam.id,
    before: before ? { ...before } : null,
    set,
    until: now + UNDO_MS,
    receipt: line("jam.pin.done", { chord: action.chord, shape: action.shape + 1 }),
  });
  tell();
}

/** Whether a record's Undo is still offered at `now`. */
export function pinUndoLive(record: PinRecord | null, now: number): boolean {
  return !!record && record.state === "live" && now < record.until;
}

/** The press on the receipt's Undo. */
export function pressPinUndo(key: string, now = Date.now()): void {
  const record = records.get(key);
  if (!record || record.state !== "live" || now >= record.until) return;
  const { receipt } = record;
  if (!door) {
    records.set(key, { state: "gone", receipt, note: line("jam.pin.changed") });
    return tell();
  }
  let take = true;
  try {
    take = door.takeNow();
  } catch {
    take = true;
  }
  if (take) {
    // Refused, and still offered: the player can press it again once the Take ends.
    records.set(key, { ...record, note: line("coachTools.why.notNow.take") });
    return tell();
  }
  const jam = door.jamOnScreen();
  if (!jam || jam.id !== record.jamId || !samePin(jam.pinnedShape, record.set)) {
    records.set(key, { state: "gone", receipt, note: line("jam.pin.changed") });
    return tell();
  }
  door.setPin(record.before);
  records.set(key, { state: "done", receipt, note: line(record.before ? "jam.pin.restored" : "jam.pin.cleared") });
  tell();
}

/** Tests only. */
export function resetPinsForTests(): void {
  door = null;
  records.clear();
  listeners.clear();
  version = 0;
}
