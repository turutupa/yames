import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import {
  listJams,
  saveJams,
  setBpm,
  setJamPosition,
  togglePlayback,
  ttsSpeak,
} from "../../../ipc";
import {
  GROOVES,
  STARTER_JAMS,
  carryCountIn,
  compileJam,
  countInCue,
  countInPhraseCues,
  createJam,
  duplicateJam as duplicateJamData,
  formBars,
  formSectionNames,
  jamMeter,
  lastVoicing,
  lineupFor,
  perBeatCountFits,
  renameJam as renameJamData,
  reorderJams as reorderJamsData,
  sectionCue,
  sectionRanges,
  sectionIndexAt,
  sectionStarts,
  shouldSpeak,
  startingBand,
  stepSection,
  tempoAfterChorus,
  tradeCue,
  upsertJam,
} from "../../../jam";
import type { BarRange } from "../../../jam";
import type { Chord } from "../../../jam/harmony";
import type { Jam, JamBandState, JamPositionCommand } from "../../../jam";
import { NO_PRACTICE } from "../../jam/PracticeRow";
import type { GrooveEditorPage } from "../../jam/editor";
import type { BeatEvent } from "../../../types";
/**
 * The engine traffic itself lives next door, because a setlist step can be a
 * jam too (JAM_MODE §8.5) and the runner has to hand the engine exactly what
 * this hook hands it. See `jamEngine.ts` for the order and why it matters.
 */
import {
  clearJam,
  jamSendRefusal,
  lineSignature,
  meterSignature,
  pushJam,
  sendJam,
  subscribeJamSend,
} from "./jamEngine";
import type { MeterSnapshot } from "./jamEngine";

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

/**
 * Said once per session, not once per beat: the position command may not
 * exist yet. `set_jam` has the same guard, over in `jamEngine.ts`.
 */
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


/**
 * The bar the engine will play after this one.
 *
 * The engine's rule, mirrored here because the bass and the keys are sent one
 * bar ahead and "ahead" has to mean the same thing on both sides: a jump it
 * has been asked for wins, a loop wraps at its last bar, and otherwise the
 * next bar is the next bar. Exported for the test that pins it.
 */
export function nextFormBar(
  bar: number,
  loop: BarRange | null,
  pendingJump: number | null,
): number {
  if (pendingJump !== null) return pendingJump;
  if (loop && bar >= loop.end) return loop.start;
  return bar + 1;
}

/**
 * Where the send timings lived before the engine traffic moved out. Re-exported
 * rather than relocated in every reader: `window.__yamesJamLatency` is a
 * debugging address the owner has been given, and it has not moved.
 */
export { jamLatency } from "./jamEngine";

/**
 * What one spoken cue costs, in milliseconds, end to end.
 *
 * Kept for the same reason `jamLatency` is: the per-beat count only works if
 * an utterance is synthesised and started inside one beat, and "it feels fine"
 * is not a number. Piper synthesises to a WAV before it plays, so this is
 * measured rather than assumed, and `perBeatCountFits` reads it to decide
 * whether to count beat by beat or to say the whole count as one phrase.
 * Read it from the console as `window.__yamesJamSpeech` while a jam plays.
 */
export const jamSpeechLatency = { last: 0, worst: 0, says: 0 };

/**
 * Say one thing, and time it. Never throws: a cue is never a requirement.
 *
 * Every cue this speaks is also on the screen, so a voice that is missing,
 * busy or broken costs the player nothing. That is what lets this swallow the
 * error rather than surfacing one — there is no failure here worth a dialog.
 */
async function speakCue(text: string): Promise<void> {
  const started = performance.now();
  try {
    await ttsSpeak(text);
  } catch {
    /* No voice, or a voice that is busy. The screen already said it. */
  } finally {
    const took = performance.now() - started;
    jamSpeechLatency.last = took;
    jamSpeechLatency.says += 1;
    if (took > jamSpeechLatency.worst) jamSpeechLatency.worst = took;
    if (typeof window !== "undefined") {
      (window as unknown as { __yamesJamSpeech?: typeof jamSpeechLatency }).__yamesJamSpeech =
        jamSpeechLatency;
    }
  }
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
   * How the count-in is going, for the spoken count: `done` is how many of
   * `beats` have sounded. `countingIn` above is the same fact as a boolean,
   * and is what the bar-ahead send needs; the cues need the number.
   */
  countIn?: { beats: number; done: number };
  /**
   * Whether a voice is installed (`ModelStatus.voiceReady`).
   *
   * Half of the spoken-cues decision, the other half being the preference
   * below — see `shouldSpeak` in `src/jam/cues.ts`. Passed in rather than
   * read here so this hook stays the thing that decides WHEN to speak and
   * never the thing that decides whether a voice exists.
   */
  voiceReady?: boolean;
  /**
   * Spoken cues, from Settings › Coach › Voice (JAM_UX_DECISIONS A4).
   *
   * A preference, not a property of a tune. Every jam used to carry its own
   * switch, so a player who wanted to be told "your four" had to say so once
   * per jam. `Jam.cues` is still on the record for the jams that set it, and
   * nothing reads it any more.
   */
  cues?: boolean;
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
  countIn,
  voiceReady = false,
  cues = false,
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
   * "Edit changes", and the bar the picker is open on.
   *
   * Screen state and not the record's: which bar you happen to have a picker
   * open on is not something a jam should remember, and neither is whether
   * you were in the mode. The CHANGES themselves are the record's — they go
   * on `jam.progression` through `editJam` like every other edit.
   */
  const [editingChords, setEditingChords] = useState(false);
  const [editingBar, setEditingBar] = useState<number | null>(null);

  /**
   * The two docked sheets (JAM_UX_DECISIONS A1, A8).
   *
   * The jam screen is two states now: a PLAYING screen of five blocks, and
   * everything you set once behind a button. Which sheet is down is screen
   * state for exactly the reason the neck is — a jam is music, not a view —
   * but it has to survive a trip to the metronome tab, and Escape has to
   * reach it, so it lives up here with the rest.
   */
  const [setupOpen, setSetupOpen] = useState(false);
  const [chordsOpen, setChordsOpen] = useState(false);

  /**
   * The kit a Preview button is sounding, or null (JAM_UX_DECISIONS B7).
   *
   * Session state, and deliberately not an edit: a preview is you listening to
   * a kit, not you choosing one, and writing it to the record would mark the
   * jam dirty for a two-bar audition. The engine hears it because the push
   * below compiles from `engineJam`, which is the record with this kit over
   * the top — the same path the real kit takes, which is the point of the
   * feature. The first four kits were measured and never heard; this is how
   * the fifth avoids that.
   */
  const [previewKit, setPreviewKit] = useState<string | null>(null);
  /**
   * The engine's standing refusal, if it has one.
   *
   * Read from the module rather than kept here because the sends happen in
   * `jamEngine`, on their own, with no React around them — and because the
   * setlist runner sends jams through the same door.
   */
  const sendRefusal = useSyncExternalStore(subscribeJamSend, jamSendRefusal, jamSendRefusal);
  /** Bar lines seen since the preview started. Two, then it is over. */
  const previewBarsRef = useRef(0);
  /** True when the preview is what pressed play, so it is what presses stop. */
  const previewStartedRef = useRef(false);
  /**
   * True once the transport has actually been HEARD playing under this
   * preview.
   *
   * `isPlaying` arrives from the engine's state event, so between the press
   * and the answer a preview that started the transport looks exactly like
   * one somebody stopped. This is the difference: before the answer, wait;
   * after it, a stop is a stop.
   */
  const previewLiveRef = useRef(false);

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
  /**
   * The jam as the ENGINE hears it: the record, with a kit being previewed
   * over the top.
   *
   * One derived value rather than a branch at each send, so the preview cannot
   * reach the drums and miss the bar-ahead bass. `customKit` is dropped along
   * with it — auditioning the built-in Raw while a folder of your own samples
   * is selected has to actually play Raw.
   */
  const engineJam = useMemo(
    () => (jam && previewKit ? { ...jam, kit: previewKit, customKit: null } : jam),
    [jam, previewKit],
  );
  const engineJamRef = useRef<Jam | null>(engineJam);
  engineJamRef.current = engineJam;

  const engineKey = jam
    ? JSON.stringify([
        jam.grooveId,
        jam.customGroove,
        jam.feel,
        jam.intensity,
        jam.form,
        jam.fills,
        // Both halves of the fill switch. "Every 4 bars" is a field of its
        // own on the config, so a key that only watched `fills` sat on the
        // change until something else moved and then sent it as a surprise.
        jam.fillEvery,
        jam.kit,
        jam.key,
        jam.band ?? lineup,
        jam.practice,
        // The fourth pass. Every one of these changes the table, the meter or
        // a line in it, so every one of them has to re-send: a chord typed
        // into bar five that the engine never hears is the bug this list
        // exists to prevent.
        jam.progression,
        jam.meter,
        jam.mix,
        jam.keysStyle,
        jam.countInSound,
        // The second pass. The voices and a folder of your own samples change
        // what the band SOUNDS like, and the kit being previewed changes it
        // for two bars — all three have to re-send or the audition is silent.
        jam.bassVoice,
        jam.keysVoice,
        jam.customKit,
        previewKit,
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
      /*
       * Only if THIS hook is what put a band on the engine.
       *
       * The tab is not the only thing that loads a jam: a setlist step can BE
       * one (JAM_MODE §8.5), and the runner puts it there while the window
       * sits on the setlist tab with no jam of its own. An unconditional
       * clear-down here fired on every tab change and on the very first
       * render, so walking from Setlist to Metronome mid-run sent
       * `setJam(null)` and killed the band under a step that was still
       * playing — from a hook that had never loaded anything.
       */
      const mine = loadedIdRef.current !== null || restore !== null;
      sentBassRef.current = null;
      sentMeterRef.current = null;
      voicingRef.current = null;
      loadedIdRef.current = null;
      if (mine) void clearJam(restore);
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
    // Stopped, the engine restarts at the pending jump, else the loop's first
    // bar, else 0 — so that is the bar this table's bass and keys are for.
    const restartBar = pendingJumpRef.current ?? loopRef.current?.start ?? 0;
    // `engineJam`, not `jam`: a kit being previewed is part of what the engine
    // is being asked to play. Everything else on this line is the record's.
    const sending = engineJam ?? jam;
    const config = compileJam(sending, {
      formBar: editingLive ? live + 1 : restartBar,
      lineup,
      // A load starts the keys player's hand fresh, in the middle of the
      // range; an edit mid-take leads on from wherever it already was.
      previousVoicing: editingLive ? voicingRef.current : null,
    });
    /*
     * The meter goes with the table only when the meter has MOVED.
     *
     * Every edit recompiles and re-sends, and most edits are not a meter: a
     * mix slider fires `onEdit` per step of the drag, so a hand on the bass
     * fader pushed free mode, the beat groups and the subdivision at it about
     * thirty times a second — and the meter is what restacks the bar. The
     * table alone is cheap and lands on the next bar line; the meter alone is
     * the thing you can hear going wrong.
     */
    const meterNow = meterSignature(sending);
    const meterMoved = sentMeterRef.current !== meterNow;
    sentMeterRef.current = meterNow;
    pushJam(sending, config, meterMoved);
    // What the engine is now holding, so the next bar line can tell whether
    // it has anything new to say. Recording `null` here would make the next
    // downbeat re-send a bass the engine already has.
    sentBassRef.current = lineSignature(config);
    voicingRef.current = lastVoicing(config.keys);
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
  /**
   * The meter the engine was last given, so an edit that does not move it
   * does not restack the bar. Null on the way out, because the metronome gets
   * its own meter back there and the next push has to say the jam's again.
   */
  const sentMeterRef = useRef<string | null>(null);
  const barRef = useRef<string | null>(null);
  /**
   * The voicing the keys player's hand is on, carried across the sends.
   *
   * Voice leading is a fact about two CONSECUTIVE bars, and each bar is
   * compiled on its own — so somebody has to remember where the hand was, and
   * it is this. Reset on the way out and on a load, so a new take starts in
   * the middle of the range instead of wherever the last one happened to end.
   */
  const voicingRef = useRef<number[] | null>(null);

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
  /**
   * The loop and the jump, as the bar-ahead send has to read them.
   *
   * Refs rather than dependencies: the send is triggered by the bar line and
   * only by the bar line. Watching the loop here would re-send the whole line
   * the moment somebody pressed the loop button, in the middle of a bar.
   */
  const loopRef = useRef<BarRange | null>(loop);
  loopRef.current = loop;
  const pendingJumpRef = useRef<number | null>(pendingJump);
  pendingJumpRef.current = pendingJump;

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

    // Read through the ref, not watched: a preview starting mid-bar goes out
    // through the effect above, which is the one that carries the meter.
    const sending = engineJamRef.current ?? jam;
    const next = compileJam(sending, {
      // The bar the engine will actually play next, which over a loop or a
      // pending jump is not `bar + 1`. Sending ahead of the wrong bar is the
      // whole failure mode this send exists to prevent: with a section on
      // repeat, every pass through the loop's first bar used to be played
      // over the line of the bar AFTER the loop's end.
      formBar: nextFormBar(bar, loopRef.current, pendingJumpRef.current),
      lineup,
      previousVoicing: voicingRef.current,
    });
    const signature = lineSignature(next);
    if (sentBassRef.current === signature) return;
    sentBassRef.current = signature;
    voicingRef.current = lastVoicing(next.keys);
    void sendJam(sending, next);
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
  // Spoken cues (JAM_MODE §4.7). Your eyes are on the neck.
  // -------------------------------------------------------------------------

  /**
   * Whether this jam is speaking at all: the toggle AND a voice.
   *
   * With no voice installed this is false and every effect below is a no-op —
   * silent, with no error and nothing to dismiss. Every cue is also on the
   * screen, so a jam without a voice is not a jam missing anything.
   */
  const speaking = shouldSpeak({ cues, voiceReady });

  /**
   * The count: "one, two, three, four", on the beats, at the tempo.
   *
   * Beat by beat where an utterance fits inside a beat, and as one phrase
   * where it does not — `perBeatCountFits` reads the measurement the last cue
   * left in `jamSpeechLatency`. That is not a nicety: at 160 BPM a beat is
   * 375 ms, and a synthesiser that takes 400 says "two" over the downbeat.
   * The whole-phrase fallback starts on the first beat and is a real count
   * rather than a worse version of the same one.
   */
  const spokenCountRef = useRef(-1);
  useEffect(() => {
    const beats = countIn?.beats ?? 0;
    const done = countIn?.done ?? 0;
    if (!speaking || view !== "jam" || !jam || beats <= 0) {
      spokenCountRef.current = -1;
      return;
    }
    if (done === spokenCountRef.current) return;
    const previous = spokenCountRef.current;
    spokenCountRef.current = done;

    const perBeat = perBeatCountFits({
      bpm: trainedBpm ?? jam.bpm,
      speechMs: jamSpeechLatency.says > 0 ? jamSpeechLatency.worst : null,
    });
    if (!perBeat) {
      // One utterance, on the first beat of the count and nowhere else.
      if (previous !== -1 || done > 1) return;
      const phrase = countInPhraseCues(beats)
        .map((cue) => t(cue.key, cue.params))
        .join(" ");
      if (phrase) void speakCue(phrase);
      return;
    }
    // `done` is how many beats have sounded, so the one that just did is
    // number `done` — and nothing has sounded yet at zero.
    if (done < 1) return;
    const cue = countInCue(done - 1);
    if (cue) void speakCue(t(cue.key, cue.params));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speaking, view, jam?.id, countIn?.beats, countIn?.done]);

  /**
   * "Your four" and "band's back", on the bar line the band hands over.
   *
   * On the CHANGE and not on every bar of it — `tradeCue` takes both states
   * for exactly that reason. The same two words `TradeCue` puts in the corner,
   * so what you hear and what you see are one string.
   */
  const spokenStateRef = useRef<JamBandState | null>(null);
  useEffect(() => {
    if (!speaking || view !== "jam" || !jam || !isPlaying || countingIn || !currentBeat) {
      spokenStateRef.current = null;
      return;
    }
    const current = currentBeat.bandState ?? "full";
    const previous = spokenStateRef.current;
    spokenStateRef.current = current;
    const cue = tradeCue({ previous, current });
    if (cue) void speakCue(t(cue.key, cue.params));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speaking, view, jam?.id, isPlaying, countingIn, currentBeat?.bandState]);

  /**
   * The section, on the bar it starts on, when it has a name.
   *
   * Only AABA names its sections. A blues is three fours and no musician
   * calls them A, B and C, so nothing is said there — a voice announcing
   * every four bars would be the first thing anybody turned off.
   */
  const spokenSectionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!speaking || view !== "jam" || !jam || !isPlaying || countingIn || !currentBeat) {
      spokenSectionRef.current = null;
      return;
    }
    const bar = Number.isFinite(currentBeat.formBar) ? currentBeat.formBar : 0;
    const at = `${currentBeat.chorus}:${bar}`;
    if (spokenSectionRef.current === at) return;
    spokenSectionRef.current = at;
    const cue = sectionCue({
      bar,
      starts: sectionStarts(jam.form),
      names: formSectionNames(jam.form),
    });
    if (cue) void speakCue(t(cue.key, cue.params));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speaking, view, jam?.id, isPlaying, countingIn, currentBeat?.chorus, currentBeat?.formBar]);

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
   * Which bar the section actions count from, and which bar the readout names.
   *
   * The one playing, or — while stopped — the one the next press of play will
   * start on. Three answers in order, and they are the engine's own order for
   * where a restart begins: a jump that has been asked for, else the loop's
   * first bar, else the top of the form. Leaving the loop out of it made the
   * screen say "bar 1" while the band was about to come in on bar 5.
   */
  const currentBar = useMemo(() => {
    if (isPlaying && currentBeat && Number.isFinite(currentBeat.formBar)) return currentBeat.formBar;
    return pendingJump ?? loop?.start ?? 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, currentBeat?.formBar, pendingJump, loop?.start]);

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
    // The sheets belong to the jam that was open. Left down, they would be
    // the first thing the NEXT jam showed, describing the one before it.
    setSetupOpen(false);
    setChordsOpen(false);
  }, []);

  /**
   * Play puts the setup sheet away (A1).
   *
   * The sheet is where you decide; the playing screen is where you read. The
   * moment the band comes in, the thing you need is the timeline it is dimming
   * — so pressing play is also the third way to close it, beside Done and
   * Escape. The chord sheet stays: it is a cheat sheet, and reading it while
   * you play is what it is for.
   */
  useEffect(() => {
    // Unless a kit preview is what pressed play. The Preview buttons are ON
    // the sheet (B7), so closing it on the transport the preview started
    // would take the kit list away from the hand that was auditioning it —
    // and the audition it interrupted was two bars long.
    if (isPlaying && !previewStartedRef.current) setSetupOpen(false);
  }, [isPlaying]);

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
    // so a jam you made on a guitar still has the band you gave it the day you
    // open it on the machine where you told the app you play bass. With no jam
    // to copy it is the drummer and nobody else (JAM_UX_DECISIONS B1) — a
    // brand new jam that opens with a bass line under it is the first thing
    // the owner asked us to stop doing.
    const created = createJam(t("jam.untitled"), {
      ...(jam ?? {}),
      band: jam?.band ?? startingBand(instrument),
    });
    commit([...jams, created]);
    loadJam(created);
    // A new jam has nothing set, so the sheet is where you are (A1). The
    // playing screen behind it is a form nobody has chosen yet.
    setSetupOpen(true);
    return created;
  }, [t, jam, jams, commit, loadJam, instrument]);

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
   * Two bars of the current groove on another kit (JAM_UX_DECISIONS B7).
   *
   * Through the normal engine path and nothing else: the kit goes over the
   * record, the push effect compiles and sends exactly as it would for a real
   * edit, and what you hear is the band you would get. A second sample player
   * would be a second answer to "what does this kit sound like", and it would
   * be the one that was wrong.
   *
   * Pressing it while stopped starts the transport with no count-in — a count
   * before a two-bar audition is more count than audition — and stops it
   * again at the end. Pressing it while the band already plays leaves the
   * transport alone; you are auditioning INTO the take, which is the better
   * way to choose a kit anyway.
   */
  const stopKitPreview = useCallback(() => {
    setPreviewKit(null);
    previewBarsRef.current = 0;
    previewLiveRef.current = false;
    if (!previewStartedRef.current) return;
    previewStartedRef.current = false;
    void togglePlayback().catch(() => {});
  }, []);

  const startKitPreview = useCallback(
    (kit: string) => {
      previewBarsRef.current = 0;
      previewLiveRef.current = false;
      setPreviewKit((current) => {
        if (current === kit) {
          // The same button again is Stop. The transport is put back by the
          // effect below, which sees the preview end either way.
          return null;
        }
        return kit;
      });
      if (previewKit === kit) {
        if (previewStartedRef.current) {
          previewStartedRef.current = false;
          void togglePlayback().catch(() => {});
        }
        return;
      }
      if (!isPlaying && !previewStartedRef.current) {
        previewStartedRef.current = true;
        void togglePlayback().catch(() => {});
      }
    },
    [isPlaying, previewKit],
  );

  /**
   * The preview's own clock: two bar lines, then back to the jam's kit.
   *
   * Counted in BARS off the engine's own beat events rather than on a timer,
   * so it is two bars at any tempo and it ends on a bar line like everything
   * else this mode does.
   */
  useEffect(() => {
    if (!previewKit) return;
    if (!isPlaying) {
      // Stopped — but which kind of stopped?
      //
      // `isPlaying` is the engine's own state event coming back, so on the
      // render right after a preview pressed play it is STILL false: the
      // press has gone out and the answer has not come back. Reading that as
      // "somebody pressed stop" cancelled the audition on the frame it
      // started, closed the sheet behind it and left the transport running
      // with no preview to end it. So a preview that started the transport
      // waits here for the event it is expecting.
      //
      // It waits ONCE, though: `previewLiveRef` goes up the moment the
      // transport is actually heard, so a player who presses stop mid-preview
      // still ends it — and ends it without pressing play again on the way
      // out, because the transport is already stopped.
      if (previewStartedRef.current && !previewLiveRef.current) return;
      // Somebody pressed stop under it. The audition is over and the
      // transport is already where it should be.
      previewStartedRef.current = false;
      previewLiveRef.current = false;
      setPreviewKit(null);
      previewBarsRef.current = 0;
      return;
    }
    previewLiveRef.current = true;
    previewBarsRef.current += 1;
    if (previewBarsRef.current > 2) stopKitPreview();
  }, [previewKit, isPlaying, currentBeat?.chorus, currentBeat?.formBar, stopKitPreview]);

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
    // `currentBar` goes with them: while stopped it is where the next press of
    // play will start, and the timeline has to light that bar rather than the
    // top of the form. One value, so the readout and the section actions can
    // never disagree about which bar you are on.
    () => ({ loop, pendingJump, currentBar, jumpTo, toggleSectionLoop }),
    [loop, pendingJump, currentBar, jumpTo, toggleSectionLoop],
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
      editingChords,
      setEditingChords,
      editingBar,
      setEditingBar,
      setupOpen,
      setSetupOpen,
      chordsOpen,
      setChordsOpen,
    }),
    [
      fretboardOpen,
      sevenths,
      shapeIndex,
      pinnedChord,
      editorOpen,
      editorPage,
      editingChords,
      editingBar,
      setupOpen,
      chordsOpen,
    ],
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
    /** The kit a Preview is sounding, and the button that starts one. */
    previewKit,
    startKitPreview,
    /**
     * True while the engine is refusing a configuration that names a folder
     * of your own samples — so the kit picker can say so instead of leaving
     * the built-in kit playing under a folder that looks chosen.
     */
    customKitRefused: !!sendRefusal?.customKit,
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
