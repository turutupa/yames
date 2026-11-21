/**
 * The one-card budget (DESIGN 6.6) over a week of fixture app opens, with the
 * store's own rules (`cardMayShow`) behind it.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { cardForThisRun, pickCard, resetCardBudget, type CardOffer } from "./cardBudget";
import { withCardDismissed, type CoachCards, type CoachKeyStates, type Suggestions } from "./store";

const DAY = 86_400_000;
const T0 = 1_794_000_000_000;
const READ: Pick<CoachKeyStates, "suggestions" | "cards"> = { suggestions: "read", cards: "read" };
const weekly: CardOffer = { kind: "weekly", key: "weekly@1" };
const plateau: CardOffer = { kind: "plateau", key: "C@1" };
const milestone: CardOffer = { kind: "milestone", key: "level@1" };

describe("pickCard", () => {
  it("gives the slot in the order milestone, look-back, plateau", () => {
    const yes = () => true;
    expect(pickCard([plateau, weekly, milestone], null, yes).card).toBe(milestone);
    expect(pickCard([plateau, weekly], null, yes).card).toBe(weekly);
    expect(pickCard([plateau], null, yes).card).toBe(plateau);
    expect(pickCard([], null, yes)).toEqual({ card: null, granted: null });
  });

  it("skips a kind the store holds back, and keeps a granted card for the rest of the run", () => {
    const notWeekly = (k: string) => k !== "weekly";
    expect(pickCard([weekly, plateau], null, notWeekly).card).toBe(plateau);
    // Granted the look-back; a plateau appearing later in the run waits.
    const first = pickCard([weekly], null, () => true);
    expect(pickCard([weekly, plateau], first.granted, () => true).card).toBe(weekly);
    // Hidden: nothing else takes its place this run.
    expect(pickCard([weekly, plateau], first.granted, notWeekly)).toEqual({ card: null, granted: weekly });
  });
});

describe("a week of app opens", () => {
  beforeEach(() => resetCardBudget());

  /**
   * Each row: one app open (a new run), what is on offer, the press made on
   * the card shown (if any), and what was shown. Suggestions "on" throughout
   * except where it says.
   */
  type Row = { day: number; offers: CardOffer[]; suggestions?: Suggestions; press?: "hide"; shown: string | null };
  const WEEK: Row[] = [
    { day: 0, offers: [weekly, plateau], shown: "weekly" }, // the look-back first; the plateau waits
    { day: 0.5, offers: [weekly, plateau], press: "hide", shown: "weekly" }, // shown again (seen is not stored), hidden
    { day: 1, offers: [weekly, plateau], shown: "plateau" }, // look-back quiet for 7 days: the plateau's turn
    { day: 2, offers: [weekly], shown: null }, // the plateau's rest is over; the look-back still quiet
    { day: 3, offers: [weekly, plateau], suggestions: "asked", shown: null }, // "Only when I ask": nothing
    { day: 7.6, offers: [weekly], shown: "weekly" }, // seven days after the Hide: back
    { day: 7.7, offers: [weekly], press: "hide", shown: "weekly" }, // the second Hide
    { day: 15, offers: [weekly, milestone], shown: "milestone" }, // a milestone outranks it anyway
    { day: 16, offers: [weekly], shown: null }, // two Hides: not until asked
  ];

  it("shows one card per open, in order, and honours Hide and Suggestions", () => {
    let cards: CoachCards = {};
    const shown: Array<string | null> = [];
    for (const row of WEEK) {
      resetCardBudget(); // a new app run
      const now = T0 + row.day * DAY;
      const card = cardForThisRun(row.offers, { suggestions: row.suggestions ?? "on", cards }, READ, now);
      shown.push(card?.kind ?? null);
      if (row.press === "hide" && card) cards = withCardDismissed(cards, card.kind, now);
    }
    expect(shown).toEqual(WEEK.map((r) => r.shown));
  });

  it("shows nothing and spends nothing while the coach's keys are not read", () => {
    const loading = { suggestions: "loading", cards: "read" } as const;
    expect(cardForThisRun([weekly], { suggestions: "on", cards: {} }, loading, T0)).toBeNull();
    expect(cardForThisRun([weekly], { suggestions: "on", cards: {} }, READ, T0)).toBe(weekly);
  });
});
