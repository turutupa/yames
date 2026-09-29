import { useCallback, useEffect, useRef, useState } from "react";
import {
  setlistReduce,
  IDLE_SETLIST_RUN,
  stepRemaining,
  type SetlistEffect,
  type SetlistRunState,
} from "../../../setlist";
import { armCountIn, setPlaying, setVolume } from "../../../ipc";
import { compileJam, lastVoicing } from "../../../jam";
import type { Jam, JamBand } from "../../../jam";
import { applySetlistStep } from "./applySetlistStep";
import { clearJam, lineSignature, sendJam } from "./jamEngine";
import type { MeterSnapshot } from "./jamEngine";
import type { BeatEvent, Setlist, SetlistStep } from "../../../types";

/**
 * Drives a setlist from the engine's beat events.
 *
 * Everything that decides anything lives in `src/setlist/runtime.ts`. This
 * hook only supplies the two clocks the runtime cannot read for itself and
 * carries out the effects it returns.
 *
 * WHERE A BAR BEGINS, and the mistake this used to make. `isDownbeat` on a
 * beat event is `sub == 0` in `engine.rs` — "this tick is a whole beat and
 * not a subdivision" — so it is true once per BEAT. Handed to the runtime as
 * if it were a bar line, it made every bar count in a setlist a beat count:
 * "after 8 bars" moved on after 8 beats, two bars of rest were two beats of
 * it, and an armed switch landed on the next beat instead of at the top of
 * the bar, which is the one thing U9.3 exists to guarantee. A bar opens on
 * `isDownbeat && measureBeat === 0`, the pair the engine itself tests when it
 * opens one (`measure_beat == 0 && sub_count == 0`), and that is what goes
 * out as `barStart`. The field keeps its own meaning everywhere else — the
 * accent dots, the zen visuals, the floating widget all want "a whole beat".
 *
 * `measureBeat` is bar-local and captured before the engine's counters
 * advance. A step whose meter differs from the one before it starts counting
 * from its own bar one, because the engine gives a meter posted at a bar
 * line to the bar that line opened — the switch's bar line and the new
 * meter's bar one are the same bar line, and there is no one-beat bar
 * between them. A step that only changes tempo cannot move the count at all.
 *
 * The clocks are deliberately different in kind, for the reason
 * `usePlaybackClock` gives: bars are counted from engine bar lines, because
 * `BeatEvent` carries no bar length and the beat index does not reset when
 * the meter changes; seconds come from wall time, because a step that
 * changes tempo would otherwise make "two minutes" mean something else.
 */
export type SetlistRunner = {
  state: SetlistRunState;
  /** The step now playing, or null when the setlist is not running. */
  step: SetlistStep | null;
  /** 1-based, for "step 2 of 4". (U9.7) */
  stepNumber: number;
  stepCount: number;
  /** What is left of the current gap, live. (U9.7) */
  remaining: ReturnType<typeof stepRemaining>;
  /** Move on at the next bar line — the manual trigger, and skip-ahead. */
  skip: () => void;
  /** The jam the step now playing is, or null. For the player's readout. */
  jam: Jam | null;
};

/**
 * What a jam step needs from the window that a plain step does not.
 *
 * All of it is read through refs inside the hook, never as dependencies: the
 * jam library, the lineup and the metronome's meter all change for reasons
 * that have nothing to do with the run, and a run that restarted because the
 * user renamed a jam in the sidebar would be a bug nobody could reproduce.
 */
export type SetlistJamContext = {
  /** The jam a step points at, or null when it has been deleted. */
  getJam: (id: string) => Jam | null;
  /** Who is in the band when the record does not say. */
  lineup?: JamBand;
  /** The metronome's own meter, handed back when the run ends. */
  meter?: MeterSnapshot;
  /** True while the engine is counting in — not a bar of the form. */
  countingIn?: boolean;
};

export function useSetlistRunner(
  setlist: Setlist | null,
  isPlaying: boolean,
  currentBeat: BeatEvent | null,
  /** Index to begin on — the step the editor has open. */
  startFrom = 0,
  jamContext?: SetlistJamContext,
  /**
   * Whether a press of Play means "run this setlist".
   *
   * It means that on the setlist tab and nowhere else. Pressing Play on the
   * METRONOME must be a metronome, and this used to be true only by accident:
   * a setlist was null unless you had deliberately opened one, so the run
   * could not start from another tab because there was nothing to run. Then
   * every mode started restoring what you last had open, a setlist began
   * outliving the tab it belongs to, and pressing Play on the metronome
   * started walking somebody's set — changing the subdivision and the beat
   * groups under them once per step, with nothing on screen to say why.
   *
   * Only the START is gated. A run already going keeps going wherever you
   * wander, which is the point of a set: press play, then go and look at
   * something.
   */
  canStart = true,
): SetlistRunner {
  const [state, setState] = useState<SetlistRunState>(IDLE_SETLIST_RUN);
  const stateRef = useRef(state);
  const setlistRef = useRef(setlist);
  setlistRef.current = setlist;
  /**
   * Read through a ref, never a dependency. The effect below starts the run
   * when `isPlaying` turns true; if the starting index were in its dependency
   * array, clicking a different step mid-run would re-dispatch `start` and
   * restart the setlist under the player.
   */
  const startFromRef = useRef(startFrom);
  startFromRef.current = startFrom;

  /** Read through a ref: switching tabs mid-run must not restart anything. */
  const canStartRef = useRef(canStart);
  canStartRef.current = canStart;

  const startedAt = useRef<number | null>(null);
  const lastBeat = useRef<number | null>(null);
  /** Volume to put back after a `rest`, if the run stops inside one. */
  const restingVolume = useRef<number | null>(null);

  // ---------------------------------------------------------------------------
  // Jam steps (JAM_MODE §8.5)
  // ---------------------------------------------------------------------------

  const jamContextRef = useRef(jamContext);
  jamContextRef.current = jamContext;

  /** The jam the engine is carrying for the step now playing, or null. */
  const [playingJam, setPlayingJam] = useState<Jam | null>(null);
  const playingJamRef = useRef<Jam | null>(null);
  /**
   * The metronome's meter, taken before the run's FIRST jam step.
   *
   * Only the first: by the second the engine is already in some groove's
   * meter, and remembering that would be remembering the jam. Handed back
   * when the run ends, exactly as leaving the jam tab hands it back.
   */
  const jamRestoreRef = useRef<MeterSnapshot | null>(null);
  /** The bass and keys the engine is holding, so a bar line can tell if they moved. */
  const jamLinesRef = useRef<string | null>(null);
  /** The voicing the keys player's hand is on, carried across the sends. */
  const jamVoicingRef = useRef<number[] | null>(null);
  /** `chorus:bar` of the last bar line seen, so each is acted on once. */
  const jamBarRef = useRef<string | null>(null);
  /** "The step we just started has bar 0 in flight; say nothing this bar." */
  const jamPushedRef = useRef(false);

  /**
   * Load a jam step's jam, or take the last one away.
   *
   * Called from `applyStep` and nowhere else, so the engine's band and the
   * step the runner thinks it is on can never be two different answers.
   */
  const carryJam = useCallback((step: SetlistStep) => {
    const context = jamContextRef.current;
    const jam = step.jamId && context ? context.getJam(step.jamId) : null;
    // The meter goes into the pocket before the first jam of the run
    // overwrites it, and not after.
    if (jam && !jamRestoreRef.current && context?.meter) {
      jamRestoreRef.current = {
        subdivision: context.meter.subdivision,
        beatGroups: [...context.meter.beatGroups],
        freeMode: context.meter.freeMode,
      };
    }
    // On a bar line, always: the runtime lands every switch on one (U9.3),
    // and a run's first step is applied as playback starts, where the engine
    // is opening bar one anyway. That is what lets the engine give the step's
    // meter to the bar the switch landed on instead of restacking its grid a
    // beat later — see `applySetlistStep`.
    applySetlistStep(step, jam, context?.lineup, true);
    playingJamRef.current = jam;
    setPlayingJam(jam);
    jamLinesRef.current = jam
      ? lineSignature(compileJam(jam, { formBar: 0, lineup: context?.lineup }))
      : null;
    jamVoicingRef.current = null;
    jamBarRef.current = null;
    // Bar 0 is on its way, meter first. The bar-ahead effect below runs on
    // this same commit and must not race past it.
    jamPushedRef.current = !!jam;
  }, []);

  /** The band away and the metronome's own meter back — the end of a run. */
  const releaseJam = useCallback(() => {
    // A setlist of plain steps never touched the band, and must not send a
    // command saying it did.
    const carried = playingJamRef.current !== null || jamRestoreRef.current !== null;
    /*
     * Only a run that ENDS on the jam step has a meter to give back.
     *
     * The pocket is filled on the run's first jam step and emptied here, so a
     * routine of "blues, then alternate picking" restored the meter the
     * metronome had before the whole run — over the picking step's own, which
     * the runner had set one step earlier and which was the meter actually
     * playing. Worse than an audible glitch: the session's mirror reads the
     * engine back into the selected step while stopped, so the restored meter
     * was written into that step and the setlist went dirty. A saved routine
     * quietly acquiring a meter nobody chose is data loss with a Save button
     * in front of it.
     *
     * A jam step that is still the one playing is the only case where the
     * meter on the engine is the jam's, and the only case worth undoing.
     */
    const restore = playingJamRef.current ? jamRestoreRef.current : null;
    jamRestoreRef.current = null;
    playingJamRef.current = null;
    jamLinesRef.current = null;
    jamVoicingRef.current = null;
    jamBarRef.current = null;
    jamPushedRef.current = false;
    setPlayingJam(null);
    // Even with nothing to restore: a run that ended on a jam step has left a
    // table on the engine, and the metronome tab is not a band.
    if (carried) void clearJam(restore);
  }, []);
  // Re-render while a seconds gap counts down; the reduced state only moves
  // on beats, which at 40 bpm is once every second and a half.
  const [, setTick] = useState(0);

  const runClock = useCallback(
    () => (startedAt.current === null ? 0 : (Date.now() - startedAt.current) / 1000),
    [],
  );

  const runEffects = useCallback(
    (effects: SetlistEffect[]) => {
      for (const effect of effects) {
        switch (effect.kind) {
          case "applyStep":
            restingVolume.current = null;
            // Through `carryJam`, never `applySetlistStep` directly: a jam
            // step has a band to load and the step before it may have had one
            // to take away, and that is the same decision as applying the
            // step, not a second one made somewhere else.
            carryJam(effect.step);
            break;
          case "rest":
            // The engine has no rest, so a rest is silence: the step that
            // lands next restores the volume as part of its own config.
            restingVolume.current = setlistRef.current?.steps[stateRef.current.stepIndex]?.volume ?? null;
            void setVolume(0).catch(() => {});
            break;
          case "countIn":
            // After applyStep, never before: the beats have to sound at the
            // tempo of the step they are counting you into.
            void armCountIn(effect.beats).catch(() => {});
            break;
          case "finished":
            void setPlaying(false).catch(() => {});
            break;
        }
      }
    },
    [carryJam],
  );

  const dispatch = useCallback(
    (event: Parameters<typeof setlistReduce>[2]) => {
      const current = setlistRef.current;
      if (!current) return;
      const { state: next, effects } = setlistReduce(current, stateRef.current, event);
      stateRef.current = next;
      setState(next);
      runEffects(effects);
    },
    [runEffects],
  );

  const restoreRestVolume = useCallback(() => {
    if (restingVolume.current === null) return;
    void setVolume(restingVolume.current).catch(() => {});
    restingVolume.current = null;
  }, []);

  // Loading a setlist and pressing play is the whole interaction: the setlist
  // starts with the transport and stops with it.
  useEffect(() => {
    if (!setlist || !isPlaying) {
      // A setlist that ended by itself already stopped playback; treating that
      // as a user stop would wipe the "finished" the transport is showing.
      if (stateRef.current.phase !== "finished" && stateRef.current.phase !== "idle") {
        restoreRestVolume();
        dispatch({ kind: "stop" });
      }
      // The band goes with the run, whichever way it ended, and the metronome
      // gets its own meter back. Outside the phase guard above: a setlist that
      // ended by itself is exactly the case where a table would be left on the
      // engine with nothing playing it (JAM_MODE 8.5).
      releaseJam();
      startedAt.current = null;
      lastBeat.current = null;
      return;
    }
    // Playing, but not from the setlist tab: this press of Play belongs to
    // whatever the user is actually looking at.
    if (!canStartRef.current && stateRef.current.phase === "idle") return;
    startedAt.current = Date.now();
    lastBeat.current = null;
    dispatch({ kind: "start", seconds: 0, from: startFromRef.current });
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [setlist?.id, isPlaying, dispatch, restoreRestVolume, releaseJam]);

  useEffect(() => {
    if (!isPlaying || !currentBeat) return;
    // Subdivisions are not beats, and the engine can re-emit an index.
    if (currentBeat.subdivision !== 0) return;
    if (lastBeat.current === currentBeat.beat) return;
    lastBeat.current = currentBeat.beat;
    // A bar opens where the engine opens one, and nowhere else: a whole beat
    // that is also bar-local position zero. See the note at the top.
    const barStart = currentBeat.isDownbeat && currentBeat.measureBeat === 0;
    dispatch({ kind: "beat", barStart, seconds: runClock() });
  }, [isPlaying, currentBeat, dispatch, runClock]);

  /**
   * The bass and the keys, one bar ahead of themselves.
   *
   * The drums are one bar that repeats and the bass is not: over a twelve-bar
   * blues the bass plays A under bar 1 and D under bar 5. Without this a jam
   * STEP would play bar one's changes for the whole step - the drummer right
   * and the bass player a chord behind for ten minutes, which is worse than
   * no bass player at all.
   *
   * It is the jam tab's rule (`useJamSession`, the bar-ahead effect) with the
   * tab's own concerns absent: nothing here is being edited mid-take, so there
   * is no live-edit case, and the tempo trainer belongs to the jam screen
   * rather than to a step in a routine. What it shares is the half of the
   * handshake the engine matches - a config posted on the downbeat of bar N
   * arrives a few milliseconds in, too late to be bar N's line and exactly in
   * time to be bar N+1's.
   */
  useEffect(() => {
    const jam = playingJamRef.current;
    const context = jamContextRef.current;
    if (!jam || !isPlaying || !currentBeat || context?.countingIn) {
      // A count-in runs on the same tick grid and reports bars like any other,
      // but it is not the form. Drop the anchor and let the first real bar
      // line start the sequence again.
      jamBarRef.current = null;
      return;
    }
    // A beat event from a build that does not fill `formBar` in yet leaves the
    // arithmetic as NaN. Bar one is the honest answer to "which bar".
    const bar = Number.isFinite(currentBeat.formBar) ? currentBeat.formBar : 0;
    const at = `${currentBeat.chorus}:${bar}`;
    if (jamBarRef.current === at) return;
    jamBarRef.current = at;
    if (jamPushedRef.current) {
      // The step that just started posted bar 0's config from inside an async
      // function, and it is still in flight. Sending the next bar now would
      // put the table in front of the meter it was written for, and the engine
      // refuses a table it cannot check.
      jamPushedRef.current = false;
      return;
    }
    const next = compileJam(jam, {
      formBar: bar + 1,
      lineup: context?.lineup,
      previousVoicing: jamVoicingRef.current,
    });
    const signature = lineSignature(next);
    if (jamLinesRef.current === signature) return;
    jamLinesRef.current = signature;
    jamVoicingRef.current = lastVoicing(next.keys);
    void sendJam(jam, next);
    // The bar is the trigger; the jam is read from the ref, not watched - it
    // only ever changes when a step changes, and that goes out through
    // `carryJam` with the meter in front of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, currentBeat?.chorus, currentBeat?.formBar]);

  const skip = useCallback(() => dispatch({ kind: "advance" }), [dispatch]);

  const step = setlist?.steps[state.stepIndex] ?? null;
  const live = runClock() - state.stepStartedAt;
  return {
    state,
    step: state.phase === "idle" || state.phase === "finished" ? null : step,
    stepNumber: state.stepIndex + 1,
    stepCount: setlist?.steps.length ?? 0,
    remaining: setlist ? stepRemaining(setlist, state, live) : null,
    skip,
    jam: playingJam,
  };
}
