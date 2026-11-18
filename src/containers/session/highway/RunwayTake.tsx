/**
 * The Take screen in the "runway" view (plans/tasks/mvp/RUNWAY.md): the neck
 * straight-on above, six lanes of what comes next under it, one compact row of
 * numbers. The neck answers WHERE, the runway WHEN and WHAT NEXT.
 *
 * Behind the Neck / Runway / Tab switch; the neck view (`SessionView.tsx`) stays the
 * default. Nothing here decides anything: it reads the same Take, lights and
 * engine position the neck view reads.
 */
import { kindOfPath } from "../../../session/kind";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { barLine } from "../../../session/coachWords";
import { currentStep, isEdgeStep } from "../../../session/runner";
import type { BeatPosition } from "../../../songs/position";
import { TAKE_COUNT_IN_BARS } from "../../../session/take";
import { useNeck } from "../../../stage3d/api";
import type { NeckView } from "../../../stage3d/api";
import type { SessionRun } from "../hooks/useSessionRun";
import { kindOfMark, neckNotesOf, useNeckSlot, useNeckTake, zoomOf } from "../hooks/useNeck";
import type { TimingMark } from "../../songs/review/marks";
import { lineText } from "../lineText";
import { CoachLine, ReadyInput, TempoNudges, bigLabel, startButton, takeCanStart } from "../parts";
import { Runway } from "./Runway";
import { ghostNeck, runwayModel } from "./runwayModel";
import type { Judged } from "./runwayModel";
import { PracticeViewSwitch } from "../practice/PracticeViewSwitch";
import { HandLine } from "../practice/HandLine";

/** The neck is told verdicts as colours here, not plucks (see `ghostNeck`). */
const NO_PLUCKS: ReadonlyMap<number, TimingMark> = new Map();

/** A Theory Exercise is about WHERE: the runway folds to one lane and the neck takes the room. */
export function isTheoryTake(session: SessionRun): boolean {
  return kindOfPath(session.paths, session.take?.pathId) === "theory";
}

export function RunwayTakeScreen({
  session,
  beat,
  isPlaying,
  listening,
  hasSignal,
  viewKey,
  onTestInput,
  onChooseInput,
}: {
  session: SessionRun;
  beat: BeatPosition | null;
  isPlaying: boolean;
  listening: boolean;
  hasSignal: boolean;
  viewKey?: string;
  onTestInput: () => void;
  onChooseInput: () => void;
}) {
  const { t } = useTranslation();
  const { run, take, exercise, live, lights, big, engineTrouble, actions } = session;
  const running = run.phase === "playing";
  const theory = isTheoryTake(session);
  const neck = useNeck();

  // The neck straight-on over the Exercise's frets; its shape quiet, the next
  // note amber and the one after a ghost (the runway moves those on).
  const played = take?.exercise.notes ?? exercise?.notes ?? [];
  const shape = useMemo(() => neckNotesOf(played, "aim"), [played]);
  const model = useMemo(() => (take ? runwayModel(take, TAKE_COUNT_IN_BARS) : null), [take]);
  // One picture at a time (the owner, 2026-11-16: "users only have one pair of
  // eyes"). Before the Take the neck shows where the hand goes; while it runs
  // the runway alone says what comes next. Theory is about where, so it keeps
  // the neck and has no runway.
  const neckOn = !running || theory;
  const runwayOn = running && !theory;
  const view: NeckView = useMemo(
    () => (neckOn ? ({ ...zoomOf(played), flat: true } as NeckView) : ({ kind: "hidden" } as NeckView)),
    [played, neckOn],
  );
  const first = useMemo(() => (model ? ghostNeck(shape, model.onsets, 0) : shape), [shape, model]);
  const slot = useNeckSlot(view, first);
  // The frame cap while the Take runs; no plucks, so the stage draws a frame
  // per change instead of every frame a string rings.
  useNeckTake(take, NO_PLUCKS, running && isPlaying);
  const shown = useRef<{ index: number; judged: Judged | null }>({ index: 0, judged: null });
  const draw = useCallback(() => {
    if (!model) return;
    neck.setNotes(ghostNeck(shape, model.onsets, shown.current.index, shown.current.judged), { fade: 0 });
  }, [neck, shape, model]);
  const onNext = useCallback(
    (index: number) => {
      shown.current.index = index;
      draw();
    },
    [draw],
  );
  // The note just judged, in its verdict's colour (the same lights the runway uses).
  useEffect(() => {
    if (!model) return;
    let last: [number, TimingMark] | null = null;
    for (const entry of lights) last = entry;
    const kind = last ? kindOfMark(last[1]) : null;
    const places = last ? model.onsets.find((o) => o.id === last![0])?.places : undefined;
    const judged = kind && places ? { places, kind } : null;
    if (!judged && !shown.current.judged) return;
    shown.current.judged = judged;
    draw();
  }, [lights, model, draw]);

  const step = currentStep(run);
  if (!exercise || !take || !step) return null;

  const pathTitle = session.paths.find((p) => p.id === take.pathId);
  const stepNumber = pathTitle?.steps.find((s) => s.exercises.some((e) => e.id === exercise.id))?.order;
  const bar = barLine(exercise, run.bpm);
  const scored = live.heard + live.missed;
  const canStart = takeCanStart(session, listening);
  const start = startButton(session, listening, t);
  const kind = isEdgeStep(step)
    ? t("session.edge.kick")
    : theory
      ? t("session.kind.theory")
      : t("session.kind.mechanics");

  return (
    <div
      className="session-body"
      data-testid="session-take"
      data-phase={run.phase}
      data-view="runway"
      data-theory={theory ? "" : undefined}
    >
      <div className="session-takeinfo">
        <span className="session-kick">
          {kind}
          {pathTitle && ` · ${t("session.run.pathStep", { path: pathTitle.title, step: stepNumber ?? 1 })}`}
        </span>
        <h2 className="session-h3">{exercise.title}</h2>
        {/* What the Exercise is, not the planner's reason (UX audit TODAY-8). */}
        {!running && <span className="session-why">{exercise.purpose}</span>}
        <PracticeViewSwitch
          view={session.practiceView}
          onChange={session.setPracticeView}
          locked={running}
          keyLabel={viewKey}
        />
      </div>

      <div className="session-compact" data-testid={running ? "session-live" : undefined}>
        {running ? (
          <>
            <span className="session-compact-stat">
              <b className={scored > 0 ? "session-good" : "session-stat-none"}>
                {scored > 0 ? `${Math.round((live.heard / scored) * 100)}%` : "–%"}
              </b>
              <span>{t("session.run.heardSoFar")}</span>
            </span>
            <span className="session-compact-stat">
              <b>
                {live.bars}
                <span className="session-stat-of"> / {take.bars}</span>
              </b>
              <span>{t("session.run.bars")}</span>
            </span>
            <span className="session-compact-coach session-why">{exercise.coachLine}</span>
          </>
        ) : (
          <div className="session-brief">
            <CoachLine>{exercise.coachLine}</CoachLine>
          </div>
        )}
        <span className="session-compact-stat session-compact-bpm">
          <b>{run.bpm}</b>
          <span>{t("session.run.bpm")}</span>
        </span>
      </div>

      {neckOn && <div className="session-slot" data-runway-neck="" ref={slot} aria-hidden="true" />}

      {runwayOn && (
        <Runway
          take={take}
          beat={beat}
          playing={isPlaying}
          lights={lights}
          collapsed={false}
          onNext={onNext}
        />
      )}

      <div className="session-actions">
        <div className="session-runway-notes">
          {/* The ready screen keeps the one picture a hand needs before it
              plays, the neck (WHERE). The runway is WHEN, so it has nothing to
              say until the Take runs, and a frozen strip beside the neck would
              be two pictures at once (QA 2026-11-17 #19). Theory has no runway. */}
          {!running && !theory && (
            <span className="session-why session-runway-later" data-testid="runway-later">
              {t("session.runway.later")}
            </span>
          )}
          {!running && <HandLine position={exercise.position} />}
          {!running && exercise.howTo[0] && <span className="session-why">{exercise.howTo[0]}</span>}
          {!running && bar && <span className="session-why">{lineText(t, bar)}</span>}
          {!running && (
            <ReadyInput
              session={session}
              listening={listening}
              hasSignal={hasSignal}
              onTestInput={onTestInput}
              onChooseInput={onChooseInput}
            />
          )}
          {engineTrouble && (
            <div className="session-glass session-card" role="alert">
              <div className="session-why session-bad">{t("session.run.engineTrouble")}</div>
            </div>
          )}
        </div>
        {!running && <TempoNudges run={run} exercise={exercise} session={session} />}
        <button
          className="session-big"
          data-size="mid"
          onClick={!running && !canStart ? undefined : actions.go}
          aria-disabled={!running && !canStart ? true : undefined}
          aria-busy={start.busy ? true : undefined}
          data-input={!running && start.needsInput ? (start.busy ? "starting" : "off") : undefined}
          data-testid="session-big"
        >
          {running ? bigLabel(big, t) : start.label}
        </button>
      </div>

      {live.countingIn && running && (
        <div className="session-count" role="status">
          {t("session.run.countIn")}
        </div>
      )}
    </div>
  );
}
