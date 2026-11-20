/**
 * The coach's note (DESIGN 3.6, 4.1, 4.2): one thing said as a headline, where
 * it comes from, and its evidence inside it.
 *
 * The note is drawn from parts, not decided here: the Session chooses what to
 * say (`SessionCoach.tsx`, from `takeNote()`), this only lays it out by the
 * rules the mocks fix.
 *
 * - The coach's colour is on the glyph and the 3 px left rule, nowhere else,
 *   and the rule never turns red or green whatever the grade.
 * - A question chip is a neutral 1 px outline with a leading "?"; a play chip
 *   is the same outline with a triangle. Neither changes the Session.
 * - The bar strip sits inside the note; rounds of the tune are set apart and a
 *   slipped bar carries a cross as well as its colour.
 * - The fact line has a check (measured), a cross (not met) or a dash (could
 *   not tell). A dash is never red and never counts.
 * - Text wraps; 12 px is the floor; nothing is `nowrap` but a number with its unit.
 */
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import type { FactItem, Mark, NoteStrip } from "../../coach/takeNote";
import { SourceLine } from "../../coach/blocks/CoachBlocks";
import type { BlockSource } from "../../coach/blocks/resolve";
import { CoachGlyph } from "./CoachLine";
import "../../styles/coach-blocks.css";
import "../../styles/coach.css";

export function CoachNote({
  headline,
  source,
  children,
  live,
  testId,
  kind,
}: {
  /** The one thing: an order before a Take, the finding after it. */
  headline: ReactNode;
  /** Where the headline's words come from, said under it. */
  source?: BlockSource;
  children?: ReactNode;
  /** A result: read out politely when it lands. */
  live?: boolean;
  testId?: string;
  /** What the note is about, for styles and tests: "ready", "result", "ungraded". */
  kind?: string;
}) {
  return (
    <section className="coach-note" data-testid={testId} data-kind={kind} aria-live={live ? "polite" : undefined}>
      <p className="coach-note-head">
        <CoachGlyph />
        <span>{headline}</span>
      </p>
      {source && <SourceLine source={source} />}
      {children}
    </section>
  );
}

/**
 * A quiet line under the headline. `extra` lines step aside in a short window
 * (under 760 px of height the note is its headline and chips, so Start stays
 * on screen).
 */
export function NoteLine({ children, extra, testId }: { children: ReactNode; extra?: boolean; testId?: string }) {
  return (
    <p className="coach-note-line" data-extra={extra ? "" : undefined} data-testid={testId}>
      {children}
    </p>
  );
}

const MARK_GLYPH: Record<Exclude<Mark, "none">, string> = { check: "✓", cross: "✗", dash: "–" };

/** The evidence in words: each fact with its mark, on one wrapping line. */
export function FactLine({ facts, render }: { facts: readonly FactItem[]; render: (fact: FactItem) => string }) {
  const { t } = useTranslation();
  if (facts.length === 0) return null;
  return (
    <p className="coach-facts" data-testid="coach-facts">
      {facts.map((fact, i) => (
        <span key={fact.kind} className="coach-fact" data-mark={fact.mark} data-kind={fact.kind}>
          {i > 0 && (
            <span className="coach-fact-sep" aria-hidden="true">
              ·
            </span>
          )}
          {fact.mark !== "none" && (
            <>
              <span className="coach-fact-mark" aria-hidden="true">
                {MARK_GLYPH[fact.mark]}
              </span>
              <span className="sr-only">{t(`session.note.mark.${fact.mark}`)} </span>
            </>
          )}
          {render(fact)}
        </span>
      ))}
    </p>
  );
}

/**
 * The Take bar by bar, inside the note. One cell a bar played; a round of the
 * tune is a group, set apart from the next; the stretch that counted for a
 * pass is underlined.
 */
export function NoteBars({ strip, label }: { strip: NoteStrip; label: string }) {
  const { t } = useTranslation();
  if (strip.cells.length < 2) return null;
  const held = strip.held;
  const inHeld = (n: number) => !!held && n >= held.from && n < held.from + held.count;
  const rounds: Array<typeof strip.cells> = [];
  for (const cell of strip.cells) {
    const last = rounds[rounds.length - 1];
    if (last && last[0].round === cell.round) last.push(cell);
    else rounds.push([cell]);
  }
  return (
    <div className="coach-bars" data-testid="coach-bars">
      <p className="coach-bars-kick">
        <span>{t("session.result.barsTitle")}</span>
        <span aria-hidden="true"> · </span>
        <span>{label}</span>
      </p>
      <ol className="coach-bars-row">
        {rounds.map((round) => (
          <li key={round[0].round} className="coach-bars-round" style={{ flexGrow: round.length }}>
            <ol>
              {round.map((c) => (
                <li
                  key={c.n}
                  className="coach-bar"
                  data-state={c.state}
                  data-held={inHeld(c.n) ? "" : undefined}
                  data-spot={c.spot ? "" : undefined}
                  aria-label={t(
                    c.state === "met"
                      ? "session.result.barHeld"
                      : c.state === "missed"
                        ? "session.result.barSlipped"
                        : "session.result.barThin",
                    { n: c.n },
                  )}
                >
                  <span aria-hidden="true">
                    {c.state === "missed" && <span className="coach-bar-x">×</span>}
                    {c.n}
                  </span>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** A chip: a question ("?") or something that plays in place (a triangle). */
export type NoteChip = {
  kind: "ask" | "play";
  label: string;
  onClick: () => void;
  testId?: string;
  expanded?: boolean;
};

export function NoteChips({ chips }: { chips: readonly NoteChip[] }) {
  if (chips.length === 0) return null;
  return (
    <div className="coach-chips">
      {chips.map((chip) => (
        <button
          key={chip.label}
          type="button"
          className="coach-chip"
          data-kind={chip.kind}
          onClick={chip.onClick}
          data-testid={chip.testId}
          aria-expanded={chip.expanded}
        >
          <span className="coach-chip-lead" aria-hidden="true">
            {chip.kind === "ask" ? (
              "?"
            ) : (
              <svg width="9" height="10" viewBox="0 0 9 10" fill="currentColor">
                <path d="M0 0l9 5-9 5z" />
              </svg>
            )}
          </span>
          <span>{chip.label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Two equal answers, nothing pre-selected, kept with the Take: an ungraded
 * Take's "did they?" (DESIGN 4.4).
 */
export function NoteAnswer({
  question,
  answer,
  onAnswer,
}: {
  question: string;
  answer: "yes" | "notYet" | undefined;
  onAnswer: (answer: "yes" | "notYet") => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="coach-answer" role="group" aria-label={question} data-testid="coach-heard">
      <span className="coach-answer-q">{question}</span>
      {(["yes", "notYet"] as const).map((value) => (
        <button
          key={value}
          type="button"
          className="coach-chip coach-answer-btn"
          aria-pressed={answer === value}
          onClick={() => onAnswer(value)}
          data-testid={`coach-heard-${value}`}
        >
          {t(value === "yes" ? "session.note.ungraded.yes" : "session.note.ungraded.notYet")}
        </button>
      ))}
    </div>
  );
}
