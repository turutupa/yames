/**
 * Typed English to a fact card (leg c2b1a): the questions that must match,
 * the near-misses that must not, and the router's commands, none of which may
 * also match a card.
 */
import { describe, expect, it } from "vitest";
import { toolCtx } from "../tools/fakeHost";
import { runIn } from "../tools/testPaths";
import type { ToolArgs } from "../tools/types";
import type { CommandTable } from "./commandTable";
import { commandFacts, routeCommand } from "./router";
import { matchCard } from "./match";
import en from "./commands/en.json";

const EN = en as unknown as CommandTable;

const MATCHES: ReadonlyArray<[string, string, ToolArgs]> = [
  ["Where did it slip?", "where_slipped", {}],
  ["where did I slip", "where_slipped", {}],
  ["Show me where it slipped", "where_slipped", {}],
  ["which bar did I mess up?", "where_slipped", {}],
  ["where did it go wrong?", "where_slipped", {}],
  ["Which bars slipped in that take?", "where_slipped", {}],
  ["where was I late?", "where_slipped", {}],
  ["where did I lose it", "where_slipped", {}],
  // A place and a way at once: the where card says which way the notes there leaned.
  ["where did it slip and was I late?", "where_slipped", {}],
  ["Am I rushing?", "early_or_late", { premise: "early" }],
  ["was I rushing", "early_or_late", { premise: "early" }],
  ["am i dragging?", "early_or_late", { premise: "late" }],
  ["Was I early or late?", "early_or_late", {}],
  ["am I rushing or dragging", "early_or_late", {}],
  ["how do i stop rushing the open string", "early_or_late", { premise: "early" }],
  ["Was I behind the beat?", "early_or_late", { premise: "late" }],
  ["did I play it ahead of the click?", "early_or_late", { premise: "early" }],
  ["was that take late?", "early_or_late", { premise: "late" }],
  ["Why didn't that count?", "why_not_counted", {}],
  ["why did that not count", "why_not_counted", {}],
  ["why wasn't it graded?", "why_not_counted", {}],
  ["Why didn't it pass?", "why_not_counted", {}],
  ["why didn’t my take count", "why_not_counted", {}],
  ["why didn't my downstrokes count?", "why_not_counted", { what: "pickDirection" }],
  ["do you check my pick direction?", "why_not_counted", { what: "pickDirection" }],
  ["Does it grade my muting?", "why_not_counted", { what: "muting" }],
  ["did you measure my tone?", "why_not_counted", { what: "tone" }],
  ["does the app check my pitch?", "why_not_counted", { what: "pitch" }],
  ["did it hear my wrong notes?", "why_not_counted", { what: "pitch" }],
  ["do you track my posture", "why_not_counted", { what: "posture" }],
];

/** Lines that must not become a card: commands, questions about something else, statements, two shapes at once. */
const NEAR_MISSES: readonly string[] = [
  "slower",
  "set 80",
  "open paths",
  "loop bar 3",
  "loop the late bars",
  "show me the late bars",
  "I was late",
  "I rushed it",
  "i keep dragging",
  "where are my paths?",
  "where is the metronome",
  "where's my progress?",
  "is it too late to start today?",
  "should I play behind the beat?",
  "can I rush a fill?",
  "how do I hold the pick?",
  "what is a clean tempo?",
  "what does 85% even mean?",
  "why this tempo?",
  "why not 100 yet?",
  "am I improving?",
  "what changed since the last take?",
  "how far is the pass mark?",
  "what should I try?",
  "why is it so slow",
  "do you check my tone and my muting?",
  "did you hear that?",
  "tell me a joke",
  "late",
  "rushing",
  "",
  "?",
];

describe("matchCard: typed English to a card", () => {
  it.each(MATCHES)("%s", (text, tool, args) => {
    expect(matchCard(text)).toEqual({ tool, args });
  });

  it.each(NEAR_MISSES.map((s) => [s]))("near miss: %s", (text) => {
    expect(matchCard(text)).toBeNull();
  });
});

/** The facts on the screens the router is held to, from a real context (as router.test.ts builds them). */
const SCREENS = {
  today: commandFacts(toolCtx({ screen: "today" }), "today"),
  paths: commandFacts(toolCtx({ screen: "paths" }), "paths"),
  beat: commandFacts(toolCtx({ screen: "beat" }), "beat"),
  jam: commandFacts(toolCtx({ screen: "jam" }), "jam"),
  ready: commandFacts(toolCtx({ screen: "session", run: runIn("ready") }), "session"),
  result: commandFacts(toolCtx({ screen: "session", run: runIn("result") }), "session"),
};

/**
 * Every line the router's English table can make into a command: each verb
 * alone, a verb with each screen, section, setting, noun and unit, plus the
 * table's own phrases on their own.
 */
function commandLines(table: CommandTable): string[] {
  const words = (group: Record<string, readonly string[] | undefined>) => Object.values(group).flatMap((w) => w ?? []);
  const verbs = words(table.verbs);
  const objects = [...words(table.screens), ...words(table.sections), ...words(table.settingKeys), ...words(table.nouns), ...words(table.swapChoices)];
  const lines = new Set<string>([...verbs, ...objects, ...words(table.never), "80", "80 bpm", "15 minutes", "loop bars 3-4", "start at part 3"]);
  for (const v of verbs) for (const o of objects) lines.add(`${v} ${o}`);
  for (const v of verbs) lines.add(`${v} the first bar`);
  return [...lines];
}

describe("a line the router takes as a command never also matches a card", () => {
  const lines = commandLines(EN);

  it("the table gives the router plenty to take", () => {
    const routed = lines.filter((line) => Object.values(SCREENS).some((f) => routeCommand(line, EN, f).kind !== "none"));
    expect(routed.length).toBeGreaterThan(100);
  });

  it.each(Object.entries(SCREENS))("on %s", (_screen, facts) => {
    const both = lines.filter((line) => routeCommand(line, EN, facts).kind !== "none" && matchCard(line) !== null);
    expect(both).toEqual([]);
  });

  it("and every question that matches a card is not a command anywhere (the router runs first)", () => {
    for (const [text] of MATCHES) {
      for (const facts of Object.values(SCREENS)) expect(routeCommand(text, EN, facts).kind, text).toBe("none");
    }
  });
});
