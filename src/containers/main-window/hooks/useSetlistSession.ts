import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  addStep,
  createSetlist,
  duplicateSetlist as duplicateSetlistData,
  jamToSetlistStep,
  presetToSetlistStep,
  renameSetlist as renameSetlistData,
  reorderSetlists as reorderSetlistsData,
  stepRange,
  updateStep,
  upsertSetlist,
} from "../../../setlist";
import {
  deleteSetlist as deleteSetlistIpc,
  listSetlists,
  reorderSetlists as reorderSetlistsIpc,
  saveSetlist as saveSetlistIpc,
  storeLoad,
  storeSave,
} from "../../../ipc";
import { meterKey } from "../../../utils/meter";
import type { Jam } from "../../../jam";
import type { AppState, BeatEvent, Setlist, SetlistStep, Preset } from "../../../types";
import { applySetlistStep } from "./applySetlistStep";
import { useSetlistRunner } from "./useSetlistRunner";
import type { SetlistJamContext } from "./useSetlistRunner";
import { sameRecord } from "../../../utils/sameRecord";

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

/**
 * `list` with `item` sitting directly after the entry with id `afterId`.
 *
 * Returns the list unchanged when it is already there or when `afterId` names
 * nothing. Pure, and used twice on purpose: once for what is on screen and
 * once for the ids the store is told to keep.
 */
function insertAfter<T extends { id: string }>(list: T[], afterId: string, item: T): T[] {
  const at = list.findIndex((c) => c.id === afterId);
  const landed = list.findIndex((c) => c.id === item.id);
  if (at < 0 || landed < 0 || landed === at + 1) return list;
  const next = [...list];
  next.splice(landed, 1);
  next.splice(landed < at ? at : at + 1, 0, item);
  return next;
}

/**
 * Where the setlist you last had open is written down — the setlist's half of
 * `LAST_JAM_KEY`, in the same store and through the same two calls as the
 * appearance preferences (`useUiPreferences`).
 */
const LAST_SETLIST_KEY = "lastSetlistId";

interface UseSetlistSessionArgs {
  state: AppState;
  isPlaying: boolean;
  currentBeat: BeatEvent | null;
  /**
   * Which tab is showing. Read for one thing only: the setlist tab always has
   * a setlist on it, and this is how the hook knows it is being looked at.
   */
  view: string;
  setView: (view: "setlist") => void;
  /** Loading a setlist takes the preset's place in the context bar. */
  onSetlistLoaded: () => void;
  /**
   * Everything a jam STEP needs (JAM_MODE 8.5), or absent on a mount that has
   * no jam library to look into.
   *
   * It arrives as one object rather than as three props because the runner
   * reads all of it through one ref, and because the whole of it is optional
   * together: a setlist of plain steps never asks any of these questions.
   */
  jamContext?: SetlistJamContext;
}

export function useSetlistSession({
  state,
  isPlaying,
  currentBeat,
  view,
  setView,
  onSetlistLoaded,
  jamContext,
}: UseSetlistSessionArgs) {
  const { t } = useTranslation();
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  /**
   * The library as it stands, for a writer that has to know the order it is
   * about to persist rather than merely hand React a new one.
   *
   * Assigned every render — the pattern `useJamSession` uses for a value an
   * effect must read without depending on — so it is never behind what is on
   * screen, which is exactly what a callback that closed over an older list
   * is.
   */
  const setlistsRef = useRef<Setlist[]>(setlists);
  setlistsRef.current = setlists;
  /** The working copy — edited freely, written to the store only on Save. */
  const [setlist, setSetlist] = useState<Setlist | null>(null);
  /** What the store holds, for the dirty flag and for Revert. */
  const [saved, setSaved] = useState<Setlist | null>(null);
  /**
   * True while the setlist on the stage is in no library.
   *
   * Its own flag rather than "`saved` is null", which was the first attempt
   * and was quietly wrong: with nothing to compare against, a setlist the tab
   * had made could never go dirty — so a routine somebody spent an afternoon
   * building was thrown away without a word the moment anything else was
   * loaded, because the gate that asks about unsaved work reads `dirty`.
   */
  const [stageUnsaved, setStageUnsaved] = useState(false);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  /**
   * The block, BESIDE the selection and never instead of it.
   *
   * `selectedStepId` is load-bearing in three places — the engine mirror
   * below, the index a run starts on, and the step the runner drags the
   * selection to — and folding it into a set would have meant teaching all
   * three which member of the set was the real one. So the set is for bulk
   * operations only, it holds the primary as its single member in the
   * ordinary case, and the anchor is where a shift-click measures from.
   */
  const [selectedStepIds, setSelectedStepIds] = useState<Set<string>>(new Set());
  const [anchorStepId, setAnchorStepId] = useState<string | null>(null);
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
  const runner = useSetlistRunner(
    setlist,
    isPlaying,
    currentBeat,
    selectedIndex,
    jamContext,
    // A set runs when you press Play ON the setlist tab. Everywhere else the
    // transport belongs to the screen you are looking at.
    view === "setlist",
  );

  useEffect(() => {
    if (!isPlaying) setEditingWhileRunning(false);
  }, [isPlaying]);

  /*
   * A run, either end of it, gives the block back.
   *
   * Starting, because the runner is about to walk the primary selection down
   * the list and a set marked against where it used to be stops describing
   * anything a moment later. STOPPING, because by then it has: the anchor
   * would still be sitting wherever the block was marked from before the
   * run, so stopping on step six and shift-clicking step eight selected one
   * through eight — a sweep of the whole routine from a gesture that asked
   * for three steps.
   */
  useEffect(() => {
    setSelectedStepIds(selectedStepId ? new Set([selectedStepId]) : new Set());
    setAnchorStepId(selectedStepId);
    // Only when the run starts or ends. Adding the selection here would
    // collapse the block on every click that moves it, which is the opposite
    // of the point.
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  /*
   * Ids the setlist no longer has.
   *
   * Revert, or an undo of any kind, can take a step away while it is marked
   * — and a ghost id leaves one row wearing the block's wash while its
   * buttons say "1 step", which is the set and the screen disagreeing about
   * what a press would do. Cheap: the common case finds nothing to prune and
   * returns the same Set, so it costs no render.
   */
  useEffect(() => {
    if (!setlist) return;
    const live = new Set(setlist.steps.map((s) => s.id));
    setSelectedStepIds((prev) => {
      let stale = false;
      for (const id of prev) if (!live.has(id)) stale = true;
      if (!stale) return prev;
      return new Set([...prev].filter((id) => live.has(id)));
    });
    setAnchorStepId((prev) => (prev && live.has(prev) ? prev : null));
  }, [setlist]);

  /**
   * True once the read from the store has landed, whatever it said.
   *
   * The restore below waits for it: choosing "the first setlist in the
   * library" out of a library that has not arrived yet would put a new
   * unsaved setlist on the stage in front of a shelf full of saved ones.
   */
  const [libraryReady, setLibraryReady] = useState(false);

  useEffect(() => {
    listSetlists()
      .then(setSetlists)
      .catch(() => {})
      .finally(() => setLibraryReady(true));
    return () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    };
  }, []);

  /**
   * The jam a step points at, or null - including when it has been deleted.
   *
   * Through the context's getter rather than a list of jams held here: the
   * library belongs to `useJamSession`, which is built after this hook, and a
   * copy kept on this side would be a second library to keep in step.
   */
  const jamFor = useCallback(
    (step: SetlistStep): Jam | null =>
      step.jamId && jamContext ? jamContext.getJam(step.jamId) : null,
    [jamContext],
  );

  const applyAndAwait = useCallback(
    (step: SetlistStep) => {
      awaiting.current = stepSignature(step);
      // A jam step puts its band on the engine while you edit it too, for the
      // reason the metronome under the track exists at all: the controls are
      // the step's own, and a jam step you cannot hear is a step you are
      // editing blind.
      applySetlistStep(step, jamFor(step), jamContext?.lineup);
    },
    [jamFor, jamContext],
  );

  const selectStep = useCallback(
    (stepId: string) => {
      setSelectedStepId(stepId);
      // A plain click is the end of whatever block was marked: one step, and
      // the next shift-click measures from here.
      setSelectedStepIds(new Set([stepId]));
      setAnchorStepId(stepId);
      // Pointing the metronome at the step is what makes it the step's own
      // controls rather than a second set of numbers beside them.
      const step = setlist?.steps.find((s) => s.id === stepId);
      if (step && !isPlaying) applyAndAwait(step);
    },
    [setlist, isPlaying, applyAndAwait],
  );

  /**
   * Shift-click, and Shift+↑/↓: everything from the anchor to here.
   *
   * The primary selection does NOT move — the metronome below the track goes
   * on editing the step it was editing, because marking five steps to move
   * them is not a request to start listening to the fifth.
   */
  const extendSelection = useCallback(
    (stepId: string) => {
      if (!setlist) return;
      const anchor = anchorStepId ?? selectedStepId;
      const range = stepRange(setlist, anchor, stepId);
      if (range.length === 0) return;
      setSelectedStepIds(new Set(range));
      if (!anchor) setAnchorStepId(stepId);
    },
    [setlist, anchorStepId, selectedStepId],
  );

  /**
   * Ctrl-click (⌘ on a Mac): this one step in or out, nothing else moves.
   *
   * Never out of existence, though. The set is "the steps an operation would
   * take", and it has to hold at least the step the controls are on — a
   * ctrl-click that emptied it left the row still drawn as selected with its
   * buttons pointing at nothing. So the primary cannot be clicked out, and a
   * toggle that would leave the set empty collapses to the primary instead.
   */
  const toggleStepSelection = useCallback(
    (stepId: string) => {
      setSelectedStepIds((prev) => {
        const next = new Set(prev);
        if (!next.has(stepId)) {
          next.add(stepId);
          return next;
        }
        if (stepId === selectedStepId) return prev;
        next.delete(stepId);
        if (next.size === 0 && selectedStepId) next.add(selectedStepId);
        return next;
      });
      setAnchorStepId(stepId);
    },
    [selectedStepId],
  );

  /** Back to the one step the controls are on. */
  const collapseSelection = useCallback(() => {
    setSelectedStepIds(selectedStepId ? new Set([selectedStepId]) : new Set());
    setAnchorStepId(selectedStepId);
  }, [selectedStepId]);

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
    /*
     * Never onto a jam step.
     *
     * A jam step's meter is the jam's, and the jam is what put it on the
     * engine - so the mirror would read the groove's own subdivision back out
     * and write it onto the step as though the user had chosen it. Worse, a
     * jam whose groove does not fit its meter is played by the rule groove in
     * a DIFFERENT bar length, and the step would quietly acquire that instead
     * of the one it was made from. The step's fields are a copy of the jam,
     * and only the jam gets to change them.
     */
    if (step.jamId) return;
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
      setStageUnsaved(false);
      const first = next.steps[0] ?? null;
      setSelectedStepId(first?.id ?? null);
      setSelectedStepIds(first ? new Set([first.id]) : new Set());
      setAnchorStepId(first?.id ?? null);
      if (first && !isPlaying) applyAndAwait(first);
      // So the tab opens on this one tomorrow. Silent on failure, like every
      // other write to this store.
      void storeSave(LAST_SETLIST_KEY, next.id).catch(() => {});
    },
    [setView, onSetlistLoaded, isPlaying, applyAndAwait],
  );

  /**
   * A setlist on the stage that the library has never heard of.
   *
   * For the player who has no setlists at all — a first run, or one who
   * deleted the lot. The rule is that a mode always has something live in
   * front of you, and the library holds what you CHOSE to save, so this goes
   * on the stage and nowhere near `save_setlist`. A mode that filed a "New
   * setlist" every time somebody clicked the tab would leave a shelf of empty
   * routines nobody made, and the library is the one thing here a player owns.
   *
   * `saved` is the setlist as it was created, so Revert and the dirty flag
   * work on it exactly as they do on a stored one — a step added to it reads
   * as an edit, and the gate that asks about unsaved work can see it.
   * `stageUnsaved` carries the other half: Save is live from the first
   * moment, because a setlist that has never been written down always has
   * something to write down.
   */
  const openUnsavedSetlist = useCallback(() => {
    const created = createSetlist(t("setlist.untitled"));
    setView("setlist");
    onSetlistLoaded();
    setSetlist(created);
    setSaved(created);
    setStageUnsaved(true);
    setSelectedStepId(null);
    setSelectedStepIds(new Set());
    setAnchorStepId(null);
    return created;
  }, [t, setView, onSetlistLoaded]);

  /**
   * The Setlist tab always has a setlist on it (2026-09-17).
   *
   * The one you last had open, else the first in the library, else a new one
   * that is not in the library at all — the same three answers, in the same
   * order, that the Jam tab gives. The owner's report was that the modes
   * disagreed with each other about this and that none of them remembered
   * anything between sittings.
   *
   * Whenever the tab is showing with nothing on the stage, not only when it
   * is entered: deleting the open setlist empties the stage while you are
   * standing on it, and the answer to that is the next setlist, not a button.
   *
   * `pickingRef` is the guard the effect needs and the state cannot give it:
   * reading the last id is a round trip, and without it every render inside
   * that window would start another one.
   */
  const pickingRef = useRef(false);
  useEffect(() => {
    if (view !== "setlist" || setlist || !libraryReady || pickingRef.current) return;
    pickingRef.current = true;
    (async () => {
      let lastId: string | undefined;
      try {
        lastId = await storeLoad<string>(LAST_SETLIST_KEY);
      } catch {
        /* Never opened one, or a store that cannot be read. The library wins. */
      }
      const library = setlistsRef.current;
      // A lookup rather than a load by id: a setlist deleted since is not an
      // answer to "what was I working on".
      const target = library.find((c) => c.id === lastId) ?? library[0] ?? null;
      if (target) loadSetlist(target);
      else openUnsavedSetlist();
      pickingRef.current = false;
    })();
  }, [view, setlist, libraryReady, loadSetlist, openUnsavedSetlist]);

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
    setStageUnsaved(false);
    setSelectedStepId(null);
    setSelectedStepIds(new Set());
    setAnchorStepId(null);
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
    setStageUnsaved(false);
    // A setlist that was only ever on the stage is in the library from here,
    // so this is the first moment there is an id worth coming back to.
    void storeSave(LAST_SETLIST_KEY, setlist.id).catch(() => {});
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

  /**
   * A copy of a setlist, beside the one it came from.
   *
   * The jam library's Duplicate, read for setlists (`duplicateJam`): the copy
   * is a variation on that setlist and belongs next to it, not at the bottom
   * of the library. What is open stays open — you duplicate a routine to
   * change the copy later, and being thrown out of the one you were editing
   * would be a second thing happening that you did not ask for.
   */
  const duplicateSetlist = useCallback(
    async (id: string) => {
      const target = setlists.find((c) => c.id === id);
      if (!target) return;
      const copy = duplicateSetlistData(target, t("setlist.copyName", { name: target.name }));
      await saveSetlistIpc(copy).catch(() => {});
      // Against the list as it is NOW, not the one this closure captured: the
      // await above is the same window `newSetlist` learned about.
      setSetlists((prev) => insertAfter(upsertSetlist(prev, copy), id, copy));
      /*
       * And in the store, which has its own order.
       *
       * `save_setlist` appends, so the copy sat beside its source on screen
       * and at the bottom of the library after a restart — the one place the
       * position was supposed to mean something. The library's order is the
       * user's, so it is written down.
       */
      const ordered = insertAfter(upsertSetlist(setlists, copy), id, copy);
      await reorderSetlistsIpc(ordered.map((c) => c.id)).catch(() => {});
      return copy;
    },
    [setlists, t],
  );

  /**
   * A setlist dragged to a new place in the library.
   *
   * The order is the user's — the routine you warm up on first, the one you
   * finish with — so it is written down rather than kept on screen: the same
   * argument, and the same `reorder_setlists` call, that `duplicateSetlist`
   * above makes for the copy's place.
   *
   * What is open stays open and the save bar stays clean. Moving a row in the
   * library says nothing about the setlist's contents, and a routine that went
   * dirty because another one moved past it would be asking to save an edit
   * nobody made.
   */
  const reorderSetlists = useCallback(async (from: number, to: number) => {
    /*
     * Against the list as it stands, never against one this callback closed
     * over: `duplicateSetlist` below awaits the store before it adds the copy,
     * and a drop landing inside that window used to write back a library from
     * before the copy existed — the copy gone, and the drag blamed for it.
     * The same window `newSetlist` and `upsertSetlist` learned about, arrived
     * at from the other side.
     */
    const current = setlistsRef.current;
    const next = reorderSetlistsData(current, from, to);
    // A drag that went home moves nothing and is not written down.
    if (next === current) return;
    setlistsRef.current = next;
    /*
     * The updater form, and the ref: one for each half of the problem.
     *
     * React does not run an updater until it re-renders, so an order computed
     * inside one is not available to the store call that has to follow it —
     * the write was simply skipped. The ref gives the order synchronously;
     * the updater makes sure that if something else landed between reading
     * the ref and this write, the move is re-applied to THAT list instead of
     * replacing it.
     */
    setSetlists((prev) => (prev === current ? next : reorderSetlistsData(prev, from, to)));
    await reorderSetlistsIpc(next.map((c) => c.id)).catch(() => {});
  }, []);

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

  /**
   * A jam, added to the setlist as a step (JAM_MODE 8.5).
   *
   * Appended rather than inserted at the selection, the way `addStepFromNow`
   * appends: "add ten minutes of playing at the end" is what the feature is
   * for, and a jam landing in the middle of a routine is a drag away.
   */
  const addJamStep = useCallback(
    (jam: Jam) => {
      if (!setlist) return null;
      const step = jamToSetlistStep(jam);
      const next = addStep(setlist, step);
      setSetlist(next);
      setSelectedStepId(step.id);
      // Selecting it points the engine at it, exactly as clicking the row
      // would - and while the setlist runs it must not, because the runner
      // owns the engine then.
      if (!isPlaying) applyAndAwait(step);
      return step;
    },
    [setlist, isPlaying, applyAndAwait],
  );

  /** The same, into a setlist that is not the one on screen. */
  const addJamToSetlist = useCallback(
    async (setlistId: string, jam: Jam) => {
      const target =
        setlist?.id === setlistId ? setlist : setlists.find((c) => c.id === setlistId);
      if (!target) return;
      if (setlist?.id === setlistId) {
        addJamStep(jam);
        return;
      }
      // Not the open one, so there is no working copy to go dirty: the step
      // lands in the store and in the library at once, which is what makes
      // "add to setlist" from the jam tab a thing you do and forget.
      const next = addStep(target, jamToSetlistStep(jam));
      await saveSetlistIpc(next).catch(() => {});
      setSetlists((prev) => upsertSetlist(prev, next));
    },
    [setlist, setlists, addJamStep],
  );

  const dirty = useMemo(
    // Compared by what the records SAY, not by their text: see `sameRecord`.
    () => (setlist && saved ? !sameRecord(setlist, saved) : false),
    [setlist, saved],
  );

  /**
   * A setlist on the stage that the library has never held.
   *
   * Beside dirty rather than folded into it. They answer two questions — "has
   * this moved since it was written down" and "has it ever been written down"
   * — and a setlist the tab made is the case where the answers differ. What
   * they share is that Save has something to do.
   */
  const unsaved = !!setlist && stageUnsaved;

  return {
    setlists,
    setlist,
    dirty,
    /** True while the setlist on the stage has never reached the library. */
    unsaved,
    saveFeedback,
    selectedStepId,
    /** The steps a bulk operation would take — never fewer than the one. */
    selectedStepIds,
    extendSelection,
    toggleStepSelection,
    collapseSelection,
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
    duplicateSetlist,
    /** The library's order, moved by hand and written to the store. */
    reorderSetlists,
    addStepFromNow,
    /** A jam as a step, in the open setlist or in a named one. */
    addJamStep,
    addJamToSetlist,
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
