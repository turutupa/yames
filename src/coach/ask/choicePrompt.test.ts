import { describe, expect, it } from "vitest";
import { estimateTokens } from "../context";
import { COACH_TOOLS, toolCatalogue } from "../tools/registry";
import { CHOICE_CONTEXT_TOKENS, CHOICE_PREFIX_TOKENS, choiceContext, choicePrefix } from "./choicePrompt";
import { EVAL_CARDS } from "./evalCards";

const catalogue = () => toolCatalogue(COACH_TOOLS);

describe("choicePrefix", () => {
  it("is byte-identical turn to turn (the worker keeps it decoded)", () => {
    const first = choicePrefix(catalogue(), EVAL_CARDS);
    const realNow = Date.now;
    try {
      Date.now = () => realNow() + 86_400_000;
      expect(choicePrefix(catalogue(), EVAL_CARDS)).toBe(first);
    } finally {
      Date.now = realNow;
    }
    expect(first).not.toMatch(/\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2}/);
  });

  it("lists every player tool and fits DESIGN 5.5's 900 tokens", () => {
    const prefix = choicePrefix(catalogue(), EVAL_CARDS);
    for (const tool of catalogue().tools) expect(prefix).toContain(`\n${tool.name}(`);
    expect(prefix).not.toContain("return_to");
    // The tools and the format (c3b1a's gate). The cards come on top: see below (c3b1b).
    expect(estimateTokens(prefix.split("\n\nCards:")[0])).toBeLessThanOrEqual(CHOICE_PREFIX_TOKENS);
  });

  it("lists each card with its arguments and its note to the first stop (c3b1b)", () => {
    const prefix = choicePrefix(catalogue(), EVAL_CARDS);
    expect(prefix).toContain("\nearly_or_late(premise?=early|late): ");
    expect(prefix).toContain("\nimproving(): ");
    expect(prefix).toMatch(/\nwhy_not_counted\(what\?=take\|pitch\|.*\|feel\): /);
    // The `take` every last-Take card carries has one value: not shown.
    expect(prefix).not.toContain("take?=last");
    const names = choicePrefix(catalogue(), EVAL_CARDS, { notes: false });
    expect(names).toContain("\nearly_or_late(premise?=early|late)\n");
  });

  it("with the real cards, and with a card list as long as 40 one-liners", () => {
    const real = estimateTokens(choicePrefix(catalogue(), EVAL_CARDS));
    const cards = Array.from({ length: 40 }, (_, i) => ({ id: `card_${i}`, note: "What the player's best clean tempo is here." }));
    const prefix = choicePrefix(catalogue(), cards);
    expect(prefix).toContain("card_39: ");
    // NOT within DESIGN 5.5's 900 with the cards: the tools alone take ~870 estimated tokens and the
    // seven cards ~250 more (c3b1b measured 1113). Rust does not cap the prefix; the budget is an open
    // decision for the orchestrator (raise it, shorten the tool lines, or send cards by name only).
    // Gated here: the cards' own section stays under 300, so it cannot grow unnoticed.
    const cardsPart = estimateTokens(choicePrefix(catalogue(), EVAL_CARDS).split("\n\nCards:")[1] ?? "");
    console.info(`choice prefix: ${real} tokens with the ${EVAL_CARDS.length} cards (cards ${cardsPart}); ${estimateTokens(prefix)} with 40 one-line cards`);
    expect(cardsPart).toBeLessThanOrEqual(300);
  });
});

describe("choiceContext", () => {
  const facts = {
    screen: "today",
    session: "none",
    grading: "on",
    minutes: 15,
    parts: ["Quarter notes on one string", "Downstrokes, then alternate", "The box, in A"],
    followed: ["Rhythm Foundations", "Alternate Picking", "Blues and Pentatonics"],
    jams: ["Blues in A", "Funk 90", "Slow rock"],
    presets: ["Warm-up 80", "Triplets 120", "Gallop"],
    possible: ["go_to", "open_path", "start_today", "set_minutes"],
  };

  it("states the facts as plain lines", () => {
    const text = choiceContext(facts);
    expect(text).toContain("Screen: today");
    expect(text).toContain("Today: 15 minutes");
    expect(text).toContain("Today's parts: 1. Quarter notes on one string; 2.");
    expect(text).toContain("Tools here: go_to, open_path, start_today, set_minutes");
  });

  it("never passes the worker's 450 tokens, whatever the titles", () => {
    const long = { ...facts, followed: Array.from({ length: 200 }, (_, i) => `学習パス ${i} 弦をまたぐオルタネイト・ピッキング`) };
    const text = choiceContext(long);
    expect(estimateTokens(text)).toBeLessThanOrEqual(CHOICE_CONTEXT_TOKENS);
    expect(text).toContain("Screen: today");
  });
});
