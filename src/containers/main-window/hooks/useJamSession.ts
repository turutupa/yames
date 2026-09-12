import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  listJams,
  saveJams,
  setBeatGroups,
  setBpm,
  setFreeMode,
  setJam,
  setSubdivision,
} from "../../../ipc";
import {
  STARTER_JAMS,
  compileJam,
  createJam,
  duplicateJam as duplicateJamData,
  jamMeter,
  renameJam as renameJamData,
  reorderJams as reorderJamsData,
  upsertJam,
} from "../../../jam";
import type { Jam } from "../../../jam/types";
import type { Subdivision } from "../../../types";
import { coachDebug } from "../../../coach/debug";

/**
 * The jam the window has open: which one, what the store holds, and the whole
 * of the traffic to the engine.
 *
 * Two things make this different from `useSetlistSession`. The library is an
 * ORDER rather than a set — the jams are saved as one list under one key, so
 * every change writes the list — and the engine is written to as a unit: a
 * jam is a meter plus a table, and the two have to arrive together and in the
 * right order or the engine refuses the table and plays the plain click.
 *
 * That order is the contract (plans/tasks/jam/BRIEF.md), and it is the reason
 * the meter and the table go out from one function rather than four effects:
 *
 *   free mode off → beat groups → subdivision → the table
 *
 * The engine checks `ticksPerBeat × beatsPerBar` against its own bar length
 * and refuses a table that disagrees, rather than guessing. Sending the table
 * first would hand it the PREVIOUS meter to check against.
 *
 * The TEMPO goes separately, and that is deliberate: a tempo is not part of
 * the table, and re-sending the meter every time somebody nudges the BPM
 * while the band is playing would restack the bar under them on every click.
 */

/** Said once per session, not once per beat: the command may not exist yet. */
let warnedAboutSetJam = false;

function pushJam(jam: Jam): void {
  const { beatsPerBar, ticksPerBeat } = jamMeter(jam);
  void (async () => {
    // Each step is awaited so the engine sees them in order, and each is
    // guarded so one rejecting does not take the rest with it — a jam that
    // applied its meter and nothing else is the worst of the failures.
    const steps: Array<[string, () => Promise<unknown>]> = [
      ["freeMode", () => setFreeMode(false)],
      ["beatGroups", () => setBeatGroups([beatsPerBar])],
      ["subdivision", () => setSubdivision(ticksPerBeat as Subdivision)],
      ["jam", () => setJam(compileJam(jam))],
    ];
    for (const [name, run] of steps) {
      try {
        await run();
      } catch (err) {
        // `set_jam` does not exist until the engine side lands. Saying so once
        // is the difference between a known gap and a screen that looks
        // broken; saying it on every edit would bury everything else.
        if (name === "jam") {
          if (warnedAboutSetJam) continue;
          warnedAboutSetJam = true;
          console.warn(
            "[yames] set_jam is not available in this build — the click plays instead of the band",
            err,
          );
          continue;
        }
        coachDebug("jam.push-step-failed", { jam: jam.id, step: name, err });
      }
    }
  })();
}

/** Take the band away and leave the metronome exactly as it was. */
function clearJam(): void {
  void setJam(null).catch(() => {});
}

interface UseJamSessionArgs {
  /** Which tab is showing — the engine only carries a jam while Jam is open. */
  view: string;
  isPlaying: boolean;
  /** Loading a jam takes the preset's place in the context bar. */
  onJamLoaded: () => void;
}

export function useJamSession({ view, isPlaying, onJamLoaded }: UseJamSessionArgs) {
  const { t } = useTranslation();
  const [jams, setJams] = useState<Jam[]>([]);
  /** The working copy — edited freely, written to the store only on Save. */
  const [jam, setActiveJam] = useState<Jam | null>(null);
  /** What the store holds, for the dirty flag and for Revert. */
  const [saved, setSaved] = useState<Jam | null>(null);
  const [saveFeedback, setSaveFeedback] = useState(false);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Seed once, on the first run that has no `jams` key at all.
   *
   * `undefined` means nothing was ever saved; an empty array means the user
   * deleted them all, and they stay deleted. Re-seeding over a deliberate
   * empty library would be the app arguing with the user.
   */
  useEffect(() => {
    let alive = true;
    listJams()
      .then(async (stored) => {
        if (!alive) return;
        if (stored === undefined) {
          const seeded = [...STARTER_JAMS];
          setJams(seeded);
          await saveJams(seeded).catch(() => {});
          return;
        }
        setJams(stored);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    };
  }, []);

  /** The whole list, to the store and to the UI, in one place. */
  const commit = useCallback((next: Jam[]) => {
    setJams(next);
    void saveJams(next).catch(() => {});
  }, []);

  /**
   * The band follows the tab.
   *
   * Leaving Jam sends `null`, so the metronome tab is the metronome again;
   * coming back re-sends, so it does not matter that the engine forgot. The
   * jam itself is the other trigger: every edit recompiles and re-sends, which
   * is what makes changing the groove audible on the next bar rather than on
   * the next reload.
   */
  const engineKey = jam
    ? JSON.stringify([jam.grooveId, jam.feel, jam.intensity, jam.form, jam.fills, jam.kit])
    : null;

  useEffect(() => {
    if (view !== "jam" || !jam) {
      clearJam();
      return;
    }
    pushJam(jam);
    // `engineKey` rather than `jam`: everything the table is made of, and not
    // the tempo or the name. eslint would rather have `jam` here, and `jam`
    // here is the bug this line exists to avoid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, engineKey]);

  /** The tempo, on its own, so changing it does not disturb the bar. */
  useEffect(() => {
    if (view !== "jam" || !jam) return;
    void setBpm(jam.bpm).catch(() => {});
  }, [view, jam?.bpm]);

  const loadJam = useCallback(
    (next: Jam) => {
      onJamLoaded();
      setActiveJam(next);
      setSaved(next);
    },
    [onJamLoaded],
  );

  /** Put the jam away — loading a preset is loading a preset. */
  const closeJam = useCallback(() => {
    setActiveJam(null);
    setSaved(null);
  }, []);

  /**
   * An edit from the stage. It lands in the working copy, which re-sends the
   * whole configuration — there is no partial update of a jam, because the
   * meter and the table have to stay in step.
   */
  const editJam = useCallback((patch: Partial<Omit<Jam, "id" | "createdAt">>) => {
    setActiveJam((current) => (current ? { ...current, ...patch } : current));
  }, []);

  /**
   * "+" — another one like this one.
   *
   * A new jam copies the loaded jam's settings rather than starting from the
   * defaults: you press it because you want the same groove at a different
   * tempo, or the same tempo over a different form.
   */
  const newJam = useCallback(() => {
    const created = createJam(t("jam.untitled"), jam ?? undefined);
    commit([...jams, created]);
    loadJam(created);
    return created;
  }, [t, jam, jams, commit, loadJam]);

  const saveActiveJam = useCallback(() => {
    if (!jam) return;
    commit(upsertJam(jams, jam));
    setSaved(jam);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setSaveFeedback(true);
    feedbackTimer.current = setTimeout(() => setSaveFeedback(false), 1800);
  }, [jam, jams, commit]);

  /** Throw the edits away and put the engine back on the stored jam. */
  const revertJam = useCallback(() => {
    if (!saved) return;
    setActiveJam(saved);
  }, [saved]);

  const deleteJam = useCallback(
    (id: string) => {
      commit(jams.filter((j) => j.id !== id));
      if (jam?.id === id) closeJam();
    },
    [jams, jam?.id, commit, closeJam],
  );

  const renameJam = useCallback(
    (id: string, name: string) => {
      const target = jams.find((j) => j.id === id);
      if (!target) return;
      const renamed = renameJamData(target, name);
      commit(jams.map((j) => (j.id === id ? renamed : j)));
      // A rename is a rename, not an edit: it lands in the working copy and in
      // the stored one at once, so the bar does not go dirty over it.
      if (jam?.id === id) setActiveJam((j) => (j ? { ...j, name: renamed.name } : j));
      if (saved?.id === id) setSaved((j) => (j ? { ...j, name: renamed.name } : j));
    },
    [jams, jam?.id, saved?.id, commit],
  );

  const duplicateJam = useCallback(
    (id: string) => {
      const target = jams.find((j) => j.id === id);
      if (!target) return;
      const copy = duplicateJamData(target, t("jam.copyName", { name: target.name }));
      // Beside the one it came from, not at the bottom of the library: the
      // copy is a variation on that jam and belongs next to it.
      const at = jams.findIndex((j) => j.id === id);
      const next = [...jams];
      next.splice(at + 1, 0, copy);
      commit(next);
    },
    [jams, t, commit],
  );

  const reorderJams = useCallback(
    (from: number, to: number) => {
      const next = reorderJamsData(jams, from, to);
      if (next !== jams) commit(next);
    },
    [jams, commit],
  );

  const dirty = useMemo(
    () => (jam && saved ? JSON.stringify(jam) !== JSON.stringify(saved) : false),
    [jam, saved],
  );

  return {
    jams,
    jam,
    dirty,
    saveFeedback,
    /** True while a jam is loaded and the transport would start the band. */
    playing: !!jam && isPlaying,
    loadJam,
    closeJam,
    editJam,
    newJam,
    saveActiveJam,
    revertJam,
    deleteJam,
    renameJam,
    duplicateJam,
    reorderJams,
  };
}
