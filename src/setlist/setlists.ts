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
    steps: setlist.steps.map((s) => ({ ...s, id: newId(), beatGroups: [...s.beatGroups] })),
  };
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
 */
export function reorderSteps(setlist: Setlist, from: number, to: number): Setlist {
  const steps = [...setlist.steps];
  if (steps.length === 0) return setlist;
  const src = clampIndex(from, steps.length);
  const dst = clampIndex(to, steps.length);
  if (src === dst) return setlist;
  const [moved] = steps.splice(src, 1);
  steps.splice(dst, 0, moved);
  return { ...setlist, steps };
}

function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(Math.floor(index), 0), Math.max(0, length - 1));
}
