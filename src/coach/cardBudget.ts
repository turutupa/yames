/**
 * The one-card budget (DESIGN 6.6): one proactive card per app open, in the
 * order milestone, then the weekly look-back, then the plateau question; the
 * rest wait for a later open.
 *
 * "Shown" lives in memory only (c4a1b: nothing is stored without a press), so
 * the budget is per app run: the module is loaded once per run, and the first
 * card granted keeps the slot for the rest of it (the dot on the rail and the
 * card on Progress agree, and a re-render or a second visit never swaps it for
 * another). What is stored is only the player's own presses ("Hide", "Not
 * now": `saveCardDismissed`), read through `cardMayShow`: seven days quiet
 * after one, not until asked after two, and nothing at all with Suggestions
 * on "Only when I ask".
 *
 * Nothing proactive in a Session, the wizard or Settings: the callers are
 * Progress and the rail, and they ask with `where`; any other place gets
 * nothing. The in-app reminder line (leg rem2) is not a proactive card and
 * does not spend this budget.
 */
import { cardMayShow, type CardKind, type CoachKeyStates, type CoachStored } from "./store";

/** The proactive kinds, in the order DESIGN 6.6 gives them the slot. */
export const BUDGET_ORDER = ["milestone", "weekly", "plateau"] as const satisfies readonly CardKind[];
export type BudgetKind = (typeof BUDGET_ORDER)[number];

/** A card that could be shown now: its kind and an id for what it is about (a week, an episode). */
export type CardOffer = { kind: BudgetKind; key: string };

/** Where a card may be shown. A Session, the wizard and Settings are never here. */
export type CardPlace = "progress" | "today";

/**
 * The card this open gets, pure: the first of `offers` in `BUDGET_ORDER` whose
 * kind `cardMayShow` allows, or the one already granted this run (`granted`)
 * while it is still on offer. A granted card that is no longer on offer (the
 * week turned, the episode ended, it was hidden) frees nothing: the budget is
 * spent for the run.
 */
export function pickCard(
  offers: readonly CardOffer[],
  granted: CardOffer | null,
  mayShow: (kind: BudgetKind) => boolean,
): { card: CardOffer | null; granted: CardOffer | null } {
  if (granted) {
    const still = offers.find((o) => o.kind === granted.kind && o.key === granted.key);
    return { card: still && mayShow(still.kind) ? still : null, granted };
  }
  for (const kind of BUDGET_ORDER) {
    const offer = offers.find((o) => o.kind === kind);
    if (offer && mayShow(kind)) return { card: offer, granted: offer };
  }
  return { card: null, granted: null };
}

let grantedThisRun: CardOffer | null = null;

/**
 * The card for this app run (see `pickCard`). `states` from `coachKeyStates()`:
 * while the keys load, or when they could not be read, nothing is shown and
 * nothing is spent.
 */
export function cardForThisRun(
  offers: readonly CardOffer[],
  stored: Pick<CoachStored, "suggestions" | "cards">,
  states: Pick<CoachKeyStates, "suggestions" | "cards">,
  now: number,
): CardOffer | null {
  const { card, granted } = pickCard(offers, grantedThisRun, (kind) => cardMayShow(stored, kind, now, states));
  grantedThisRun = granted;
  return card;
}

/** Tests only: a new app run. */
export function resetCardBudget(): void {
  grantedThisRun = null;
}
