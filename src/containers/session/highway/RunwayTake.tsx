/**
 * The Take screen in the "runway" view (plans/tasks/mvp/RUNWAY.md): the neck
 * straight-on above, six lanes of what comes next under it, one compact row of
 * numbers. The neck answers WHERE, the runway WHEN and WHAT NEXT.
 *
 * Behind the Neck / Runway switch; the neck view (`SessionView.tsx`) stays the
 * default. Nothing here decides anything: it reads the same Take, lights and
 * engine position the neck view reads.
 */
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { barLine, reasonLine } from "../../../session/coachWords";
import { currentStep, isEdgeStep } from "../../../session/runner";
import type { BeatPosition } from "../../../songs/position";
import { TAKE_COUNT_IN_BARS } from "../../../session/take";
import { useNeck } from "../../../stage3d/api";
import type { NeckView } from "../../../stage3d/api";
import type { SessionRun } from "../hooks/useSessionRun";
import { neckNotesOf, useNeckSlot, useNeckTake, zoomOf } from "../hooks/useNeck";
import { lineText } from "../lineText";
import { CoachLine, TempoNudges, bigLabel } from "../parts";
import { Runway } from "./Runway";
import { ghostNeck, runwayModel } from "./runwayModel";
import type { PracticeView, RunwayModel } from "./runwayModel";

/** Neck or Runway. Locked while a Take runs, so each Take has one view. */
export function PracticeViewSwitch({ session, locked }: { session: SessionRun; locked: boolean }) {
  const { t } = useTranslation();
  const views: PracticeView[] = ["neck", "runway"];
  return (
    <div
      className="session-viewswitch"
      role="radiogroup"
      aria-label={t("session.view.label")}
      title={locked ? t("session.view.between") : undefined}
      data-testid="practice-view"
    >
      {views.map((v) => (
        <button
          key={v}
          role="radio"
          aria-checked={session.practiceView === v}
          data-on={session.practiceView === v ? "" : undefined}
          disabled={locked}
          onClick={() => session.setPracticeView(v)}
          data-testid={`practice-view-${v}`}
        >
          {t(`session.view.${v}`)}
        </button>
      ))}
    </div>
  );
}

/** A Theory Exercise is about WHERE: the runway folds to one lane and the neck takes the room. */
export function isTheoryTake(session: SessionRun): boolean {
  const pathId = session.take?.pathId;
  return !!pathId && session.paths.find((p) => p.id === pathId)?.kind === "theory";
}

export function RunwayTakeScreen({
  session,
  beat,
  isPlaying,
  listening,
  hasSignal,
  onCheckSound,
}: {
  session: SessionRun;
  beat: BeatPosition | null;
  isPlaying: boolean;
  listening: boolean;
  hasSignal: boolean;
  onCheckSound: () => void;
}) {
  const { t } = useTranslation();
  const { run, take, exercise, live, lights, big, prepared, engineTrouble, actions } = session;
  const running = run.phase === "playing";
  const theory = isTheoryTake(session);
  const neck = useNeck();

  // The neck straight-on over the Exercise's frets; its shape quiet, the next
  // note amber and the one after a ghost (the runway moves those on).
  const played = take?.exercise.notes ?? exercise?.notes ?? [];
  const shape = useMemo(() => neckNotesOf(played, "aim"), [played]);
  const model = useMemo(() => (take ? runwayModel(take, TAKE_COUNT_IN_BARS) : null), [take]);
  const view: NeckView = useMemo(() => ({ ...zoomOf(played), flat: true }) as NeckView, [played]);
  const first = useMemo(() => (model ? ghostNeck(shape, model.onsets, 0) : shape), [shape, model]);
  const slot = useNeckSlot(view, first);
  useNeckTake(take, lights, running && isPlaying);
  const onNext = useCallback(
    (index: number, m: RunwayModel) => neck.setNotes(ghostNeck(shape, m.onsets, index), { fade: 0.12 }),
    [neck, shape],
  );

  const step = currentStep(run);
  if (!exercise || !take || !step) return null;

  const pathTitle = session.paths.find((p) => p.id === take.pathId);
  const stepNumber = pathTitle?.steps.find((s) => s.exercises.some((e) => e.id === exercise.id))?.order;
  const bar = barLine(exercise, run.bpm);
  const scored = live.heard + live.missed;
  const canStart = prepared && listening;
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
        {!running && <span className="session-why">{lineText(t, reasonLine(step.why))}</span>}
        <PracticeViewSwitch session={session} locked={running} />
      </div>

      <div className="session-compact" data-testid={running ? "session-live" : undefined}>
        {running ? (
          <>
            <span className="session-compact-stat">
              <b className="session-good">
                {scored > 0 ? `${Math.round((live.heard / scored) * 100)}%` : "–"}
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

      <div className="session-slot" data-runway-neck="" ref={slot} aria-hidden="true" />

      <Runway
        take={take}
        beat={beat}
        playing={running && isPlaying}
        lights={lights}
        collapsed={theory}
        onNext={onNext}
      />

      <div className="session-actions">
        <div className="session-runway-notes">
          {!running && listening && (
            <span className="session-signal" data-on={hasSignal ? "" : undefined}>
              <i />
              {t(hasSignal ? "session.run.hearing" : "session.run.waitingForSignal")}
            </span>
          )}
          {!running && exercise.howTo[0] && <span className="session-why">{exercise.howTo[0]}</span>}
          {!running && bar && <span className="session-why">{lineText(t, bar)}</span>}
          {!running && !listening && (
            <div className="session-glass session-card" role="status" data-testid="session-no-input">
              <div className="session-why">{t("session.run.noInput")}</div>
              <button className="session-link" onClick={onCheckSound}>
                {t("session.run.checkSound")}
              </button>
            </div>
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
          onClick={actions.go}
          disabled={!running && !canStart}
          data-testid="session-big"
        >
          {bigLabel(big, t)}
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
