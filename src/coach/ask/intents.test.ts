/**
 * The question shapes as `read` tools (leg c2b1a): plain data the registry's
 * catalogue shape can carry, closed arguments, `when` false in a Take and for
 * an ungraded player, and the runner's shape check in front of every card.
 */
import { describe, expect, it } from "vitest";
import { toolCatalogue } from "../tools/registry";
import { checkCall } from "../tools/run";
import { runIn } from "../tools/testPaths";
import { fakeHost } from "../tools/fakeHost";
import { isCard } from "./cards";
import { fixture } from "./cardFixtures";
import { cardsHere, factCardCatalogue, FACT_CARDS, runFactCard } from "./intents";
import { rememberPaths } from "../pathSuggest";
import { NO_PROGRESS } from "../../session/progress";
import { ALT, SWEEP } from "../../session/testKit";

/** Every card, in the list's order (c2b1a's three, then c2b1b's four). */
const ALL_CARDS = [
  "where_slipped",
  "early_or_late",
  "why_not_counted",
  "what_changed",
  "improving",
  "score_made_of",
  "pass_mark_distance",
  "suggest_path",
] as const;

describe("the cards as read tools", () => {
  it("every card is a player `read` tool with closed arguments (no query, no id)", () => {
    for (const card of FACT_CARDS) {
      expect(card.kind).toBe("read");
      expect(card.audience).toBe("player");
      for (const arg of card.args) expect(arg.type.kind === "enum" || arg.type.kind === "integer", `${card.name}.${arg.name}`).toBe(true);
    }
  });

  it("names are unique, and none is a tool of the registry", () => {
    const names = FACT_CARDS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    const tools = new Set(toolCatalogue().tools.map((t) => t.name));
    for (const name of names) expect(tools.has(name)).toBe(false);
  });

  it("the catalogue is plain data in the registry's shape", () => {
    const catalogue = factCardCatalogue();
    expect(JSON.parse(JSON.stringify(catalogue))).toEqual(catalogue);
    expect(catalogue.tools.map((t) => t.name)).toEqual([...ALL_CARDS]);
  });

  it("the runner's shape check stands in front of every card", () => {
    const { ctx } = fixture({ slipped: [0, 4], failOn: "timingEvenness" });
    expect(checkCall({ tool: "early_or_late", args: { premise: "sideways" } }, FACT_CARDS).ok).toBe(false);
    const bad = runFactCard({ tool: "early_or_late", args: { premise: "sideways" } }, ctx);
    expect(isCard(bad)).toBe(false);
    expect(isCard(runFactCard({ tool: "nope", args: {} }, ctx))).toBe(false);
  });

  it("a card's `run` answers through the tools' runner too (its first sentence as the receipt)", () => {
    const { ctx } = fixture({ slipped: [0, 4], failOn: "timingEvenness" });
    const tool = FACT_CARDS.find((c) => c.name === "where_slipped")!;
    const out = tool.run({}, fakeHost(), ctx);
    expect(out.ok && out.receipt.key).toBe("session.note.place.slipped.bar");
  });
});

describe("when: what can be asked here", () => {
  const graded = fixture({ slipped: [0, 4], failOn: "timingEvenness" }).ctx;
  const rows: Array<[string, Parameters<typeof fixture>[0], Parameters<typeof fixture>[1], string[]]> = [
    ["a graded result below the pass mark", { slipped: [0, 4], failOn: "timingEvenness" }, {}, [...ALL_CARDS]],
    // c2b1b: what was measured reads nothing; why, the history and the pass mark's make-up still answer.
    ["a Take not caught: why, the history, the make-up", { verdict: "notCaught" }, {}, ["why_not_counted", "improving", "score_made_of", "suggest_path"]],
    ["the Take for the eyes: why, the history, the make-up", { ungraded: "eyes" }, {}, ["why_not_counted", "improving", "score_made_of", "suggest_path"]],
    ["during a Take: nothing", {}, { run: runIn("playing") }, []],
    // c4b3: a Path suggestion reads no grade, so it is there for an ungraded player too.
    ["grading off: nothing about quality", {}, { grading: "off" }, ["suggest_path"]],
    ["a Session played ungraded: nothing about quality", {}, { run: { ...runIn("result"), ungraded: "chosen" } }, ["suggest_path"]],
    ["no Take yet: only what the score is made of (it reads the Exercise)", {}, { lastTake: undefined }, ["score_made_of", "suggest_path"]],
  ];
  it.each(rows)("%s", (_name, shape, over, cards) => {
    expect(cardsHere(fixture(shape, over).ctx)).toEqual(cards);
  });

  it("an ungraded player asking anyway gets one line, never a card about quality", () => {
    const out = runFactCard({ tool: "where_slipped", args: {} }, { ...graded, grading: "off" });
    expect(isCard(out)).toBe(false);
    expect(!isCard(out) && out.line.key).toBe("ask.card.notNow.ungraded");
  });

  it("an ungraded player asking for a Path suggestion is answered, not refused (c4b3)", () => {
    rememberPaths([ALT, SWEEP]);
    try {
      const out = runFactCard({ tool: "suggest_path", args: {} }, { ...graded, grading: "off", progress: NO_PROGRESS });
      expect(isCard(out) && out.shape).toBe("suggest_path");
      expect(isCard(out) && out.source).toEqual({ kind: "path" });
    } finally {
      rememberPaths([]);
    }
  });

  it("asked about a Take not caught, the where card says it did not measure it (uncertainty by rule)", () => {
    const out = runFactCard({ tool: "where_slipped", args: {} }, fixture({ verdict: "notCaught" }).ctx);
    expect(isCard(out) && out.uncertain).toBe(true);
  });

  it("a metric needs the Exercise, not a Take", () => {
    const out = runFactCard({ tool: "why_not_counted", args: { what: "muting" } }, fixture({}, { lastTake: undefined }).ctx);
    expect(isCard(out) && out.lines[0].key).toBe("ask.card.notMeasured.muting");
  });
});
