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
    expect(catalogue.tools.map((t) => t.name)).toEqual(["where_slipped", "early_or_late", "why_not_counted"]);
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
    ["a graded result below the pass mark", { slipped: [0, 4], failOn: "timingEvenness" }, {}, ["where_slipped", "early_or_late", "why_not_counted"]],
    ["a Take not caught: only why", { verdict: "notCaught" }, {}, ["why_not_counted"]],
    ["the Take for the eyes: only why", { ungraded: "eyes" }, {}, ["why_not_counted"]],
    ["during a Take: nothing", {}, { run: runIn("playing") }, []],
    ["grading off: nothing about quality", {}, { grading: "off" }, []],
    ["a Session played ungraded: nothing about quality", {}, { run: { ...runIn("result"), ungraded: "chosen" } }, []],
    ["no Take yet: nothing", {}, { lastTake: undefined }, []],
  ];
  it.each(rows)("%s", (_name, shape, over, cards) => {
    expect(cardsHere(fixture(shape, over).ctx)).toEqual(cards);
  });

  it("an ungraded player asking anyway gets one line, never a card about quality", () => {
    const out = runFactCard({ tool: "where_slipped", args: {} }, { ...graded, grading: "off" });
    expect(isCard(out)).toBe(false);
    expect(!isCard(out) && out.line.key).toBe("ask.card.notNow.ungraded");
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
