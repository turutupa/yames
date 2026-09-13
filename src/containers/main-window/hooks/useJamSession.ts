import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  listJams,
  saveJams,
  setBeatGroups,
  setBpm,
  setFreeMode,
  setJam,
  setJamPosition,
  setSubdivision,
} from "../../../ipc";
import {
  GROOVES,
  STARTER_JAMS,
  carryCountIn,
  compileJam,
  createJam,
  duplicateJam as duplicateJamData,
  formBars,
  jamMeter,
  lineupFor,
  renameJam as renameJamData,
  reorderJams as reorderJamsData,
  sectionRanges,
  sectionIndexAt,
  stepSection,
  tempoAfterChorus,
  upsertJam,
} from "../../../jam";
import type { BarRange } from "../../../jam";
import type { Chord } from "../../../jam/harmony";
import type { Jam, JamEngineConfig, JamPositionCommand } from "../../../jam";
import { NO_PRACTICE } from "../../jam/PracticeRow";
import type { GrooveEditorPage } from "../../jam/editor";
import type { BeatEvent, Subdivision } from "../../../types";
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
/** Likewise for the position command, which arrives with the engine's jumps. */
let warnedAboutSetJamPosition = false;

/**
 * Ask the form to move, and say once if the engine cannot hear it.
 *
 * The screen keeps its own answer either way: a click on bar 7 marks bar 7 as
 * pending whether or not the command landed, because the marker is the UI
 * telling you what it asked for, not a reading of what the engine did. On a
 * build without `set_jam_position` that leaves a mark that never clears, which
 * is the honest picture of a jump that never happened.
 */
async function sendPosition(command: JamPositionCommand): Promise<void> {
  try {
    await setJamPosition(command);
  } catch (err) {
    if (warnedAboutSetJamPosition) return;
    warnedAboutSetJamPosition = true;
    console.warn(
      "[yames] set_jam_position is not available in this build — the form plays straight through",
      err,
    );
  }
}

/** The metronome's own meter, remembered so the jam can hand it back. */
type MeterSnapshot = { subdivision: number; beatGroups: number[]; freeMode: boolean };

/**
 * The last round trip `setJam` took, in milliseconds.
 *
 * Kept because the bar-ahead send below only works if a config posted on one
 * downbeat has arrived before the next, and "it feels fine" is not a number.
 * Read it from the console as `window.__yamesJamLatency` while a jam plays.
 */
export const jamLatency = { last: 0, worst: 0, sends: 0 };

/** One `setJam`, timed, with the missing-command case said once. */
async function sendJam(jam: Jam, config: JamEngineConfig | null): Promise<void> {
  const started = performance.now();
  try {
    await setJam(config);
  } catch (err) {
    if (warnedAboutSetJam) return;
    warnedAboutSetJam = true;
    console.warn(
      "[yames] set_jam is not available in this build — the click plays instead of the band",
      err,
    );
    return;
  } finally {
    const took = performance.now() - started;
    jamLatency.last = took;
    jamLatency.sends += 1;
    if (took > jamLatency.worst) jamLatency.worst = took;
    if (typeof window !== "undefined") {
      (window as unknown as { __yamesJamLatency?: typeof jamLatency }).__yamesJamLatency =
        jamLatency;
    }
    if (took > 20) coachDebug("jam.send-slow", { jam: jam.id, ms: Math.round(took) });
  }
}

/**
 * The meter and the table, in that order — what a jam needs on the way in.
 *
 * Only on load and on an edit. Never per bar: re-sending the meter under a
 * playing band would restack the bar on every downbeat.
 */
function pushJam(jam: Jam, config: JamEngineConfig): void {
  const { beatsPerBar, ticksPerBeat } = jamMeter(jam);
  void (async () => {
    // Each step is awaited so the engine sees them in order, and each is
    // guarded so one rejecting does not take the rest with it — a jam that
    // applied its meter and nothing else is the worst of the failures.
    const steps: Array<[string, () => Promise<unknown>]> = [
      ["freeMode", () => setFreeMode(false)],
      ["beatGroups", () => setBeatGroups([beatsPerBar])],
      ["subdivision", () => setSubdivision(ticksPerBeat as Subdivision)],
    ];
    for (const [name, run] of steps) {
      try {
        await run();
      } catch (err) {
        coachDebug("jam.push-step-failed", { jam: jam.id, step: name, err });
      }
    }
    await sendJam(jam, config);
  })();
}

/** What the engine is holding, as one comparable string. */
function bassSignature(config: JamEngineConfig): string {
  return config.bass ? config.bass.pitches.join(",") : "";
}

/**
 * Take the band away, and give the metronome back the meter it came in with.
 *
 * `setJam(null)` alone is not enough, and the bug it leaves is a quiet one: a
 * jam sets the engine's subdivision and beat groups to the groove's, and those
 * are engine state, not jam state. Walk out of a bossa and the metronome tab
 * is a metronome again — in sixteenths, in four — whatever it was before. A
 * player who came in from 7/8 finds their own setting gone and no message
 * saying so.
 *
 * So the meter the jam found is remembered on the way in and handed back on
 * the way out, in the same order it was taken: free mode, groups, subdivision.
 * The table goes first, because the engine checks the two against each other
 * and a meter that arrives while a table is still loaded is a meter it may
 * refuse.
 */
function clearJam(restore: MeterSnapshot | null): void {
  void (async () => {
    try {
      await setJam(null);
    } catch {
      /* The command may not exist yet; the meter still has to go back. */
    }
    if (!restore) return;
    const steps: Array<() => Promise<unknown>> = [
      () => setFreeMode(restore.freeMode),
      () => setBeatGroups(restore.beatGroups),
      () => setSubdivision(restore.subdivision as Subdivision),
    ];
    for (const run of steps) {
      try {
        await run();
      } catch {
        /* One step failing must not take the other two with it. */
      }
    }
  })();
}

interface UseJamSessionArgs {
  /** Which tab is showing — the engine only carries a jam while Jam is open. */
  view: string;
  isPlaying: boolean;
  /** Loading a jam takes the preset's place in the context bar. */
  onJamLoaded: () => void;
  /** What you play. The band is everything but that (JAM_MODE §3.1). */
  instrument: string;
  /** The latest tick, for the bar-ahead bass and the tempo trainer. */
  currentBeat: BeatEvent | null;
  /**
   * True while the engine is counting the band in.
   *
   * The count-in runs on the tick grid and reports beats like any other bar,
   * so without this the bar-ahead send below would treat the count as part of
   * the form: a two-bar count crosses a bar line, the next bar's bass goes out
   * inside it, and the engine applies it at the top of the form — so the first
   * bar of the tune plays the second bar's bass. Nothing is sent while this is
   * on; the config the load posted is already the right one for bar one.
   */
  countingIn: boolean;
  /**
   * The metronome's own meter, as the app state holds it right now.
   *
   * Read only at the moment the first jam is pushed, and handed back when the
   * tab is left. Passing it in rather than reading the engine keeps this hook
   * the only thing that writes to the engine's meter — a read-back would race
   * the write the jam itself is making.
   */
  meter?: MeterSnapshot;
}

export function useJamSession({
  view,
  isPlaying,
  onJamLoaded,
  instrument,
  currentBeat,
  countingIn,
  meter,
}: UseJamSessionArgs) {
  const { t } = useTranslation();
  const [jams, setJams] = useState<Jam[]>([]);
  /** The working copy — edited freely, written to the store only on Save. */
  const [jam, setActiveJam] = useState<Jam | null>(null);
  /** What the store holds, for the dirty flag and for Revert. */
  const [saved, setSaved] = useState<Jam | null>(null);
  const [saveFeedback, setSaveFeedback] = useState(false);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * The tempo the trainer has climbed to, or null while it has not moved.
   *
   * Deliberately NOT the record's `bpm`. The trainer is something the jam is
   * doing to you right now, not an edit you made to it: writing it back would
   * mark the jam dirty for playing it, and pressing Save after a good long
   * session would quietly file the jam at a tempo you never chose. Stop, and
   * the jam is at its own tempo again.
   */
  const [trainedBpm, setTrainedBpm] = useState<number | null>(null);

  /** The band, when the record has not been asked who is in it. */
  const lineup = useMemo(() => {
    const full = lineupFor(instrument);
    return { drums: full.drums, bass: full.bass };
  }, [instrument]);

  /**
   * What the screen is showing that the jam does not remember.
   *
   * The neck being open, which chord the shapes row is pinned to, which shape
   * of it you are looking at, the groove editor being down. None of this
   * belongs on the record — a jam is music, not a view — but all of it has to
   * outlive a trip to the metronome tab and back, and the hotkeys have to
   * reach it, so it lives here rather than inside `JamView`.
   */
  const [fretboardOpen, setFretboardOpen] = useState(false);
  const [sevenths, setSevenths] = useState(false);
  const [shapeIndex, setShapeIndex] = useState(0);
  const [pinnedChord, setPinnedChord] = useState<Chord | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorPage, setEditorPage] = useState<GrooveEditorPage>("bar");

  /**
   * Where the form has been told to go, and what it has been told to repeat.
   *
   * Session state rather than record state, and deliberately: looping the
   * bridge for ten minutes is something you are doing to a jam this afternoon,
   * not a property of the tune. Saving it would mean a jam that opens looping
   * four bars a week later with nobody remembering why.
   */
  const [loop, setLoop] = useState<BarRange | null>(null);
  /**
   * The bar the form is on its way to, until a beat event lands there.
   *
   * The engine applies a jump at the next bar line, so between the click and
   * that line there is a bar of nothing-has-happened-yet. Without this the
   * click would look ignored, and the second click — on the same cell, a beat
   * later — is how a player finds out the hard way that it was not.
   */
  const [pendingJump, setPendingJump] = useState<number | null>(null);

  /**
   * The metronome's meter, as of the last render, and the copy the jam took.
   *
   * The live one is a ref so the push effect can read it without re-running
   * every time the engine reports a new subdivision — which it does, loudly,
   * the moment a jam sets one.
   */
  const meterRef = useRef<MeterSnapshot | undefined>(meter);
  meterRef.current = meter;
  const restoreRef = useRef<MeterSnapshot | null>(null);

  /**
   * True once the library has been WRITTEN — a new jam, a delete, a reorder.
   *
   * The read from the store is a round trip, and a fast hand gets to "+"
   * before it lands. Without this the resolved list would then be applied over
   * the jam that was just made and it would be gone, and on a first run the
   * six starters would be seeded on top of it as well. So a write wins: once
   * the user has said something about the library, whatever the disk said
   * before they said it is no longer news.
   */
  const touchedRef = useRef(false);

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
        if (!alive || touchedRef.current) return;
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
    touchedRef.current = true;
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
    ? JSON.stringify([
        jam.grooveId,
        jam.customGroove,
        jam.feel,
        jam.intensity,
        jam.form,
        jam.fills,
        jam.kit,
        jam.key,
        jam.band ?? lineup,
        jam.practice,
      ])
    : null;

  useEffect(() => {
    if (view !== "jam" || !jam) {
      // The meter goes back with the band. `restoreRef` is nulled here rather
      // than inside `clearJam` so a second pass through this branch — React
      // runs effects twice in development — does not hand the metronome its
      // own restored meter a second time and call that a snapshot.
      const restore = restoreRef.current;
      restoreRef.current = null;
      clearJam(restore);
      sentBassRef.current = null;
      loadedIdRef.current = null;
      return;
    }
    // The meter the jam found, taken once, before the jam overwrites it. Only
    // the FIRST push: by the second the engine is already in the groove's
    // meter, and remembering that would be remembering the jam.
    if (!restoreRef.current && meterRef.current) {
      restoreRef.current = {
        subdivision: meterRef.current.subdivision,
        beatGroups: [...meterRef.current.beatGroups],
        freeMode: meterRef.current.freeMode,
      };
    }
    // A load starts at bar 0. An edit to a jam that is already playing is a
    // different thing: the engine applies a changed drummer at once and holds
    // a changed bass for the bar line, so the bass this config carries is
    // the NEXT bar's — the one the bar line is about to need — and the bar
    // line after that goes on sending ahead as usual. Compiled for bar 0 it
    // played bar 1's bass under bar 7 for a whole bar.
    const isLoad = loadedIdRef.current !== jam.id;
    const live = playingBarRef.current;
    const editingLive = !isLoad && isPlaying && !countingIn && live !== null;
    const config = compileJam(jam, { formBar: editingLive ? live + 1 : 0, lineup });
    pushJam(jam, config);
    // What the engine is now holding, so the next bar line can tell whether
    // it has anything new to say. Recording `null` here would make the next
    // downbeat re-send a bass the engine already has.
    sentBassRef.current = bassSignature(config);
    loadedIdRef.current = jam.id;
    if (!editingLive) {
      barRef.current = null;
      // Bar 0 is on its way, meter first. The bar-ahead effect below runs on
      // this same commit and must not race past it — see `pushedRef`.
      pushedRef.current = true;
    }
    // `engineKey` rather than `jam`: everything the table is made of, and not
    // the tempo or the name. eslint would rather have `jam` here, and `jam`
    // here is the bug this line exists to avoid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, engineKey]);

  /**
   * The tempo, on its own, so changing it does not disturb the bar.
   *
   * `jam?.id` is in the list beside the tempo because two jams can be saved at
   * the same tempo. Without it, switching from a blues you had trained up to
   * 140 onto another jam filed at the same BPM leaves the trainer's climb in
   * place, and the new jam starts at a tempo it never asked for.
   */
  useEffect(() => {
    if (view !== "jam" || !jam) return;
    setTrainedBpm(null);
    void setBpm(jam.bpm).catch(() => {});
  }, [view, jam?.id, jam?.bpm]);

  /**
   * The bass, one bar ahead of itself.
   *
   * The drums are one bar that repeats and the bass is not: over a twelve-bar
   * blues the bass plays A under bar 1 and D under bar 5. So the config goes
   * out again at every bar line where the NEXT bar's bass differs from the one
   * the engine is holding — which over a one-chord jam is never, and over a
   * blues is four times a chorus.
   *
   * One bar ahead, not this bar: a config posted on the downbeat of bar N
   * arrives a few milliseconds into bar N, which is too late to be bar N's
   * bass and exactly in time to be bar N+1's. **This is the half of the
   * handshake the engine has to match** — a bass that arrives mid-bar belongs
   * to the next bar line, not to the bar it landed in. `jamLatency` above is
   * the number that says there is room for it.
   */
  const sentBassRef = useRef<string | null>(null);
  const barRef = useRef<string | null>(null);

  /**
   * "The load above has bar 0 in flight; say nothing this bar."
   *
   * The load effect posts the meter and the table from inside an async
   * function, so `setBeatGroups` and `setSubdivision` land in microtasks. This
   * effect runs on the SAME commit, synchronously, and with the bar just
   * re-anchored it would send the next bar's table straight away — before the
   * meter it was written in. The engine checks the two against each other and
   * refuses the table, so loading or switching a jam mid-song would quietly
   * drop the band. One bar of silence from this effect is all it takes: the
   * config the load is already posting IS bar 0's.
   *
   * Cleared on every bar line and on every way out, so a jam that was loaded
   * while stopped does not swallow the first bar line of the take that
   * follows.
   */
  const pushedRef = useRef(false);
  /** The id the engine was last loaded with, so an edit is not taken for a load. */
  const loadedIdRef = useRef<string | null>(null);
  /** The bar the form is on right now, or null when not playing a bar. */
  const playingBarRef = useRef<number | null>(null);

  useEffect(() => {
    if (view !== "jam" || !jam || !currentBeat || !isPlaying || countingIn) {
      // A count-in is beats on the same grid but it is not the form, so the
      // bar it reports is not a bar to send ahead of. Drop the anchor and let
      // the first real bar line start the sequence again.
      barRef.current = null;
      pushedRef.current = false;
      playingBarRef.current = null;
      return;
    }
    // A beat event from a build that does not fill `formBar` in yet leaves the
    // arithmetic below as NaN and the bass lookup on `undefined`. Bar one is
    // the honest answer to "which bar", and the click keeps its band.
    const bar = Number.isFinite(currentBeat.formBar) ? currentBeat.formBar : 0;
    playingBarRef.current = bar;
    const at = `${currentBeat.chorus}:${bar}`;
    if (barRef.current === at) return;
    barRef.current = at;
    if (pushedRef.current) {
      pushedRef.current = false;
      return;
    }

    const next = compileJam(jam, { formBar: bar + 1, lineup });
    const signature = bassSignature(next);
    if (sentBassRef.current === signature) return;
    sentBassRef.current = signature;
    void sendJam(jam, next);
    // The bar is the trigger; the jam is read, not watched — an edit goes out
    // through the effect above, which is the one that also carries the meter.
    // `jam?.id` is in the list because a jam loaded while the click is already
    // running arrives on no bar line at all, and without it the first bar of
    // the new jam would be counted as the same bar as the last of the old.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, isPlaying, countingIn, jam?.id, currentBeat?.chorus, currentBeat?.formBar]);

  /**
   * The tempo trainer: up a step every N choruses, on the downbeat.
   *
   * Applied when the CHORUS number changes rather than on a timer, so the
   * change lands on a bar line and the chorus you are in is played at one
   * tempo from start to finish. Drill's ramp wearing a band (JAM_MODE §4.2).
   */
  const chorusRef = useRef<number | null>(null);
  useEffect(() => {
    if (view !== "jam" || !jam || !currentBeat || !isPlaying) {
      chorusRef.current = null;
      return;
    }
    const chorus = currentBeat.chorus;
    const previous = chorusRef.current;
    chorusRef.current = chorus;
    if (previous === null || chorus <= previous) return;

    const practice = jam.practice;
    if (!practice || practice.tempoStep === 0 || practice.tempoEveryChoruses <= 0) return;

    const from = trainedBpm ?? jam.bpm;
    // The chorus that just FINISHED is the one being counted, so it is the
    // one before the number that just arrived.
    const to = tempoAfterChorus({
      bpm: from,
      chorus: previous,
      tempoStep: practice.tempoStep,
      tempoEveryChoruses: practice.tempoEveryChoruses,
    });
    if (to === from) return;
    setTrainedBpm(to);
    void setBpm(to).catch(() => {});
    // `jam?.id` again: loading a jam onto a click that is already running has
    // to anchor the count here, or the first chorus of the new jam is read as
    // a continuation of the last one and its step is swallowed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, isPlaying, jam?.id, currentBeat?.chorus]);

  /** Stop, and the jam is at its own tempo again. */
  useEffect(() => {
    if (isPlaying || trainedBpm === null) return;
    setTrainedBpm(null);
    if (view === "jam" && jam) void setBpm(jam.bpm).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  // -------------------------------------------------------------------------
  // Moving through the form (JAM_MODE §4.2)
  // -------------------------------------------------------------------------

  /** Is anything set, for the effect that clears without watching the state. */
  const positionSetRef = useRef(false);
  positionSetRef.current = loop !== null || pendingJump !== null;

  /**
   * A loop belongs to the jam it was drawn on, and to this sitting of it.
   *
   * Leaving the tab or putting another jam on the stage clears it, and tells
   * the engine so — otherwise the next jam's bar 5 inherits the last one's
   * bridge, which is the kind of bug that gets reported as "it skips".
   */
  const positionKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = view === "jam" && jam ? jam.id : null;
    if (positionKeyRef.current === key) return;
    positionKeyRef.current = key;
    if (!positionSetRef.current) return;
    setLoop(null);
    setPendingJump(null);
    void sendPosition({ jumpTo: null, loop: null });
  }, [view, jam?.id]);

  /** The jump has landed when a beat event reports the bar it asked for. */
  useEffect(() => {
    if (pendingJump === null || !isPlaying || countingIn || !currentBeat) return;
    const bar = Number.isFinite(currentBeat.formBar) ? currentBeat.formBar : 0;
    if (bar === pendingJump) setPendingJump(null);
  }, [pendingJump, isPlaying, countingIn, currentBeat?.formBar, currentBeat?.chorus]);

  /**
   * Which bar the section actions count from.
   *
   * The one playing, or — while stopped — the one the next press of play will
   * start on, which is the pending jump if there is one and bar one if not.
   */
  const currentBar = useMemo(() => {
    if (isPlaying && currentBeat && Number.isFinite(currentBeat.formBar)) return currentBeat.formBar;
    return pendingJump ?? 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, currentBeat?.formBar, pendingJump]);

  /**
   * Go to a bar — at the next bar line, which is the engine's business.
   *
   * The loop goes with it. Inside the looped bars it is re-sent unchanged: a
   * jump inside a looped section is a jump inside a looped section, and the
   * one command says both things without a second round trip that could
   * half-apply. Outside them the loop MOVES to the section the target bar is
   * in: the engine's rule is that the loop catches a jump, so a jump that
   * left the loop where it was would land straight back at its start and
   * "next section" would do nothing with a loop on. Looping and stepping
   * sections together means "loop the next one now".
   */
  const jumpTo = useCallback(
    (bar: number) => {
      if (!jam) return;
      const total = formBars(jam.form);
      if (total <= 0) return;
      const target = Math.min(Math.max(Math.trunc(bar), 0), total - 1);
      let nextLoop = loop;
      if (loop && (target < loop.start || target > loop.end)) {
        const ranges = sectionRanges(jam.form);
        nextLoop = ranges[sectionIndexAt(jam.form, target)] ?? null;
        setLoop(nextLoop);
      }
      setPendingJump(target);
      void sendPosition({ jumpTo: target, loop: nextLoop });
    },
    [jam, loop],
  );

  /** One loop at a time: pressing the one that is on turns it off. */
  const toggleSectionLoop = useCallback(
    (range: BarRange) => {
      const off = !!loop && loop.start === range.start && loop.end === range.end;
      const next = off ? null : range;
      setLoop(next);
      void sendPosition({ jumpTo: null, loop: next });
    },
    [loop],
  );

  /** The next or previous section's first bar, wrapping round the form. */
  const stepToSection = useCallback(
    (by: number) => {
      if (!jam) return;
      jumpTo(stepSection(jam.form, currentBar, by).start);
    },
    [jam, currentBar, jumpTo],
  );

  /** Loop the section the form is in, or stop looping it. */
  const loopCurrentSection = useCallback(() => {
    if (!jam) return;
    const ranges = sectionRanges(jam.form);
    const range = ranges[sectionIndexAt(jam.form, currentBar)];
    if (range) toggleSectionLoop(range);
  }, [jam, currentBar, toggleSectionLoop]);

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
    // The band is written down at creation rather than left to the fallback,
    // so a jam you made on a guitar still has a bass player the day you open
    // it on the machine where you told the app you play bass.
    const created = createJam(t("jam.untitled"), { ...(jam ?? {}), band: jam?.band ?? lineup });
    commit([...jams, created]);
    loadJam(created);
    return created;
  }, [t, jam, jams, commit, loadJam, lineup]);

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

  // -------------------------------------------------------------------------
  // Hands-free (JAM_MODE §4.7). A footswitch sends the same action a key does.
  // -------------------------------------------------------------------------

  /** The next groove along, wrapping. Carries the count-in into its meter. */
  const stepGroove = useCallback(
    (by: number) => {
      setActiveJam((current) => {
        if (!current) return current;
        const at = GROOVES.findIndex((g) => g.id === current.grooveId);
        const next = GROOVES[(((at + by) % GROOVES.length) + GROOVES.length) % GROOVES.length];
        const from = jamMeter(current).beatsPerBar;
        return {
          ...current,
          grooveId: next.id,
          // Stepping grooves with a footswitch has to keep the count-in in
          // BARS, exactly as clicking a card does, or a hop from a waltz to a
          // rock beat lands you on the wrong beat of bar one.
          countIn: carryCountIn(current.countIn, from, next.beatsPerBar),
          // A groove you step to is the preset, not the one you drew. Keeping
          // the custom groove here would make the footswitch do nothing.
          customGroove: undefined,
        };
      });
    },
    [],
  );

  /** Trading on or off, keeping the number of bars it was set to. */
  const toggleTrade = useCallback(() => {
    setActiveJam((current) => {
      if (!current) return current;
      const practice = current.practice ?? NO_PRACTICE;
      return {
        ...current,
        practice: { ...practice, tradeBars: practice.tradeBars > 0 ? 0 : 4 },
      };
    });
  }, []);

  /** Drop-outs on or off, likewise. */
  const toggleDropOut = useCallback(() => {
    setActiveJam((current) => {
      if (!current) return current;
      const practice = current.practice ?? NO_PRACTICE;
      const on = practice.dropOutEvery > 0 && practice.dropOutBars > 0;
      return {
        ...current,
        practice: {
          ...practice,
          dropOutEvery: on ? 0 : practice.dropOutEvery || 8,
          dropOutBars: practice.dropOutBars || 2,
        },
      };
    });
  }, []);

  /**
   * The next shape of the chord on screen.
   *
   * Wrapping is the row's own job — it knows how many shapes the chord has —
   * so this only ever counts up, and `ChordShapesRow` brings it back round.
   */
  const nextShape = useCallback(() => setShapeIndex((i) => i + 1), []);

  /**
   * The hands-free actions as one stable object.
   *
   * One object rather than five props because they are one feature, and
   * memoised because the action dispatcher lists its dependencies and a fresh
   * object every render would rebuild it on every beat event.
   */
  const actions = useMemo(
    () => ({
      nextGroove: () => stepGroove(1),
      prevGroove: () => stepGroove(-1),
      toggleTrade,
      toggleDropOut,
      nextShape,
      nextSection: () => stepToSection(1),
      prevSection: () => stepToSection(-1),
      loopSection: loopCurrentSection,
    }),
    [stepGroove, toggleTrade, toggleDropOut, nextShape, stepToSection, loopCurrentSection],
  );

  /**
   * Where the form is being sent, as one object for the screen.
   *
   * The timeline is the only control here that does not write to the record —
   * moving through a form is not an edit to it — so it gets its own bundle
   * rather than a sixth thing hanging off `screen`.
   */
  const position = useMemo(
    () => ({ loop, pendingJump, jumpTo, toggleSectionLoop }),
    [loop, pendingJump, jumpTo, toggleSectionLoop],
  );

  const screen = useMemo(
    () => ({
      fretboardOpen,
      toggleFretboard: () => setFretboardOpen((open) => !open),
      sevenths,
      setSevenths,
      shapeIndex,
      setShapeIndex,
      pinnedChord,
      setPinnedChord,
      editorOpen,
      setEditorOpen,
      editorPage,
      setEditorPage,
    }),
    [fretboardOpen, sevenths, shapeIndex, pinnedChord, editorOpen, editorPage],
  );

  return {
    jams,
    jam,
    dirty,
    saveFeedback,
    /** The band when the record has not been asked — what the toggles show. */
    lineup,
    /** What the screen is showing that the jam does not remember. */
    screen,
    /** Hands-free: a footswitch sends these exactly as a key does. */
    actions,
    /** The loop, the pending jump, and the two ways to move the form. */
    position,
    /** Where the tempo trainer has got to, or null while it has not moved. */
    trainedBpm,
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
