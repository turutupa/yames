/**
 * The fact cards a choice may name: the ONE list the test set's validator,
 * the choice grammar and the choice prompt read (leg c3b1a).
 *
 * The cards' own list (`FACT_CARDS`, `intents.ts`; legs c2b1a / c2b1b),
 * read as plain data: id, note and closed arguments (leg c3b1b). A card added
 * there (c2b2a's Path, plan and theory cards) reaches the validator, the
 * grammar and the prompt with no change here; the test set gets its items
 * when the card is on `coach`.
 */
import type { ArgField } from "../tools/types";
import { FACT_CARDS } from "./intents";

export type EvalCard = {
  id: string;
  /** What it answers, in one line (the prompt's description). */
  note: string;
  /** Its arguments, typed as a tool's are (all optional today). Absent: the grammar's generic card argument. */
  args?: readonly ArgField[];
  /**
   * What it answers in at most six words, by hand (leg c2b2ac): the prompt's
   * line for every card when the notes do not fit `CHOICE_CARDS_TOKENS`.
   * Absent (a test's made-up card): the first three words of the note.
   */
  short?: string;
};

export const EVAL_CARDS: readonly EvalCard[] = FACT_CARDS.map((card) => ({ id: card.name, note: card.note, args: card.args, short: card.short }));

export const CARD_IDS: readonly string[] = EVAL_CARDS.map((card) => card.id);
