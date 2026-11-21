/**
 * The chips' chooser (leg c2b1a): a table of places and facts, the three-chip
 * cap, and the chips the notes already showed kept exactly as they were.
 */
import { describe, expect, it } from "vitest";
import { fixture } from "./cardFixtures";
import { cardChipsFor, MAX_CHIPS, suggestChips, type ChipChoice, type ChipFacts, type ChipPlace } from "./suggest";

const ALL = ["where_slipped", "early_or_late", "why_not_counted"] as const;

function names(chips: ChipChoice[]): string[] {
  return chips.map((c) => (c.kind === "card" ? c.shape : c.kind === "feed" ? `feed${c.index}` : c.kind));
}

const TABLE: ReadonlyArray<[string, ChipPlace, ChipFacts, string[]]> = [
  // The Session's notes: exactly the chips c1b1 drew.
  ["ready note, sound and a How", "readyNote", { hear: true, howTo: true }, ["hear", "try"]],
  ["ready note, silent preview", "readyNote", { hear: false, howTo: true }, ["try"]],
  ["ready note, nothing", "readyNote", {}, []],
  ["result note with a How", "resultNote", { howTo: true }, ["try"]],
  ["result note, no How", "resultNote", { howTo: false }, []],
  ["result note: no card chips on the note in this leg", "resultNote", { howTo: true, cards: ALL, verdict: "belowBar" }, ["try"]],
  // The tools' note: the run's own chips, in order.
  ["tool note, three", "toolNote", { feed: 3 }, ["feed0", "feed1", "feed2"]],
  ["tool note, one", "toolNote", { feed: 1 }, ["feed0"]],
  ["tool note, none", "toolNote", { feed: 0 }, []],
  // Ask: the cards, ordered by the last Take.
  ["Ask, below the pass mark", "askEmpty", { cards: ALL, verdict: "belowBar" }, ["where_slipped", "early_or_late", "why_not_counted"]],
  ["Ask, a pass", "askEmpty", { cards: ALL, verdict: "passed" }, ["where_slipped", "early_or_late"]],
  ["Ask, a Take not caught", "askAbove", { cards: ["why_not_counted"], verdict: "notCaught" }, ["why_not_counted"]],
  ["Ask, after the where card was answered", "askAbove", { cards: ALL, verdict: "belowBar", answered: "where_slipped" }, ["early_or_late", "why_not_counted"]],
  ["Ask, an ungraded player: no card", "askEmpty", { cards: [], verdict: "belowBar" }, []],
  ["Ask, no Take", "askEmpty", { cards: ALL, verdict: null }, []],
];

describe("suggestChips", () => {
  it.each(TABLE)("%s", (_name, place, facts, want) => {
    expect(names(suggestChips(place, facts))).toEqual(want);
  });

  it("never more than three, anywhere", () => {
    expect(suggestChips("toolNote", { feed: 7 })).toHaveLength(MAX_CHIPS);
  });

  it("a card chip carries its call and its words as a key", () => {
    const [chip] = suggestChips("askEmpty", { cards: ALL, verdict: "belowBar" });
    expect(chip).toEqual({
      kind: "card",
      shape: "where_slipped",
      call: { tool: "where_slipped", args: {} },
      label: { key: "ask.card.chip.where", values: {} },
    });
  });
});

describe("cardChipsFor: the facts read off a real context", () => {
  it("a graded result below the pass mark offers all three", () => {
    expect(names(cardChipsFor(fixture({ slipped: [0, 4], failOn: "timingEvenness" }).ctx, "askEmpty"))).toEqual([...ALL]);
  });
  it("grading off: none", () => {
    expect(cardChipsFor(fixture({ slipped: [0, 4], failOn: "timingEvenness" }, { grading: "off" }).ctx, "askEmpty")).toEqual([]);
  });
  it("a Take not caught: only why", () => {
    expect(names(cardChipsFor(fixture({ verdict: "notCaught" }).ctx, "askAbove"))).toEqual(["why_not_counted"]);
  });
});
