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
import { PLAN_MINUTES, planSession } from "../../../session/planner";
import type { PlanMinutes, PlanStep, SessionPlan } from "../../../session/planner";
import {
  NO_PROGRESS,
  cleanTempoOf,
  factsOf,
  lastCaughtTake,
  nextStepAfterPass,
  takesOf,
} from "../../../session/progress";
import type { PlayerProgress, TakeFacts } from "../../../session/progress";
import {
  IDLE,
  bigAction,
  currentStep,
  eventForBigAction,
  runReducer,
} from "../../../session/runner";
import type { BigAction, RunState, TakeOutcome } from "../../../session/runner";
import { TAKE_COUNT_IN_BARS, buildTake } from "../../../session/take";
import type { TakePlan } from "../../../session/take";

/** How many Takes are read back for planning. More than any plan looks at. */
const TAKES_TO_READ = 500;
const MINUTES_KEY = "session.minutes";
const TICK_MS = 1000;
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
    cardOpen: boolean;
    startSession: () => Promise<void>;
    endSession: () => Promise<void>;
    toggleCard: () => void;
  };
  listening: boolean;
  /** The jam library, for a jam step. */
  jams: Jam[];
  lineup?: JamBand;
};

/** The current step's Exercise and its Path, when it has one. */
function exerciseOf(
  step: PlanStep | null,
  paths: readonly PathDoc[],
): { path: PathDoc; step: Step; exercise: Exercise } | null {
  if (!step || (step.kind !== "exercise" && step.kind !== "metronome")) return null;
  if (!step.pathId || !step.exerciseId) return null;
  const path = paths.find((p) => p.id === step.pathId);
  if (!path) return null;
  const found = findExercise(path, step.exerciseId);
  return found ? { path, ...found } : null;
}

/** The player's Paths: the ones started, or the one everybody starts on. */
export function playerPaths(paths: readonly PathDoc[], progress: PlayerProgress): PathDoc[] {
  const mine = progress.states
    .map((state) => paths.find((p) => p.id === state.pathId))
    .filter((path): path is PathDoc => !!path && isRunnable(path.id));
  if (mine.length > 0) return mine;
  const first = paths.find((p) => p.id === FIRST_PATH_ID);
  return first ? [first] : [];
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

export function useSessionRun(input: SessionRunInput) {
  const { view, setView, isPlaying, beat, listening } = input;
  const [run, dispatch] = useReducer(runReducer, IDLE);
  const [paths, setPaths] = useState<PathDoc[]>([]);
  const [progress, setProgress] = useState<PlayerProgress>(NO_PROGRESS);
  const [minutes, setMinutesState] = useState<PlanMinutes>(10);
  const [prepared, setPrepared] = useState(false);
  const [engineTrouble, setEngineTrouble] = useState<string | null>(null);
  const [live, setLive] = useState<LiveTake>(NO_LIVE);
  // Stamped once a view opens, so a plan does not rebuild on every second.
  const [planClock, setPlanClock] = useState(() => Date.now());

  const latest = useRef(input);
  latest.current = input;
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
  const cardWasOpen = useRef(false);

  // --- what the store knows ------------------------------------------------
  const loadedRef = useRef(false);
  const refresh = useCallback(async () => {
    const [states, takes, ceilings] = await Promise.all([
      listPathStates().catch(() => [] as PathStateRow[]),
      listPathTakes(TAKES_TO_READ).catch(() => [] as PathTakeRow[]),
      listExerciseCeilings().catch(() => []),
    ]);
    setProgress({ states, takes, ceilings });
  }, []);

  const onLearningSide =
    view === "today" || view === "paths" || view === "progress" || view === "session";
  useEffect(() => {
    if (!onLearningSide) return;
    setPlanClock(Date.now());
    if (loadedRef.current) return;
    loadedRef.current = true;
    void loadAllPacks().then(setPaths);
    void refresh();
    void storeLoad<number>(MINUTES_KEY).then((saved) => {
      if (PLAN_MINUTES.includes(saved as PlanMinutes)) setMinutesState(saved as PlanMinutes);
    });
  }, [onLearningSide, refresh]);

  const setMinutes = useCallback((next: PlanMinutes) => {
    setMinutesState(next);
    void storeSave(MINUTES_KEY, next).catch(() => {});
  }, []);

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
    const bpm = run.bpm || (step?.kind === "metronome" ? step.bpm : 0);
    return bpm > 0 ? buildTake(current.path, current.exercise, bpm) : null;
    // `run.bpm` and the Exercise are the whole of what a Take is built from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, run.bpm]);

  const onExercise = step?.kind === "exercise";

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
        if (kind === "jam") await clearJam(null);
        if (kind === "drill") await stopSpeedRamp().catch(() => {});
      }),
    [enqueue],
  );

  const lastEntered = useRef<{ index: number; kind: PlanStep["kind"] } | null>(null);
  const prepareId = useRef(0);

  /** Get a Take onto the engine: the song, the mix, then the schedule. */
  useEffect(() => {
    if (run.phase !== "ready" || !take || !onExercise) return;
    const mine = ++prepareId.current;
    setPrepared(false);
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
        await loadSong(transport, null);
        await setSongMix(engineMix(DEFAULT_MIX_SETTING, 0));
        await loadScoreSchedule(take.schedule);
        if (prepareId.current === mine) setPrepared(true);
      } catch (err) {
        if (prepareId.current !== mine) return;
        setEngineTrouble(typeof err === "string" ? err : "load");
      }
    });
  }, [run.phase, take, onExercise, enqueue]);

  /** Start whatever a timed step is. It moves on by the clock, in the reducer. */
  useEffect(() => {
    if (run.phase !== "timed" || !step) return;
    const entered = lastEntered.current;
    if (entered?.index === run.stepIndex) return;
    lastEntered.current = { index: run.stepIndex, kind: step.kind };
    const { jams, lineup, state } = latest.current;
    void enqueue(async () => {
      await setPlaying(false).catch(() => {});
      await clearScoreSchedule().catch(() => {});
      await clearSong().catch(() => {});
      await clearJam(null);
      if (step.kind === "metronome") {
        await setBpm(step.bpm).catch(() => {});
        await setFreeMode(false).catch(() => {});
        await setBeatGroups([4]).catch(() => {});
        await setSubdivision(step.subdivision as Subdivision).catch(() => {});
        await setPlaying(true).catch(() => {});
      } else if (step.kind === "jam") {
        const jam = jams[0];
        if (!jam) return;
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
  }, [run.phase, run.stepIndex, step, enqueue]);

  /** Leaving a timed step for anything else: stop what it started. */
  useEffect(() => {
    const entered = lastEntered.current;
    if (!entered) return;
    if (run.phase === "timed" && entered.index === run.stepIndex) return;
    lastEntered.current = null;
    void stopTimed(entered.kind);
  }, [run.phase, run.stepIndex, stopTimed]);

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
  useEffect(() => {
    const was = wasPlaying.current;
    wasPlaying.current = isPlaying;
    if (isPlaying && !was && run.phase === "ready" && onExercise) {
      barsReached.current = 0;
      dispatch({ type: "takeStarted", now: Date.now() });
    } else if (!isPlaying && was && run.phase === "playing") {
      dispatch({ type: "takeStopped", now: Date.now() });
    }
  }, [isPlaying, run.phase, onExercise]);

  // A piece that plays to its end stops itself, and says so here. The stop is
  // idempotent, and a toggle would start the click again (`useJamSession`).
  useEffect(() => {
    if (run.phase !== "playing") return;
    const off = onJamEnded(() => {
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
      // Played to the end: the engine stopped itself on the last bar's line.
      barsPlayed: Math.min(played, barsReached.current),
    });
    const bpm = state.bpm;
    const grade = gradeTake(current.exercise, bpm, measures);
    const { path, step: pathStep, exercise } = current;
    const earlier = takesOf(progress, path.id, exercise.id);
    const metric = grade.headline?.metric;
    const cleanBefore = cleanTempoOf(progress, path.id, exercise.id);
    const now = Date.now();
    const facts: TakeFacts = { measures, verdict: grade.verdict, ...headlineFacts(grade) };
    const row: PathTakeRow = {
      id: newAttemptId(),
      pathId: path.id,
      stepId: pathStep.id,
      exerciseId: exercise.id,
      startedAt: now,
      bpm,
      bars: measures.barsPlayed,
      caught: measures.caught,
      passed: grade.verdict === "passed",
      ...(stepNow.variantSeed === null ? {} : { variantSeed: stepNow.variantSeed }),
      facts,
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
    };
    dispatch({ type: "takeResult", outcome, now });

    // What the Session goes on to read: kept in memory at once, in the store as
    // it will be. A save that fails loses this one row, and is not the player's
    // problem in the middle of a Session.
    const cleanBpm =
      grade.cleanBpm !== null && (cleanBefore === null || grade.cleanBpm > cleanBefore)
        ? grade.cleanBpm
        : null;
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
    const moved = nextStepAfterPass(nextProgress, path);
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
    setProgress(
      nextState
        ? {
            ...nextProgress,
            states: [...nextProgress.states.filter((s) => s.pathId !== path.id), nextState],
          }
        : nextProgress,
    );
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
    const entered = lastEntered.current;
    lastEntered.current = null;
    setPrepared(false);
    void enqueue(async () => {
      await setPlaying(false).catch(() => {});
      if (entered?.kind === "drill") await stopSpeedRamp().catch(() => {});
      await clearScoreSchedule().catch(() => {});
      await clearSong().catch(() => {});
      await clearJam(null);
      if (!saved) return;
      await setFreeMode(saved.freeMode).catch(() => {});
      await setBeatGroups(saved.beatGroups).catch(() => {});
      await setSubdivision(saved.subdivision).catch(() => {});
      await setBpm(saved.bpm).catch(() => {});
    });
    const { coach } = latest.current;
    // Through `useSession`: this is what writes the Session into the history.
    if (coach.active) void coach.endSession().catch(() => {});
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
    (next: SessionPlan) => {
      if (next.steps.length === 0) return;
      const { state, coach } = latest.current;
      snapshot.current = {
        bpm: state.bpm,
        subdivision: state.subdivision,
        beatGroups: state.beatGroups,
        freeMode: state.freeMode,
      };
      cardWasOpen.current = coach.cardOpen;
      const now = Date.now();
      // A Path is started the first time it is played, not the first time it is
      // shown, so looking at Today writes nothing.
      for (const pathId of new Set(next.steps.flatMap((s) => ("pathId" in s && s.pathId ? [s.pathId] : [])))) {
        if (!progress.states.some((s) => s.pathId === pathId)) {
          const row: PathStateRow = { pathId, startedAt: now, updatedAt: now };
          setProgress((p) => ({ ...p, states: [...p.states, row] }));
          void savePathState(row).catch(() => {});
        }
      }
      dispatch({ type: "start", plan: next, now });
      setView("session");
      if (!coach.active) void coach.startSession().catch(() => {});
    },
    [progress.states, setView],
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
      });
    },
    [begin, progress],
  );

  /** Choose this Step. No lock: a player can start anywhere and change later. */
  const chooseStep = useCallback(
    (path: PathDoc, pathStep: Step) => {
      const now = Date.now();
      const stored = progress.states.find((s) => s.pathId === path.id);
      const row: PathStateRow = {
        pathId: path.id,
        ...(stored?.level ? { level: stored.level } : {}),
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
    [progress.states],
  );

  /** Choose a Level. Progress is keyed by Exercise, so nothing is lost. */
  const chooseLevel = useCallback(
    (path: PathDoc, level: string) => {
      const now = Date.now();
      const stored = progress.states.find((s) => s.pathId === path.id);
      const row: PathStateRow = {
        pathId: path.id,
        level,
        ...(stored?.currentStepId ? { currentStepId: stored.currentStepId } : {}),
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

  const exercise = current?.exercise ?? null;
  const big: BigAction = useMemo(() => bigAction(run, exercise), [run, exercise]);

  const startTake = useCallback(() => {
    if (!prepared || !listening) return;
    void enqueue(() => setPlaying(true));
  }, [prepared, listening, enqueue]);

  const stopTake = useCallback(() => {
    void enqueue(() => setPlaying(false));
  }, [enqueue]);

  /** The one big next action, from the button, the keyboard or the pedal. */
  const go = useCallback(() => {
    if (big.kind === "startTake") return startTake();
    if (big.kind === "stopTake") return stopTake();
    const event = eventForBigAction(big, Date.now());
    if (!event) return;
    dispatch(event);
    if (event.type === "close") setView("today");
  }, [big, startTake, stopTake, setView]);

  const slower = useCallback(() => {
    if (exercise) dispatch({ type: "slower", exercise, now: Date.now() });
  }, [exercise]);

  const faster = useCallback(() => {
    if (exercise) dispatch({ type: "faster", exercise, now: Date.now() });
  }, [exercise]);

  /** Go again at this tempo, whatever the big button is offering. */
  const again = useCallback(() => {
    dispatch({ type: "again", now: Date.now() });
  }, []);

  const next = useCallback(() => {
    dispatch({ type: "next", now: Date.now() });
  }, []);

  /** Ramp up from the tempo reached, then back to the plan. */
  const rampFromHere = useCallback(() => {
    const bpm = runRef.current.bpm;
    dispatch({
      type: "insertDrill",
      now: Date.now(),
      step: {
        kind: "drill",
        id: `edge-${runRef.current.stepIndex}`,
        title: "",
        startBpm: bpm,
        targetBpm: Math.min(300, bpm + 40),
        minutes: 2,
        why: { code: "edge", values: { bpm } },
      },
    });
  }, []);

  const exit = useCallback(() => {
    teardown();
    dispatch({ type: "cancel" });
    setView("today");
  }, [teardown, setView]);

  return {
    run,
    plan,
    minutes,
    setMinutes,
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
    actions: {
      startToday,
      playExercise,
      chooseStep,
      chooseLevel,
      go,
      slower,
      faster,
      again,
      next,
      rampFromHere,
      exit,
    },
  };
}

export type SessionRun = ReturnType<typeof useSessionRun>;
