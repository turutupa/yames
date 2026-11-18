/**
 * The running Session: one screen per state of the runner.
 *
 * No rail and no tools, because hands are on a guitar. There is one big thing to
 * press in every state, and it does what a pedal tap does: both come from
 * `bigAction`, so they cannot disagree.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  barLine,
  barStrip,
  decidingCheck,
  displayBar,
  displayValue,
  metricKey,
  notCaughtHint,
  reasonLine,
  takeLine,
} from "../../session/coachWords";
import type { BarCheck } from "../../session/grade";
import { EDGE_MINUTES, planSession } from "../../session/planner";
import type { PlanStep } from "../../session/planner";
import {
  currentStep,
  edgeOf,
  isEdgeStep,
  minutesLeft,
  stepRemainingMs,
  timedTempoAdjustable,
} from "../../session/runner";
import type { RunState, TakeOutcome } from "../../session/runner";
import { CoachLine, TempoNudges, bigLabel, timedHowKey } from "./parts";
import { RunwayTakeScreen, isTheoryTake } from "./highway/RunwayTake";
import { Runway } from "./highway/Runway";
import type { SessionRun } from "./hooks/useSessionRun";
import { exerciseNeck, useNeck3d, useNeckSlot } from "./hooks/useNeck";
import { PracticeViewSwitch } from "./practice/PracticeViewSwitch";
import { NeckInstruction } from "./practice/NeckInstruction";
import { PracticeTab } from "./practice/PracticeTab";
import { HandLine } from "./practice/HandLine";
import { resumeBeats, useWarmupBeat, warmupClockOf } from "./practice/useWarmupBeat";
import { Key, MetaClock, MetaTempo, PracticeHead, clockText } from "./practice/PracticeChrome";
import type { PracticeBeat } from "./practice/useWarmupBeat";
import type { TimingMark } from "../songs/review/marks";
import type { BeatPosition } from "../../songs/position";
import type { NeckKind, NeckView } from "../../stage3d/api";
import { lineText } from "./lineText";
import { honestLineKey } from "../../session/caveats";
import { ContextLine, StepTag, rise, stepTitle } from "./TodayView";
import { factsOf } from "../../session/progress";
import { totalsFrom } from "./ProgressView";
import type { MainView } from "../main-window/MainHeader";
import { IS_MOBILE } from "../../platform";
import "../../styles/session.css";

const WHOLE: NeckView = { kind: "whole" };

/** The Exercise the screen is about, as played: the Take's variant when there is one. */
function playedNotes(session: SessionRun) {
  return (session.take?.exercise ?? session.exercise)?.notes;
}

/** The neck framed on the Exercise's own frets, its notes in one colour. */
function useExerciseSlot(session: SessionRun, kind: NeckKind, sweep = false, clip = false) {
  const { view, notes } = exerciseNeck(playedNotes(session), kind, isTheoryTake(session));
  return useNeckSlot(clip && view.kind === "zoom" ? { ...view, clip: true } : view, notes, { sweep });
}

/** What an Exercise step plays, in the pack's words: its purpose. */
function purposeOf(session: SessionRun, step: PlanStep): string | null {
  if (step.kind !== "exercise") return null;
  const path = session.paths.find((p) => p.id === step.pathId);
  for (const s of path?.steps ?? []) {
    const found = s.exercises.find((e) => e.id === step.exerciseId);
    if (found) return found.purpose;
  }
  return null;
}

/** Exit, how far along, and how long is left. The mocks' session bar. */
function SessionBar({
  run,
  onExit,
  onSkip,
  skipKey,
}: {
  run: RunState;
  onExit: () => void;
  /** "Skip this" on a Take's ready screen (UX audit TODAY-2), with its key. */
  onSkip?: () => void;
  skipKey?: string;
}) {
  const { t } = useTranslation();
  const steps = run.plan?.steps ?? [];
  const left = minutesLeft(run);
  return (
    <div className="session-bar">
      <button className="session-exit" onClick={onExit} data-testid="session-exit">
        {t("session.run.exit")}
      </button>
      <div
        className="session-pips"
        role="img"
        aria-label={t("session.run.stepOf", { n: run.stepIndex + 1, of: steps.length })}
      >
        {steps.map((step, i) => (
          <i
            key={step.id}
            data-state={
              i < run.stepIndex ? (run.skipped.includes(step.id) ? "skipped" : "done") : i === run.stepIndex ? "on" : undefined
            }
            title={i < run.stepIndex && run.skipped.includes(step.id) ? t("session.run.skipped") : undefined}
          />
        ))}
      </div>
      {/* Started from a Step: no countdown, only a quiet clock of the time
          spent so far (UX audit SES-11). */}
      <span className="session-quiet session-bar-left" data-untimed={run.untimed ? "" : undefined}>
        {run.untimed
          ? clockText(Math.max(0, run.now - run.startedAt))
          : left > 0
            ? t("session.run.minutesLeft", { minutes: left })
            : t("session.run.timeUp")}
      </span>
      {onSkip && (
        <button className="session-skip-this" onClick={onSkip} data-testid="session-skip-this">
          {t("session.run.skip")}
          {skipKey && <kbd>{skipKey}</kbd>}
        </button>
      )}
    </div>
  );
}

/** The latest notes against the grid: a dot per note, late above, early below. */
function TimingStrip({ deviations }: { deviations: readonly number[] }) {
  const { t } = useTranslation();
  const W = 560;
  const H = 84;
  const MID = H / 2;
  const RANGE_MS = 50;
  const y = (ms: number) => MID - (Math.max(-RANGE_MS, Math.min(RANGE_MS, ms)) / RANGE_MS) * (MID - 8);
  const step = (W - 12) / 24;
  // The words are HTML beside the drawing, not SVG text in it: the drawing is
  // scaled to its box, and at the head's 46 px they came out about 6 px tall
  // (acceptance P2-5).
  return (
    <span className="session-strip" role="img" aria-label={t("session.run.stripLabel")}>
      <span className="session-strip-labels" aria-hidden="true">
        <span>{t("session.run.late")}</span>
        <span>{t("session.run.early")}</span>
      </span>
      <span className="session-strip-area" aria-hidden="true">
        <svg className="session-strip-plot" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <line x1="0" x2={W} y1={MID} y2={MID} className="session-strip-grid" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="session-strip-dots">
          {deviations.map((ms, i) => (
            <i
              key={i}
              className="session-strip-dot"
              style={{ left: `${((6 + i * step) / W) * 100}%`, top: `${(y(ms) / H) * 100}%` }}
            />
          ))}
        </span>
      </span>
    </span>
  );
}

/** One line for each thing the pedal does, so nobody has to remember. */
function PedalCard() {
  const { t } = useTranslation();
  return (
    <div className="session-glass session-card">
      <div className="session-kick">{t("session.pedal.title")}</div>
      <dl className="session-say">
        <dt className="session-ped">{t("session.pedal.tap")}</dt>
        <dd className="session-why">{t("session.pedal.tapDoes")}</dd>
        <dt className="session-ped">{t("session.pedal.double")}</dt>
        <dd className="session-why">{t("session.pedal.doubleDoes")}</dd>
        <dt className="session-ped">{t("session.pedal.hold")}</dt>
        <dd className="session-why">{t("session.pedal.holdDoes")}</dd>
      </dl>
    </div>
  );
}

/** Ready and running are one screen: what to play, and how it is going. */
function TakeScreen({
  session,
  beat,
  isPlaying,
  listening,
  hasSignal,
  viewKey,
  onCheckSound,
}: {
  session: SessionRun;
  beat: PracticeBeat | null;
  isPlaying: boolean;
  listening: boolean;
  hasSignal: boolean;
  viewKey: string;
  onCheckSound: () => void;
}) {
  const { t } = useTranslation();
  const { run, take, exercise, live, lights, big, prepared, engineTrouble, actions } = session;
  const running = run.phase === "playing";
  const tabView = session.practiceView === "tab";
  const step = currentStep(run);
  if (!exercise || !take || !step) return null;

  const pathTitle = session.paths.find((p) => p.id === take.pathId);
  const stepNumber = pathTitle?.steps.find((s) => s.exercises.some((e) => e.id === exercise.id))?.order;
  const bar = barLine(exercise, run.bpm);
  const scored = live.heard + live.missed;
  const inputReady = listening;
  const canStart = prepared && inputReady;
  const honest = honestLineKey(exercise);

  return (
    <div className="session-body" data-testid="session-take" data-phase={run.phase}>
      <PracticeHead
        kick={
          <>
            {isEdgeStep(step)
              ? t("session.edge.kick")
              : isTheoryTake(session)
                ? t("session.kind.theory")
                : t("session.kind.mechanics")}
            {pathTitle && ` · ${t("session.run.pathStep", { path: pathTitle.title, step: stepNumber ?? 1 })}`}
          </>
        }
        title={exercise.title}
        aside={
          <PracticeViewSwitch
            view={session.practiceView}
            onChange={session.setPracticeView}
            locked={running}
            keyLabel={viewKey}
          />
        }
        meta={
          <>
            <MetaTempo bpm={run.bpm} />
            {running && (
              <span className="session-row session-live practice-live" data-testid="session-live">
                {/* Nothing scored yet: a quiet "–%", not a green dash that
                    reads as an empty bar (QA 2026-11-17 #21). */}
                <span className="practice-num" data-tone={scored > 0 ? "good" : undefined}>
                  {scored > 0 ? `${Math.round((live.heard / scored) * 100)}%` : "–%"}
                  <small>{t("session.run.heardSoFar")}</small>
                </span>
                <span className="practice-num" data-testid="session-live-bars">
                  {live.bars}
                  <span className="session-stat-of"> / {take.bars}</span>
                  <small>{t("session.run.bars")}</small>
                </span>
                <TimingStrip deviations={live.deviations} />
              </span>
            )}
          </>
        }
        status={
          running
            ? live.countingIn
              ? t("session.run.countIn")
              : null
            : // What the Exercise is, not why the planner picked it: that is
              // Today's line, and in here it read as a log (UX audit TODAY-8).
              exercise.purpose
        }
        statusTone={running ? "live" : "quiet"}
      />
      {!running && <ContextLine step={step} />}

      {/* One picture at a time (the owner, 2026-11-16): the neck, numbered
          before the start and leading note by note while it runs, or the
          tab, large, its cursor following. Never both. */}
      {tabView ? (
        <PracticeTab take={take} running={running} beat={beat} playing={isPlaying} lights={lights} />
      ) : (
        <NeckInstruction
          take={take}
          running={running}
          beat={beat}
          playing={isPlaying}
          lights={lights}
          pluck
          theory={isTheoryTake(session)}
          className="session-practice-hero"
        />
      )}

      <div className="session-mechlow" data-single="">
        <div className="session-col">
          {!running && <HandLine position={exercise.position} />}
          <CoachLine>{exercise.coachLine}</CoachLine>
          {!running && (
            <HowLines collapsed={IS_MOBILE}>
              {exercise.howTo[0] && <div className="session-why">{exercise.howTo[0]}</div>}
              {bar && <div className="session-why">{lineText(t, bar)}</div>}
              {/* Said once a Session, before its first Take, not on every
                  screen of it (UX audit SES-14). */}
              {honest && run.outcomes.length === 0 && (
                <div className="session-why" data-testid="pick-caveat">{t(honest)}</div>
              )}
            </HowLines>
          )}
          <BandVolume session={session} hint={!running} />
          {!running && !inputReady && (
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
      </div>

      <div className="session-actions">
        {!running && inputReady && (
          <span className="session-signal" data-on={hasSignal ? "" : undefined}>
            <i />
            {t(hasSignal ? "session.run.hearing" : "session.run.waitingForSignal")}
          </span>
        )}
        {!running && session.canGoBack && <BackLink session={session} />}
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

    </div>
  );
}

/**
 * The how-to under the coach's line. On a phone it folds behind "How"
 * (PHONE-2): three paragraphs there pushed the Start button a screen down and
 * read as a wall; the coach's line stays open, the rest is one tap away.
 */
function HowLines({ collapsed, children }: { collapsed: boolean; children: React.ReactNode }) {
  const { t } = useTranslation();
  if (!collapsed) return <>{children}</>;
  return (
    <details className="session-how" data-testid="session-how">
      <summary>{t("session.paths.howTo")}</summary>
      <div className="session-how-body">{children}</div>
    </details>
  );
}

/** A bar as the player reads it: "Bar 85%", "Bar: 2 or fewer". */
function barText(check: Pick<BarCheck, "metric" | "min" | "max">, t: ReturnType<typeof useTranslation>["t"]): string | null {
  const bar = displayBar(check);
  if (bar === null) return null;
  return check.metric === "extraNotes" ? t("session.result.barChipCount", { bar }) : t("session.result.barChip", { bar });
}

/**
 * The number the verdict turned on (UX audit SES-3), the same kind of number
 * whichever way the Take went: on a miss what held it back, on a pass the
 * closest call. Said in words above it, with the bar beside it, ✓ or ✗.
 */
function DecidingNumber({ outcome }: { outcome: TakeOutcome }) {
  const { t } = useTranslation();
  const check = decidingCheck(outcome.grade);
  if (!check) return null;
  const value = displayValue(check);
  const metric = metricKey(check.metric);
  const percent = check.metric !== "extraNotes";
  // The last Take's number is kept for the grade's own headline; it only
  // means something beside the same metric.
  const sameAsStored = outcome.grade.headline?.metric === check.metric;
  const before =
    outcome.previousValue === null || !sameAsStored
      ? null
      : displayValue({ metric: check.metric, value: outcome.previousValue });
  const moved = before !== null && before !== value;
  const met = check.met === true;
  const bar = barText(check, t);
  return (
    <div className="session-decided" data-testid="session-moved" data-metric={check.metric} data-met={met ? "" : undefined}>
      <div className="session-kick session-decided-why">
        {t(met ? "session.result.decidedPass" : "session.result.decidedMiss")}
      </div>
      <div className="session-moved">
        {/* The two numbers never part: "78 →" alone on a line above the
            result read as a heading (acceptance P1-2). */}
        <span className="session-moved-pair">
          {moved && (
            <span className="session-moved-before" data-testid="session-moved-before">
              <small>{t("session.result.lastTime")}</small>
              {before} →
            </span>
          )}
          <span className="session-moved-value" data-met={met ? "" : undefined}>
            {value}
            {percent ? "%" : ""}
          </span>
        </span>
        <span className="session-h2 session-fade" style={rise(3)}>{t(`session.metric.${metric}`)}</span>
        {bar !== null && (
          <span className="session-tag session-barchip" data-met={met ? "" : undefined} data-testid="session-barchip">
            <span aria-hidden="true">{met ? "✓" : "✗"}</span> {bar}
            <span className="sr-only"> {t(met ? "session.result.barMet" : "session.result.barMissed")}</span>
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Everything else the bar asked for, each with its own ✓ or ✗, and what could
 * not be checked this time, said plainly in one place (UX audit SES-2, SES-3).
 */
function OtherChecks({ outcome }: { outcome: TakeOutcome }) {
  const { t } = useTranslation();
  const deciding = decidingCheck(outcome.grade);
  const others = outcome.grade.checks.filter((c) => c !== deciding && c.met !== null && c.value !== null);
  // Only the pitch check is ever left unmeasured by this build; it is said
  // plainly here, in one place (UX audit SES-2).
  const unchecked = outcome.grade.unmeasured.includes("noteIdentity");
  if (others.length === 0 && !unchecked) return null;
  return (
    <ul className="session-checks" data-testid="session-checks">
      {others.map((c, i) => {
        const value = displayValue(c);
        const bar = barText(c, t);
        return (
          <li key={i} data-met={c.met ? "" : undefined} data-missed={c.met === false ? "" : undefined}>
            <span className="session-check-mark" aria-hidden="true">{c.met ? "✓" : "✗"}</span>
            <span>
              <b>
                {value}
                {c.metric !== "extraNotes" ? "%" : ""}
              </b>{" "}
              {t(`session.metric.${metricKey(c.metric)}`)}
            </span>
            {bar && <span className="session-check-bar">{bar}</span>}
          </li>
        );
      })}
      {unchecked && (
        <li data-unchecked="">
          <span className="session-check-mark" aria-hidden="true">–</span>
          <span>{t("session.result.notesNotChecked")}</span>
        </li>
      )}
    </ul>
  );
}

/**
 * Bar by bar (UX audit SES-3): every bar of the Take, green with ✓ where it
 * held, red with ✗ where it slipped, from the scorer's own per-bar figures;
 * the stretch that counted underlined.
 */
function BarByBar({ session, outcome }: { session: SessionRun; outcome: TakeOutcome }) {
  const { t } = useTranslation();
  const exercise = session.exercise;
  if (!exercise) return null;
  const strip = barStrip(exercise, outcome.measures);
  if (!strip || strip.cells.length < 2) return null;
  const { cells, held } = strip;
  const inHeld = (n: number) => !!held && n >= held.from && n < held.from + held.count;
  const met = cells.filter((c) => c.state === "met").length;
  return (
    <div className="session-bars" data-testid="session-bars">
      <div className="session-bars-head">
        <span className="session-kick">{t("session.result.barsTitle")}</span>
        <span className="session-why">
          {held && outcome.grade.verdict === "passed"
            ? t("session.result.barsHeld", { count: held.count })
            : t("session.result.barsMet", { count: met, of: cells.length })}
        </span>
      </div>
      <ol className="session-bars-row" style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}>
        {cells.map((c) => (
          <li
            key={c.n}
            data-state={c.state}
            data-held={inHeld(c.n) ? "" : undefined}
            aria-label={t(
              c.state === "met" ? "session.result.barHeld" : c.state === "missed" ? "session.result.barSlipped" : "session.result.barThin",
              { n: c.n },
            )}
          >
            <span aria-hidden="true">{c.state === "met" ? "✓" : c.state === "missed" ? "✗" : "·"}</span>
            <small aria-hidden="true">{c.n}</small>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Close enough to the bar either way that the player's own view is worth asking (UX audit SES-5). */
function borderline(outcome: TakeOutcome): boolean {
  const check = decidingCheck(outcome.grade);
  if (!check) return false;
  const value = displayValue(check);
  const bar = displayBar(check);
  if (value === null || bar === null) return false;
  return Math.abs(value - bar) <= (check.metric === "extraNotes" ? 1 : 5);
}

function CleanTempoLine({ outcome }: { outcome: TakeOutcome }) {
  const { t } = useTranslation();
  const earned = outcome.grade.cleanBpm;
  if (earned === null) return null;
  if (outcome.cleanBefore !== null && outcome.cleanBefore >= earned) return null;
  return (
    <div className="session-clean" data-testid="session-clean">
      {outcome.cleanBefore === null
        ? t("session.result.cleanFirst", { bpm: earned })
        : t("session.result.cleanMoved", { from: outcome.cleanBefore, bpm: earned })}
    </div>
  );
}

/**
 * Find my edge, after a Take: the climb so far, and the edge once it is found.
 *
 * The edge is the fastest rung passed over eight bars, which is a clean tempo by
 * the owner's definition, so `CleanTempoLine` above already says when it moved.
 */
function EdgePanel({ session }: { session: SessionRun }) {
  const { t } = useTranslation();
  const edge = edgeOf(session.run, session.exercise);
  return (
    <div className="session-edge" data-testid="session-edge" data-done={edge.done ? "" : undefined}>
      <div className="session-edge-head">
        {edge.reached !== null ? (
          <b>
            {edge.done
              ? t("session.edge.done", { bpm: edge.reached })
              : t("session.edge.reached", { bpm: edge.reached })}
          </b>
        ) : (
          edge.done && <b>{t("session.edge.none")}</b>
        )}
        {edge.slippedAt !== null && (
          <span className="session-why">{t("session.edge.slipped", { bpm: edge.slippedAt })}</span>
        )}
      </div>
      {/* One rung per tempo, with every Take on it as ✓ or ✗: a slip and
          its retry are one rung, not "90 90" (UX audit SES-12). */}
      <div className="session-edge-climb" role="list" aria-label={t("session.edge.climb")}>
        {rungsOf(edge.climb).map((rung) => (
          <span
            key={rung.bpm}
            role="listitem"
            className="session-edge-rung"
            data-state={rung.marks.includes("met") ? "met" : rung.marks.includes("missed") ? "missed" : "none"}
            aria-label={t("session.edge.rungLabel", {
              bpm: rung.bpm,
              met: rung.marks.filter((m) => m === "met").length,
              missed: rung.marks.filter((m) => m === "missed").length,
            })}
          >
            {rung.bpm}
            <span className="session-edge-marks" aria-hidden="true">
              {rung.marks.map((m, i) => (
                <i key={i} data-mark={m}>
                  {m === "met" ? "✓" : m === "missed" ? "✗" : "·"}
                </i>
              ))}
            </span>
          </span>
        ))}
      </div>
      {!edge.done && <div className="session-why">{t("session.edge.how")}</div>}
    </div>
  );
}

/** The climb, one rung per tempo in the order first reached, each with its Takes' marks. */
function rungsOf(climb: ReadonlyArray<{ bpm: number; verdict: TakeOutcome["grade"]["verdict"] }>) {
  const out: Array<{ bpm: number; marks: Array<"met" | "missed" | "none"> }> = [];
  for (const take of climb) {
    let rung = out.find((r) => r.bpm === take.bpm);
    if (!rung) out.push((rung = { bpm: take.bpm, marks: [] }));
    rung.marks.push(take.verdict === "passed" ? "met" : take.verdict === "belowBar" ? "missed" : "none");
  }
  return out;
}

/**
 * "Was this grade fair?": one tap, kept in the Take's facts for the export; a
 * tap on the other answer changes it, and the thanks says which is kept.
 * Only on a graded result: a Take not heard has no grade to judge.
 */
export function FairTap({
  session,
  outcome,
  askKey = "session.result.fairAsk",
}: {
  session: SessionRun;
  outcome: TakeOutcome;
  /** The question: about this Take, or (on the recap) about today's grades. */
  askKey?: string;
}) {
  const { t } = useTranslation();
  const id = outcome.takeId;
  if (!id) return null;
  const row = session.progress.takes.find((take) => take.id === id);
  const answer = row ? factsOf(row).fair : undefined;
  return (
    <div className="session-fair" role="group" aria-label={t(askKey)} data-testid="session-fair">
      <span>{t(askKey)}</span>
      {(["yes", "no"] as const).map((value) => (
        <button
          key={value}
          className="session-secondary"
          aria-pressed={answer === value}
          onClick={() => session.actions.answerFair(id, value)}
          data-testid={`session-fair-${value}`}
        >
          {t(value === "yes" ? "session.result.fairYes" : "session.result.fairNo")}
        </button>
      ))}
      {answer && (
        <span role="status" data-answer={answer}>
          {t(answer === "yes" ? "session.result.fairThanksYes" : "session.result.fairThanksNo")}
        </span>
      )}
    </div>
  );
}

/**
 * A graded Take. Passed or not, one layout and one order (UX audit SES-3): the
 * number the verdict turned on, why in words, the rest of the bar, the Take
 * bar by bar; then the big button, which after a miss is Go again and after a
 * pass is what comes next (SES-4).
 */
function ResultScreen({ session, pedalMapped }: { session: SessionRun; pedalMapped: boolean }) {
  const { t } = useTranslation();
  const { run, exercise, big, actions } = session;
  const outcome = run.outcomes[run.outcomes.length - 1];
  const passed = outcome?.grade.verdict === "passed";
  // The warm sweep on every result; the notes green when the bar was met.
  // A phone hides the neck here (phone-learning.css, PHONE-4).
  // Clipped to its own column: never behind the result's words (acceptance P1-2).
  const slot = useExerciseSlot(session, passed ? "tone" : "aim", true, true);
  if (!outcome) return null;
  const onEdge = isEdgeStep(currentStep(run));
  const line = takeLine(outcome.grade, outcome.measures, outcome.bpm);
  return (
    <div className="session-body" data-testid={passed ? "session-result" : "session-between"} data-verdict={outcome.grade.verdict}>
      <div className="session-between">
        <div className="session-col">
          <div className="session-kick session-fade" style={rise(1)}>
            {t("session.result.kick", {
              take: outcome.takeNumber,
              title: outcome.title,
              bpm: outcome.bpm,
              bars: outcome.measures.barsPlayed,
            })}
          </div>
          <DecidingNumber outcome={outcome} />
          <CleanTempoLine outcome={outcome} />
          {onEdge && <EdgePanel session={session} />}
          <CoachLine good={passed}>{lineText(t, line)}</CoachLine>
          <OtherChecks outcome={outcome} />
          <BarByBar session={session} outcome={outcome} />
          {/* There at once, with no fade: a pedal tap the moment the result
              lands must find it (UX audit SES-15). */}
          <button className="session-big" data-size="mid" onClick={actions.go} data-testid="session-big">
            {bigLabel(big, t)}
          </button>
          <div className="session-nudges">
            <TempoNudges run={run} exercise={exercise} session={session} />
            {big.kind !== "again" && (
              <button className="session-secondary" onClick={actions.again} data-testid="session-again">
                {t("session.run.goAgain", { bpm: run.bpm })}
              </button>
            )}
            {big.kind === "again" && (
              <button className="session-secondary" onClick={actions.next} data-testid="session-move-on">
                {t("session.result.moveOn")}
              </button>
            )}
          </div>
          {/* Asked where the answer is worth having: a result near its bar
              either way. The recap asks about the rest (UX audit SES-5). */}
          {borderline(outcome) && <FairTap session={session} outcome={outcome} />}
          {passed && !onEdge && (
            <button
              className="session-choice session-glass"
              onClick={actions.findEdgeFromHere}
              data-testid="session-find-edge"
            >
              <b>{t("session.edge.offerTitle")}</b>
              <span>{t("session.edge.offerBody", { bpm: outcome.bpm, minutes: EDGE_MINUTES })}</span>
            </button>
          )}
          {pedalMapped && <PedalCard />}
        </div>
        <div className="session-col">
          <div className="session-slot" ref={slot} aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

function NoCatchScreen({
  session,
  onCheckSound,
}: {
  session: SessionRun;
  onCheckSound: () => void;
}) {
  const { t } = useTranslation();
  const { run, big, actions } = session;
  const outcome = run.outcomes[run.outcomes.length - 1];
  // The neck quiet: nothing on it was heard well enough to colour.
  const slot = useExerciseSlot(session, "dim");
  if (!outcome) return null;
  const { measures } = outcome;
  return (
    <div className="session-body" data-testid="session-no-catch">
      <div className="session-center" data-top="">
        <div className="session-kick session-rise">{t("session.noCatch.kick")}</div>
        <h1 className="session-h1 session-rise" style={rise(1)}>
          {t("session.noCatch.title")}
        </h1>
        {measures.expected > 0 && (
          <div className="session-stat session-rise" style={rise(2)}>
            <b>{measures.heard}</b>
            <span>{t("session.noCatch.heardOf", { expected: measures.expected })}</span>
          </div>
        )}
        <div className="session-why session-rise" style={rise(3)}>
          {t("session.noCatch.noGuess")} {lineText(t, notCaughtHint(measures))}
        </div>
      </div>
      <div className="session-slot" ref={slot} aria-hidden="true" />
      <div className="session-center">
        <button
          className="session-big"
          data-size="mid"
          onClick={actions.go}
          data-testid="session-big"
        >
          {bigLabel(big, t)}
        </button>
        <div className="session-nudges">
          <button className="session-link" onClick={onCheckSound}>
            {t("session.run.checkSound")}
          </button>
          <button className="session-link" onClick={actions.next}>
            {t("session.result.moveOn")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** How loud the band under this Exercise is. Only when there is one. */
export function BandVolume({ session, hint }: { session: SessionRun; hint: boolean }) {
  const { t } = useTranslation();
  if (!session.hasBand) return null;
  return (
    <>
      <label className="session-band" data-testid="session-band">
        <span>{t("session.run.band")}</span>
        <input
          type="range"
          min={0}
          max={1.5}
          step={0.05}
          value={session.bandVolume}
          onChange={(e) => session.setBandVolume(Number(e.target.value))}
        />
      </label>
      {hint && (
        <div className="session-why">
          {t(session.directInput ? "session.run.bandHint" : "session.run.bandMicHint")}
        </div>
      )}
    </>
  );
}

/**
 * A metronome, a jam or a drill: not graded, and it moves on by itself.
 *
 * It opens ready, like a Take: what to play, its tempo and its minutes, the
 * neck at rest, and a Start. The clock, the click and the camera's move all
 * wait for that press, so the first block of a Session is not already running
 * by the time anyone has read it (owner, 2026-11-17).
 */
const NO_LIGHTS: ReadonlyMap<number, TimingMark> = new Map();

/** A Take's whole range in ticks: one loop of a finisher, which the engine repeats. */
function takeTicks(take: NonNullable<SessionRun["take"]>): number {
  const first = take.score.bars[take.range.startBar];
  const last = take.score.bars[take.range.endBar];
  return first && last ? last.startTick + last.lengthTicks - first.startTick : 0;
}

/** A jam or a ramp: the whole neck at rest, nothing on it to follow. */
function WholeNeckSlot() {
  const slot = useNeckSlot(WHOLE, []);
  return <div className="session-slot" ref={slot} aria-hidden="true" />;
}

/** Which bar of the pattern a position is in, from 1, and how many there are. */
function patternBarOf(take: NonNullable<SessionRun["take"]>, pos: BeatPosition | null): { n: number; of: number } | null {
  if (!pos || pos.songCountIn) return null;
  const first = take.score.bars[take.range.startBar];
  const barTicks = first?.lengthTicks || take.score.ticksPerQuarter * 4;
  const of = Math.max(1, take.exercise.bars);
  const into = pos.songTick - (first?.startTick ?? 0);
  return { n: (((Math.floor(into / barTicks) % of) + of) % of) + 1, of };
}

function TimedScreen({
  session,
  bpmNow,
  beat,
  isPlaying,
  viewKey,
  pauseKey,
  restartKey,
}: {
  session: SessionRun;
  bpmNow: number;
  beat: PracticeBeat | null;
  isPlaying: boolean;
  viewKey: string;
  pauseKey: string;
  restartKey: string;
}) {
  const { t } = useTranslation();
  const { run, take, big, actions } = session;
  const step = currentStep(run);
  const ready = run.phase === "timedReady";
  const running = !ready;
  const ended = running && run.ended;
  const paused = running && run.paused;
  const live = running && !paused && !ended;
  // A warm-up plays the click alone, so its position is made from the click's
  // beats; a finisher loads its Exercise as a song, so the engine reports one.
  const warmup = step?.kind === "metronome";
  const finisher = step?.kind === "jam" && !!step.exerciseId;
  const pattern = (warmup || finisher) && take ? take : null;

  // Paused: the picture holds where it was, and a Resume carries on from that
  // bar after a count-in. A Restart is from the top.
  const [fromBeats, setFromBeats] = useState(0);
  const [frozen, setFrozen] = useState<BeatPosition | null>(null);
  const lastPos = useRef<BeatPosition | null>(null);
  const warmBeat = useWarmupBeat(warmup ? take : null, beat, live && isPlaying, fromBeats);
  const livePos = warmup ? warmBeat : finisher ? beat : null;
  if (live && livePos && !livePos.songCountIn) lastPos.current = livePos;
  useEffect(() => {
    if (!paused) return;
    const at = lastPos.current;
    setFrozen(at);
    if (warmup && pattern) {
      const clock = warmupClockOf(pattern);
      const barTicks = pattern.score.bars[pattern.range.startBar]?.lengthTicks || clock.perQuarter * 4;
      setFromBeats(resumeBeats(clock, at, barTicks));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);
  useEffect(() => {
    lastPos.current = null;
    setFrozen(null);
    setFromBeats(0);
  }, [run.restarts, run.stepIndex]);
  const position = paused ? frozen : livePos;

  if (!step) return null;
  const kick =
    step.kind === "metronome"
      ? t(step.why.code === "yourTurn" ? "session.timed.yourTurnKick" : "session.timed.warmUpKick")
      : step.kind === "jam"
        ? t(step.exerciseId ? "session.timed.finisherKick" : "session.timed.jamKick")
        : t("session.timed.drillKick");
  const adjustable = timedTempoAdjustable(step);
  const bpm = adjustable ? run.bpm : step.kind === "jam" && step.bpm ? step.bpm : bpmNow;
  const view = session.practiceView;
  const countingIn = !!pattern && live && isPlaying && !!position?.songCountIn;
  const where = pattern ? patternBarOf(pattern, position) : null;
  const left = stepRemainingMs(run);
  const checked = step.kind === "metronome" && step.why.code === "yourTurn";

  const status = ready
    ? (session.exercise?.purpose ?? lineText(t, reasonLine(step.why)))
    : ended
      ? t("session.practice.ended")
      : paused
      ? where
        ? t("session.practice.pausedAt", { n: where.n, of: where.of })
        : t("session.practice.paused")
      : countingIn
        ? t("session.run.countIn")
        : where
          ? t("session.practice.barOf", { n: where.n, of: where.of })
          : null;

  const picture = !pattern ? (
    <WholeNeckSlot />
  ) : view === "tab" ? (
    <PracticeTab
      take={pattern}
      running={running}
      paused={paused || ended}
      beat={ended ? null : position}
      playing={live && isPlaying}
      loopTicks={warmup ? warmupClockOf(pattern).passTicks : takeTicks(pattern)}
    />
  ) : view === "runway" ? (
    <Runway take={pattern} beat={position} playing={live && isPlaying} lights={NO_LIGHTS} />
  ) : (
    <NeckInstruction
      take={pattern}
      running={running}
      beat={position}
      playing={live && isPlaying}
      theory={isTheoryTake(session)}
      className="session-practice-hero"
    />
  );

  return (
    <div
      className="session-body"
      data-testid="session-timed"
      data-kind={step.kind}
      data-phase={run.phase}
      data-paused={paused ? "" : undefined}
      data-ended={ended ? "" : undefined}
      data-view={pattern ? view : undefined}
    >
      <PracticeHead
        kick={kick}
        title={stepTitle(step, t)}
        aside={
          // Live the whole time: nothing here is graded, so the player may
          // look at it whichever way helps, while it plays.
          pattern && <PracticeViewSwitch view={view} onChange={session.setPracticeView} locked={false} keyLabel={viewKey} />
        }
        meta={
          <>
            <MetaClock ms={left} held={ready || paused || ended} />
            {bpm > 0 && (
              <MetaTempo
                bpm={bpm}
                onSlower={adjustable && (ready || paused || ended) ? actions.slower : undefined}
                onFaster={adjustable && (ready || paused || ended) ? actions.faster : undefined}
                slowerKey="↓"
                fasterKey="↑"
              />
            )}
          </>
        }
        status={status}
        statusTone={ready || ended ? "quiet" : paused ? "hold" : "live"}
      />
      {picture}
      {/* The whole pattern under the neck or the runway before the start:
          learn the sequence before keeping up (owner, beta 5). Paused, the
          neck holds where it was and the Tab view (V) has every bar marked;
          an overview here would reframe the camera under the player. */}
      {pattern && view !== "tab" && ready && (
        <PracticeTab take={pattern} running={false} beat={null} playing={false} fretStrip={false} compact />
      )}
      <div className="practice-foot">
        {ready ? (
          <span className="practice-note" data-testid="session-timed-how">
            {pattern && <HandLine position={pattern.exercise.position} />} {t(timedHowKey(step))}
          </span>
        ) : ended ? (
          <span className="practice-note" data-testid="session-timed-ended">{t("session.practice.endedFoot")}</span>
        ) : paused ? (
          <span className="practice-note">
            {t(view === "tab" || !pattern ? "session.practice.pausedFoot" : "session.practice.pausedFootNeck", { key: viewKey })}
          </span>
        ) : (
          <span className="practice-note">
            {t(checked ? "session.practice.notChecked" : "session.practice.notGraded", { time: clockText(left) })}
          </span>
        )}
        <span className="practice-grow" />
        {ready && session.canGoBack && <BackLink session={session} />}
        {ready && (
          <button className="session-link" onClick={actions.next} data-testid="session-skip">
            {t("session.timed.skip")}
          </button>
        )}
        {pattern && (ready || live) && (
          <span className="practice-note practice-switchhint">
            {t("session.practice.switchAny")} · <b>{viewKey}</b>
          </span>
        )}
        {running && (
          <button
            className="session-secondary practice-control"
            onClick={actions.restart}
            data-testid="session-restart"
            title={t("session.practice.restart")}
          >
            <RestartIcon /> {t(ended ? "session.practice.again" : "session.practice.restart")} <Key k={restartKey} />
          </button>
        )}
        {/* The big button is what Space, Enter and the pedal do (SES-1): while
            it runs that is Pause, so moving on is a link and never a slip. */}
        {(live || paused) && (
          <button className="session-link practice-next-link" onClick={actions.go} data-testid="session-next-link">
            {bigLabel(big, t)} →
          </button>
        )}
        {live ? (
          <button
            className="session-big practice-pausebig"
            data-size="mid"
            onClick={actions.togglePause}
            data-testid="session-pause"
            title={t("session.practice.pauseKeys", { key: pauseKey })}
          >
            <PauseIcon /> {t("session.practice.pause")}
          </button>
        ) : paused ? (
          <button className="session-big" data-size="mid" onClick={actions.togglePause} data-testid="session-resume">
            <PlayIcon /> {t("session.practice.resume")}
          </button>
        ) : (
          <button
            className="session-big"
            data-size={ready ? undefined : "mid"}
            onClick={actions.go}
            data-testid="session-big"
            title={ready ? t("session.timed.startKeys") : undefined}
          >
            {bigLabel(big, t)}
          </button>
        )}
      </div>
    </div>
  );
}

/** "Again: A melody up one string": the timed step before this one, from its ready screen. */
function BackLink({ session }: { session: SessionRun }) {
  const { t } = useTranslation();
  const before = session.run.plan?.steps[session.run.stepIndex - 1];
  if (!before) return null;
  return (
    <button className="session-link" onClick={session.actions.back} data-testid="session-back">
      ↺ {t("session.practice.back", { title: stepTitle(before, t) })}
    </button>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <rect x="3" y="2" width="3.6" height="12" rx="1" fill="currentColor" />
      <rect x="9.4" y="2" width="3.6" height="12" rx="1" fill="currentColor" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M4 2.5v11l9.5-5.5z" fill="currentColor" />
    </svg>
  );
}

function RestartIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3 8a5 5 0 1 0 1.5-3.6" strokeLinecap="round" />
      <path d="M3.2 1.8v3h3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RecapItem({ step, session }: { step: PlanStep; session: SessionRun }) {
  const { t } = useTranslation();
  const outcomes = session.run.outcomes.filter((o) => o.stepId === step.id);
  if (outcomes.length === 0) return null;
  const first = outcomes[0];
  const last = outcomes[outcomes.length - 1];
  if (isEdgeStep(step)) {
    const reached = outcomes.reduce<number | null>(
      (most, o) =>
        o.grade.verdict === "passed" && o.grade.cleanBpm !== null
          ? Math.max(most ?? 0, o.grade.cleanBpm)
          : most,
      null,
    );
    return (
      <div className="session-recap-item session-glass session-rise">
        <div className="session-recap-text">
          <div className="session-plan-title">{`${t("session.edge.kick")} · ${first.title}`}</div>
          <div className="session-why">
            {t("session.recap.takesAt", { count: outcomes.length, bpm: last.bpm })}
          </div>
        </div>
        {reached !== null && (
          <div className="session-recap-number">
            {first.cleanBefore !== null && first.cleanBefore !== reached && (
              <span>{first.cleanBefore} → </span>
            )}
            <b>{reached}</b>
            <small>{t("session.edge.recap")}</small>
          </div>
        )}
      </div>
    );
  }
  const graded = outcomes.filter((o) => o.grade.headline && o.grade.verdict !== "notCaught");
  const head = graded[graded.length - 1]?.grade.headline ?? null;
  const metric = head ? metricKey(head.metric) : null;
  const value = head ? displayValue(head) : null;
  const percent = head?.metric !== "extraNotes";
  const before =
    graded[0]?.previousValue != null && head
      ? displayValue({ metric: head.metric, value: graded[0].previousValue })
      : null;
  return (
    <div className="session-recap-item session-glass session-rise">
      <div className="session-recap-text">
        <div className="session-plan-title">{first.title}</div>
        <div className="session-why">
          {t("session.recap.takesAt", { count: outcomes.length, bpm: last.bpm })}
          {last.grade.verdict === "passed" ? ` · ${t("session.result.barMet")}` : ""}
        </div>
      </div>
      {value !== null && metric && (
        <div className="session-recap-number">
          {before !== null && before !== value && <span>{before} → </span>}
          <b>
            {value}
            {percent ? "%" : ""}
          </b>
          <small>{t(`session.metric.${metric}`)}</small>
        </div>
      )}
    </div>
  );
}

/** A learning screen's name, as the rail calls it. */
function placeName(view: MainView, t: ReturnType<typeof useTranslation>["t"]): string {
  return view === "paths" || view === "progress" || view === "tools" ? t(`session.nav.${view}`) : t("session.nav.today");
}

/**
 * The recap (UX audit SES-10): what the Session did, in numbers that mean
 * something (minutes, Takes, the streak), what changed, what comes next, and
 * three ways on. No empty neck, and no button the width of the window.
 */
function RecapScreen({ session }: { session: SessionRun }) {
  const { t } = useTranslation();
  const { run, actions } = session;
  const steps = run.plan?.steps ?? [];
  const passed = new Set(
    run.outcomes.filter((o) => o.grade.passesExercise).map((o) => o.exerciseId),
  ).size;
  const takes = run.outcomes.length;
  const notGraded = run.timedSteps.length > 0;
  const minutes = Math.max(1, Math.round((run.now - run.startedAt) / 60_000));
  const streak = totalsFrom(session.progress.takes, session.paths).streak;
  // The best news first: a clean tempo that rose, then a pass, then the time put in.
  const raised = [...run.outcomes]
    .reverse()
    .find((o) => o.grade.cleanBpm !== null && (o.cleanBefore === null || o.grade.cleanBpm > o.cleanBefore));
  const lastGraded = [...run.outcomes].reverse().find((o) => o.takeId && o.grade.verdict !== "notCaught" && o.grade.verdict !== "ungraded");
  const tomorrow = planSession({
    minutes: session.minutes,
    now: Date.now(),
    paths: session.myPaths,
    progress: session.progress,
  });
  const origin = session.origin;
  const lastExercise = [...steps].reverse().find((s) => s.kind === "exercise");

  return (
    <div className="session-body session-recap" data-testid="session-recap">
      <div className="session-recap-head session-rise">
        <div className="session-kick">{t("session.recap.kick")}</div>
        <h1 className="session-h1">
          {raised && raised.grade.cleanBpm !== null
            ? t("session.recap.headClean", { bpm: raised.grade.cleanBpm, title: raised.title })
            : passed > 0
              ? t("session.recap.passed", { count: passed })
              : takes > 0
                ? t("session.recap.headPlayed", { count: minutes })
                : t("session.recap.none")}
        </h1>
        <dl className="session-recap-stats" data-testid="session-recap-stats">
          <div>
            <dt>{t("session.recap.statMinutesLabel")}</dt>
            <dd>{t("session.recap.statMinutes", { count: minutes })}</dd>
          </div>
          <div>
            <dt>{t("session.recap.statTakesLabel")}</dt>
            <dd>{takes}</dd>
          </div>
          {streak > 0 && (
            <div data-testid="session-recap-streak">
              <dt>{t("session.recap.statStreakLabel")}</dt>
              <dd>{t("session.recap.statStreak", { count: streak })}</dd>
            </div>
          )}
        </dl>
      </div>
      <div className="session-split">
        <div className="session-col">
          <div className="session-kick session-rise">{t("session.recap.moved")}</div>
          {steps.map((step) => (
            <RecapItem key={step.id} step={step} session={session} />
          ))}
          {takes === 0 && <div className="session-why">{t("session.recap.noTakes")}</div>}
          {notGraded && <div className="session-why">{t("session.recap.notGraded")}</div>}
          {lastGraded && <FairTap session={session} outcome={lastGraded} askKey="session.recap.fairAsk" />}
        </div>
        <div className="session-col">
          <div className="session-kick session-rise">
            {t("session.recap.nextSession", { minutes: tomorrow.minutes })}
          </div>
          {tomorrow.steps
            .filter((s) => s.kind === "exercise")
            .map((step) => (
              <div className="session-plan-item session-glass session-rise" key={step.id}>
                <div className="session-plan-body">
                  <div className="session-plan-title">
                    <span>{stepTitle(step, t)}</span>
                    <StepTag step={step} paths={session.paths} />
                  </div>
                  <div className="session-why">
                    {purposeOf(session, step) ?? lineText(t, reasonLine(step.why))}
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>
      <div className="session-recap-actions">
        {/* The big button is what the pedal's tap does: back where the
            Session began. */}
        <button className="session-big" data-size="mid" onClick={actions.go} data-testid="session-big">
          {t("session.recap.backTo", { place: placeName(origin, t) })}
        </button>
        <button className="session-secondary" onClick={actions.moreMinutes} data-testid="session-more">
          {run.untimed && lastExercise
            ? t("session.recap.keepGoing", { title: stepTitle(lastExercise, t) })
            : t("session.recap.more")}
        </button>
        {origin !== "progress" && (
          <button className="session-link" onClick={() => actions.closeTo("progress")} data-testid="session-to-progress">
            {t("session.nav.progress")} →
          </button>
        )}
      </div>
    </div>
  );
}

/** Between the Take and its verdict: a moment, with the Exercise still on the neck. */
function ListeningScreen({ session }: { session: SessionRun }) {
  const { t } = useTranslation();
  const slot = useExerciseSlot(session, "aim");
  return (
    <div className="session-body" role="status" data-testid="session-listening">
      <div className="session-center" data-top="">
        <div className="session-h2">{t("session.run.listeningBack")}</div>
      </div>
      <div className="session-slot" ref={slot} aria-hidden="true" />
    </div>
  );
}

export function SessionView({
  session,
  beat,
  isPlaying,
  listening,
  hasSignal,
  bpmNow,
  viewKey = "V",
  pauseKey = "K",
  restartKey = "R",
  skipKey = "N",
  pedalMapped = false,
  onCheckSound,
}: {
  session: SessionRun;
  /** The theme. The Session's tab strip draws in its own palette; kept for the caller. */
  themeId?: string;
  /** The engine's beat: a Take's position, and the click's own count for a warm-up. */
  beat: PracticeBeat | null;
  isPlaying: boolean;
  listening: boolean;
  hasSignal: boolean;
  /** The tempo the engine is at, for a ramp that moves it. */
  bpmNow: number;
  /** The key bound to switching views, as shown. */
  viewKey?: string;
  /** The keys bound to pausing and restarting a timed block, as shown. */
  pauseKey?: string;
  restartKey?: string;
  /** The key bound to the next step, shown on Skip this. */
  skipKey?: string;
  /** A footswitch is mapped to the Session's pedal: only then is its legend shown (UX audit SES-5). */
  pedalMapped?: boolean;
  onCheckSound: () => void;
}) {
  const { run, actions } = session;
  const last = run.outcomes[run.outcomes.length - 1];
  const neck3d = useNeck3d();
  // The Tab view draws no neck: the page keeps its own backdrop then.
  const step = currentStep(run);
  const tabShown =
    session.practiceView === "tab" &&
    !!session.take &&
    (run.phase === "ready" ||
      run.phase === "playing" ||
      ((run.phase === "timedReady" || run.phase === "timed") &&
        (step?.kind === "metronome" || (step?.kind === "jam" && !!step.exerciseId))));

  return (
    // The recap draws no neck either (UX audit SES-10): the page's own backdrop.
    <div className="session-page session-run" data-testid="session" data-neck3d={tabShown || run.phase === "recap" ? undefined : neck3d}>
      {run.phase !== "recap" && (
        <SessionBar
          run={run}
          onExit={actions.exit}
          onSkip={run.phase === "ready" ? actions.next : undefined}
          skipKey={skipKey}
        />
      )}
      {(run.phase === "ready" || run.phase === "playing") && session.practiceView === "runway" && (
        <RunwayTakeScreen
          session={session}
          beat={beat}
          isPlaying={isPlaying}
          listening={listening}
          hasSignal={hasSignal}
          viewKey={viewKey}
          onCheckSound={onCheckSound}
        />
      )}
      {(run.phase === "ready" || run.phase === "playing") && session.practiceView !== "runway" && (
        <TakeScreen
          session={session}
          beat={beat}
          isPlaying={isPlaying}
          listening={listening}
          hasSignal={hasSignal}
          viewKey={viewKey}
          onCheckSound={onCheckSound}
        />
      )}
      {run.phase === "listening" && <ListeningScreen session={session} />}
      {run.phase === "result" &&
        (last?.grade.verdict === "notCaught" ? (
          <NoCatchScreen session={session} onCheckSound={onCheckSound} />
        ) : (
          <ResultScreen session={session} pedalMapped={pedalMapped} />
        ))}
      {(run.phase === "timedReady" || run.phase === "timed") && (
        <TimedScreen
          session={session}
          bpmNow={bpmNow}
          beat={beat}
          isPlaying={isPlaying}
          viewKey={viewKey}
          pauseKey={pauseKey}
          restartKey={restartKey}
        />
      )}
      {run.phase === "recap" && <RecapScreen session={session} />}
    </div>
  );
}

