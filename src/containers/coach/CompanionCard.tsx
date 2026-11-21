/**
 * The coach's proactive card on Progress (DESIGN 6.2, 6.3, 6.6; mock 10):
 * the weekly look-back, or, alone, the plateau question. First on the page,
 * one per app run (`coach/cardBudget.ts`), never in a Session, the wizard or
 * Settings (Progress is none of them).
 *
 * Everything it says is computed in `coach/weekly.ts` and `coach/nudges.ts`
 * from stored Takes; this file only words it. Its presses:
 * - "Hide" (the look-back) / "Not now" (the plateau alone): the card goes at
 *   once and an Undo stays for `UNDO_MS`. The dismissal is written when that
 *   window closes (or the page is left), so Undo writes nothing at all. The
 *   Undo's line says what is true: seven days quiet on a kind's first Hide,
 *   "until you ask" on its second, and the way to ask ("On" under Settings →
 *   Coach → Suggestions, `saveCardsAsked`).
 * - "Keep at it": `play_exercise`'s proposal in Ask; the player confirms there.
 * - "Try it another way": `swap_part`'s proposal ("different") for a part of
 *   today's plan on the stuck Exercise itself (`anotherWayPart`); not offered,
 *   and not named in the question, when the plan has none.
 * - "Rest it till …": what the plan already does (the planner parked it on
 *   its own): nothing to change, so no tool; the card says so. Offered only
 *   when no part of today's plan plays it (`planPartOn`): parking puts an
 *   Exercise behind the open ones, it does not take it out, and on a day the
 *   plan holds it the card says which part instead (c4b2b's re-read, MEDIUM 1).
 * The card itself never acts. An answered question is not asked again this
 * run (memory only).
 *
 * The long view (`listCleanTempoSpans`, c4b1) is read once when the card
 * mounts on Progress, never at startup or during a Take, for the "up 20 BPM"
 * milestone lines.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { listCleanTempoSpans, type CleanTempoSpanRow } from "../../ipc";
import { answerPlateau, markCompanionSeen, plateauAnswered, useCompanion } from "../../coach/companion";
import type { Plateau } from "../../coach/nudges";
import {
  CARD_DISMISSALS_TO_STOP,
  cardMayShow,
  cardOf,
  coachKeyStates,
  coachStored,
  saveCardDismissed,
  subscribeCoachStored,
} from "../../coach/store";
import { lookBack, playerWeekStart, type LookBack } from "../../coach/weekly";
import type { SessionRun } from "../session/hooks/useSessionRun";
import { CoachGlyph } from "./CoachLine";
import { openAsk } from "./askStore";
import { runAskCall } from "./askTools";
import "../../styles/coach.css";

/** How long "Hide" can be undone before it is written. */
export const UNDO_MS = 6_000;

function useDates() {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  return {
    day: (at: number) => new Date(at).toLocaleDateString(lang, { day: "numeric", month: "short" }),
    // The rest ends at a time of day (the last Take + 48 h), not at midnight:
    // the weekday alone would be wrong for part of that day (review L11).
    until: (at: number) => new Date(at).toLocaleString(lang, { weekday: "long", hour: "numeric", minute: "2-digit" }),
  };
}

/**
 * The part of today's plan "Try it another way" would swap: an Exercise part
 * on the stuck Exercise itself (c4b2's review, M5), else none and the button
 * is not offered.
 */
export function anotherWayPart(plan: SessionRun["plan"], plateau: Plateau): number {
  return (plan?.steps ?? []).findIndex(
    (s) => s.kind === "exercise" && s.pathId === plateau.path.id && s.exerciseId === plateau.exercise.id,
  );
}

/**
 * The first part of today's plan that plays the stuck Exercise, of any kind
 * (its Exercise block, its warm-up, the band's finisher), or -1.
 *
 * Parking does not take an Exercise out of the plan: `openWork` puts it behind
 * the open ones, so it is still played when its Path has nothing else open
 * (and the warm-up, a review, a recap or the finisher may play it). Only when
 * no part plays it does the plan rest it till `restsUntil`; on a day a part
 * does, "the plan rests it" is false and Rest is not offered (c4b2b's re-read,
 * MEDIUM 1).
 */
export function planPartOn(plan: SessionRun["plan"], plateau: Plateau): number {
  return (plan?.steps ?? []).findIndex((s) => {
    const on = s as { pathId?: string; exerciseId?: string };
    return on.pathId === plateau.path.id && on.exerciseId === plateau.exercise.id;
  });
}

/** The question's sentences and which answers it offers, from today's plan. */
export function plateauWords(plan: SessionRun["plan"], plateau: Plateau) {
  const held = planPartOn(plan, plateau);
  const part = anotherWayPart(plan, plateau);
  const range = plateau.low !== plateau.high;
  if (held < 0) {
    return { say: range ? "companion.plateau.sayRange" : "companion.plateau.say", ask: "companion.plateau.askTwo", held, part, rest: true } as const;
  }
  return {
    say: range ? "companion.plateau.sayRangeToday" : "companion.plateau.sayToday",
    ask: part >= 0 ? "companion.plateau.askToday" : "companion.plateau.askKeep",
    held,
    part,
    rest: false,
  } as const;
}

function PlateauQuestion({ plateau, session, onAnswered }: { plateau: Plateau; session: SessionRun; onAnswered: () => void }) {
  const { t } = useTranslation();
  const { until } = useDates();
  const [rested, setRested] = useState(false);
  const day = until(plateau.restsUntil);
  const words = plateauWords(session.plan, plateau);
  const part = words.part;
  const values = {
    exercise: plateau.exercise.title,
    sessions: plateau.sessions,
    bpm: plateau.high,
    low: plateau.low,
    high: plateau.high,
    day,
    n: words.held + 1,
  };
  const ask = (call: Parameters<typeof runAskCall>[0], said: string) => {
    answerPlateau(plateau.key);
    openAsk();
    runAskCall(call, said);
    onAnswered();
  };
  if (rested) {
    return (
      <p className="companion-plateau-said" role="status" data-testid="companion-plateau-rested">
        {t("companion.plateau.rested", { day })}
      </p>
    );
  }
  const keep = t("companion.plateau.keep");
  const another = t("companion.plateau.another");
  return (
    <div className="companion-plateau" data-testid="companion-plateau">
      <p className="companion-plateau-say">
        {t(words.say, values)} {t(words.ask)}
      </p>
      <div className="companion-buttons">
        <button
          type="button"
          className="coach-chip"
          data-testid="companion-plateau-keep"
          onClick={() => ask({ tool: "play_exercise", args: { exercise: plateau.exercise.title, path: plateau.path.title } }, keep)}
        >
          {keep}
        </button>
        {part >= 0 && (
          <button
            type="button"
            className="coach-chip"
            data-testid="companion-plateau-another"
            onClick={() => ask({ tool: "swap_part", args: { at: part + 1, choice: "different" } }, another)}
          >
            {another}
          </button>
        )}
        {words.rest && (
          <button
            type="button"
            className="coach-chip"
            data-testid="companion-plateau-rest"
            onClick={() => {
              answerPlateau(plateau.key);
              setRested(true);
            }}
          >
            {t("companion.plateau.rest", { day })}
          </button>
        )}
      </div>
    </div>
  );
}

function WeekBody({ look, session, showPlateau }: { look: LookBack; session: SessionRun; showPlateau: boolean }) {
  const { t } = useTranslation();
  const { day } = useDates();
  const [, setAnswered] = useState(0);
  const stuck = look.stuck && showPlateau && !plateauAnswered(look.stuck.key) ? look.stuck : null;
  return (
    <>
      <p className="companion-say" data-testid="companion-sentence">
        {t(look.sentence.key, look.sentence.values)}
      </p>
      {look.goal && (
        <p className="companion-goal" data-testid="companion-goal">
          {t("companion.weekly.goal", { goal: look.goal.text })}
        </p>
      )}
      {look.benchmark && (
        <div className="companion-bench" data-testid="companion-bench">
          <span>
            {t("companion.weekly.bench", {
              exercise: look.benchmark.exercise.title,
              bpm: look.benchmark.bpm,
              fromDay: look.benchmark.fromDay,
              toDay: look.benchmark.toDay,
            })}
          </span>
          <strong>{t("companion.weekly.benchValue", { from: look.benchmark.fromEven, to: look.benchmark.toEven })}</strong>
        </div>
      )}
      {look.moved.length > 0 && (
        <div className="companion-moved" data-testid="companion-moved">
          <p className="companion-moved-head">
            {t(look.graded ? "companion.weekly.movedHeadClean" : "companion.weekly.movedHeadPlayed")}
          </p>
          <ul>
            {look.moved.map((m) => (
              <li key={`${m.path.id}/${m.exercise.id}`}>
                <span>{m.exercise.title}</span>
                <b>
                  {m.isNew
                    ? t("companion.weekly.movedNew", { to: m.to })
                    : m.from === null
                      ? t("companion.weekly.movedRisen", { to: m.to })
                      : t("companion.weekly.movedFromTo", { from: m.from, to: m.to })}
                </b>
              </li>
            ))}
          </ul>
        </div>
      )}
      {look.milestones.map((m) => (
        <p className="companion-milestone" key={`${m.path.id}/${m.exercise.id}`} data-testid="companion-milestone">
          {t("companion.weekly.milestone", { exercise: m.exercise.title, from: m.firstBpm, to: m.bestBpm, date: day(m.firstAt) })}
        </p>
      ))}
      {stuck && <PlateauQuestion plateau={stuck} session={session} onAnswered={() => setAnswered((n) => n + 1)} />}
      <p className="companion-foot" data-testid="companion-foot">
        {t(look.leftOut ? "companion.weekly.footLeftOut" : "companion.weekly.foot", look.counts)}
      </p>
    </>
  );
}

/** First on Progress. Renders nothing when this run's card is not one of Progress's. */
export function CompanionCard({ session }: { session: SessionRun }) {
  const { t, i18n } = useTranslation();
  const { day } = useDates();
  const companion = useCompanion();
  const card = companion.card;
  const stored = useSyncExternalStore(subscribeCoachStored, coachStored, coachStored);
  const states = useSyncExternalStore(subscribeCoachStored, coachKeyStates, coachKeyStates);
  // The plateau question inside the look-back is a plateau card too: it keeps
  // the player's "Not now" (seven days quiet, not until asked after two), as
  // the plateau card alone does through the budget (c4b2's review, M1).
  const plateauMayShow = cardMayShow(stored, "plateau", Date.now(), states);
  const [spans, setSpans] = useState<readonly CleanTempoSpanRow[] | "unread" | null>(null);
  const [hiding, setHiding] = useState<"no" | "undo" | "done">("no");
  // The Undo's line, fixed at the press: the first Hide of a kind quiets it for
  // seven days, the second until the player asks (M2).
  const [hiddenLine, setHiddenLine] = useState<"companion.hidden" | "companion.hiddenUntilAsked">("companion.hidden");
  const pending = useRef<{ kind: string; at: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The long view, once, when Progress shows a look-back.
  const wantsSpans = card?.kind === "weekly";
  useEffect(() => {
    if (!wantsSpans) return;
    let live = true;
    void listCleanTempoSpans()
      .then((rows) => {
        if (live) setSpans(rows);
      })
      // A failed call does not leave the dot leading to nothing (c4b2b's
      // re-read, LOW 2): the look-back shows without what moved, which is not
      // known (never as "no clean tempo moved").
      .catch(() => {
        if (live) setSpans("unread");
      });
    return () => {
      live = false;
    };
  }, [wantsSpans]);

  // The full look-back (with the long view's milestones) for the week the budget granted.
  const look = useMemo(() => {
    if (card?.kind !== "weekly" || !companion.look) return null;
    if (!spans) return companion.look;
    return (
      lookBack({
        progress: session.progress,
        paths: session.paths,
        spans,
        now: Date.now(),
        weekStart: playerWeekStart(i18n.language),
        graded: session.grading !== "off",
        goal: companion.look.goal,
      }) ?? companion.look
    );
  }, [card, companion.look, spans, session.progress, session.paths, session.grading, i18n.language]);

  // A graded look-back waits for the long view (M4): until it answers, what
  // moved is not known, and a card that says it would flash and change.
  const weekReady = look !== null && !look.needsSpans;
  const shown = card !== null && hiding !== "done" && (card.kind === "weekly" ? weekReady : companion.plateau !== null);
  useEffect(() => {
    if (shown) markCompanionSeen();
  }, [shown]);

  const commit = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const p = pending.current;
    pending.current = null;
    if (p) saveCardDismissed(p.kind, p.at);
  };
  // Leaving the page within the Undo's window keeps the press.
  useEffect(() => () => commit(), []);

  if (!card || hiding === "done") return null;
  if (hiding === "undo") {
    return (
      <div className="coach-note companion-hidden" role="status" data-testid="companion-hidden">
        <span>{t(hiddenLine)}</span>
        <button
          type="button"
          className="coach-chip"
          data-testid="companion-undo"
          onClick={() => {
            if (timer.current) clearTimeout(timer.current);
            timer.current = null;
            pending.current = null;
            setHiding("no");
          }}
        >
          {t("companion.undo")}
        </button>
      </div>
    );
  }
  const hide = () => {
    pending.current = { kind: card.kind, at: Date.now() };
    // This press is the kind's first, or (seven days after one) its second.
    setHiddenLine(
      cardOf(coachStored().cards, card.kind).dismissed + 1 >= CARD_DISMISSALS_TO_STOP ? "companion.hiddenUntilAsked" : "companion.hidden",
    );
    setHiding("undo");
    timer.current = setTimeout(() => {
      commit();
      setHiding("done");
    }, UNDO_MS);
  };

  if (card.kind === "weekly" && look && weekReady) {
    return (
      <section className="coach-note companion-card" data-testid="companion-weekly" aria-label={t("companion.weekly.label")}>
        <div className="companion-head">
          <CoachGlyph size={17} />
          <span className="companion-kick">{t("companion.weekly.kick", { from: day(look.start), to: day(look.end - 1) })}</span>
          <button type="button" className="companion-hide" onClick={hide} data-testid="companion-hide">
            {t("companion.hide")}
          </button>
        </div>
        <WeekBody look={look} session={session} showPlateau={plateauMayShow} />
      </section>
    );
  }
  if (card.kind === "plateau" && companion.plateau && !plateauAnswered(companion.plateau.key)) {
    return (
      <section className="coach-note companion-card" data-testid="companion-plateau-card" aria-label={t("companion.plateau.label")}>
        <div className="companion-head">
          <CoachGlyph size={17} />
          <span className="companion-kick">{t("companion.plateau.kick")}</span>
          <button type="button" className="companion-hide" onClick={hide} data-testid="companion-hide">
            {t("companion.notNow")}
          </button>
        </div>
        <PlateauQuestion plateau={companion.plateau} session={session} onAnswered={() => setHiding("done")} />
      </section>
    );
  }
  return null;
}
