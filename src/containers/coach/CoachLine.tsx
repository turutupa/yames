/**
 * The coach's voice in one line (DESIGN 2, 3.4, 3.6).
 *
 * The coach has no name and no face: one glyph, the rail's speech bubble with
 * level bars, in the theme's second accent (`--accent-2`). That colour is spent
 * on the glyph and on a note's 3 px rule and nowhere else; the words are ink.
 *
 * The learning side's old `CoachLine` (a lamp, amber or green, then the words)
 * is folded in here: the lamp went with DESIGN 2 ("the number carries the
 * grade"), the voice it carried is the one this keeps.
 */
import { memo } from "react";
import type { ReactNode } from "react";
import type { AskHandler } from "./askStore";
import "../../styles/coach.css";

/** The coach's mark: a speech bubble with three level bars, drawn in `currentColor`. */
export function CoachGlyph({ size = 18, className = "coach-glyph" }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a8 8 0 1 0-3.1 6.3L21 19z" />
      <line x1="9" y1="10" x2="9" y2="14" />
      <line x1="12.5" y1="8.5" x2="12.5" y2="15.5" />
      <line x1="16" y1="11" x2="16" y2="13" />
    </svg>
  );
}

/**
 * The note's sentence or the line's words, tappable when the coach can be
 * asked about them: Ask opens with that sentence as what the question is
 * about (DESIGN 5.1). The words as read, not a label of their own. Without
 * `onAsk`, just the words.
 */
export function AskableText({ children, onAsk, testId }: { children: ReactNode; onAsk?: AskHandler; testId?: string }) {
  if (!onAsk) return <>{children}</>;
  return (
    <button
      type="button"
      className="coach-say"
      onClick={(e) => onAsk({ about: e.currentTarget.textContent?.trim() || undefined, from: e.currentTarget })}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

/** One line from the coach: its glyph, then the words. No card, no rule. */
export function CoachLine({ children, testId, onAsk }: { children: ReactNode; testId?: string; onAsk?: AskHandler }) {
  return (
    <div className="coach-line" data-testid={testId}>
      <CoachGlyph />
      <div className="coach-line-text">
        <AskableText onAsk={onAsk} testId={testId ? `${testId}-ask` : undefined}>
          {children}
        </AskableText>
      </div>
    </div>
  );
}

/**
 * The longest order a running Take shows (DESIGN 3.4: a pack rule for any cue).
 * Counted in characters as the player reads them, not in UTF-16 units.
 */
export const TAKE_ORDER_MAX = 48;

/**
 * The cue in its short form, or null. A cue longer than the limit is not cut
 * mid-sentence: the Take shows nothing rather than half an order.
 */
export function shortCue(text: string | null | undefined): string | null {
  const said = text?.trim();
  if (!said) return null;
  return [...said].length <= TAKE_ORDER_MAX ? said : null;
}

/**
 * The one order during a Take (DESIGN 3.4): chosen before the count-in and
 * fixed until the Take ends. In ink, with a faint glyph: no coach colour on a
 * live screen. Memoised on its words alone, so the beat that re-renders the
 * Take screen nine times a second never reaches it (`smooth.spec.ts`).
 */
export const TakeOrder = memo(function TakeOrder({ text }: { text: string }) {
  return (
    <div className="coach-order" data-testid="coach-order">
      <CoachGlyph className="coach-glyph coach-order-glyph" size={20} />
      <span>{text}</span>
    </div>
  );
});
