/**
 * Setlist data operations — everything that reshapes a `Setlist` without
 * touching the store, the engine or React.
 *
 * They are pure and they return new objects. Persistence is one call away
 * (`saveSetlist` in `src/ipc.ts`) and deliberately not folded in here: the UI
 * edits a setlist across several keystrokes and drags, and writing to the
 * store on each of them would be the sidebar's decision to make, not this
 * module's.
 */
import type { Setlist, SetlistStep, Preset } from "../types";
import { presetBeatGroups, presetFreeMode } from "../utils/meter";
import { jamMeter } from "../jam/compile";
import { formBars } from "../jam/forms";
import type { Jam } from "../jam/types";

/**
 * Same scheme as `PresetSidebar`'s: sortable-ish by time, short enough to
 * read in the store file, and random enough that duplicating a setlist in one
 * tick does not collide across its steps.
 */
function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

/** A gap that never fires on its own, so a fresh step cannot run away. */
export const DEFAULT_TRIGGER: SetlistStep["trigger"] = { kind: "manual" };
export const DEFAULT_TRANSITION: SetlistStep["transition"] = { kind: "cut" };

// ---------------------------------------------------------------------------
// Preset ↔ step (U9.1)
// ---------------------------------------------------------------------------

/**
 * "Add this preset as a step."
 *
 * The preset is *copied*, not referenced (U9.1) — a new step id, and
 * `beatGroups` / `freeMode` resolved through the same helpers the metronome
 * uses when it loads a preset, so a legacy preset that only carries a time
 * signature becomes a step with a real grouping rather than an empty one.
 */
export function presetToSetlistStep(
  preset: Preset,
  gap?: { trigger?: SetlistStep["trigger"]; transition?: SetlistStep["transition"] },
): SetlistStep {
  return {
    id: newId(),
    name: preset.name,
    bpm: preset.bpm,
    subdivision: preset.subdivision,
    beatGroups: [...presetBeatGroups(preset)],
    freeMode: presetFreeMode(preset),
    soundType: preset.soundType,
    volume: preset.volume,
    trigger: gap?.trigger ?? DEFAULT_TRIGGER,
    transition: gap?.transition ?? DEFAULT_TRANSITION,
  };
}

// ---------------------------------------------------------------------------
// Jam → step (JAM_MODE §8.5)
// ---------------------------------------------------------------------------

/**
 * The click a jam step falls back to.
 *
 * A jam has no click of its own — it has a band — so the only sound on the
 * record is the one it counts you in with, and that is what the step takes.
 * `sticks` is the drummer on the rim, and `wood` is the nearest thing the
 * metronome owns; `beep` is a sound type by that name already.
 *
 * This matters on exactly one day: the day the jam has been deleted and the
 * step plays as the plain metronome step it describes. A step that fell back
 * to whatever the app happened to be set to would sound like a different
 * step every time it did.
 */
const JAM_STEP_SOUND: Record<string, string> = { beep: "beep", sticks: "wood" };

/**
 * "Add this jam as a step."
 *
 * The jam is COPIED, exactly as a preset is (U9.1): its tempo, its meter and
 * its sound land in the fields the step already has, and `jamId` is the one
 * thing that points back. That is not redundancy — it is what lets a jam step
 * whose jam has been deleted go on playing as the plain step it describes,
 * and it is what the sentence reads to draw the step without loading anything.
 *
 * The groups, not `[beatsPerBar]`: a jam in 7/8 accented 3+2+2 has to arrive
 * in the setlist as 3+2+2, for the same reason `pushJam` sends the groups.
 */
export function jamToSetlistStep(
  jam: Jam,
  gap?: { trigger?: SetlistStep["trigger"]; transition?: SetlistStep["transition"] },
): SetlistStep {
  const meter = jamMeter(jam);
  return {
    id: newId(),
    name: jam.name,
    bpm: jam.bpm,
    subdivision: meter.ticksPerBeat,
    beatGroups: [...meter.beatGroups],
    // A jam is never free: the whole thing is a table on a counted bar.
    freeMode: false,
    soundType: JAM_STEP_SOUND[jam.countInSound ?? "beep"] ?? "beep",
    // Loud enough to be the band rather than a click under one. The metronome's
    // own default, which is what every other new step gets.
    volume: 0.7,
    trigger: gap?.trigger ?? DEFAULT_TRIGGER,
    transition: gap?.transition ?? DEFAULT_TRANSITION,
    jamId: jam.id,
  };
}

/** How many bars one chorus of a jam step's jam runs to. 0 when it is gone. */
export function jamStepBars(jam: Jam | null | undefined): number {
  return jam ? formBars(jam.form) : 0;
}

/**
 * "Save this step as a preset."
 *
 * `timeSignature` is the summed grouping because that is what the store's
 * preset shape records and what `presetBeatGroups` falls back to; the gap
 * (trigger/transition) has no preset equivalent and is dropped on purpose —
 * a preset is a sound, not a schedule.
 */
export function setlistStepToPreset(step: SetlistStep, name = step.name): Preset {
  return {
    id: newId(),
    name,
    createdAt: Date.now(),
    bpm: step.bpm,
    subdivision: step.subdivision,
    timeSignature: step.beatGroups.reduce((a, b) => a + b, 0),
    beatGroups: [...step.beatGroups],
    freeMode: step.freeMode ?? false,
    soundType: step.soundType,
    volume: step.volume,
    view: "beat",
  };
}

// ---------------------------------------------------------------------------
// Setlists
// ---------------------------------------------------------------------------

/**
 * How many beats to count out before the first step. Clamped to what the
 * engine will take — `arm_count_in` accepts 0..8, and a count-in longer than
 * two bars of four stops being a count-in and starts being a wait.
 */
export function setSetlistCountIn(setlist: Setlist, beats: number): Setlist {
  const next = Math.max(0, Math.min(8, Math.round(beats)));
  if ((setlist.countIn ?? 0) === next) return setlist;
  return { ...setlist, countIn: next };
}

export function createSetlist(name: string, steps: SetlistStep[] = []): Setlist {
  return {
    id: newId(),
    name,
    createdAt: Date.now(),
    steps,
    repeat: 1,
  };
}

/**
 * `list` with `next` in it — replacing an entry of the same id, or appended.
 *
 * Both writers of the setlist list need this, and one of them learned why the
 * hard way. `newSetlist` awaits `save_setlist` and then added its setlist to the
 * list; but the setlist is in the STORE by the time that await returns, so a
 * `list_setlists` still in flight can resolve with it already present. Appending
 * blind put one id in the list twice. React warned about duplicate keys, and
 * reconciliation between two rows sharing an identity is undefined — they
 * rendered as a single row stuck in rename mode, and clicking either did
 * nothing, which is what the owner reported.
 *
 * Returns `list` itself when nothing changes, so React can skip the render.
 */
export function upsertSetlist(list: Setlist[], next: Setlist): Setlist[] {
  const at = list.findIndex((c) => c.id === next.id);
  if (at === -1) return [...list, next];
  if (list[at] === next) return list;
  const copy = [...list];
  copy[at] = next;
  return copy;
}

export function renameSetlist(setlist: Setlist, name: string): Setlist {
  return { ...setlist, name };
}

export function setSetlistRepeat(setlist: Setlist, repeat: number): Setlist {
  // Negative repeats have no reading — 0 already means "forever" (U9.6).
  return { ...setlist, repeat: Math.max(0, Math.floor(repeat)) };
}

/**
 * Every step gets a fresh id too. Sharing them would make the copy and the
 * original the same rows to any list keyed by step id.
 */
export function duplicateSetlist(setlist: Setlist, name = setlist.name): Setlist {
  return {
    id: newId(),
    name,
    createdAt: Date.now(),
    repeat: setlist.repeat,
    // The count-in is part of how the routine starts, so a copy that lost it
    // would start differently from the setlist it was copied from. It was
    // dropped here until a drummer duplicated a setlist and found the four
    // beats gone.
    countIn: setlist.countIn,
    steps: setlist.steps.map((s) => ({ ...s, id: newId(), beatGroups: [...s.beatGroups] })),
  };
}

/**
 * Move a setlist within the library. Out-of-range indices leave the list
 * alone, so a drag that ends outside the panel is a no-op rather than a
 * reshuffle.
 *
 * `reorderJams`, read for setlists, and deliberately the same function twice
 * rather than one generic: the two libraries are drops in the same sidebar
 * and a drummer who has dragged a jam expects a setlist to move the same way,
 * which is a promise about behaviour and not about types.
 *
 * The library's order is the user's — the routine you warm up on first, the
 * one you finish with — which is why it is moved by hand here and why
 * `reorderSetlists` in `src/ipc.ts` writes it down.
 */
export function reorderSetlists(list: Setlist[], from: number, to: number): Setlist[] {
  if (from === to) return list;
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return list;
  const out = [...list];
  const [moved] = out.splice(from, 1);
  out.splice(to, 0, moved);
  return out;
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

export function addStep(setlist: Setlist, step: SetlistStep, at?: number): Setlist {
  const steps = [...setlist.steps];
  const index = at === undefined ? steps.length : clampIndex(at, steps.length + 1);
  steps.splice(index, 0, step);
  return { ...setlist, steps };
}

export function removeStep(setlist: Setlist, stepId: string): Setlist {
  return { ...setlist, steps: setlist.steps.filter((s) => s.id !== stepId) };
}

export function updateStep(
  setlist: Setlist,
  stepId: string,
  patch: Partial<Omit<SetlistStep, "id">>,
): Setlist {
  return {
    ...setlist,
    steps: setlist.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)),
  };
}

export function duplicateStep(setlist: Setlist, stepId: string): Setlist {
  const at = setlist.steps.findIndex((s) => s.id === stepId);
  if (at < 0) return setlist;
  const copy: SetlistStep = {
    ...setlist.steps[at],
    id: newId(),
    beatGroups: [...setlist.steps[at].beatGroups],
  };
  return addStep(setlist, copy, at + 1);
}

/**
 * Move by position, not by id: a drag reports where the row landed, and two
 * steps built from the same preset are otherwise indistinguishable on screen.
 *
 * One row is a block of one, so this is `moveSteps` with the id at `from`.
 * Keeping it is not duplication — the up/down buttons and the keyboard know
 * where a row is and not what it is called, and turning that back into an id
 * at every call site would put `steps[i].id` in four places instead of one.
 */
export function reorderSteps(setlist: Setlist, from: number, to: number): Setlist {
  if (setlist.steps.length === 0) return setlist;
  const src = clampIndex(from, setlist.steps.length);
  return moveSteps(setlist, [setlist.steps[src].id], to);
}

/**
 * Move the named steps, as one block, to land at `to`.
 *
 * `to` is an index in the list **after** the block has been lifted out, which
 * is the only reading that makes a drop line unambiguous: the line sits
 * between two of the rows that are staying, and that gap keeps its number
 * whether the block came from above it or below.
 *
 * Their relative order survives the move — a block of steps 2, 4 and 5 lands
 * as 2, 4, 5 and not in the order they were clicked in. Ids that name no step
 * are ignored, and a move that changes nothing returns the same object so
 * React can skip the render and the save bar does not go dirty over a drag
 * that went back where it started.
 */
export function moveSteps(setlist: Setlist, ids: string[], to: number): Setlist {
  const wanted = new Set(ids);
  // List order, not the order the ids arrived in: the block is what the eye
  // sees between the first and the last of them.
  const moving = setlist.steps.filter((s) => wanted.has(s.id));
  if (moving.length === 0) return setlist;
  const rest = setlist.steps.filter((s) => !wanted.has(s.id));
  const at = clampInsert(to, rest.length);
  const steps = [...rest.slice(0, at), ...moving, ...rest.slice(at)];
  if (steps.every((s, i) => s === setlist.steps[i])) return setlist;
  return { ...setlist, steps };
}

/** The same rows the remove button takes off, a block at a time. */
export function removeSteps(setlist: Setlist, ids: string[]): Setlist {
  const wanted = new Set(ids);
  const steps = setlist.steps.filter((s) => !wanted.has(s.id));
  if (steps.length === setlist.steps.length) return setlist;
  return { ...setlist, steps };
}

/**
 * Copies of the named steps, landing as a block directly after the last of
 * them — the same place one duplicated step lands, read for several.
 *
 * Fresh ids and cloned `beatGroups`, for the reason `duplicateSetlist` needs
 * them: two rows sharing an id are one row to React, and a shared array is
 * one meter for both.
 */
export function duplicateSteps(setlist: Setlist, ids: string[]): Setlist {
  const wanted = new Set(ids);
  const sources = setlist.steps.filter((s) => wanted.has(s.id));
  if (sources.length === 0) return setlist;
  const last = setlist.steps.reduce((at, s, i) => (wanted.has(s.id) ? i : at), -1);
  const copies = sources.map((s) => ({ ...s, id: newId(), beatGroups: [...s.beatGroups] }));
  const steps = [...setlist.steps];
  steps.splice(last + 1, 0, ...copies);
  return { ...setlist, steps };
}

/**
 * Every step from the anchor to the target, in list order, both ends included
 * — what a shift-click means.
 *
 * Either way round: shift-clicking above the anchor selects upwards. An id
 * that names no step falls back to the other one alone rather than to
 * nothing, because the row you just clicked is the one gesture we are certain
 * about.
 */
export function stepRange(setlist: Setlist, anchorId: string | null, targetId: string): string[] {
  const steps = setlist.steps;
  const anchor = steps.findIndex((s) => s.id === anchorId);
  const target = steps.findIndex((s) => s.id === targetId);
  if (target < 0) return anchor < 0 ? [] : [steps[anchor].id];
  if (anchor < 0) return [steps[target].id];
  const lo = Math.min(anchor, target);
  const hi = Math.max(anchor, target);
  return steps.slice(lo, hi + 1).map((s) => s.id);
}

function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(Math.floor(index), 0), Math.max(0, length - 1));
}

/** A landing place, which may be past the last row — one more than an index. */
function clampInsert(index: number, length: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(Math.floor(index), 0), length);
}
