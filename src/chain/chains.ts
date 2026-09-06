/**
 * Chain data operations — everything that reshapes a `Chain` without
 * touching the store, the engine or React.
 *
 * They are pure and they return new objects. Persistence is one call away
 * (`saveChain` in `src/ipc.ts`) and deliberately not folded in here: the UI
 * edits a chain across several keystrokes and drags, and writing to the
 * store on each of them would be the sidebar's decision to make, not this
 * module's.
 */
import type { Chain, ChainStep, Preset } from "../types";
import { presetBeatGroups, presetFreeMode } from "../utils/meter";

/**
 * Same scheme as `PresetSidebar`'s: sortable-ish by time, short enough to
 * read in the store file, and random enough that duplicating a chain in one
 * tick does not collide across its steps.
 */
function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

/** A gap that never fires on its own, so a fresh step cannot run away. */
export const DEFAULT_TRIGGER: ChainStep["trigger"] = { kind: "manual" };
export const DEFAULT_TRANSITION: ChainStep["transition"] = { kind: "cut" };

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
export function presetToChainStep(
  preset: Preset,
  gap?: { trigger?: ChainStep["trigger"]; transition?: ChainStep["transition"] },
): ChainStep {
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
export function chainStepToPreset(step: ChainStep, name = step.name): Preset {
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
// Chains
// ---------------------------------------------------------------------------

export function createChain(name: string, steps: ChainStep[] = []): Chain {
  return {
    id: newId(),
    name,
    createdAt: Date.now(),
    steps,
    repeat: 1,
  };
}

export function renameChain(chain: Chain, name: string): Chain {
  return { ...chain, name };
}

export function setChainRepeat(chain: Chain, repeat: number): Chain {
  // Negative repeats have no reading — 0 already means "forever" (U9.6).
  return { ...chain, repeat: Math.max(0, Math.floor(repeat)) };
}

/**
 * Every step gets a fresh id too. Sharing them would make the copy and the
 * original the same rows to any list keyed by step id.
 */
export function duplicateChain(chain: Chain, name = chain.name): Chain {
  return {
    id: newId(),
    name,
    createdAt: Date.now(),
    repeat: chain.repeat,
    steps: chain.steps.map((s) => ({ ...s, id: newId(), beatGroups: [...s.beatGroups] })),
  };
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

export function addStep(chain: Chain, step: ChainStep, at?: number): Chain {
  const steps = [...chain.steps];
  const index = at === undefined ? steps.length : clampIndex(at, steps.length + 1);
  steps.splice(index, 0, step);
  return { ...chain, steps };
}

export function removeStep(chain: Chain, stepId: string): Chain {
  return { ...chain, steps: chain.steps.filter((s) => s.id !== stepId) };
}

export function updateStep(
  chain: Chain,
  stepId: string,
  patch: Partial<Omit<ChainStep, "id">>,
): Chain {
  return {
    ...chain,
    steps: chain.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)),
  };
}

export function duplicateStep(chain: Chain, stepId: string): Chain {
  const at = chain.steps.findIndex((s) => s.id === stepId);
  if (at < 0) return chain;
  const copy: ChainStep = {
    ...chain.steps[at],
    id: newId(),
    beatGroups: [...chain.steps[at].beatGroups],
  };
  return addStep(chain, copy, at + 1);
}

/**
 * Move by position, not by id: a drag reports where the row landed, and two
 * steps built from the same preset are otherwise indistinguishable on screen.
 */
export function reorderSteps(chain: Chain, from: number, to: number): Chain {
  const steps = [...chain.steps];
  if (steps.length === 0) return chain;
  const src = clampIndex(from, steps.length);
  const dst = clampIndex(to, steps.length);
  if (src === dst) return chain;
  const [moved] = steps.splice(src, 1);
  steps.splice(dst, 0, moved);
  return { ...chain, steps };
}

function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(Math.floor(index), 0), Math.max(0, length - 1));
}
