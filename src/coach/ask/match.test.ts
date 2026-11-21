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
  // Still cards after the review's fixes (F6): "that" as the subject, the last Take named.
  ["was that late?", "early_or_late", { premise: "late" }],
  ["why didn't the last take count?", "why_not_counted", {}],
  ["was I late in my last take?", "early_or_late", { premise: "late" }],
  // The second review (c2b1c M3): a regression ("does it"), and three safe failures that are clearly this Take.
  ["Where does it slip?", "where_slipped", {}],
  ["Where does it fall apart?", "where_slipped", {}],
  ["Which bar was off?", "where_slipped", {}],
  ["Why didn't I pass?", "why_not_counted", {}],
  ["How come that didn't count?", "why_not_counted", {}],
  // c2b1b: the four cards about the Take's history and the pass mark.
  ["what changed since the last take?", "what_changed", {}],
  ["What changed?", "what_changed", {}],
  ["What's different from my previous take?", "what_changed", {}],
  ["was that better than the last one?", "what_changed", {}],
  ["Did I do better?", "what_changed", {}],
  ["how does this compare to my last take?", "what_changed", {}],
  ["am I improving?", "improving", {}],
  ["Am I getting better at this exercise?", "improving", {}],
  ["have I improved?", "improving", {}],
  ["how am I doing?", "improving", {}],
  ["What is the score made of?", "score_made_of", {}],
  ["how is my take graded?", "score_made_of", {}],
  ["what do you check?", "score_made_of", {}],
  ["what is the grade based on?", "score_made_of", {}],
  ["how far is the pass mark?", "pass_mark_distance", {}],
  ["How far was I from passing?", "pass_mark_distance", {}],
  ["how close am I to the pass mark?", "pass_mark_distance", {}],
  ["did I nearly pass?", "pass_mark_distance", {}],
  ["what do I need to pass?", "pass_mark_distance", {}],
  // A metric named: the why card's question, never what the score is made of.
  ["do you grade my muting?", "why_not_counted", { what: "muting" }],
  // int1b (review c2b1b, item 3): "improving" about something the app does not grade is "I didn't measure that".
  ["Is my tone getting better?", "why_not_counted", { what: "tone" }],
  ["is my muting improving?", "why_not_counted", { what: "muting" }],
  ["Am I getting better at alternate picking?", "why_not_counted", { what: "pickDirection" }],
  ["is my timing improving?", "improving", {}],
  ["I feel stuck, am I improving?", "improving", {}],
  // int1b (review c2b1b, item 4): passing this Exercise is the pass mark's own subject.
  ["How close am I to passing this exercise?", "pass_mark_distance", {}],
  ["how far off am I from passing?", "pass_mark_distance", {}],
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
  // c2b2a: "what is a clean tempo?", "what does 85% even mean?", "why this tempo?" and
  // "what should I try?" now have cards (`pathMatch.test.ts`, with their near-misses).
  "why not 100 yet?",
  // c2b1b: these three now have cards (see MATCHES); their near-misses are below.
  "why is it so slow",
  "do you check my tone and my muting?",
  "did you hear that?",
  "tell me a joke",
  "late",
  "rushing",
  "",
  "?",
  // The review of c2b1a (F6): each of these matched a card it does not ask for.
  "Why is there no count-in?",
  "why isn't there a count in?",
  "Why didn't my bends count?",
  "why didn't my vibrato count?",
  "Am I behind on my Path?",
  "am I ahead of schedule?",
  "am i behind with my practice?",
  "What does it mean to rush?",
  "what does dragging mean?",
  "Was I late in Take 1?",
  "where did take 3 slip?",
  "did I rush yesterday?",
  "was I rushing in the first take?",
  "why didn't the previous take count?",
  // With "my" in them, so ABOUT_ME holds and only NOT_MY_TIMING keeps them out (review c2b1c L4).
  "Did my metronome start late?",
  "is my click late?",
  // The second review (c2b1c M3): each of these matched a card it does not ask for.
  "Is my click late?",
  "Was my metronome late?",
  "Why didn't this Step count towards my Path?",
  "Am I behind everyone else?",
  "Why do my notes sound late in the recording?",
  "Did I rush the warm-up?",
  "Why didn't I pass the Path?",
  "was I late in the solo?",
  // c2b1b: near the four new cards, and not their question.
  "what changed in the app?",
  "what changed in this version?",
  "what changed since take 3?",
  "what changed since yesterday?",
  "what changed on this step?",
  "am I improving overall?",
  "am I getting better at guitar?",
  "am I improving on the Path?",
  "is my playing improving and was I late?",
  "how far is the next step?",
  "how far am I from the end of the path?",
  "what is my score?",
  "what is a pass mark?",
  "what does the pass mark mean?",
  "how is the weather?",
  "did I pass?",
  "how far is it to the next exercise?",
  "what changed since the previous take, and was I late?",
  // int1b (review c2b1b, item 4): each of these matched a card it does not ask for.
  "How is my progress calculated?",
  "how is my progress worked out?",
  "How far off was I on the downbeat?",
  "how far off am I?",
  "What was different about bar 5?",
  "what changed in bar 3?",
  "What changed in the coach?",
  "What changed in this build?",
  "what changed in the beta?",
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
