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
 *   window closes (or the page is left), so Undo writes nothing at all; there
 *   is no un-dismiss writer, and none is needed.
 * - "Keep at it": `play_exercise`'s proposal in Ask; the player confirms there.
 * - "Try it another way": `swap_part`'s proposal ("different") for the part of
 *   today's plan on the same Path, the part standing in for the rested
 *   Exercise; not offered when the plan has none.
 * - "Rest it till …": what the plan already does (the planner parked it on
 *   its own): nothing to change, so no tool; the card says so.
 * The card itself never acts. An answered question is not asked again this
 * run (memory only).
 *
 * The long view (`listCleanTempoSpans`, c4b1) is read once when the card
 * mounts on Progress, never at startup or during a Take, for the "up 20 BPM"
 * milestone lines.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { listCleanTempoSpans, type CleanTempoSpanRow } from "../../ipc";
import { answerPlateau, markCompanionSeen, plateauAnswered, useCompanion } from "../../coach/companion";
import type { Plateau } from "../../coach/nudges";
import { saveCardDismissed } from "../../coach/store";
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
    weekday: (at: number) => new Date(at).toLocaleDateString(lang, { weekday: "long" }),
  };
}

function PlateauQuestion({ plateau, session, onAnswered }: { plateau: Plateau; session: SessionRun; onAnswered: () => void }) {
  const { t } = useTranslation();
  const { weekday } = useDates();
  const [rested, setRested] = useState(false);
  const day = weekday(plateau.restsUntil);
  const values = {
    exercise: plateau.exercise.title,
    sessions: plateau.sessions,
    bpm: plateau.high,
    low: plateau.low,
    high: plateau.high,
    day,
  };
  const part = (session.plan?.steps ?? []).findIndex((s) => s.kind === "exercise" && s.pathId === plateau.path.id);
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
        {t(plateau.low === plateau.high ? "companion.plateau.say" : "companion.plateau.sayRange", values)}
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
                  {m.from === null
                    ? t("companion.weekly.movedNew", { to: m.to })
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
        {t("companion.weekly.foot", look.counts)}
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
  const [spans, setSpans] = useState<readonly CleanTempoSpanRow[] | null>(null);
  const [hiding, setHiding] = useState<"no" | "undo" | "done">("no");
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
      .catch(() => {});
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

  const shown = card !== null && hiding !== "done" && (card.kind === "weekly" ? look !== null : companion.plateau !== null);
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
        <span>{t("companion.hidden")}</span>
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
    setHiding("undo");
    timer.current = setTimeout(() => {
      commit();
      setHiding("done");
    }, UNDO_MS);
  };

  if (card.kind === "weekly" && look) {
    return (
      <section className="coach-note companion-card" data-testid="companion-weekly" aria-label={t("companion.weekly.label")}>
        <div className="companion-head">
          <CoachGlyph size={17} />
          <span className="companion-kick">{t("companion.weekly.kick", { from: day(look.start), to: day(look.end - 1) })}</span>
          <button type="button" className="companion-hide" onClick={hide} data-testid="companion-hide">
            {t("companion.hide")}
          </button>
        </div>
        <WeekBody look={look} session={session} showPlateau />
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
