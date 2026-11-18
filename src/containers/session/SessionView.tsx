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
  blockState,
  currentStep,
  edgeOf,
  isEdgeStep,
  minutesLeft,
  stepRemainingMs,
  timedTempoAdjustable,
  timedTempoLive,
} from "../../session/runner";
import type { TakeOutcome } from "../../session/runner";
import { CoachLine, ReadyInput, TempoNudges, bigLabel, startButton, takeCanStart, timedHowKey } from "./parts";
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
import { readyHonestLineKey } from "../../session/caveats";
import { ContextLine, StepTag, rise, stepTitle } from "./TodayView";
import { roleKey } from "./todayPlan";
import { factsOf } from "../../session/progress";
import type { PathTakeRow } from "../../ipc";
import { totalsFrom } from "./ProgressView";
import type { MainView } from "../main-window/MainHeader";
import { LeaveSessionDialog } from "./LeaveSessionDialog";
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
  session,
  onSkip,
  skipKey,
  previousKey,
  listening,
  hasSignal,
  onTestInput,
}: {
  session: SessionRun;
  /** "Skip this" on a Take's ready screen (UX audit TODAY-2), with its key. */
  onSkip?: () => void;
  skipKey?: string;
  /** The key bound to Previous, shown on it. */
  previousKey?: string;
  listening: boolean;
  hasSignal: boolean;
  onTestInput: () => void;
}) {
  const { t } = useTranslation();
  const { run, actions } = session;
  const steps = run.plan?.steps ?? [];
  const left = minutesLeft(run);
  const first = run.stepIndex === 0;
  return (
    <div className="session-bar" data-testid="session-bar">
      <button className="session-exit" onClick={actions.requestExit} data-testid="session-exit">
        {t("session.run.exit")}
      </button>
      {/* One step is no progress to show: its single pip, lit, read as a
          full bar over a clock counting up (acceptance pass 2). The empty row
          keeps the clock where it was. Each block is a button (owner,
          2026-11-18): to any block's ready screen, back or ahead. */}
      <div
        className="session-pips"
        role={steps.length > 1 ? "group" : undefined}
        aria-label={steps.length > 1 ? t("session.run.stepOf", { n: run.stepIndex + 1, of: steps.length }) : undefined}
        data-testid="session-pips"
      >
        {steps.length > 1 &&
          steps.map((step, i) => {
            const state = blockState(run, i);
            const tip = t("session.blocks.tip", {
              n: i + 1,
              title: stepTitle(step, t),
              kind: t(roleKey(step)),
              state: t(`session.blocks.state.${state}`),
            });
            return (
              <button
                key={step.id}
                className="session-pip"
                data-state={state === "todo" ? undefined : state}
                data-edge={i === 0 ? "start" : i === steps.length - 1 ? "end" : undefined}
                data-tip={tip}
                aria-label={tip}
                aria-current={state === "on" ? "step" : undefined}
                onClick={() => actions.jump(i)}
                data-testid={`session-pip-${i}`}
              >
                <i aria-hidden="true" />
              </button>
            );
          })}
      </div>
      <InputChip session={session} listening={listening} hasSignal={hasSignal} onTestInput={onTestInput} />
      {/* Started from a Step: no countdown, only a quiet clock of the time
          spent so far (UX audit SES-11). */}
      <span className="session-quiet session-bar-left" data-untimed={run.untimed ? "" : undefined}>
        {run.untimed
          ? t("session.run.played", { time: clockText(Math.max(0, run.now - run.startedAt)) })
          : left > 0
            ? t("session.run.minutesLeft", { minutes: left })
            : t("session.run.timeUp")}
      </span>
      {steps.length > 1 && (
        // `aria-disabled` with its reason, not `disabled`: a disabled button
        // shows no tooltip and drops the keyboard's focus.
        <button
          className="session-skip-this session-prev"
          onClick={first ? undefined : actions.previous}
          aria-label={first ? `${t("session.run.previous")}. ${t("session.run.previousFirst")}` : t("session.run.previous")}
          aria-disabled={first ? true : undefined}
          data-tip={first ? t("session.run.previousFirst") : undefined}
          data-testid="session-previous"
        >
          <span aria-hidden="true">‹</span>
          <span className="session-prev-word">{t("session.run.previous")}</span>
          {previousKey && <kbd>{previousKey}</kbd>}
        </button>
      )}
      {onSkip && (
        <button className="session-skip-this" onClick={onSkip} data-testid="session-skip-this">
          {t("session.run.skip")}
          {skipKey && <kbd>{skipKey}</kbd>}
        </button>
      )}
    </div>
  );
}

/**
 * The input, as the Session sees it, in the bar: listening, no signal, off,
 * or not graded, and one press from fixing it (owner, beta 6). The same
 * words and mic as the header's chip.
 */
function InputChip({
  session,
  listening,
  hasSignal,
  onTestInput,
}: {
  session: SessionRun;
  listening: boolean;
  hasSignal: boolean;
  onTestInput: () => void;
}) {
  const { t } = useTranslation();
  const { run, inputStart, actions } = session;
  if (run.ungraded) {
    return (
      <span className="session-input-chip" data-state="ungraded" data-testid="session-input-chip">
        <MicGlyph off />
        <span className="session-input-chip-word">{t("session.input.notGraded")}</span>
        <button className="session-link" onClick={actions.gradeAgain} data-testid="session-grade-again">
          {t("session.input.turnOn")}
        </button>
      </span>
    );
  }
  const state = listening ? (hasSignal ? "on" : "quiet") : inputStart.status === "starting" ? "starting" : "off";
  const word =
    state === "on"
      ? t("transport.listening")
      : state === "quiet"
        ? t("session.input.noSignal")
        : state === "starting"
          ? t("session.input.startingShort")
          : t("transport.inputOff");
  // On: check it. Off: turn it on.
  const press = listening ? onTestInput : () => void actions.startInput();
  const hint = listening ? t("session.run.checkSound") : t("session.input.turnOn");
  return (
    <button
      className="session-input-chip"
      data-state={state}
      onClick={state === "starting" ? undefined : press}
      aria-disabled={state === "starting" ? true : undefined}
      aria-label={`${word}. ${hint}`}
      data-tip={hint}
      data-testid="session-input-chip"
    >
      <MicGlyph off={!listening} />
      <span className="session-input-chip-word">{word}</span>
    </button>
  );
}

function MicGlyph({ off = false }: { off?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 12a6.5 6.5 0 0 0 13 0" />
      <line x1="12" y1="18.5" x2="12" y2="21" />
      {off && <line x1="4" y1="3.5" x2="20" y2="20.5" />}
    </svg>
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
  onTestInput,
  onChooseInput,
}: {
  session: SessionRun;
  beat: PracticeBeat | null;
  isPlaying: boolean;
  listening: boolean;
  hasSignal: boolean;
  viewKey: string;
  onTestInput: () => void;
  onChooseInput: () => void;
}) {
  const { t } = useTranslation();
  const { run, take, exercise, live, lights, engineTrouble, actions } = session;
  const running = run.phase === "playing";
  const tabView = session.practiceView === "tab";
  const step = currentStep(run);
  if (!exercise || !take || !step) return null;

  const pathTitle = session.paths.find((p) => p.id === take.pathId);
  const stepNumber = pathTitle?.steps.find((s) => s.exercises.some((e) => e.id === exercise.id))?.order;
  const bar = barLine(exercise, run.bpm);
  const scored = live.heard + live.missed;
  const canStart = takeCanStart(session, listening);
  const start = startButton(session, listening, t);
  // Said once a Session, before its first Take (UX audit SES-14), and not at
  // all where the coach's own line already says it (acceptance P1-4).
  const honest = run.outcomes.length === 0 ? readyHonestLineKey(exercise) : null;
  // The ready screen says three things (acceptance pass 2, P1-4): where the
  // hand goes, what is graded, and a folded "how". The bar IS what is graded,
  // so it is the coach's line; the Exercise's own tip and caveat go in the
  // fold, and any sentence naming the fret or the tempo the screen already
  // shows is left out of it.
  const gradedLine = bar ? lineText(t, bar) : exercise.coachLine;
  const how = howText(
    exercise.howTo[0],
    exercise.position,
    [bar ? exercise.coachLine : null, honest ? t(honest) : null],
    [exercise.tempo.passAtBpm, exercise.tempo.rungs[0]?.bpm, run.bpm],
  );

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
            : // Nothing on the ready screen's head: what the Exercise is was a
              // fourth block of text over the hand, coach and how lines, and a
              // ragged right-aligned one (acceptance pass 2, P1-4 and P2-3).
              // The Step page says it.
              null
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
          {/* Ready: what is graded. Running: the Exercise's own tip. */}
          <CoachLine>{running ? exercise.coachLine : gradedLine}</CoachLine>
          {/* One hand line, one coach line, one "how", folded: the how-to, the
              tip and the pick caveat, with nothing the lines above or the
              picture already said (acceptance P1-4). */}
          {!running && how && (
            <HowLines>
              <div className="session-why session-how-text" data-testid="session-how-text">{how}</div>
            </HowLines>
          )}
          <BandVolume session={session} hint={!running} />
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
      </div>

      <div className="session-actions">
        {/* Back to the warm-up before anything is played here (the e2e
            `warmup` scenario; lost with acceptance P1-4's first pass). */}
        {!running && session.canGoBack && <BackLink session={session} />}
        {/* The tempo nudges and the button travel together: on a phone the
            pair is what sticks to the bottom, so Slower and Faster are never
            under the button (acceptance P1-5). A plain run of the row on a
            desktop (`display: contents`). */}
        <div className="session-go" data-testid="session-go">
          {!running && <TempoNudges run={run} exercise={exercise} session={session} />}
          {/* `aria-disabled`, not `disabled`, while the next Take loads: ↓ or
              ↑ reloads it, and a disabled button drops the keyboard's focus
              to the page (acceptance pass 2, P2-9). */}
          {/* With the input off it says so and turns it on (owner, beta 6):
              never a button that does nothing when pressed. */}
          <button
            className="session-big"
            data-size="mid"
            onClick={!running && !canStart ? undefined : actions.go}
            aria-disabled={!running && !canStart ? true : undefined}
            aria-busy={start.busy ? true : undefined}
            data-input={!running && start.needsInput ? (start.busy ? "starting" : "off") : undefined}
            data-testid="session-big"
          >
            {running ? bigLabel(session.big, t) : start.label}
          </button>
        </div>
      </div>

    </div>
  );
}

/**
 * The ready screen's one "how" paragraph: the Exercise's first how-to line,
 * less any sentence naming the fret the hand line already gives (acceptance
 * P1-4: "fret 5" said twice), then the bar and the caveat. By the number, not
 * the words, so it holds in every language.
 */
export function howText(
  first: string | undefined,
  position: { fret: number } | undefined,
  more: readonly (string | null)[],
  /** Numbers already on screen (the tempo, the bar's): a sentence naming one goes. */
  shown: readonly (number | null | undefined)[] = [],
): string {
  const fret = position && position.fret > 0 ? position.fret : null;
  const sentences = (first ?? "").split(/(?<=[.!?。！？])\s*/).filter((s) => s.trim() !== "");
  const numbers = [fret, ...shown].filter((n): n is number => typeof n === "number" && n > 0);
  const names = (s: string) => numbers.some((n) => new RegExp(`(^|[^0-9])${n}([^0-9]|$)`).test(s));
  const kept = sentences.filter((s) => !names(s));
  return [...kept.map((s) => s.trim()), ...more.filter((m): m is string => !!m)].join(" ");
}

/**
 * The how-to under the coach's line, folded behind "How" (PHONE-2, then
 * acceptance pass 2 on every screen): three paragraphs there pushed the Start button a screen down and
 * read as a wall; the coach's line stays open, the rest is one tap away.
 */
function HowLines({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  // Folded everywhere since acceptance pass 2 (P1-4): open, it was the wall
  // of text the owner keeps asking to be rid of.
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
 * closest call. Said in words above it: on a pass "Passed" and the bar it
 * met; on a miss what held it back, with the bar beside it, ✗.
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
      {/* A pass says so, with the bar it met ("Passed · Bar 85%"); "closest
          to the bar" over a pass read as a near miss (acceptance pass 2). */}
      <div className="session-kick session-decided-why">
        {met
          ? [t("session.result.decidedPass"), bar].filter(Boolean).join(" · ")
          : t("session.result.decidedMiss")}
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
        <span className="session-moved-metric session-fade" style={rise(3)}>{t(`session.metric.${metric}`)}</span>
        {bar !== null && !met && (
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

/**
 * The Take the recap asks "fair?" about, or null (acceptance P1-9): the last
 * graded one, at most once a Session. A player who already answered on any
 * Take's result this Session, the last one's included, is not asked again.
 * The recap decides this once, as it opens, so an answer given on the recap
 * itself stays on screen with its thanks.
 */
export function recapFairOutcome(
  outcomes: readonly TakeOutcome[],
  takes: readonly PathTakeRow[],
  /** Find my edge steps: their climb asked once, as it ended (acceptance pass 3 P2-7). */
  edgeSteps: ReadonlySet<string> = new Set(),
): TakeOutcome | null {
  const graded = outcomes.filter(
    (o) => o.takeId && !edgeSteps.has(o.stepId) && o.grade.verdict !== "notCaught" && o.grade.verdict !== "ungraded",
  );
  const last = graded[graded.length - 1];
  if (!last) return null;
  const answered = (id: string | undefined) => {
    const row = takes.find((take) => take.id === id);
    return !!row && factsOf(row).fair !== undefined;
  };
  // Any Take of this Session, the last one included: a "Yes" on its own
  // result is the answer (acceptance pass 2, P1-9). Called once, as the recap
  // opens, so an answer given on the recap does not take the question away.
  return graded.some((o) => answered(o.takeId)) ? null : last;
}

/** How near the bar a result must be for the fairness question: points, or notes on a count. */
export const FAIR_BAND = 3;

/**
 * A verdict the player could plausibly dispute, so their view is worth asking
 * (UX audit SES-5, acceptance P1-9, acceptance pass 3 P2-7): the deciding
 * number within 3 points of its bar (one note on a count), and then only
 * where the verdict could have gone the other way. A miss just under the bar
 * always qualifies. A pass just over it qualifies only when the Take did not
 * hold the bar in every bar it played: 87% against 85% with all ten bars held
 * is a clear pass, and asking about it reads as doubt in the grader.
 * Exported for its test.
 */
export function borderline(outcome: TakeOutcome): boolean {
  const check = decidingCheck(outcome.grade);
  if (!check) return false;
  const value = displayValue(check);
  const bar = displayBar(check);
  if (value === null || bar === null) return false;
  const count = check.metric === "extraNotes";
  // Positive: on the passing side of the bar; negative: short of it.
  const margin = count ? bar - value : value - bar;
  const band = count ? 1 : FAIR_BAND;
  if (Math.abs(margin) > band) return false;
  if (outcome.grade.verdict === "belowBar") return true;
  if (outcome.grade.verdict !== "passed") return false;
  const pass = outcome.measures?.pass;
  const played = outcome.measures?.barsPlayed ?? 0;
  const heldThroughout = !!pass && played > 0 && pass.heldBars >= played;
  return !heldThroughout;
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
  const edgeDone = onEdge && edgeOf(run, exercise).done;
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
              that could have gone the other way. The recap asks about the
              rest (UX audit SES-5). Find my edge never asks Take by Take: a
              climb is meant to end on a miss, so it asks once, about the
              climb, when the edge is found (acceptance pass 3 P2-7). */}
          {onEdge
            ? edgeDone && <FairTap session={session} outcome={outcome} askKey="session.edge.fairAsk" />
            : borderline(outcome) && <FairTap session={session} outcome={outcome} />}
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

/**
 * A Take played without grading (owner, 2026-11-18): said plainly, with no
 * score, no bar strip and no fairness question. Next, or the same again.
 */
function UngradedResultScreen({ session }: { session: SessionRun }) {
  const { t } = useTranslation();
  const { run, big, actions } = session;
  const outcome = run.outcomes[run.outcomes.length - 1];
  const slot = useExerciseSlot(session, "dim");
  if (!outcome) return null;
  return (
    <div className="session-body" data-testid="session-ungraded" data-verdict="ungraded">
      <div className="session-center" data-top="">
        <div className="session-kick session-rise">
          {t("session.result.kick", {
            take: outcome.takeNumber,
            title: outcome.title,
            bpm: outcome.bpm,
            bars: outcome.measures.barsPlayed,
          })}
        </div>
        <h1 className="session-h1 session-rise" style={rise(1)}>
          {t(outcome.ungraded === "gradingOff" ? "session.ungraded.resultOff" : "session.ungraded.result")}
        </h1>
        <div className="session-why session-rise" style={rise(2)}>
          {t("session.ungraded.body")}
        </div>
      </div>
      <div className="session-slot" ref={slot} aria-hidden="true" />
      <div className="session-center">
        <button className="session-big" data-size="mid" onClick={actions.go} data-testid="session-big">
          {bigLabel(big, t)}
        </button>
        <div className="session-nudges">
          {big.kind !== "again" && (
            <button className="session-secondary" onClick={actions.again} data-testid="session-again">
              {t("session.run.goAgain", { bpm: run.bpm })}
            </button>
          )}
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
                onSlower={adjustable && (ready || paused || ended || timedTempoLive(step)) ? actions.slower : undefined}
                onFaster={adjustable && (ready || paused || ended || timedTempoLive(step)) ? actions.faster : undefined}
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
          {/* Practice all the same (owner, 2026-11-18): counted, not graded. */}
          {outcomes.every((o) => o.ungraded) ? ` · ${t("session.ungraded.recap")}` : ""}
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
  // Decided once, as the recap opens: an answer given on a result earlier in
  // the Session means no question here, and an answer given here keeps its
  // thanks on screen rather than taking the question away.
  const [lastGraded] = useState(() =>
    recapFairOutcome(
      run.outcomes,
      session.progress.takes,
      new Set((run.plan?.steps ?? []).filter((s) => isEdgeStep(s)).map((s) => s.id)),
    ),
  );
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
  previousKey = "⇧N",
  pedalMapped = false,
  onCheckSound,
  onTestInput,
  onChooseInput,
  inputDevice: _inputDevice = null,
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
  /** The key bound to Previous. */
  previousKey?: string;
  /** A footswitch is mapped to the Session's pedal: only then is its legend shown (UX audit SES-5). */
  pedalMapped?: boolean;
  onCheckSound: () => void;
  /** "Check my sound": the input tester, over the Session. Defaults to `onCheckSound`. */
  onTestInput?: () => void;
  /** "Choose input": Settings, at the input devices. Defaults to `onCheckSound`. */
  onChooseInput?: () => void;
  /** The device the input is on, when known. Kept for the caller; the Session reads its own. */
  inputDevice?: string | null;
}) {
  const { t } = useTranslation();
  const { run, actions } = session;
  const testInput = onTestInput ?? onCheckSound;
  const chooseInput = onChooseInput ?? onCheckSound;
  const asked = session.jumpAsked;
  const askedStep = asked === null ? null : run.plan?.steps[asked] ?? null;
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
          session={session}
          onSkip={run.phase === "ready" ? actions.next : undefined}
          skipKey={skipKey}
          previousKey={previousKey}
          listening={listening}
          hasSignal={hasSignal}
          onTestInput={testInput}
        />
      )}
      {askedStep && (
        <LeaveSessionDialog
          testId="jump-ask"
          onLeave={actions.confirmJump}
          onStay={actions.stayHere}
          words={{
            title: t("session.jump.title", { title: stepTitle(askedStep, t) }),
            body: t("session.jump.body"),
            stay: t("session.leave.stay"),
            leave: t("session.jump.go"),
          }}
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
          onTestInput={testInput}
          onChooseInput={chooseInput}
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
          onTestInput={testInput}
          onChooseInput={chooseInput}
        />
      )}
      {run.phase === "listening" && <ListeningScreen session={session} />}
      {run.phase === "result" &&
        (last?.ungraded ? (
          <UngradedResultScreen session={session} />
        ) : last?.grade.verdict === "notCaught" ? (
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

