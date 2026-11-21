/**
 * The chips' chooser (leg c2b1a): a table of places and facts, the three-chip
 * cap, and the chips the notes already showed kept exactly as they were.
 */
import { describe, expect, it } from "vitest";
import { fixture } from "./cardFixtures";
import { cardChipsFor, MAX_CHIPS, SCREEN_HELP_CHIP, suggestChips, type ChipChoice, type ChipFacts, type ChipPlace } from "./suggest";

const ALL = ["where_slipped", "early_or_late", "why_not_counted", "what_changed", "improving", "score_made_of", "pass_mark_distance"] as const;
/** The first three after a Take below the pass mark (c2b1b; before it: where, lean, count). */
const BELOW = ["where_slipped", "pass_mark_distance", "early_or_late"];
/** The Path's and the plan's cards that can have a chip (leg c2b2a). */
const PATH_PLAN = ["exercise_try", "exercise_purpose", "exercise_how", "plan_why", "plan_tempo", "plan_next", "plan_return", "clean_tempo", "pass_mark_ms"] as const;

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
  ["Ask, below the pass mark", "askEmpty", { cards: ALL, verdict: "belowBar" }, BELOW],
  ["Ask, a pass", "askEmpty", { cards: ALL, verdict: "passed" }, ["where_slipped", "what_changed", "early_or_late"]],
  ["Ask, a Take not caught", "askAbove", { cards: ["why_not_counted", "improving", "score_made_of"], verdict: "notCaught" }, ["why_not_counted", "score_made_of"]],
  ["Ask, after the where card was answered", "askAbove", { cards: ALL, verdict: "belowBar", answered: "where_slipped" }, ["pass_mark_distance", "early_or_late", "what_changed"]],
  ["Ask, after a pass, only the history cards here", "askAbove", { cards: ["what_changed", "improving"], verdict: "passed" }, ["what_changed", "improving"]],
  ["Ask, an Exercise the player checks: what the score is made of", "askEmpty", { cards: ["why_not_counted", "score_made_of"], verdict: "ungraded" }, ["why_not_counted", "score_made_of"]],
  ["Ask, an ungraded player: no card", "askEmpty", { cards: [], verdict: "belowBar" }, []],
  ["Ask, no Take", "askEmpty", { cards: ALL, verdict: null }, []],
  // Leg c2b2a: the Path's words and the plan.
  ["Ask, a Session's ready screen before a Take", "askEmpty", { cards: [...ALL, ...PATH_PLAN], verdict: null }, ["exercise_try", "plan_why", "exercise_purpose"]],
  ["Ask, before a Take, no cue in the pack", "askEmpty", { cards: ["plan_why", "exercise_purpose", "exercise_how"], verdict: null }, ["plan_why", "exercise_purpose", "exercise_how"]],
  ["Ask, below the pass mark: the Take's cards first, the Path's never crowd them", "askAbove", { cards: [...ALL, ...PATH_PLAN], verdict: "belowBar" }, BELOW],
  ["Ask, a Take not caught: the Path's cue fills the third place", "askAbove", { cards: ["why_not_counted", "score_made_of", ...PATH_PLAN], verdict: "notCaught" }, ["why_not_counted", "score_made_of", "exercise_try"]],
  ["Ask, theory and minutes never as chips", "askEmpty", { cards: ["scale_fits", "chord_notes", "plan_minutes", "plan_skip"], verdict: null }, []],
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
  it("a graded result below the pass mark offers three (in the empty state, two and 'What is this screen for?', leg c2cb)", () => {
    const ctx = fixture({ slipped: [0, 4], failOn: "timingEvenness" }).ctx;
    expect(names(cardChipsFor(ctx, "askAbove"))).toEqual(BELOW);
    expect(names(cardChipsFor(ctx, "askEmpty"))).toEqual([...BELOW.slice(0, 2), "help"]);
  });
  it("grading off: no card, only 'What is this screen for?' in the empty state", () => {
    const ctx = fixture({ slipped: [0, 4], failOn: "timingEvenness" }, { grading: "off" }).ctx;
    expect(cardChipsFor(ctx, "askAbove")).toEqual([]);
    expect(cardChipsFor(ctx, "askEmpty")).toEqual([SCREEN_HELP_CHIP]);
  });
  it("the help chip is explain_screen, and is not offered again straight after it answered", () => {
    expect(SCREEN_HELP_CHIP).toMatchObject({ kind: "card", shape: "help", call: { tool: "explain_screen", args: {} }, label: { key: "help.ui.chip" } });
    expect(names(cardChipsFor(fixture({ slipped: [0, 4], failOn: "timingEvenness" }).ctx, "askEmpty", "help"))).not.toContain("help");
  });
  it("a Take not caught: why, and what the score is made of (then the Path's cue, when the pack has cues)", () => {
    const f = fixture({ verdict: "notCaught" });
    const third = (f.exercise.cues?.length ?? 0) > 0 ? ["exercise_try"] : f.exercise.howTo.length > 0 ? ["exercise_how"] : [];
    expect(names(cardChipsFor(f.ctx, "askAbove"))).toEqual(["why_not_counted", "score_made_of", ...third]);
  });
  it("a new card's chip carries its own words", () => {
    const chips = suggestChips("askEmpty", { cards: ALL, verdict: "passed" });
    expect(chips.map((c) => (c.kind === "card" ? c.label.key : c.kind))).toEqual(["ask.card.chip.where", "ask.card.chip.changed", "ask.card.chip.lean"]);
  });
});
