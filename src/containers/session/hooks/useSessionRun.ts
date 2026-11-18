/**
 * The Session, driving the app: the effects half of `src/session/runner.ts`.
 *
 * The reducer decides; this does. It crosses modes that were built to be
 * mutually exclusive (`CONVERSION_AUDIT.md` §4), so three rules hold throughout:
 *
 * - **It goes through the doors that exist.** A Session is a coach session:
 *   `useSession.startSession` opens the input and `endSession` stops the
 *   analyzer, reads the final report and saves it, in that order, or there is no
 *   history (TOOLS_PARITY §3.1 item 4). A Take is a Songs pass: `useSongAttempt`
 *   runs the stop. Moving between screens is `setView`, which stops playback.
 * - **The engine is told things one at a time.** Every send goes through one
 *   queue, because a jam's table and a song's table refuse each other in the wrong
 *   order, and a refusal is silence rather than an error.
 * - **The player's metronome is put back.** A warm-up has to set a tempo and a
 *   meter, which the app persists. A Session must not leave the Metronome tab at
 *   its warm-up tempo, so what was there is noted at the start and restored at the
 *   end, the same courtesy `useSetlistRunner` pays.
 *
 * Nothing here records a take or opens a camera: both have a consent door a
 * Session does not go through yet.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  clearScoreSchedule,
  clearSong,
  configureSpeedRamp,
  listExerciseCeilings,
  listPathStates,
  listPathTakes,
  loadScoreSchedule,
  loadSong,
  onJamEnded,
  onScoreOnset,
  savePathState,
  savePathTake,
  setBeatGroups,
  setBpm,
  setFreeMode,
  setPlaying,
  setSongMix,
  setSubdivision,
  startSpeedRamp,
  stopSpeedRamp,
  storeLoad,
  storeSave,
} from "../../../ipc";
import type { PathStateRow, PathTakeRow } from "../../../ipc";
import { compileJam } from "../../../jam";
import type { Jam, JamBand } from "../../../jam";
import { clearJam, pushJam } from "../../main-window/hooks/jamEngine";
import type { MainView } from "../../main-window/MainHeader";
import { useSongAttempt } from "../../songs/review/useSongAttempt";
import { useLiveNoteLights } from "../../songs/review/useLiveNoteLights";
import { newAttemptId } from "../../../songs/attempt";
import { DEFAULT_MIX_SETTING, engineMix } from "../../../songs/songEngine";
import type { BeatPosition } from "../../../songs/position";
import type { AppState, Subdivision } from "../../../types";
import type { Exercise, PathDoc, Step } from "../../../paths/format";
import { FIRST_PATH_ID, findExercise, isRunnable, loadAllPacks } from "../../../session/packs";
import { gradeTake } from "../../../session/grade";
import type { BarCheck, TakeGrade } from "../../../session/grade";
import { measureTake } from "../../../session/takeMeasures";
import type { TakeMeasures } from "../../../session/takeMeasures";
import { PLAN_MINUTES, TEST_OUT_MINUTES, edgeStep, planSession, replanRest, testOutSteps } from "../../../session/planner";
import { SUBSCRIPTION_CAP } from "../../../session/rotation";
import type { PlanMinutes, PlanStep, SessionPlan } from "../../../session/planner";
import {
  NO_PROGRESS,
  chosenLevelOf,
  cleanTempoOf,
  currentStepOf,
  factsOf,
  isStepPassed,
  isSubscribed,
  lastCaughtTake,
  levelEntryStep,
  levelOfStep,
  levelStartIndex,
  nextStepAfterPass,
  takesOf,
} from "../../../session/progress";
import { levelsOf } from "../../../session/variants";
import type { PlayerProgress, TakeFacts } from "../../../session/progress";
import {
  IDLE,
  TIMED_BPM_STEP,
  bigAction,
  canGoBack,
  currentStep,
  eventForBigAction,
  runReducer,
  timedBpm,
  timedTempoAdjustable,
  tempoNudges,
} from "../../../session/runner";
import type { BigAction, RunState, TakeOutcome } from "../../../session/runner";
import { TAKE_COUNT_IN_BARS, buildTake } from "../../../session/take";
import { GUITAR_BAND, bandVolumeFor, buildTakeBand, readBandVolume, takeMix } from "../../../session/takeBand";
import type { SongBacking } from "../../../songs/types";
import { DEFAULT_PRACTICE_VIEW, isPracticeView, nextPracticeView } from "../highway/runwayModel";
import type { PracticeView } from "../highway/runwayModel";
import type { TakePlan } from "../../../session/take";

/** How many Takes are read back for planning. More than any plan looks at. */
const TAKES_TO_READ = 500;
const MINUTES_KEY = "session.minutes";
/** Paths the player unsubscribed from; their rows and Takes stay (`PlayerProgress.unsubscribed`). */
const UNSUBSCRIBED_KEY = "session.unsubscribed";
/** Neck or runway on the Take screen (plans/tasks/mvp/RUNWAY.md). A tester's own A/B switch. */
const PRACTICE_VIEW_KEY = "practiceView";
/** The one-time "Switch views any time" hint has been shown and seen. */
const VIEW_HINT_KEY = "session.viewHintSeen";
/** How loud the band is under a jam-backed Take, 0..1.5 (0 is the click alone). */
const BAND_VOLUME_KEY = "session.bandVolume";
const TICK_MS = 1000;
/** Minutes per Exercise in Test out: one Take at the pass tempo, and a breath. */
/** How many recent timing deviations the running screen's strip shows. */
const STRIP_NOTES = 24;

/** What the running screen shows while a Take is going, as data allows. */
export type LiveTake = {
  heard: number;
  missed: number;
  /** Bars finished, from the engine's own position. */
  bars: number;
  countingIn: boolean;
  /** The latest notes against the grid, in ms. Negative is early. */
  deviations: number[];
};

const NO_LIVE: LiveTake = { heard: 0, missed: 0, bars: 0, countingIn: false, deviations: [] };

type EngineSnapshot = {
  bpm: number;
  subdivision: Subdivision;
  beatGroups: number[];
  freeMode: boolean;
};

export type SessionRunInput = {
  view: MainView;
  setView: (view: MainView) => void;
  isPlaying: boolean;
  beat: BeatPosition | null;
  state: AppState;
  /** The coach session. Its call order is what keeps history. */
  coach: {
    active: boolean;
    /** `active` as of the calls made, not the last render (`useSession`). */
    isActive?: () => boolean;
    cardOpen: boolean;
    startSession: () => Promise<void>;
    endSession: () => Promise<void>;
    toggleCard: () => void;
  };
  listening: boolean;
  /**
   * The guitar comes in through an interface (the selected input device is one
   * the engine recognises as such), so nothing the speakers play reaches it.
   * Absent or false: a microphone, or a device nobody can vouch for.
   */
  directInput?: boolean;
  /** The jam library, for a jam step. */
  jams: Jam[];
  lineup?: JamBand;
  /**
   * Load the player's Paths and progress even off the learning side: the
   * first-run wizard asks where to start, and can be opened over a tool.
   */
  preload?: boolean;
};

/** The current step's Exercise and its Path, when it has one. */
function exerciseOf(
  step: PlanStep | null,
  paths: readonly PathDoc[],
): { path: PathDoc; step: Step; exercise: Exercise } | null {
  if (!step || step.kind === "drill") return null;
  if (!step.pathId || !step.exerciseId) return null;
  const path = paths.find((p) => p.id === step.pathId);
  if (!path) return null;
  const found = findExercise(path, step.exerciseId);
  return found ? { path, ...found } : null;
}

/**
 * The player's Paths, in their order: the ones subscribed (started, and not
 * unsubscribed since), or, for a player who has started none, the one
 * everybody starts on.
 */
export function playerPaths(paths: readonly PathDoc[], progress: PlayerProgress): PathDoc[] {
  const mine = progress.states
    .filter((state) => isSubscribed(progress, state.pathId))
    .map((state) => paths.find((p) => p.id === state.pathId))
    .filter((path): path is PathDoc => !!path && isRunnable(path.id));
  if (mine.length > 0 || progress.states.length > 0) return mine;
  const first = paths.find((p) => p.id === FIRST_PATH_ID);
  return first ? [first] : [];
}

/** Why a subscribe did not happen. */
export type SubscribeRefusal = "cap" | null;

/**
 * Where a Session goes back to when it ends: Exit, Escape, or the recap's Done.
 *
 * The screen it was started from (QA 2026-11-17: Escape on an Exercise played
 * from a Step's page landed on Today). Today's Start goes back to Today; a
 * Step's Play this, Find my edge and Test out go back to that Step, which keeps
 * its place because the Paths screen's place is kept above it
 * (`usePathsPlace`). Anything that is not a learning screen, or a Session
 * started from inside a Session, goes back to Today, the front door.
 */
/**
 * The gradable Exercise after this one on its Step, or the first of the Steps
 * after it. Null at the end of the Path.
 */
export function followingExercise(
  paths: readonly PathDoc[],
  pathId: string,
  exerciseId: string,
): { path: PathDoc; step: Step; exercise: Exercise } | null {
  const path = paths.find((p) => p.id === pathId);
  if (!path) return null;
  const all = path.steps.flatMap((step) =>
    step.exercises.filter((e) => e.grading === "graded" && e.tempo.passAtBpm !== null).map((exercise) => ({ path, step, exercise })),
  );
  const at = all.findIndex((x) => x.exercise.id === exerciseId);
  return at >= 0 ? all[at + 1] ?? null : null;
}

/** The variant a step plays: an Exercise's, or a warm-up's. */
function seedOf(step: PlanStep | null): number | null {
  if (step?.kind === "exercise") return step.variantSeed;
  if (step?.kind === "metronome") return step.variantSeed ?? null;
  return null;
}

export function sessionOrigin(view: MainView): MainView {
  return view === "today" || view === "paths" || view === "progress" || view === "tools"
    ? view
    : "today";
}

/** The number a result is about, on the scale it is written in. */
function headlineFacts(grade: TakeGrade): Pick<
  TakeFacts,
  "headlineMetric" | "headlineValue" | "headlineMin" | "headlineMax"
> {
  const check: BarCheck | null = grade.headline;
  if (!check) return {};
  return {
    headlineMetric: check.metric,
    headlineValue: check.value,
    ...(check.min === undefined ? {} : { headlineMin: check.min }),
    ...(check.max === undefined ? {} : { headlineMax: check.max }),
  };
}

/** The last time this number was heard on this Exercise, to show it move. */
function previousValueOf(
  takes: readonly PathTakeRow[],
  metric: string | undefined,
): number | null {
  if (!metric) return null;
  for (const take of takes) {
    if (!take.caught) continue;
    const facts = factsOf(take);
    if (facts.headlineMetric === metric && typeof facts.headlineValue === "number") {
      return facts.headlineValue;
    }
  }
  return null;
}

/** What makes one Take a different one to load: its notes, tempo and length. */
function takeKey(take: TakePlan, takeNumber: string): string {
  return `${takeNumber}|${take.pathId}|${take.exercise.id}|${take.bpm}|${take.bars}|${take.source.length}`;
}

export function useSessionRun(input: SessionRunInput) {
  const { view, setView, isPlaying, beat, listening } = input;
  const [run, dispatch] = useReducer(runReducer, IDLE);
  const [paths, setPaths] = useState<PathDoc[]>([]);
  const { i18n } = useTranslation();
  const packLanguage = i18n.resolvedLanguage ?? i18n.language ?? "en";
  const [progress, setProgress] = useState<PlayerProgress>(NO_PROGRESS);
  const [minutes, setMinutesState] = useState<PlanMinutes>(10);
  const [practiceView, setPracticeViewState] = useState<PracticeView>(DEFAULT_PRACTICE_VIEW);
  const [viewHintSeen, setViewHintSeen] = useState(false);
  /** The player's band volume, or null for "never set" (the default then depends on the input). */
  const [bandChoice, setBandChoice] = useState<number | null>(null);
  /** The band on the engine now (a Take's, or the finisher's), for live volume moves. */
  const loadedBand = useRef<SongBacking | null>(null);
  /** The song on the engine is the finisher's, which its step's stop clears. */
  const finisherLoaded = useRef(false);
  const practiceViewRef = useRef(practiceView);
  practiceViewRef.current = practiceView;
  /**
   * The Take the engine holds, once its song, mix and schedule are loaded.
   * Kept as the Take itself rather than a flag: a new Take (Go again at a new
   * tempo) is unprepared in the very render it appears in, so a quick press of
   * Start or the pedal cannot begin it on the last Take's song while the new
   * one is still loading.
   */
  const [preparedTake, setPreparedTake] = useState<string | null>(null);
  const [engineTrouble, setEngineTrouble] = useState<string | null>(null);
  const [live, setLive] = useState<LiveTake>(NO_LIVE);
  // Stamped once a view opens, so a plan does not rebuild on every second.
  const [planClock, setPlanClock] = useState(() => Date.now());

  const latest = useRef(input);
  latest.current = input;
  /** Where this Session was started from (`sessionOrigin`). Set by `begin`. */
  const origin = useRef<MainView>("today");
  const runRef = useRef<RunState>(run);
  runRef.current = run;

  /** One queue for every send to the engine. See the top of this file. */
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = useCallback((work: () => Promise<unknown>) => {
    const next = queue.current.then(work).catch((err) => {
      console.warn("[yames] the session could not reach the engine", err);
    });
    queue.current = next;
    return next;
  }, []);

  const snapshot = useRef<EngineSnapshot | null>(null);
  /** What the last teardown handed back: a Session begun from the recap keeps it. */
  const restoredTo = useRef<EngineSnapshot | null>(null);
  const cardWasOpen = useRef(false);
  /**
   * The coach session this Session started, and the end of it while that is
   * still running. A coach session the player already had running is theirs:
   * the Session rides along in it and leaves it running, rather than ending it
   * and writing their own practice into the Session's history row.
   *
   * Read instead of `coach.active`, which is a render behind: pressing Start
   * again right after Exit saw the old session still active, took it for the
   * player's own, and did not start one, and the end then switched the input
   * off (B1). `useSession` runs the end and the start in turn; these only
   * decide whose it is.
   */
  const ownsCoach = useRef(false);
  const coachEnding = useRef<Promise<unknown> | null>(null);

  // --- what the store knows ------------------------------------------------
  const loadedRef = useRef(false);
  const refresh = useCallback(async () => {
    const [states, takes, ceilings, unsubscribed] = await Promise.all([
      listPathStates().catch(() => [] as PathStateRow[]),
      listPathTakes(TAKES_TO_READ).catch(() => [] as PathTakeRow[]),
      listExerciseCeilings().catch(() => []),
      storeLoad<string[]>(UNSUBSCRIBED_KEY).catch(() => undefined),
    ]);
    setProgress({
      states,
      takes,
      ceilings,
      unsubscribed: Array.isArray(unsubscribed) ? unsubscribed.filter((id) => typeof id === "string") : [],
    });
  }, []);

  // The learning side is on screen, or the first-run wizard is asking about it.
  const wantsLearning =
    view === "today" || view === "paths" || view === "progress" || view === "session" || input.preload === true;
  useEffect(() => {
    if (!wantsLearning) return;
    setPlanClock(Date.now());
    if (loadedRef.current) return;
    loadedRef.current = true;
    void refresh();
    void storeLoad<number>(MINUTES_KEY).then((saved) => {
      if (PLAN_MINUTES.includes(saved as PlanMinutes)) setMinutesState(saved as PlanMinutes);
    });
    void storeLoad<string>(PRACTICE_VIEW_KEY).then((saved) => {
      // "tab" is new (2026-11-17); a value this build does not know keeps the default.
      if (isPracticeView(saved)) setPracticeViewState(saved);
    });
    void storeLoad<boolean>(VIEW_HINT_KEY).then((seen) => {
      if (seen === true) setViewHintSeen(true);
    });
    void storeLoad<number>(BAND_VOLUME_KEY).then((saved) => {
      setBandChoice(readBandVolume(saved));
    });
  }, [wantsLearning, refresh]);

  // The packs, in the language on screen: loaded with the learning side, and
  // again when the language changes. Ids and notes are the same in every
  // language, so a plan or a Take in progress keeps its place.
  const packsLanguage = useRef<string | null>(null);
  useEffect(() => {
    if (!wantsLearning || packsLanguage.current === packLanguage) return;
    packsLanguage.current = packLanguage;
    let current = true;
    let done = false;
    void loadAllPacks(packLanguage).then((docs) => {
      done = true;
      if (current) setPaths(docs);
    });
    return () => {
      current = false;
      // Interrupted before it arrived: the next run must load it again.
      if (!done && packsLanguage.current === packLanguage) packsLanguage.current = null;
    };
  }, [wantsLearning, packLanguage]);

  const setMinutes = useCallback((next: PlanMinutes) => {
    setMinutesState(next);
    void storeSave(MINUTES_KEY, next).catch(() => {});
  }, []);

  /** The band's level, per player, kept. */
  const setBandVolume = useCallback((next: number) => {
    const level = readBandVolume(next) ?? 0;
    setBandChoice(level);
    void storeSave(BAND_VOLUME_KEY, level).catch(() => {});
  }, []);

  /** The one-time hint is done with: switched once, or read once. */
  const dismissViewHint = useCallback(() => {
    setViewHintSeen((seen) => {
      if (!seen) void storeSave(VIEW_HINT_KEY, true).catch(() => {});
      return true;
    });
  }, []);

  const setPracticeView = useCallback(
    (next: PracticeView) => {
      setPracticeViewState(next);
      void storeSave(PRACTICE_VIEW_KEY, next).catch(() => {});
      dismissViewHint();
    },
    [dismissViewHint],
  );

  const myPaths = useMemo(() => playerPaths(paths, progress), [paths, progress]);

  const plan: SessionPlan = useMemo(
    () => planSession({ minutes, now: planClock, paths: myPaths, progress }),
    [minutes, planClock, myPaths, progress],
  );

  // --- what is on the stage ------------------------------------------------
  const step = currentStep(run);
  const current = useMemo(() => exerciseOf(step, paths), [step, paths]);

  const take: TakePlan | null = useMemo(() => {
    if (!current) return null;
    // A metronome step shows its Exercise at its own tempo, and is not a Take.
    const bpm =
      run.bpm || (step?.kind === "metronome" ? step.bpm : step?.kind === "jam" ? (step.bpm ?? 0) : 0);
    // A warm-up carries a variant too, so its notes change from Session to Session.
    const variantSeed = seedOf(step);
    return bpm > 0 ? buildTake(current.path, current.exercise, bpm, variantSeed) : null;
    // `run.bpm`, the Exercise and its variant are the whole of what a Take is built from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, run.bpm, seedOf(step)]);
  // Which Take of this step it is: Go again at the same tempo is the same
  // notes, and still a new Take that has to be loaded before it can start.
  const takeRef = useRef(take);
  takeRef.current = take;

  // The view hint is shown on a warm-up with an Exercise: once one is over, it has been read.
  const hintPhase = useRef(run.phase);
  useEffect(() => {
    if (hintPhase.current === "timed" && run.phase !== "timed" && takeRef.current) dismissViewHint();
    hintPhase.current = run.phase;
  }, [run.phase, dismissViewHint]);
  const takeNumber = `${run.stepIndex}|${run.takes}`;
  const prepared = take !== null && preparedTake === takeKey(take, takeNumber);

  const onExercise = step?.kind === "exercise";
  // A graded Take on a microphone starts with the band off (see `bandVolumeFor`).
  const bandVolume = bandVolumeFor(bandChoice, input.directInput === true, onExercise);
  const bandVolumeRef = useRef(bandVolume);
  bandVolumeRef.current = bandVolume;
  // A move of the slider (or the input changing) is heard at once, on the band loaded now.
  useEffect(() => {
    void enqueue(async () => {
      const band = loadedBand.current;
      if (band) await setSongMix(takeMix(band, bandVolumeRef.current, DEFAULT_MIX_SETTING.mix.click));
    });
  }, [bandVolume, enqueue]);

  const attempt = useSongAttempt({
    score: onExercise && take ? take.score : null,
    scoreId: null,
    range: take?.range ?? { startBar: 0, endBar: 0 },
    loop: false,
    tempoPercent: 100,
    bpm: take?.bpm ?? 120,
    // Only a Take's own edge. A warm-up's click stopping is not a pass.
    isPlaying: isPlaying && onExercise,
    listening,
  });

  const lights = useLiveNoteLights({
    schedule: onExercise ? (take?.schedule ?? null) : null,
    beatInRange: beat && !beat.songCountIn ? beat.songTick / 960 : 0,
    isPlaying: isPlaying && onExercise,
    bpm: take?.bpm,
  });

  // --- entering a step -----------------------------------------------------
  const stopTimed = useCallback(
    (kind: PlanStep["kind"] | null) =>
      enqueue(async () => {
        await setPlaying(false).catch(() => {});
        if (kind === "jam") {
          await clearJam(null);
          // The finisher plays its band as a song. Only its own: a Take that
          // was queued ahead of this stop has already replaced it.
          if (finisherLoaded.current) {
            finisherLoaded.current = false;
            await clearSong().catch(() => {});
            loadedBand.current = null;
          }
        }
        if (kind === "drill") await stopSpeedRamp().catch(() => {});
      }),
    [enqueue],
  );

  /** The timed step whose sound is on: which step, and which of its runs (Start, Resume, Restart). */
  const lastEntered = useRef<{ index: number; kind: PlanStep["kind"]; runs: number } | null>(null);
  const prepareId = useRef(0);

  /** Get a Take onto the engine: the song, the mix, then the schedule. */
  useEffect(() => {
    if (run.phase !== "ready" || !take || !onExercise) return;
    const mine = ++prepareId.current;
    setPreparedTake(null);
    setEngineTrouble(null);
    setLive(NO_LIVE);
    void enqueue(async () => {
      try {
        const importer = await import("../../../songs/import");
        const transport = importer.buildTransport(take.score, take.range, {
          loops: false,
          tempoPercent: 100,
          countInBars: TAKE_COUNT_IN_BARS,
          startTick: 0,
        });
        // The band the Exercise asks for, in the song itself: one transport,
        // one clock, and none of its notes in the schedule the scorer reads.
        const band = buildTakeBand(take.exercise, take.bars, take.bpm, latest.current.lineup ?? GUITAR_BAND);
        finisherLoaded.current = false;
        await loadSong(transport, band);
        loadedBand.current = band;
        await setSongMix(
          band
            ? takeMix(band, bandVolumeRef.current, DEFAULT_MIX_SETTING.mix.click)
            : engineMix(DEFAULT_MIX_SETTING, 0),
        );
        await loadScoreSchedule(take.schedule, take.exercise.passBars, take.pitches);
        if (prepareId.current === mine) setPreparedTake(takeKey(take, takeNumber));
      } catch (err) {
        if (prepareId.current !== mine) return;
        setEngineTrouble(typeof err === "string" ? err : "load");
      }
    });
  }, [run.phase, take, onExercise, enqueue]);

  /** Start whatever a timed step is. It moves on by the clock, in the reducer. */
  useEffect(() => {
    if (run.phase !== "timed" || !step || run.paused || run.ended) return;
    const entered = lastEntered.current;
    if (entered?.index === run.stepIndex && entered.runs === run.runs) return;
    lastEntered.current = { index: run.stepIndex, kind: step.kind, runs: run.runs };
    const { jams, lineup, state } = latest.current;
    const finisher = step.kind === "jam" ? takeRef.current : null;
    // The player's tempo (- / + on the ready screen or while paused), else the step's.
    const bpmNow = run.bpm;
    void enqueue(async () => {
      await setPlaying(false).catch(() => {});
      // A Restart of a ramp: from its first rung again.
      if (step.kind === "drill") await stopSpeedRamp().catch(() => {});
      await clearScoreSchedule().catch(() => {});
      await clearSong().catch(() => {});
      loadedBand.current = null;
      await clearJam(null);
      if (step.kind === "metronome") {
        await setBpm(bpmNow > 0 ? bpmNow : step.bpm).catch(() => {});
        await setFreeMode(false).catch(() => {});
        await setBeatGroups([4]).catch(() => {});
        await setSubdivision(step.subdivision as Subdivision).catch(() => {});
        await setPlaying(true).catch(() => {});
      } else if (step.kind === "jam" && step.exerciseId && finisher) {
        // The finisher: its Exercise over the band it asks for, looping, at a
        // tempo already passed. Nothing is scheduled for the scorer: ungraded.
        const band = buildTakeBand(finisher.exercise, finisher.bars, finisher.bpm, lineup ?? GUITAR_BAND);
        if (band) {
          const importer = await import("../../../songs/import");
          const transport = importer.buildTransport(finisher.score, finisher.range, {
            loops: true,
            tempoPercent: 100,
            countInBars: TAKE_COUNT_IN_BARS,
            startTick: 0,
          });
          try {
            await loadSong(transport, band);
            finisherLoaded.current = true;
            loadedBand.current = band;
            await setSongMix(takeMix(band, bandVolumeRef.current, DEFAULT_MIX_SETTING.mix.click));
            await setPlaying(true).catch(() => {});
            return;
          } catch (err) {
            console.warn("[yames] the finisher's band would not load; the jam plays instead", err);
          }
        }
        const first = jams[0];
        if (!first) return;
        const jam = step.bpm ? { ...first, bpm: bpmNow || step.bpm } : first;
        pushJam(jam, compileJam(jam, { formBar: 0, lineup }));
        await setPlaying(true).catch(() => {});
      } else if (step.kind === "jam") {
        const first = jams[0];
        if (!first) return;
        // The finisher plays at a tempo already passed on its Exercise.
        const jam = step.bpm ? { ...first, bpm: bpmNow || step.bpm } : first;
        pushJam(jam, compileJam(jam, { formBar: 0, lineup }));
        await setPlaying(true).catch(() => {});
      } else if (step.kind === "drill") {
        const ramp = state.speedRamp;
        await configureSpeedRamp({
          startBpm: step.startBpm,
          targetBpm: step.targetBpm,
          increment: ramp.increment,
          decrement: ramp.decrement,
          barsPerStep: ramp.barsPerStep,
          beatsPerBar: ramp.beatsPerBar,
          mode: ramp.mode,
          cyclic: ramp.cyclic,
          warmupBeats: ramp.warmupBeats,
          aggressiveness: ramp.aggressiveness,
        }).catch(() => {});
        await startSpeedRamp().catch(() => {});
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.phase, run.stepIndex, run.paused, run.runs, step, enqueue]);

  /** Leaving a timed step for anything else, or pausing it: stop what it started. */
  useEffect(() => {
    const entered = lastEntered.current;
    if (!entered) return;
    if (run.phase === "timed" && entered.index === run.stepIndex && !run.paused && !run.ended) return;
    lastEntered.current = null;
    void stopTimed(entered.kind);
  }, [run.phase, run.stepIndex, run.paused, run.ended, stopTimed]);

  // --- the clock -----------------------------------------------------------
  const running = run.phase !== "idle" && run.phase !== "recap";
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => dispatch({ type: "tick", now: Date.now() }), TICK_MS);
    return () => clearInterval(timer);
  }, [running]);

  // --- a Take's edges ------------------------------------------------------
  const wasPlaying = useRef(false);
  const barsReached = useRef(0);
  /** The piece played to its end and stopped itself, rather than being stopped. */
  const playedOut = useRef(false);
  /** When the Take on the stage started, for its row in the history. */
  const takeStartedAt = useRef(0);
  useEffect(() => {
    const was = wasPlaying.current;
    wasPlaying.current = isPlaying;
    if (isPlaying && !was && run.phase === "ready" && onExercise) {
      barsReached.current = 0;
      playedOut.current = false;
      takeStartedAt.current = Date.now();
      dispatch({ type: "takeStarted", now: takeStartedAt.current });
    } else if (!isPlaying && was && run.phase === "playing") {
      dispatch({ type: "takeStopped", now: Date.now() });
    }
  }, [isPlaying, run.phase, onExercise]);

  // A piece that plays to its end stops itself, and says so here. The stop is
  // idempotent, and a toggle would start the click again (`useJamSession`).
  useEffect(() => {
    if (run.phase !== "playing") return;
    const off = onJamEnded(() => {
      playedOut.current = true;
      void setPlaying(false).catch(() => {});
    });
    return () => {
      void off.then((fn) => fn()).catch(() => {});
    };
  }, [run.phase]);

  // What the running screen shows. Provisional, like the lights: the verdict
  // after the Take is the authority, and it can revise the last bar of this.
  useEffect(() => {
    if (run.phase !== "playing") return;
    const off = onScoreOnset((onset) => {
      setLive((now) => {
        const deviation = onset.deviationMs;
        return {
          ...now,
          heard: now.heard + (onset.state === "hit" ? 1 : 0),
          missed: now.missed + (onset.state === "miss" ? 1 : 0),
          deviations:
            onset.state === "hit" && deviation !== null
              ? [...now.deviations, deviation].slice(-STRIP_NOTES)
              : now.deviations,
        };
      });
    });
    return () => {
      void off.then((fn) => fn()).catch(() => {});
    };
  }, [run.phase]);

  useEffect(() => {
    if (run.phase !== "playing" || !beat) return;
    const bars = beat.songBar === null ? 0 : beat.songBar + 1;
    if (bars > barsReached.current) barsReached.current = bars;
    setLive((now) => {
      const finished = Math.max(0, barsReached.current - 1);
      return now.bars === finished && now.countingIn === beat.songCountIn
        ? now
        : { ...now, bars: finished, countingIn: beat.songCountIn };
    });
  }, [run.phase, beat]);

  // --- the verdict ---------------------------------------------------------
  const settledSeen = useRef(attempt.settled);
  useEffect(() => {
    if (attempt.settled === settledSeen.current) return;
    settledSeen.current = attempt.settled;
    const state = runRef.current;
    const stepNow = currentStep(state);
    if (state.phase !== "listening" || !current || !stepNow || stepNow.kind !== "exercise") return;

    const played = take?.bars ?? 0;
    const measures: TakeMeasures = measureTake(attempt.review?.segment ?? null, {
      // Played to the end, the engine stopped itself on the last bar's line and
      // every bar is finished. Stopped early, the bar it stopped in is not.
      barsPlayed: playedOut.current
        ? played
        : Math.min(played, Math.max(0, barsReached.current - 1)),
      // A silent Take has no segment; the scorer still answers for it.
      grade: attempt.lastGrade,
    });
    const bpm = state.bpm;
    const grade = gradeTake(current.exercise, bpm, measures);
    const { path, step: pathStep, exercise } = current;
    const earlier = takesOf(progress, path.id, exercise.id);
    const metric = grade.headline?.metric;
    const cleanBefore = cleanTempoOf(progress, path.id, exercise.id);
    const now = Date.now();
    const raised =
      grade.cleanBpm !== null && (cleanBefore === null || grade.cleanBpm > cleanBefore);
    const facts: TakeFacts = {
      measures,
      verdict: grade.verdict,
      ...headlineFacts(grade),
      // What the planner reads back: which Session, which role, why, and
      // whether this raised the clean tempo (parking counts that).
      session: state.startedAt,
      role: stepNow.role,
      reason: stepNow.why.code,
      newClean: raised,
      ...(stepNow.benchmark
        ? { benchmark: { day: stepNow.benchmark.day, exerciseId: exercise.id, bpm } }
        : {}),
    };
    const row: PathTakeRow = {
      id: newAttemptId(),
      pathId: path.id,
      stepId: pathStep.id,
      exerciseId: exercise.id,
      startedAt: takeStartedAt.current || now,
      bpm,
      bars: measures.barsPlayed,
      caught: measures.caught,
      passed: grade.verdict === "passed",
      ...(stepNow.variantSeed === null ? {} : { variantSeed: stepNow.variantSeed }),
      // Which view the Take was played in, so the testers' A/B can be compared.
      // The switch is locked while a Take runs, so this is the view it started in.
      facts: { ...facts, view: practiceViewRef.current },
    };

    const outcome: TakeOutcome = {
      stepId: stepNow.id,
      exerciseId: exercise.id,
      title: exercise.title,
      bpm,
      takeNumber: state.takes + 1,
      measures,
      grade,
      previousValue: previousValueOf(earlier, metric),
      cleanBefore,
      takeId: row.id,
    };
    dispatch({ type: "takeResult", outcome, now });

    // What the Session goes on to read: kept in memory at once, in the store as
    // it will be. A save that fails loses this one row, and is not the player's
    // problem in the middle of a Session.
    const cleanBpm = raised ? grade.cleanBpm : null;
    const nextProgress: PlayerProgress = {
      ...progress,
      takes: [row, ...progress.takes],
      ceilings:
        cleanBpm === null
          ? progress.ceilings
          : [
              ...progress.ceilings.filter((c) => c.exerciseKey !== `${path.id}/${exercise.id}`),
              { exerciseKey: `${path.id}/${exercise.id}`, cleanBpm, lastPracticed: now },
            ],
    };
    // Placement that passed at the pass tempo skips the Step it tried; anything
    // else moves on when about three of four in the Step are passed.
    const placedPast =
      stepNow.role === "placement" && grade.passesExercise
        ? path.steps[path.steps.findIndex((s) => s.id === pathStep.id) + 1] ?? null
        : null;
    const currentAt = (id: string | undefined) => path.steps.findIndex((s) => s.id === id);
    const storedStep = currentStepOf(progress, path).id;
    // Test out of a Step that passes moves the player past it, to the first
    // Step after it not passed yet, even when it was not the Step they were on
    // (UX audit PATH-5). Only ever forward.
    const testedPast =
      stepNow.role === "test" && isStepPassed(nextProgress, path.id, pathStep)
        ? path.steps
            .slice(path.steps.findIndex((s) => s.id === pathStep.id) + 1)
            .find((s) => !isStepPassed(nextProgress, path.id, s)) ?? null
        : null;
    const ahead = [placedPast, testedPast].find(
      (s): s is Step => !!s && currentAt(s.id) > currentAt(storedStep),
    );
    const moved = ahead ?? nextStepAfterPass(nextProgress, path);
    const state0 = progress.states.find((s) => s.pathId === path.id);
    const nextState: PathStateRow | null = moved
      ? {
          pathId: path.id,
          ...(state0?.level ? { level: state0.level } : {}),
          currentStepId: moved.id,
          startedAt: state0?.startedAt ?? now,
          updatedAt: now,
        }
      : null;
    const progressAfter = nextState
      ? { ...nextProgress, states: [...nextProgress.states.filter((s) => s.pathId !== path.id), nextState] }
      : nextProgress;
    setProgress(progressAfter);
    // Placement moved the player: the rest of today's Session follows them
    // (UX audit TODAY-3), rather than serving the Step they just skipped.
    if (nextState && stepNow.role === "placement") {
      const r = runRef.current;
      const plan = r.plan;
      if (plan) {
        const played = new Set(
          plan.steps.slice(0, r.stepIndex + 1).flatMap((x) => (x.kind === "exercise" ? [x.exerciseId] : [])),
        );
        const rest = plan.steps.slice(r.stepIndex + 1);
        dispatch({ type: "replaceRest", steps: replanRest(rest, path, progressAfter, now, played) });
      }
    }
    void savePathTake(row, cleanBpm).catch((err) => {
      console.warn("[yames] could not keep the Take", err);
    });
    if (nextState) void savePathState(nextState).catch(() => {});
    // `settled` is the only edge this answers. The rest is read as of that edge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt.settled]);

  // --- leaving -------------------------------------------------------------
  /** Everything a Session touched, handed back. Safe to run twice. */
  const teardown = useCallback(() => {
    prepareId.current += 1;
    const saved = snapshot.current;
    snapshot.current = null;
    if (saved) restoredTo.current = saved;
    const entered = lastEntered.current;
    lastEntered.current = null;
    setPreparedTake(null);
    void enqueue(async () => {
      await setPlaying(false).catch(() => {});
      if (entered?.kind === "drill") await stopSpeedRamp().catch(() => {});
      await clearScoreSchedule().catch(() => {});
      await clearSong().catch(() => {});
      finisherLoaded.current = false;
      loadedBand.current = null;
      await clearJam(null);
      if (!saved) return;
      await setFreeMode(saved.freeMode).catch(() => {});
      await setBeatGroups(saved.beatGroups).catch(() => {});
      await setSubdivision(saved.subdivision).catch(() => {});
      await setBpm(saved.bpm).catch(() => {});
    });
    const { coach } = latest.current;
    // Through `useSession`: this is what writes the Session into the history.
    if (ownsCoach.current) {
      ownsCoach.current = false;
      const ending = coach.endSession().catch(() => {});
      coachEnding.current = ending;
      void ending.then(() => {
        if (coachEnding.current === ending) coachEnding.current = null;
      });
    }
    if (!cardWasOpen.current && coach.cardOpen) coach.toggleCard();
  }, [enqueue]);

  /** The recap is the end of the Session: the history is written as it opens. */
  const endedRef = useRef(false);
  useEffect(() => {
    if (run.phase === "recap" && !endedRef.current) {
      endedRef.current = true;
      teardown();
    }
    if (run.phase === "idle") endedRef.current = false;
  }, [run.phase, teardown]);

  /** Walking away by any other door, a tab hotkey or an opened file, is leaving. */
  useEffect(() => {
    if (run.phase === "idle" || run.phase === "recap") return;
    if (view === "session" || view === "settings") return;
    teardown();
    dispatch({ type: "cancel" });
  }, [view, run.phase, teardown]);

  // --- what the player can do ----------------------------------------------
  const begin = useCallback(
    (next: SessionPlan, options: { untimed?: boolean } = {}) => {
      if (next.steps.length === 0) return;
      const { state, coach } = latest.current;
      snapshot.current = {
        bpm: state.bpm,
        subdivision: state.subdivision,
        beatGroups: state.beatGroups,
        freeMode: state.freeMode,
      };
      cardWasOpen.current = coach.cardOpen;
      // The player's own coach session, running before this: not ours to end.
      // One we are still ending is ours, whatever the last render said.
      // `isActive` and not `active`: the end of our last session may have
      // finished a moment ago with the render that says so still to come.
      const active = coach.isActive ? coach.isActive() : coach.active;
      const theirs = active && !ownsCoach.current && coachEnding.current === null;
      const now = Date.now();
      // A Path is started (subscribed) the first time it is played, not the
      // first time it is shown, so looking at Today writes nothing. Past the cap
      // it is played without subscribing; its Takes are kept all the same.
      let subscribed = progress.states.filter((s) => isSubscribed(progress, s.pathId)).length;
      for (const pathId of new Set(next.steps.flatMap((s) => ("pathId" in s && s.pathId ? [s.pathId] : [])))) {
        if (!progress.states.some((s) => s.pathId === pathId) && subscribed < SUBSCRIPTION_CAP) {
          subscribed += 1;
          const row: PathStateRow = { pathId, startedAt: now, updatedAt: now };
          setProgress((p) => ({ ...p, states: [...p.states, row] }));
          void savePathState(row).catch(() => {});
        }
      }
      dispatch({ type: "start", plan: next, now, untimed: options.untimed === true });
      origin.current = sessionOrigin(latest.current.view);
      setView("session");
      if (!theirs) {
        ownsCoach.current = true;
        void coach.startSession().catch(() => {});
      }
    },
    [progress, setView],
  );

  const startToday = useCallback(() => begin(plan), [begin, plan]);

  /** One Exercise, from its Step's page: a short Session of just that. */
  const playExercise = useCallback(
    (path: PathDoc, pathStep: Step, exercise: Exercise) => {
      const takes = takesOf(progress, path.id, exercise.id);
      const last = lastCaughtTake(takes);
      begin({
        minutes: 5,
        mood: "returning",
        daysAway: null,
        steps: [
          {
            kind: "exercise",
            id: "chosen",
            role: "focus",
            pathId: path.id,
            stepId: pathStep.id,
            exerciseId: exercise.id,
            title: exercise.title,
            bpm: last?.bpm ?? exercise.tempo.rungs[0]?.bpm ?? 60,
            minutes: 5,
            variantSeed: null,
            why: { code: "chosen", values: { step: pathStep.title } },
          },
        ],
      }, { untimed: true });
    },
    [begin, progress],
  );

  /**
   * Choose this Step. No lock: a player can start anywhere and change later.
   * A Step below the chosen Level takes the Level down with it, to the one the
   * Step is in, so the Step chosen is the Step they are on (`currentStepOf`
   * never goes below the Level).
   */
  const chooseStep = useCallback(
    (path: PathDoc, pathStep: Step) => {
      const now = Date.now();
      const stored = progress.states.find((s) => s.pathId === path.id);
      const chosen = chosenLevelOf(progress, path);
      const below =
        chosen !== null &&
        path.steps.findIndex((s) => s.id === pathStep.id) < levelStartIndex(path, chosen);
      const level = below ? levelOfStep(path, pathStep.id)?.id : stored?.level;
      const row: PathStateRow = {
        pathId: path.id,
        ...(level ? { level } : {}),
        currentStepId: pathStep.id,
        startedAt: stored?.startedAt ?? now,
        updatedAt: now,
      };
      setProgress((p) => ({
        ...p,
        states: [...p.states.filter((s) => s.pathId !== path.id), row],
      }));
      void savePathState(row).catch(() => {});
    },
    [progress],
  );

  /**
   * Choose a Level, and start there (owner, 2026-11-17: Levels must actually do
   * something). The current Step becomes the Level's first Step not passed yet;
   * the Steps below it count as skipped (`isStepSkipped`), so Today plans from
   * there. Choosing a lower Level brings them back. Progress is keyed by
   * Exercise, so nothing is lost either way.
   */
  const chooseLevel = useCallback(
    (path: PathDoc, level: string) => {
      const now = Date.now();
      const stored = progress.states.find((s) => s.pathId === path.id);
      const offered = levelsOf(path).find((l) => l.id === level);
      const entry = offered ? levelEntryStep(progress, path, offered) : null;
      const currentStepId = entry?.id ?? stored?.currentStepId;
      const row: PathStateRow = {
        pathId: path.id,
        level,
        ...(currentStepId ? { currentStepId } : {}),
        startedAt: stored?.startedAt ?? now,
        updatedAt: now,
      };
      setProgress((p) => ({
        ...p,
        states: [...p.states.filter((s) => s.pathId !== path.id), row],
      }));
      void savePathState(row).catch(() => {});
    },
    [progress.states],
  );

  /**
   * Subscribe to a Path: start it (its `path_state` row), or take it off the
   * unsubscribed list. Refused at the cap, and says so.
   */
  const subscribe = useCallback(
    (path: PathDoc): SubscribeRefusal => {
      if (isSubscribed(progress, path.id)) return null;
      const count = progress.states.filter((s) => isSubscribed(progress, s.pathId)).length;
      if (count >= SUBSCRIPTION_CAP) return "cap";
      const now = Date.now();
      const unsubscribed = (progress.unsubscribed ?? []).filter((id) => id !== path.id);
      const has = progress.states.some((s) => s.pathId === path.id);
      const row: PathStateRow = { pathId: path.id, startedAt: now, updatedAt: now };
      setProgress((p) => ({
        ...p,
        unsubscribed,
        states: has ? p.states : [...p.states, row],
      }));
      if (!has) void savePathState(row).catch(() => {});
      void storeSave(UNSUBSCRIBED_KEY, unsubscribed).catch(() => {});
      return null;
    },
    [progress],
  );

  /**
   * Start a Path at a Level in one write (the first-run wizard's "Where do you
   * start?"): `subscribe` and `chooseLevel` together, as the Path page does them
   * one press at a time, so the two never race to the store with two rows.
   * Refused at the cap, as `subscribe` is.
   */
  const startPath = useCallback(
    (path: PathDoc, level: string | null): SubscribeRefusal => {
      const count = progress.states.filter((s) => isSubscribed(progress, s.pathId)).length;
      if (!isSubscribed(progress, path.id) && count >= SUBSCRIPTION_CAP) return "cap";
      const now = Date.now();
      const stored = progress.states.find((s) => s.pathId === path.id);
      const offered = level ? levelsOf(path).find((l) => l.id === level) : undefined;
      const entry = offered ? levelEntryStep(progress, path, offered) : null;
      const currentStepId = entry?.id ?? stored?.currentStepId;
      const row: PathStateRow = {
        pathId: path.id,
        ...(offered ? { level: offered.id } : stored?.level ? { level: stored.level } : {}),
        ...(currentStepId ? { currentStepId } : {}),
        startedAt: stored?.startedAt ?? now,
        updatedAt: now,
      };
      const unsubscribed = (progress.unsubscribed ?? []).filter((id) => id !== path.id);
      setProgress((p) => ({
        ...p,
        unsubscribed,
        states: [...p.states.filter((s) => s.pathId !== path.id), row],
      }));
      void savePathState(row).catch(() => {});
      if (unsubscribed.length !== (progress.unsubscribed ?? []).length) {
        void storeSave(UNSUBSCRIBED_KEY, unsubscribed).catch(() => {});
      }
      return null;
    },
    [progress],
  );

  /** Unsubscribe: Today stops planning it. Its row and every Take stay. */
  const unsubscribe = useCallback(
    (path: PathDoc) => {
      const unsubscribed = [...new Set([...(progress.unsubscribed ?? []), path.id])];
      setProgress((p) => ({ ...p, unsubscribed }));
      void storeSave(UNSUBSCRIBED_KEY, unsubscribed).catch(() => {});
    },
    [progress.unsubscribed],
  );

  /** Test out of a Step: one Take at each graded Exercise's pass tempo. */
  const testOut = useCallback(
    (path: PathDoc, pathStep: Step) => {
      const steps = testOutSteps(path, pathStep, progress);
      if (steps.length === 0) return;
      const total = steps.length * TEST_OUT_MINUTES;
      const minutes = PLAN_MINUTES.find((m) => m >= total) ?? 20;
      begin({ minutes, mood: "returning", daysAway: null, steps }, { untimed: true });
    },
    [begin, progress],
  );

  /**
   * "Was this grade fair?": kept in the Take's facts, and in the export. Tapping
   * the other answer changes it and saves again; the latest tap wins, read from
   * a ref so two quick taps can't race on a stale list.
   */
  const takesRef = useRef(progress.takes);
  takesRef.current = progress.takes;
  const answerFair = useCallback((takeId: string, fair: "yes" | "no") => {
    const row = takesRef.current.find((t) => t.id === takeId);
    if (!row || factsOf(row).fair === fair) return;
    const next: PathTakeRow = { ...row, facts: { ...factsOf(row), fair } };
    takesRef.current = takesRef.current.map((t) => (t.id === takeId ? next : t));
    setProgress((p) => ({ ...p, takes: p.takes.map((t) => (t.id === takeId ? { ...t, facts: { ...factsOf(t), fair } } : t)) }));
    // The same row again: `INSERT OR REPLACE`, and no clean tempo with it.
    void savePathTake(next, null).catch(() => {});
  }, []);

  const exercise = current?.exercise ?? null;
  const big: BigAction = useMemo(() => bigAction(run, exercise), [run, exercise]);

  /**
   * Where placement put the player, once its climb is over (UX audit TODAY-3):
   * the result says "You start at Step 2" rather than moving on in silence.
   */
  const placed = useMemo(() => {
    if (run.phase !== "result" || step?.kind !== "exercise" || step.role !== "placement") return null;
    if (big.kind === "again" || (big.kind === "next" && big.insert)) return null;
    const path = paths.find((p) => p.id === step.pathId);
    if (!path) return null;
    const at = currentStepOf(progress, path);
    return { path: path.title, n: at.order, step: at.title };
  }, [run.phase, step, big, paths, progress]);

  const playTake = useCallback(() => {
    if (!prepared || !listening) return;
    void enqueue(() => setPlaying(true));
  }, [prepared, listening, enqueue]);

  const endTake = useCallback(() => {
    void enqueue(() => setPlaying(false));
  }, [enqueue]);

  /**
   * Go again starts the count-in by itself (UX audit SES-4): one press, not
   * one to get back to the ready screen and another to start. The Take still
   * waits until its song is on the engine and the input is open, so this is
   * a request the next ready state answers, not a start on the old Take.
   */
  const autoStart = useRef(false);
  useEffect(() => {
    if (run.phase !== "ready") {
      if (run.phase !== "result") autoStart.current = false;
      return;
    }
    if (!autoStart.current || engineTrouble) {
      autoStart.current = false;
      return;
    }
    if (prepared && listening) {
      autoStart.current = false;
      playTake();
    }
  }, [run.phase, prepared, listening, engineTrouble, playTake]);

  /** The one big next action, from the button, the keyboard or the pedal. */
  const go = useCallback(() => {
    if (big.kind === "playTake") return playTake();
    if (big.kind === "endTake") return endTake();
    const event = eventForBigAction(big, Date.now());
    if (!event) return;
    if (event.type === "again") autoStart.current = true;
    dispatch(event);
    if (event.type === "close") setView(origin.current);
  }, [big, playTake, endTake, setView]);

  /**
   * A timed step's own tempo, a step at a time: on its ready screen or while
   * paused. Not graded, so any tempo is fine (owner, beta 5: slow down to learn).
   */
  const nudgeTimed = useCallback((sign: 1 | -1) => {
    const state = runRef.current;
    const timedNow = state.phase === "timedReady" || (state.phase === "timed" && (state.paused || state.ended));
    if (!timedNow || !timedTempoAdjustable(currentStep(state))) return false;
    dispatch({ type: "setBpm", bpm: timedBpm(state.bpm, sign * TIMED_BPM_STEP), now: Date.now() });
    return true;
  }, []);

  // Locked on a Test out, whose Take has to be at the pass tempo (`tempoNudges`).
  const slower = useCallback(() => {
    if (nudgeTimed(-1)) return;
    if (exercise && tempoNudges(runRef.current, exercise).slower) {
      dispatch({ type: "slower", exercise, now: Date.now() });
    }
  }, [exercise, nudgeTimed]);

  const faster = useCallback(() => {
    if (nudgeTimed(1)) return;
    if (exercise && tempoNudges(runRef.current, exercise).faster) {
      dispatch({ type: "faster", exercise, now: Date.now() });
    }
  }, [exercise, nudgeTimed]);

  /** Pause a running timed step, or resume a paused one. */
  const togglePause = useCallback(() => {
    const state = runRef.current;
    if (state.phase !== "timed" || state.ended) return;
    dispatch({ type: state.paused ? "resume" : "pause", now: Date.now() });
  }, []);

  /**
   * Go again: a timed step from the top (running or paused), a graded result
   * at the same tempo. Nothing anywhere else.
   */
  const restart = useCallback(() => {
    const state = runRef.current;
    if (state.phase === "timed") dispatch({ type: "restart", now: Date.now() });
    else if (state.phase === "result") {
      autoStart.current = true;
      dispatch({ type: "again", now: Date.now() });
    }
  }, []);

  /** Back to the warm-up (or the timed step) just before this one, before anything is played here. */
  const back = useCallback(() => {
    dispatch({ type: "back", now: Date.now() });
  }, []);

  /**
   * Space and Enter: what the big button says, except while a timed step runs,
   * where they pause and resume it. The big button there says "Next", and a
   * key pressed to stop the click must not skip the warm-up (owner, beta 5).
   */
  const goKey = useCallback(() => {
    const state = runRef.current;
    if (state.phase === "timed" && !state.ended) return togglePause();
    go();
  }, [go, togglePause]);

  /** Go again at this tempo, whatever the big button is offering: straight into the count-in. */
  const again = useCallback(() => {
    autoStart.current = true;
    dispatch({ type: "again", now: Date.now() });
  }, []);

  /**
   * The recap's ways on (UX audit SES-10). "5 more minutes" plans five more
   * minutes the way Today would; from a Step's page it is that Step's
   * Exercise again, still with no countdown. Either way the Session goes back
   * where this one came from when it ends.
   */
  const moreMinutes = useCallback(() => {
    const state = runRef.current;
    if (state.phase !== "recap") return;
    const from = origin.current;
    const lastExercise = [...(state.plan?.steps ?? [])].reverse().find((s) => s.kind === "exercise");
    const next: SessionPlan | null = state.untimed
      ? lastExercise
        ? {
            minutes: 5,
            mood: "returning",
            daysAway: null,
            steps: [{ ...lastExercise, id: `${lastExercise.id}-more`, bpm: state.outcomes[state.outcomes.length - 1]?.bpm ?? lastExercise.bpm }],
          }
        : null
      : planSession({ minutes: 5, now: Date.now(), paths: myPaths, progress });
    if (!next || next.steps.length === 0) return;
    dispatch({ type: "close" });
    endedRef.current = false;
    begin(next, { untimed: state.untimed });
    origin.current = from;
    if (restoredTo.current) snapshot.current = restoredTo.current;
  }, [begin, myPaths, progress]);

  /** Leave the recap for a screen of the player's choosing: where it began, or Progress. */
  const closeTo = useCallback(
    (to: MainView) => {
      dispatch({ type: "close" });
      setView(to);
    },
    [setView],
  );

  /**
   * The next step: Skip this, or N. A Session started with Play this on a
   * Step's page is one Exercise long, so the next step there is the next
   * Exercise on that Step (then the Step after), not the end (UX audit
   * TODAY-2). Anywhere else it is the plan's next step.
   */
  const next = useCallback(() => {
    const r = runRef.current;
    const here = currentStep(r);
    const now = Date.now();
    if (here?.kind === "exercise" && here.why.code === "chosen" && !r.plan?.steps[r.stepIndex + 1]) {
      const following = followingExercise(paths, here.pathId, here.exerciseId);
      if (following) {
        const takes = takesOf(progress, following.path.id, following.exercise.id);
        const last = lastCaughtTake(takes);
        dispatch({
          type: "next",
          now,
          insert: {
            kind: "exercise",
            id: `chosen-${r.stepIndex + 1}`,
            role: "focus",
            pathId: following.path.id,
            stepId: following.step.id,
            exerciseId: following.exercise.id,
            title: following.exercise.title,
            bpm: last?.bpm ?? following.exercise.tempo.rungs[0]?.bpm ?? 60,
            minutes: 5,
            variantSeed: null,
            why: { code: "chosen", values: { step: following.step.title } },
          },
        });
        return;
      }
    }
    dispatch({ type: "next", now });
  }, [paths, progress]);

  /** Find my edge on this Exercise, from the tempo reached, then back to the plan. */
  const findEdgeFromHere = useCallback(() => {
    if (!current) return;
    const bpm = runRef.current.bpm;
    dispatch({
      type: "insertStep",
      now: Date.now(),
      step: edgeStep(current, progress, {
        id: `edge-${runRef.current.stepIndex}`,
        bpm,
        why: { code: "edge", values: { bpm } },
      }),
    });
  }, [current, progress]);

  /** Find my edge on one Exercise, as a Session of its own, from a Step page. */
  const findEdge = useCallback(
    (path: PathDoc, pathStep: Step, exercise: Exercise) => {
      const step = edgeStep({ path, step: pathStep, exercise }, progress);
      // Planned as the shortest Session; the step keeps its own minutes.
      begin({ minutes: 5, mood: "returning", daysAway: null, steps: [step] }, { untimed: true });
    },
    [begin, progress],
  );

  /**
   * V on a practice screen: the next of Neck, Runway and Tab. Live in a
   * warm-up or a timed block while it runs; a graded Take keeps the view it
   * started with, so V does nothing while one runs.
   */
  const cycleView = useCallback(() => {
    const phase = runRef.current.phase;
    if (phase !== "ready" && phase !== "timedReady" && phase !== "timed") return;
    setPracticeView(nextPracticeView(practiceViewRef.current));
  }, [setPracticeView]);

  const [leaveAsked, setLeaveAsked] = useState(false);

  const exit = useCallback(() => {
    setLeaveAsked(false);
    teardown();
    dispatch({ type: "cancel" });
    setView(origin.current);
  }, [teardown, setView]);

  /**
   * Escape in a Session (UX audit NAV-2, 2026-11-17). A running Take is
   * stopped first, and kept: that is one press. Leaving is the next one, and
   * once this Session has Takes in it, it asks ("Your Takes are saved") rather
   * than walking out on a key that sits next to the ones a player is using.
   * With nothing played yet, or on the recap, it leaves at once.
   */
  const escape = useCallback(() => {
    const phase = runRef.current.phase;
    if (phase === "playing") return endTake();
    if (phase === "listening") return;
    if (phase === "recap" || runRef.current.outcomes.length === 0) return exit();
    setLeaveAsked(true);
  }, [endTake, exit]);

  const stayInSession = useCallback(() => setLeaveAsked(false), []);
  useEffect(() => {
    if (run.phase === "idle") setLeaveAsked(false);
  }, [run.phase]);

  return {
    run,
    plan,
    minutes,
    setMinutes,
    practiceView,
    setPracticeView,
    viewHintSeen,
    dismissViewHint,
    bandVolume,
    setBandVolume,
    directInput: input.directInput === true,
    /** The Take on the stage has a band under it. */
    hasBand: take?.exercise.backing.kind === "jam",
    paths,
    myPaths,
    progress,
    take,
    exercise,
    stepNow: step,
    prepared,
    engineTrouble,
    live,
    lights,
    big,
    working: run.phase === "listening",
    canGoBack: canGoBack(run),
    /** Escape asked "Leave this Session?" and it has not been answered. */
    leaveAsked,
    /** Placement's verdict, on the result that ended its climb. */
    placed,
    /** Where this Session goes back to when it ends. */
    origin: origin.current,
    actions: {
      startToday,
      playExercise,
      chooseStep,
      chooseLevel,
      go,
      goKey,
      slower,
      faster,
      again,
      moreMinutes,
      closeTo,
      next,
      togglePause,
      restart,
      back,
      findEdgeFromHere,
      findEdge,
      exit,
      escape,
      stayInSession,
      subscribe,
      startPath,
      unsubscribe,
      testOut,
      answerFair,
      cycleView,
    },
  };
}

export type SessionRun = ReturnType<typeof useSessionRun>;
