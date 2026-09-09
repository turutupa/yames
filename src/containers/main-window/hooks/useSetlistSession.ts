import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  addStep,
  createSetlist,
  presetToSetlistStep,
  renameSetlist as renameSetlistData,
  updateStep,
  upsertSetlist,
} from "../../../setlist";
import {
  deleteSetlist as deleteSetlistIpc,
  listSetlists,
  saveSetlist as saveSetlistIpc,
} from "../../../ipc";
import { meterKey } from "../../../utils/meter";
import type { AppState, BeatEvent, Setlist, SetlistStep, Preset } from "../../../types";
import { applySetlistStep } from "./applySetlistStep";
import { useSetlistRunner } from "./useSetlistRunner";

/**
 * The setlist the window has open: which one, which step you are editing, and
 * whether what is on screen has been saved.
 *
 * The metronome under the track is the *same* metronome — it writes to the
 * engine exactly as it always did, and this hook reads the engine back into
 * the selected step. That is the whole trick behind U9's stage: loading a
 * setlist must not read as entering a mode where the controls went away, and
 * the cheapest way to guarantee it is to not give the controls a second code
 * path to take.
 *
 * The mirror runs only while stopped. Once the setlist is running, the runner
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

function stepSignature(step: SetlistStep): string {
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
function stateAsStepPatch(state: AppState): Partial<Omit<SetlistStep, "id">> {
  return {
    bpm: state.bpm,
    subdivision: state.subdivision,
    beatGroups: [...(state.beatGroups ?? [])],
    freeMode: state.freeMode ?? false,
    soundType: state.soundType,
    volume: state.volume,
  };
}

/** What the engine is set to, as a preset — the shape `presetToSetlistStep` eats. */
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

interface UseSetlistSessionArgs {
  state: AppState;
  isPlaying: boolean;
  currentBeat: BeatEvent | null;
  setView: (view: "setlist") => void;
  /** Loading a setlist takes the preset's place in the context bar. */
  onSetlistLoaded: () => void;
}

export function useSetlistSession({
  state,
  isPlaying,
  currentBeat,
  setView,
  onSetlistLoaded,
}: UseSetlistSessionArgs) {
  const { t } = useTranslation();
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  /** The working copy — edited freely, written to the store only on Save. */
  const [setlist, setSetlist] = useState<Setlist | null>(null);
  /** What the store holds, for the dirty flag and for Revert. */
  const [saved, setSaved] = useState<Setlist | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState(false);
  /**
   * The player is showing but you asked for the paragraph back.
   *
   * You start a setlist, hear that step 3 is too fast, and want to fix it
   * without stopping — so the way out of the player does not stop the run.
   * It clears itself when the run does, because the paragraph is where a
   * stopped setlist lives anyway.
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

  /**
    * The step a run would begin on: the one open in the editor.
    *
    * -1 (nothing selected) reads as the top, which is also what a setlist
    * you have just loaded does — `loadSetlist` selects the first step.
    */
  const selectedIndex = Math.max(
    0,
    setlist?.steps.findIndex((s) => s.id === selectedStepId) ?? 0,
  );
  const runner = useSetlistRunner(setlist, isPlaying, currentBeat, selectedIndex);

  useEffect(() => {
    if (!isPlaying) setEditingWhileRunning(false);
  }, [isPlaying]);

  useEffect(() => {
    listSetlists().then(setSetlists).catch(() => {});
    return () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    };
  }, []);

  const applyAndAwait = useCallback((step: SetlistStep) => {
    awaiting.current = stepSignature(step);
    applySetlistStep(step);
  }, []);

  const selectStep = useCallback(
    (stepId: string) => {
      setSelectedStepId(stepId);
      // Pointing the metronome at the step is what makes it the step's own
      // controls rather than a second set of numbers beside them.
      const step = setlist?.steps.find((s) => s.id === stepId);
      if (step && !isPlaying) applyAndAwait(step);
    },
    [setlist, isPlaying, applyAndAwait],
  );

  // While the setlist runs, the selection follows it: the controls below the
  // track always describe what you are hearing.
  const runningStepId = runner.step?.id ?? null;
  useEffect(() => {
    if (runningStepId) setSelectedStepId(runningStepId);
  }, [runningStepId]);

  // The mirror. Engine → selected step, while stopped.
  const engineSignature = stateSignature(state);
  useEffect(() => {
    if (!setlist || !selectedStepId || isPlaying) return;
    if (awaiting.current !== null) {
      // Still catching up to something we pushed. Only the arrival of that
      // exact configuration clears the wait — anything else is an event from
      // before the apply.
      if (awaiting.current === engineSignature) awaiting.current = null;
      return;
    }
    const step = setlist.steps.find((s) => s.id === selectedStepId);
    if (!step || stepSignature(step) === engineSignature) return;
    setSetlist((current) =>
      current
        ? {
            ...current,
            steps: current.steps.map((s) =>
              s.id === selectedStepId ? { ...s, ...stateAsStepPatch(state) } : s,
            ),
          }
        : current,
    );
  }, [setlist, selectedStepId, isPlaying, engineSignature, state]);

  const loadSetlist = useCallback(
    (next: Setlist) => {
      setView("setlist");
      onSetlistLoaded();
      setSetlist(next);
      setSaved(next);
      const first = next.steps[0] ?? null;
      setSelectedStepId(first?.id ?? null);
      if (first && !isPlaying) applyAndAwait(first);
    },
    [setView, onSetlistLoaded, isPlaying, applyAndAwait],
  );

  /**
   * A step edited from its own sentence.
   *
   * This has to PUSH the step onto the engine, not merely change it. The
   * mirror above exists so the header's sound and volume chips still edit the
   * selected step — but it cannot tell an edit made in the sentence from the
   * engine disagreeing with the step, so an edit that is not applied is read
   * straight back out and undone on the next `state-changed`. That was a real
   * bug and a quiet one: every phrase in the sentence looked dead, while the
   * trigger and the transition — the only two fields the mirror does not
   * touch — worked fine.
   *
   * Applying it is also what makes the edit audible, which is what you want
   * from a control with a tempo written on it. Not while the setlist runs,
   * though: the runner owns the engine then, and editing step seven must not
   * retune the step you are listening to.
   */
  const patchStep = useCallback(
    (stepId: string, next: Partial<Omit<SetlistStep, "id">>) => {
      if (!setlist) return;
      const patched = updateStep(setlist, stepId, next);
      const step = patched.steps.find((s) => s.id === stepId);
      if (step && !isPlaying) applyAndAwait(step);
      setSetlist(patched);
    },
    [setlist, isPlaying, applyAndAwait],
  );

  /** Put the setlist away — loading a preset is loading a preset, not a step. */
  const closeSetlist = useCallback(() => {
    setSetlist(null);
    setSaved(null);
    setSelectedStepId(null);
  }, []);

  const newSetlist = useCallback(async () => {
    const created = createSetlist(t("setlist.untitled"));
    await saveSetlistIpc(created).catch(() => {});
    // NOT a blind append. The await above is a window — the setlist is in the
    // store by the time it closes, so a `listSetlists()` still in flight can
    // resolve with it already present. See `upsertSetlist`.
    setSetlists((prev) => upsertSetlist(prev, created));
    loadSetlist(created);
    return created;
  }, [t, loadSetlist]);

  const saveActiveSetlist = useCallback(async () => {
    if (!setlist) return;
    await saveSetlistIpc(setlist).catch(() => {});
    setSetlists((prev) => upsertSetlist(prev, setlist));
    setSaved(setlist);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setSaveFeedback(true);
    feedbackTimer.current = setTimeout(() => setSaveFeedback(false), 1800);
  }, [setlist]);

  /** Throw the edits away and put the engine back on the stored step. */
  const revertSetlist = useCallback(() => {
    if (!saved) return;
    setSetlist(saved);
    const step =
      saved.steps.find((s) => s.id === selectedStepId) ?? saved.steps[0] ?? null;
    setSelectedStepId(step?.id ?? null);
    if (step && !isPlaying) applyAndAwait(step);
  }, [saved, selectedStepId, isPlaying, applyAndAwait]);

  const deleteSetlist = useCallback(
    async (id: string) => {
      await deleteSetlistIpc(id).catch(() => {});
      setSetlists((prev) => prev.filter((c) => c.id !== id));
      if (setlist?.id === id) closeSetlist();
    },
    [setlist?.id, closeSetlist],
  );

  const renameSetlist = useCallback(
    async (id: string, name: string) => {
      const target = setlists.find((c) => c.id === id);
      if (!target) return;
      const renamed = renameSetlistData(target, name);
      await saveSetlistIpc(renamed).catch(() => {});
      setSetlists((prev) => prev.map((c) => (c.id === id ? renamed : c)));
      // A rename is a rename, not an edit: it lands in the working copy and
      // in the stored one at once, so the bar does not go dirty over it.
      if (setlist?.id === id) setSetlist((c) => (c ? { ...c, name } : c));
      if (saved?.id === id) setSaved((c) => (c ? { ...c, name } : c));
    },
    [setlists, setlist?.id, saved?.id],
  );

  /**
   * A new step at the end of the setlist.
   *
   * This used to mean "whatever the metronome is set to now", which worked
   * because the metronome was on screen underneath the track. In the
   * paragraph there is no metronome to copy, so a new step copies the step
   * ABOVE it — you add a step to a routine because it is like the last one
   * but faster, not because it is like whatever happened to be loaded. The
   * first step of an empty setlist has nothing above it and takes the engine's
   * current settings, which is the old behaviour exactly where it still makes
   * sense.
   */
  const addStepFromNow = useCallback(() => {
    if (!setlist) return;
    const name = t("setlist.stepDefaultName", { number: setlist.steps.length + 1 });
    const previous = setlist.steps[setlist.steps.length - 1];
    const step = previous
      ? { ...previous, id: crypto.randomUUID(), name }
      : presetToSetlistStep(stateAsPreset(state, name));
    // The step already is what the engine is playing, so there is nothing to
    // apply — but the mirror must not read that back as an edit, which is
    // the same wait selecting a step opens.
    awaiting.current = stepSignature(step);
    setSetlist(addStep(setlist, step));
    setSelectedStepId(step.id);
  }, [setlist, state, t]);

  const dirty = useMemo(
    () => (setlist && saved ? JSON.stringify(setlist) !== JSON.stringify(saved) : false),
    [setlist, saved],
  );

  return {
    setlists,
    setlist,
    dirty,
    saveFeedback,
    selectedStepId,
    /** The step the controls below the track are editing. */
    selectedStep: setlist?.steps.find((s) => s.id === selectedStepId) ?? null,
    runner,
    /** Index the runner is on, or -1 when the setlist is not running. */
    runningIndex: runner.step ? runner.stepNumber - 1 : -1,
    setSetlist,
    patchStep,
    selectStep,
    loadSetlist,
    closeSetlist,
    newSetlist,
    saveActiveSetlist,
    revertSetlist,
    deleteSetlist,
    renameSetlist,
    addStepFromNow,
    /** 1-based, for the transport's "Start at step 3". */
    startAt: setlist ? selectedIndex + 1 : 0,
    /** True while the setlist is on a step — the player's condition. */
    setlistPlaying: runner.step !== null && !editingWhileRunning,
    editingWhileRunning,
    /** Leave the player for the paragraph without stopping the run. */
    editWhileRunning: () => setEditingWhileRunning(true),
    backToPlaying: () => setEditingWhileRunning(false),
  };
}
