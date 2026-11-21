/**
 * The coach in a Path Session (DESIGN 4.1, 4.2, 4.4): what it says before a
 * Take, during it and after it, chosen from what the Session already knows.
 *
 * The words are the locale files' (`session.note.*`); the parts are
 * `takeNote()`'s; the look is `containers/coach`. Nothing here decides a grade
 * or a tempo: the Session's own buttons (`bigAction`) do that, and no sentence
 * here argues with them.
 */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { noteFinding, useCoachAnswer } from "../../coach/coachSlot";
import { sayAtBoundary, type VoiceBoundary } from "../../coach/voice";
import type { AskHandler } from "../coach/askStore";
import { useTranslation } from "react-i18next";
import { noteForTake } from "../../coach/takeNote";
import { cueFor, cueOrder } from "../../coach/cues";
import type { CuePick } from "../../coach/cues";
import type { FactItem, TakeNote, TakeReview } from "../../coach/takeNote";
import { useCoachEvent } from "../../coach/useCoachEvent";
import type { Exercise } from "../../paths/format";
import type { Line } from "../../session/coachWords";
import { displayValue, metricKey, reasonLine } from "../../session/coachWords";
import { readyHonestLineKey } from "../../session/caveats";
import type { PlanStep } from "../../session/planner";
import { heardItOf, lastRaisedOutcome, shownCleanTempoOf, upstrokeOf } from "../../session/progress";
import { parkedUntil, reviewStateOf } from "../../session/rotation";
import { MY_EXERCISES_PATH_ID } from "../../session/myExercises";
import { currentStep } from "../../session/runner";
import type { BigAction, TakeOutcome } from "../../session/runner";
import { loopLine } from "../../coach/loopLine";
import { suggestChips } from "../../coach/ask/suggest";
import { hearBackLabel, hearBackOffer, hearBarOf } from "../../coach/hearBack";
import { noteNameOf } from "../songs/review/marks";
import { CoachLine, shortCue } from "../coach/CoachLine";
import { CoachNote, FactLine, NoteAnswer, NoteBars, NoteChips, NoteCue, NoteLine } from "../coach/CoachNote";
import type { NoteChip } from "../coach/CoachNote";
import { seedOf } from "./hooks/useSessionRun";
import type { SessionRun } from "./hooks/useSessionRun";
import type { WatchControl } from "./practice/useWatch";
import { lineText } from "./lineText";

type T = ReturnType<typeof useTranslation>["t"];

/**
 * Ask, for the coach's words in a Session (DESIGN 5.1): the note's sentence
 * and the recap's line open Ask with that sentence as what the question is
 * about, a cell of the bar strip opens it on that bar. `SessionView` provides
 * `askCoach` where Ask exists and nothing while a Take runs (the Take screen
 * shows its order, not a note, and nothing of Ask is offered then).
 *
 * No "?" chips yet: with no model and no fact cards (the next milestone),
 * Ask's honest "can't answer typed questions yet" is all a question would
 * get. "What should I try?" keeps opening the How fold. The fact-card leg
 * adds the chips, with `onAsk({ question })`.
 */
export const SessionAsk = createContext<AskHandler | undefined>(undefined);

const DAY_MS = 86_400_000;

/**
 * The headline a note drew at a boundary, handed to the coach's voice
 * (`coach/voice.ts`), which says it once if Voice is on and nothing sounds.
 * The same string the note shows: there is no second wording.
 */
function useBoundaryVoice(kind: VoiceBoundary, text: string | null): void {
  useEffect(() => {
    if (text) sayAtBoundary(kind, text);
  }, [kind, text]);
}

/**
 * What a coach key put in the coach's slot (`ask-explain-last`,
 * `ask-what-next`): one line in the note, until the screen changes.
 */
export function CoachAnswerLine() {
  const answer = useCoachAnswer();
  if (!answer) return null;
  return <NoteLine testId="coach-answer">{answer}</NoteLine>;
}

/**
 * A Take not caught has no note: its screen's title is the finding. Kept for
 * `ask-explain-last` and said at the boundary like a note's headline.
 */
export function useNoCatchVoice(outcome: TakeOutcome | undefined, title: string): void {
  useEffect(() => {
    if (outcome) noteFinding(outcome, title, null);
  }, [outcome, title]);
  useBoundaryVoice("result", outcome ? title : null);
}

/** A pitch class as a player says it ("B", "F#"): the note a direction line names. */
function pitchName(midi: number): string {
  return noteNameOf(midi).replace(/-?\d+$/, "");
}

/** A coach line in the player's language, with the note name a direction line needs. */
export function noteText(t: T, line: Line): string {
  const midi = line.values.midi;
  return lineText(t, typeof midi === "number" ? { ...line, values: { ...line.values, note: pitchName(midi) } } : line);
}

/**
 * The order a running Take shows (DESIGN 3.4): the cue chosen for it, the
 * same sentence the ready note and the last result said; without one, the
 * Exercise's coach line when it is short enough, else nothing.
 */
export function takeOrderText(
  exercise: Pick<Exercise, "coachLine"> | null | undefined,
  pick?: CuePick | null,
): string | null {
  return pick ? cueOrder(pick) : shortCue(exercise?.coachLine);
}

/**
 * The cue for the next Take of the step on screen (`cueFor`), from the last
 * Take of that step in this Session: one sentence for the ready note, the
 * Take's order and the result's "Next time". Fixed while a Take runs: nothing
 * it reads changes until the Take's result.
 */
export function useNextCue(session: SessionRun): CuePick | null {
  const step = currentStep(session.run);
  const outcomes = session.run.outcomes;
  const last = useMemo(() => {
    if (!step) return null;
    const mine = outcomes.filter((o) => o.stepId === step.id);
    return mine[mine.length - 1] ?? null;
  }, [outcomes, step]);
  const note = useTakeNote(session, last);
  const played = session.take?.exercise ?? session.exercise;
  return useMemo(() => (played ? cueFor(played, note) : null), [played, note]);
}

/** The Step's number in its Path, for "From the Path · Step N". */
function pathStepNumber(session: SessionRun): number | undefined {
  const { exercise, pathId } = whereOf(session);
  const base = session.exercise ?? exercise;
  if (!base || !pathId) return undefined;
  const path = session.paths.find((p) => p.id === pathId);
  return path?.steps.find((s) => s.exercises.some((e) => e.id === base.id))?.order;
}

/** What the Session's coach needs to know about where it is. */
function whereOf(session: SessionRun) {
  const step = currentStep(session.run);
  const exerciseStep = step?.kind === "exercise" ? step : null;
  const exercise = session.take?.exercise ?? session.exercise;
  const pathId = session.take?.pathId ?? exerciseStep?.pathId ?? null;
  return { step: exerciseStep, exercise, pathId };
}

/**
 * The note for one Take, from `takeNote()`. The review is the one the bus
 * carried with this Take's result (null for an older Take, an ungraded one, or
 * one the analyzer said nothing about), and "earlier" is this Exercise's Takes
 * before it, newest first.
 */
export function useTakeNote(session: SessionRun, outcome: TakeOutcome | null | undefined): TakeNote | null {
  const event = useCoachEvent("takeResult");
  const review: TakeReview | null =
    event && outcome && (event.outcome === outcome || (!!outcome.takeId && event.outcome.takeId === outcome.takeId))
      ? event.review
      : null;
  const { step, exercise, pathId } = whereOf(session);
  const takes = session.progress.takes;
  const startedAt = session.run.startedAt;
  const variantSeed = step ? seedOf(step) : null;
  return useMemo(() => {
    if (!outcome || !exercise || !pathId) return null;
    // The same function Ask's cards read the note with (`noteOf`, c2b2ab M3).
    return noteForTake(outcome, review, { ...session.progress, takes }, pathId, exercise, { variantSeed, session: startedAt });
    // `session.progress` is read for its takes only, which are a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome, review, takes, exercise, pathId, variantSeed, startedAt]);
}

/**
 * Where, in words. Every bar of the tune on the same rounds is the tune, not
 * "bars 1 to 4 of the tune".
 */
function placeText(t: T, note: TakeNote): string | null {
  const { place, placeLine } = note;
  if (!place || !placeLine) return null;
  const tuneBars = note.strip?.patternBars ?? 0;
  if (place.shape === "bars" && tuneBars > 1 && place.patternBars.length >= tuneBars) {
    const verb = note.verdict === "passed" ? "caught" : "slipped";
    return t(`session.note.place.${verb}.all`, { count: place.slipped, of: place.of });
  }
  return noteText(t, placeLine);
}

/** The finding as one or two sentences: what decided the verdict when it was not timing, then where and which way. */
function findingText(t: T, note: TakeNote, bpm: number): string {
  const parts: string[] = [];
  const timing =
    note.deciding?.metric === "timingEvenness" || note.deciding?.metric === "evennessHold" || note.deciding === null;
  const where = placeText(t, note);
  if (note.verdict === "passed") {
    if (where) {
      parts.push(t("session.note.passedAt", { bpm }));
      parts.push(where);
      if (note.lastTakeLine) parts.push(noteText(t, note.lastTakeLine));
    } else {
      parts.push(noteText(t, note.lead));
    }
    return parts.join(" ");
  }
  // Below the pass mark on notes heard, extras or pitch: that is said before any bar is named.
  if (!timing || !where) parts.push(noteText(t, note.lead));
  if (where) parts.push(where);
  if (note.directionLine) parts.push(noteText(t, note.directionLine));
  return parts.join(" ");
}

/**
 * The one quiet line under a finding: what the big button does and why, when
 * a rule chose it (P2's "leave it", P1's "once more"), else what history
 * knows. Read off `bigAction`'s actual result, so no sentence here argues
 * with the button.
 */
function historyText(t: T, note: TakeNote, big: BigAction): string | null {
  if (note.repeatLine && (big.kind === "next" || big.kind === "finish") && big.leaveIt) {
    return noteText(t, note.repeatLine);
  }
  if (big.kind === "again" && big.onceMore) return t("session.note.repeat.onceMore", { bpm: big.bpm, up: big.onceMore.up });
  // A new clean tempo is said by the result's own line above the note.
  const line = note.historyLines.find((l) => l.key !== "session.note.history.newClean");
  return line ? noteText(t, line) : null;
}

function factText(t: T, fact: FactItem): string {
  return noteText(t, fact.line);
}

/**
 * The note after a graded Take (mocks 06, 07, 14): the finding, the bar strip,
 * one fact line, and "What should I try?", which opens the Exercise's own How.
 */
export function ResultNote({ session, outcome, howTo }: { session: SessionRun; outcome: TakeOutcome; howTo: readonly string[] }) {
  const { t } = useTranslation();
  const onAsk = useContext(SessionAsk);
  const note = useTakeNote(session, outcome);
  const [howOpen, setHowOpen] = useState(false);
  const played = whereOf(session).exercise;
  const said = note && note.kind !== "notCaught" && note.kind !== "ungraded" ? note : null;
  const headline = said ? findingText(t, said, outcome.bpm) : null;
  const history = said ? historyText(t, said, session.big) : null;
  // The finding, as drawn: what `ask-explain-last` repeats and the voice says.
  useEffect(() => {
    if (headline) noteFinding(outcome, headline, history);
  }, [outcome, headline, history]);
  useBoundaryVoice("result", headline);
  if (!note || !headline || note.kind === "notCaught" || note.kind === "ungraded") return null;
  // One thing to try next time (DESIGN 4.2): only a cue this Take's finding
  // chose, and only when the next Take is this Exercise again. "Go again"
  // skips the ready screen, so this is where it is read. A pass that moves
  // on, or the Session moving on, carries none.
  const big = session.big;
  const pick = played ? cueFor(played, note) : null;
  const next = pick && pick.basis === "measured" && big.kind !== "next" && big.kind !== "finish" ? pick : null;
  const stepNumber = pathStepNumber(session);
  const more = next?.cue.more;
  // "Hear bar N: yours, then the demo" (c5b2): there, or absent; first, as mock 06 draws it.
  const hear = session.hear;
  const hearBar = hear
    ? hearBackOffer({
        phase: session.run.phase,
        ungraded: outcome.ungraded !== undefined,
        bar: hearBarOf(note),
        held: hear.held,
        demo: session.listen?.active ?? false,
        loop: session.loopSound ?? false,
      })
    : null;
  const hearChip: NoteChip[] =
    hear && hearBar
      ? [
          {
            kind: "play",
            label: noteText(t, hearBackLabel(hear.stage, hear.bar ?? hearBar)),
            onClick: () => hear.toggle(hearBar),
            testId: "coach-hear-back",
          },
        ]
      : [];
  // Chosen by the one chooser (`coach/ask/suggest.ts`, leg c2b1a); the same chip as before.
  const chips: NoteChip[] = hearChip.concat(suggestChips("resultNote", { howTo: howTo.length > 0 }).flatMap((chip): NoteChip[] =>
    chip.kind === "try"
      ? [
          {
            kind: "ask",
            label: t("session.note.chip.try"),
            onClick: () => setHowOpen((open) => !open),
            testId: "coach-try",
            expanded: howOpen,
          },
        ]
      : [],
  ));
  return (
    <CoachNote headline={headline} live kind="result" testId="coach-note" onAsk={onAsk}>
      <CoachAnswerLine />
      {note.findingLine && <NoteLine>{noteText(t, note.findingLine)}</NoteLine>}
      {history && <NoteLine testId="coach-history">{history}</NoteLine>}
      {next && (
        <NoteCue
          label={t("session.note.nextTime")}
          say={next.cue.say}
          source={{ kind: "path", ...(stepNumber === undefined ? {} : { step: stepNumber }) }}
          testId="coach-next"
        />
      )}
      {note.strip && <NoteBars strip={note.strip} label={noteText(t, note.strip.label)} onAsk={onAsk} />}
      <FactLine facts={note.facts} render={(fact) => factText(t, fact)} />
      <NoteChips chips={chips} />
      {howOpen && (
        <div className="coach-note-how" data-testid="coach-how">
          {howTo.map((line, i) => (
            <p
              key={i}
              className="coach-note-line"
              data-pointed={more === i ? "" : undefined}
              ref={more === i ? (el) => el?.scrollIntoView?.({ block: "nearest" }) : undefined}
            >
              {line}
            </p>
          ))}
        </div>
      )}
    </CoachNote>
  );
}

/** The question an ungraded Take listens for: the author's own, where there is one. */
function selfCheckOf(played: Exercise | null | undefined, exercise: Exercise | null | undefined): string | null {
  const said = (played?.selfCheck ?? []).find((q) => q.trim() !== "") ?? (exercise?.selfCheck ?? []).find((q) => q.trim() !== "");
  return said ?? null;
}

/**
 * After an ungraded Take (mock 04, DESIGN 4.4): the question the Take listened
 * for and two equal answers, nothing pre-selected, kept with the Take. Only
 * where the author wrote a question: no generic quiz.
 */
export function UngradedNote({ session, outcome }: { session: SessionRun; outcome: TakeOutcome }) {
  const { t } = useTranslation();
  const onAsk = useContext(SessionAsk);
  const { exercise } = whereOf(session);
  // The question the Take listened for is what this result says, aloud too.
  const asked = !outcome.takeId
    ? null
    : outcome.ungraded === "eyes"
      ? t("session.eyes.question")
      : selfCheckOf(exercise, session.exercise);
  useBoundaryVoice("result", asked);
  // The Take for the eyes (DESIGN 4.2, "Watch your pick"): its one question,
  // answered by the player, kept with the Take.
  if (outcome.ungraded === "eyes") {
    const id = outcome.takeId;
    if (!id) return null;
    const row = session.progress.takes.find((take) => take.id === id);
    const said = row ? upstrokeOf(row) : null;
    const question = t("session.eyes.question");
    return (
      <CoachNote headline={question} kind="ungraded" testId="coach-note">
        <CoachAnswerLine />
        <NoteAnswer
          question={t("session.note.ungraded.yourAnswer")}
          answer={said === "yes" ? "yes" : said === "no" ? "notYet" : undefined}
          labels={{ yes: t("session.eyes.yes"), notYet: t("session.eyes.no") }}
          onAnswer={(value) => session.actions.answerUpstroke(id, value === "yes" ? "yes" : "no")}
        />
      </CoachNote>
    );
  }
  const question = selfCheckOf(exercise, session.exercise);
  const id = outcome.takeId;
  if (!question || !id) return null;
  const row = session.progress.takes.find((take) => take.id === id);
  const answer = row ? (heardItOf(row) ?? undefined) : undefined;
  return (
    <CoachNote headline={question} kind="ungraded" testId="coach-note" onAsk={onAsk}>
      <CoachAnswerLine />
      <NoteAnswer
        question={t("session.note.ungraded.yourAnswer")}
        answer={answer}
        onAnswer={(value) => session.actions.answerHeardIt(id, value)}
      />
    </CoachNote>
  );
}

/** "Last Take: 79% even." The number the verdict turned on, as the result showed it. */
export function lastTakeLead(t: T, outcome: TakeOutcome): string | null {
  const { grade } = outcome;
  if (grade.verdict === "notCaught") return t("session.note.ready.lastNotCaught");
  if (grade.verdict === "passed") return t("session.note.ready.lastPassed", { bpm: outcome.bpm });
  const check = grade.verdict === "belowBar" ? (grade.checks.find((c) => c.met === false) ?? null) : null;
  const value = check ? displayValue(check) : null;
  if (!check || value === null) return null;
  return t(check.metric === "extraNotes" ? "session.note.ready.lastCount" : "session.note.ready.lastValue", {
    value,
    metric: t(`session.metric.${metricKey(check.metric)}`),
  });
}

/**
 * Before a Take (mocks 03, 04). One thing to do as the headline, with its
 * source; before the first Take why this and why this tempo, and once what
 * the coach can and cannot hear; before a later one, the last Take in one
 * quiet line. Ungraded: one thing to listen for, as the author asked it.
 */
export function ReadyNote({
  session,
  step,
  stepNumber,
  watch,
  onTry,
}: {
  session: SessionRun;
  step: PlanStep;
  stepNumber: number | undefined;
  watch?: WatchControl;
  /** Opens the Exercise's How, at the cue's line when it names one. Absent where the How is already open. */
  onTry?: (more?: number) => void;
}) {
  const { t } = useTranslation();
  const onAsk = useContext(SessionAsk);
  const { run } = session;
  const exercise = session.exercise;
  const played = session.take?.exercise ?? exercise;
  const mine = run.outcomes.filter((o) => o.stepId === step.id);
  const last = mine[mine.length - 1] ?? null;
  const lastNote = useTakeNote(session, last);
  // One thing to do: the cue the last Take chose, or the general one (DESIGN 4.1).
  const pick = useNextCue(session);
  // The order: the headline in each case below, and what the voice says.
  const question = run.ungraded && run.ungraded !== "eyes" ? selfCheckOf(played, exercise) : null;
  const headline = !exercise
    ? null
    : run.ungraded === "eyes"
      ? t("session.eyes.watch")
      : question
        ? t("session.note.ungraded.listenFor", { question })
        : (pick?.cue.say ?? exercise.coachLine);
  useBoundaryVoice("ready", headline);
  if (!exercise || headline === null) return null;
  const source = { kind: "path" as const, ...(stepNumber === undefined ? {} : { step: stepNumber }) };
  // Chosen by the one chooser (`coach/ask/suggest.ts`, leg c2b1a); the same two chips as before.
  const chips: NoteChip[] = suggestChips("readyNote", {
    hear: !!(watch?.canWatch && watch.hasSound && watch.soundOn && !watch.showing),
    howTo: !!onTry,
  }).flatMap((chip): NoteChip[] =>
    chip.kind === "hear" && watch
      ? [{ kind: "play", label: t("session.note.chip.hear"), onClick: watch.toggle, testId: "coach-hear" }]
      : chip.kind === "try" && onTry
        ? [{ kind: "ask", label: t("session.note.chip.try"), onClick: () => onTry(pick?.cue.more), testId: "coach-try" }]
        : [],
  );

  // The Take for the eyes: what to watch, and nothing else.
  if (run.ungraded === "eyes") {
    return (
      <CoachNote headline={headline} source={source} kind="ready" testId="coach-note">
        <CoachAnswerLine />
      </CoachNote>
    );
  }
  // Ungraded, by choice or because nothing is listening: no claim about the playing.
  if (run.ungraded) {
    const saidOnce = run.outcomes.some((o) => o.ungraded !== undefined);
    const lastRow = last?.takeId ? session.progress.takes.find((row) => row.id === last.takeId) : undefined;
    const lastUngraded = !!last && last.ungraded !== undefined && !!last.takeId;
    const answered = lastRow ? heardItOf(lastRow) : null;
    const untried = lastNote?.ungraded?.tryLine ?? null;
    return (
      <CoachNote
        headline={headline}
        source={source}
        kind="ready"
        testId="coach-note"
        onAsk={onAsk}
      >
        <CoachAnswerLine />
        {!saidOnce && run.ungraded !== "inputOff" && (
          <NoteLine extra testId="coach-not-listening">
            {t("session.note.ungraded.notListening")}
          </NoteLine>
        )}
        {question && lastUngraded && answered === null && last?.takeId && (
          <NoteAnswer
            question={t("session.note.ungraded.didThey", { question })}
            answer={undefined}
            onAnswer={(value) => session.actions.answerHeardIt(last.takeId!, value)}
          />
        )}
        {untried && <NoteLine extra>{noteText(t, untried)}</NoteLine>}
        <NoteChips chips={chips} />
      </CoachNote>
    );
  }

  const quiet: Array<{ text: string; id: string }> = [];
  if (!last) {
    quiet.push({ text: noteText(t, reasonLine(step.why)), id: "coach-reason" });
    const honest = readyHonestLineKey(exercise);
    // Once a Session: the first Take of the Session, not of every Exercise.
    if (honest && run.outcomes.length === 0) quiet.push({ text: t(honest), id: "coach-honest" });
  } else {
    const lead = lastTakeLead(t, last);
    const where = lastNote && lastNote.kind === "result" && lastNote.verdict === "belowBar" ? lastNote : null;
    const tail = where
      ? [placeText(t, where), where.directionLine ? noteText(t, where.directionLine) : null].filter(
          (s): s is string => !!s,
        )
      : [];
    if (lead) quiet.push({ text: [lead, ...tail].join(" "), id: "coach-last" });
  }
  // Back from a loop: one line about it, when something was measured (DESIGN 4.2).
  const afterLoop = run.afterLoop ? loopLine(run.afterLoop.heard, run.afterLoop.loop, !run.ungraded) : null;
  if (afterLoop) quiet.unshift({ text: noteText(t, afterLoop), id: "coach-after-loop" });
  return (
    <CoachNote
      headline={headline}
      source={source}
      kind="ready"
      testId="coach-note"
      onAsk={onAsk}
      cue={pick ? pick.trigger : undefined}
    >
      <CoachAnswerLine />
      {quiet.map((line) => (
        <NoteLine key={line.id} extra testId={line.id}>
          {line.text}
        </NoteLine>
      ))}
      <NoteChips chips={chips} />
    </CoachNote>
  );
}

/**
 * The recap's one coach line (DESIGN 4.1): what moved, and when the last
 * Exercise played comes back. Built from what the Session and the store hold.
 */
export function recapLineText(t: T, session: SessionRun, now: number): string | null {
  const outcomes = session.run.outcomes;
  const last = outcomes[outcomes.length - 1];
  if (!last) return null;
  const step = session.run.plan?.steps.find((s) => s.id === last.stepId);
  const pathId = step?.kind === "exercise" ? step.pathId : null;
  const path = pathId ? session.paths.find((p) => p.id === pathId) : undefined;
  const exercise = path?.steps.flatMap((s) => s.exercises).find((e) => e.id === last.exerciseId);
  const mine = outcomes.filter((o) => o.exerciseId === last.exerciseId);
  // "Rose" against the "before" read now (nf1c L2), not the one frozen at settle.
  const raised = lastRaisedOutcome(session.progress, outcomes, mine);
  const passed = [...mine].reverse().find((o) => o.grade.verdict === "passed");
  const title = last.title;
  // A clean tempo that rose is the recap's own headline: not said twice.
  let moved: string | null = null;
  if (raised && raised.grade.cleanBpm !== null) moved = null;
  else if (passed) moved = t("session.note.recap.passed", { bpm: passed.bpm });
  else if (last.ungraded === undefined) {
    const clean = pathId ? shownCleanTempoOf(session.progress, pathId, last.exerciseId) : null;
    moved = clean !== null ? t("session.note.recap.held", { bpm: clean }) : t("session.note.recap.played", { bpm: last.bpm });
  }
  // A custom Exercise (My exercises, t2bb) is never planned by Today: no
  // "comes back" of any kind, only what moved.
  if (pathId === MY_EXERCISES_PATH_ID) return moved;
  let back = t("session.note.recap.backNext", { title });
  const pathStep = path?.steps.find((s) => s.exercises.some((e) => e.id === last.exerciseId));
  if (path && pathStep && exercise) {
    const parked = parkedUntil(session.progress, path.id, exercise);
    // `dueReviews` lists what is due now; the date it reads is this one.
    const review = reviewStateOf(session.progress, { path, step: pathStep, exercise });
    const days = (at: number) => Math.max(1, Math.ceil((at - now) / DAY_MS));
    if (parked !== null && parked > now) back = t("session.note.recap.backParked", { title, count: days(parked) });
    else if (review && review.dueAt > now) back = t("session.note.recap.backReview", { title, count: days(review.dueAt) });
  }
  return moved ? `${moved} ${back}` : back;
}

export function RecapLine({ session }: { session: SessionRun }) {
  const { t } = useTranslation();
  const onAsk = useContext(SessionAsk);
  // Read once, as the recap opens: the line does not move under the player.
  const [text] = useState(() => recapLineText(t, session, Date.now()));
  if (!text) return null;
  return (
    <CoachLine testId="coach-recap" onAsk={onAsk}>
      {text}
    </CoachLine>
  );
}
