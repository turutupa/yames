import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  addStep,
  createChain,
  presetToChainStep,
  renameChain as renameChainData,
  upsertChain,
} from "../../../chain";
import {
  deleteChain as deleteChainIpc,
  listChains,
  saveChain as saveChainIpc,
} from "../../../ipc";
import { meterKey } from "../../../utils/meter";
import type { AppState, BeatEvent, Chain, ChainStep, Preset } from "../../../types";
import { applyChainStep } from "./applyChainStep";
import { useChainRunner } from "./useChainRunner";

/**
 * The chain the window has open: which one, which step you are editing, and
 * whether what is on screen has been saved.
 *
 * The metronome under the track is the *same* metronome — it writes to the
 * engine exactly as it always did, and this hook reads the engine back into
 * the selected step. That is the whole trick behind U9's stage: loading a
 * chain must not read as entering a mode where the controls went away, and
 * the cheapest way to guarantee it is to not give the controls a second code
 * path to take.
 *
 * The mirror runs only while stopped. Once the chain is running, the runner
 * owns the engine — every step it applies would otherwise be read back as
 * the user editing the step they are listening to.
 */

/** The six fields a step copies from the engine, as one comparable string. */
function signature(
  bpm: number,
  subdivision: number,
  beatGroups: number[] | undefined,
  freeMode: boolean | undefined,
  soundType: string,
  volume: number,
): string {
  // Volume is a float that arrives from a slider; comparing it raw would make
  // the step dirty on a rounding difference nobody can hear.
  return [
    bpm,
    subdivision,
    meterKey(beatGroups),
    freeMode ? "free" : "-",
    soundType,
    Math.round(volume * 100),
  ].join("|");
}

function stepSignature(step: ChainStep): string {
  return signature(step.bpm, step.subdivision, step.beatGroups, step.freeMode, step.soundType, step.volume);
}

function stateSignature(state: AppState): string {
  return signature(
    state.bpm,
    state.subdivision,
    state.beatGroups,
    state.freeMode,
    state.soundType,
    state.volume,
  );
}

/** The engine's current configuration, shaped as a step patch. */
function stateAsStepPatch(state: AppState): Partial<Omit<ChainStep, "id">> {
  return {
    bpm: state.bpm,
    subdivision: state.subdivision,
    beatGroups: [...(state.beatGroups ?? [])],
    freeMode: state.freeMode ?? false,
    soundType: state.soundType,
    volume: state.volume,
  };
}

/** What the engine is set to, as a preset — the shape `presetToChainStep` eats. */
function stateAsPreset(state: AppState, name: string): Preset {
  return {
    id: "",
    name,
    createdAt: Date.now(),
    bpm: state.bpm,
    subdivision: state.subdivision,
    timeSignature: state.timeSignature,
    beatGroups: state.beatGroups,
    freeMode: state.freeMode,
    soundType: state.soundType,
    volume: state.volume,
    view: "beat",
  };
}

interface UseChainSessionArgs {
  state: AppState;
  isPlaying: boolean;
  currentBeat: BeatEvent | null;
  setView: (view: "beat") => void;
  /** Loading a chain takes the preset's place in the context bar. */
  onChainLoaded: () => void;
}

export function useChainSession({
  state,
  isPlaying,
  currentBeat,
  setView,
  onChainLoaded,
}: UseChainSessionArgs) {
  const { t } = useTranslation();
  const [chains, setChains] = useState<Chain[]>([]);
  /** The working copy — edited freely, written to the store only on Save. */
  const [chain, setChain] = useState<Chain | null>(null);
  /** What the store holds, for the dirty flag and for Revert. */
  const [saved, setSaved] = useState<Chain | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState(false);
  /**
   * The player is showing but you asked for the paragraph back.
   *
   * You start a chain, hear that step 3 is too fast, and want to fix it
   * without stopping — so the way out of the player does not stop the run.
   * It clears itself when the run does, because the paragraph is where a
   * stopped chain lives anyway.
   */
  const [editingWhileRunning, setEditingWhileRunning] = useState(false);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * The configuration we last pushed to the engine ourselves, and are still
   * waiting to see arrive. Without it, the gap between applying a step and
   * the `state-changed` event coming back is a window in which the mirror
   * would read the *previous* step's settings into the newly selected one.
   */
  const awaiting = useRef<string | null>(null);

  const runner = useChainRunner(chain, isPlaying, currentBeat);

  useEffect(() => {
    if (!isPlaying) setEditingWhileRunning(false);
  }, [isPlaying]);

  useEffect(() => {
    listChains().then(setChains).catch(() => {});
    return () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    };
  }, []);

  const applyAndAwait = useCallback((step: ChainStep) => {
    awaiting.current = stepSignature(step);
    applyChainStep(step);
  }, []);

  const selectStep = useCallback(
    (stepId: string) => {
      setSelectedStepId(stepId);
      // Pointing the metronome at the step is what makes it the step's own
      // controls rather than a second set of numbers beside them.
      const step = chain?.steps.find((s) => s.id === stepId);
      if (step && !isPlaying) applyAndAwait(step);
    },
    [chain, isPlaying, applyAndAwait],
  );

  // While the chain runs, the selection follows it: the controls below the
  // track always describe what you are hearing.
  const runningStepId = runner.step?.id ?? null;
  useEffect(() => {
    if (runningStepId) setSelectedStepId(runningStepId);
  }, [runningStepId]);

  // The mirror. Engine → selected step, while stopped.
  const engineSignature = stateSignature(state);
  useEffect(() => {
    if (!chain || !selectedStepId || isPlaying) return;
    if (awaiting.current !== null) {
      // Still catching up to something we pushed. Only the arrival of that
      // exact configuration clears the wait — anything else is an event from
      // before the apply.
      if (awaiting.current === engineSignature) awaiting.current = null;
      return;
    }
    const step = chain.steps.find((s) => s.id === selectedStepId);
    if (!step || stepSignature(step) === engineSignature) return;
    setChain((current) =>
      current
        ? {
            ...current,
            steps: current.steps.map((s) =>
              s.id === selectedStepId ? { ...s, ...stateAsStepPatch(state) } : s,
            ),
          }
        : current,
    );
  }, [chain, selectedStepId, isPlaying, engineSignature, state]);

  const loadChain = useCallback(
    (next: Chain) => {
      setView("beat");
      onChainLoaded();
      setChain(next);
      setSaved(next);
      const first = next.steps[0] ?? null;
      setSelectedStepId(first?.id ?? null);
      if (first && !isPlaying) applyAndAwait(first);
    },
    [setView, onChainLoaded, isPlaying, applyAndAwait],
  );

  /** Put the chain away — loading a preset is loading a preset, not a step. */
  const closeChain = useCallback(() => {
    setChain(null);
    setSaved(null);
    setSelectedStepId(null);
  }, []);

  const newChain = useCallback(async () => {
    const created = createChain(t("chain.untitled"));
    await saveChainIpc(created).catch(() => {});
    // NOT a blind append. The await above is a window — the chain is in the
    // store by the time it closes, so a `listChains()` still in flight can
    // resolve with it already present. See `upsertChain`.
    setChains((prev) => upsertChain(prev, created));
    loadChain(created);
    return created;
  }, [t, loadChain]);

  const saveActiveChain = useCallback(async () => {
    if (!chain) return;
    await saveChainIpc(chain).catch(() => {});
    setChains((prev) => upsertChain(prev, chain));
    setSaved(chain);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setSaveFeedback(true);
    feedbackTimer.current = setTimeout(() => setSaveFeedback(false), 1800);
  }, [chain]);

  /** Throw the edits away and put the engine back on the stored step. */
  const revertChain = useCallback(() => {
    if (!saved) return;
    setChain(saved);
    const step =
      saved.steps.find((s) => s.id === selectedStepId) ?? saved.steps[0] ?? null;
    setSelectedStepId(step?.id ?? null);
    if (step && !isPlaying) applyAndAwait(step);
  }, [saved, selectedStepId, isPlaying, applyAndAwait]);

  const deleteChain = useCallback(
    async (id: string) => {
      await deleteChainIpc(id).catch(() => {});
      setChains((prev) => prev.filter((c) => c.id !== id));
      if (chain?.id === id) closeChain();
    },
    [chain?.id, closeChain],
  );

  const renameChain = useCallback(
    async (id: string, name: string) => {
      const target = chains.find((c) => c.id === id);
      if (!target) return;
      const renamed = renameChainData(target, name);
      await saveChainIpc(renamed).catch(() => {});
      setChains((prev) => prev.map((c) => (c.id === id ? renamed : c)));
      // A rename is a rename, not an edit: it lands in the working copy and
      // in the stored one at once, so the bar does not go dirty over it.
      if (chain?.id === id) setChain((c) => (c ? { ...c, name } : c));
      if (saved?.id === id) setSaved((c) => (c ? { ...c, name } : c));
    },
    [chains, chain?.id, saved?.id],
  );

  /**
   * A new step at the end of the chain.
   *
   * This used to mean "whatever the metronome is set to now", which worked
   * because the metronome was on screen underneath the track. In the
   * paragraph there is no metronome to copy, so a new step copies the step
   * ABOVE it — you add a step to a routine because it is like the last one
   * but faster, not because it is like whatever happened to be loaded. The
   * first step of an empty chain has nothing above it and takes the engine's
   * current settings, which is the old behaviour exactly where it still makes
   * sense.
   *
   * Adding a preset from the library is unchanged; that is `addPresetAsStep`.
   */
  const addStepFromNow = useCallback(() => {
    if (!chain) return;
    const name = t("chain.stepDefaultName", { number: chain.steps.length + 1 });
    const previous = chain.steps[chain.steps.length - 1];
    const step = previous
      ? { ...previous, id: crypto.randomUUID(), name }
      : presetToChainStep(stateAsPreset(state, name));
    // The step already is what the engine is playing, so there is nothing to
    // apply — but the mirror must not read that back as an edit, which is
    // the same wait selecting a step opens.
    awaiting.current = stepSignature(step);
    setChain(addStep(chain, step));
    setSelectedStepId(step.id);
  }, [chain, state, t]);

  /** U9.1's other direction: a preset copied in as a step, never referenced. */
  const addPresetAsStep = useCallback((preset: Preset) => {
    setChain((current) => (current ? addStep(current, presetToChainStep(preset)) : current));
  }, []);

  const dirty = useMemo(
    () => (chain && saved ? JSON.stringify(chain) !== JSON.stringify(saved) : false),
    [chain, saved],
  );

  return {
    chains,
    chain,
    dirty,
    saveFeedback,
    selectedStepId,
    /** The step the controls below the track are editing. */
    selectedStep: chain?.steps.find((s) => s.id === selectedStepId) ?? null,
    runner,
    /** Index the runner is on, or -1 when the chain is not running. */
    runningIndex: runner.step ? runner.stepNumber - 1 : -1,
    setChain,
    selectStep,
    loadChain,
    closeChain,
    newChain,
    saveActiveChain,
    revertChain,
    deleteChain,
    renameChain,
    addStepFromNow,
    addPresetAsStep,
    /** True while the chain is on a step — the player's condition. */
    chainPlaying: runner.step !== null && !editingWhileRunning,
    editingWhileRunning,
    /** Leave the player for the paragraph without stopping the run. */
    editWhileRunning: () => setEditingWhileRunning(true),
    backToPlaying: () => setEditingWhileRunning(false),
  };
}
