/**
 * The fact cards a choice may name: the ONE list the test set's validator,
 * the choice grammar and the choice prompt read (leg c3b1a).
 *
 * Empty for now, on purpose. The cards (`src/coach/ask/cards.ts`, legs
 * c2b1b and c2b2a) were not on `coach` when this was built; when they are,
 * this becomes one line that reads their list (their ids and one-line
 * descriptions), and leg c3b1b adds the test set's card items. Nothing else
 * changes: the item format, `judgeExpected`, `choiceGrammar` and the prompt
 * already take cards.
 */
export type EvalCard = {
  id: string;
  /** What it answers, in one line (the prompt's description). */
  note: string;
};

export const EVAL_CARDS: readonly EvalCard[] = [];

export const CARD_IDS: readonly string[] = EVAL_CARDS.map((card) => card.id);
