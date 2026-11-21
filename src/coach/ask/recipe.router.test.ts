/**
 * Typed recipes with no model (leg t2c, mock 17's note 1): what each English
 * line routes to, the near-misses that must not become a recipe, the
 * never-list still answered `yours`, and every recipe line building (or being
 * refused with a sentence) through the real tool.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { fakeHost, toolCtx } from "../tools/fakeHost";
import { loadExerciseGenerator } from "../tools/make";
import { runCoachTool } from "../tools/run";
import { runIn } from "../tools/testPaths";
import type { ToolArgs } from "../tools/types";
import { validateCommandTable, type CommandTable } from "./commandTable";
import { commandFacts, routeCommand, type RouteResult } from "./router";
import en from "./commands/en.json";

const EN = en as unknown as CommandTable;
const today = commandFacts(toolCtx({ screen: "today" }), "today");
const route = (text: string, f = today): RouteResult => routeCommand(text, EN, f);

beforeAll(async () => {
  await loadExerciseGenerator();
});

/** Each typed line, and the call it is. */
export const RECIPE_LINES: ReadonlyArray<[string, ToolArgs]> = [
  ["a minor pentatonic eighths 5th fret", { root: "A", scale: "minorPentatonic", subdivision: 2, position: 5 }],
  ["make me an a minor pentatonic exercise", { root: "A", scale: "minorPentatonic" }],
  ["make a minor pentatonic exercise", { root: "A", scale: "minorPentatonic" }],
  ["make c major three notes per string at the 8th fret", { root: "C", scale: "major", shape: "threePerString", position: 8 }],
  ["e blues box at fret 12 in sixteenths", { root: "E", scale: "blues", shape: "box", position: 12, subdivision: 4 }],
  ["make a minor 7 arpeggio", { root: "A", chord: "m7", shape: "arpeggio" }],
  ["make me a g major arpeggio 2 bars", { root: "G", chord: "maj", shape: "arpeggio", bars: 2 }],
  ["chromatic exercise at the 1st fret", { shape: "chromatic", position: 1 }],
  ["d dorian on one string quarter notes", { root: "D", scale: "dorian", shape: "oneString", subdivision: 1 }],
  ["f sharp minor pentatonic triplets fret 2", { root: "F#", scale: "minorPentatonic", subdivision: 3, position: 2 }],
  ["build a b flat major pentatonic exercise", { root: "Bb", scale: "majorPentatonic" }],
  // The article before a root that follows; "in a" is the key.
  ["make a c major exercise", { root: "C", scale: "major" }],
  ["make an exercise in a minor pentatonic", { root: "A", scale: "minorPentatonic" }],
  ["a minor pentatonic box in eighths", { root: "A", scale: "minorPentatonic", shape: "box", subdivision: 2 }],
];

/** Whether a typed line ends in a `make_exercise` proposal (one press from the store). */
function proposes(text: string, f = today): boolean {
  const r = route(text, f);
  if (r.kind !== "call" || r.call.tool !== "make_exercise") return false;
  const out = runCoachTool(r.call, fakeHost(), toolCtx());
  return out.ok && "proposal" in out;
}

describe("typed recipes, English", () => {
  it("the English table's recipe words are valid", () => {
    expect(validateCommandTable(EN)).toEqual([]);
  });

  it.each(RECIPE_LINES)("%s", (text, args) => {
    const r = route(text);
    expect(r, JSON.stringify(r)).toEqual({ kind: "call", call: { tool: "make_exercise", args } });
  });

  it("every line reaches the tool, which proposes or says why in a sentence; nothing is stored", () => {
    for (const [text] of RECIPE_LINES) {
      const r = route(text);
      if (r.kind !== "call") throw new Error(text);
      const host = fakeHost();
      const out = runCoachTool(r.call, host, toolCtx());
      if (out.ok) expect("proposal" in out, text).toBe(true);
      else expect(out.line.key, text).toMatch(/^coachTools\.why\.make\./);
      expect(host.changes()).toEqual([]);
    }
  });

  it("mock 17's line proposes mock 17", () => {
    const r = route("a minor pentatonic eighths 5th fret");
    if (r.kind !== "call") throw new Error("no call");
    const out = runCoachTool(r.call, fakeHost(), toolCtx());
    expect(out.ok && "proposal" in out && out.proposal.preview?.summary).toMatchObject({ shape: "box", position: 5, bars: 3, startBpm: 60 });
  });
});

describe("near-misses: never a recipe", () => {
  const NONE = [
    "what is a minor pentatonic?",
    "what is a minor pentatonic",
    "a minor pentatonic",
    "a minor pentatonic scale",
    "the a minor pentatonic",
    "how do I play a minor pentatonic at the 5th fret",
    "i want a minor pentatonic exercise",
    "a minor pentatonic exercise later",
    "is the 5th fret a minor pentatonic",
    "a minor pentatonic 17th fret",
    "a minor pentatonic 9 bars",
    "a minor pentatonic eighths descending",
    "eighths",
    "5th fret",
    // Review t2c, finding 1: a shape or a fret word alone is not an exercise's word; nor is
    // "shape" / "pattern" a shape; nor "position 2" a fret (a guitarist means box 2).
    "a blues box",
    "a minor pentatonic box",
    "a minor pentatonic shape",
    "a minor pentatonic pattern",
    "a minor pentatonic box shape",
    "a minor pentatonic at the 5th fret",
    "a minor pentatonic box at the 5th fret",
    "a minor arpeggio",
    "c major 7 arpeggio",
    "chromatic",
    "spider",
    "a minor pentatonic position 2",
    "make a minor pentatonic position 2",
  ];
  it.each(NONE)("%s", (text) => {
    const r = route(text);
    expect(r.kind === "call" && r.call.tool === "make_exercise", JSON.stringify(r)).toBe(false);
    expect(proposes(text), text).toBe(false);
  });

  // The article "a" is not the root A when no other root follows: the key was never said, and
  // the tool asks for it in a sentence. Never an A blues proposal.
  const KEYLESS: ReadonlyArray<[string, ToolArgs]> = [
    ["make a blues exercise", { scale: "blues" }],
    ["make a pentatonic exercise", { scale: "minorPentatonic" }],
    ["make a major scale exercise", { scale: "major" }],
    ["make a minor arpeggio", { chord: "min", shape: "arpeggio" }],
    ["make me a blues box", { scale: "blues", shape: "box" }],
    ["a blues exercise", { scale: "blues" }],
  ];
  it.each(KEYLESS)("%s: no key, so the tool asks which", (text, args) => {
    const r = route(text);
    expect(r, JSON.stringify(r)).toEqual({ kind: "call", call: { tool: "make_exercise", args } });
    if (r.kind !== "call") return;
    const host = fakeHost();
    const out = runCoachTool(r.call, host, toolCtx());
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.line.key).toBe("coachTools.why.make.root");
    expect(host.changes()).toEqual([]);
  });

  it("what a player types to SEE a scale reaches show_scale or nothing, never a recipe", () => {
    const SEE = [
      "a minor pentatonic at the 5th fret",
      "a minor pentatonic box",
      "a minor pentatonic shape",
      "show me a minor pentatonic at the 5th fret",
      "show me a minor pentatonic box",
      "show me a minor pentatonic shape",
      "show me the a minor pentatonic shape",
      "show me a minor pentatonic",
    ];
    for (const text of SEE) {
      const r = route(text);
      expect(r.kind === "none" || (r.kind === "call" && r.call.tool === "show_scale"), `${text}: ${JSON.stringify(r)}`).toBe(true);
    }
    // "pentatonic" alone is the minor one, as `show_scale` reads it from the same scale table.
    expect(route("show me c pentatonic")).toEqual({ kind: "call", call: { tool: "show_scale", args: { root: "C", scale: "minorPentatonic" } } });
    expect(route("make c pentatonic exercise")).toEqual({ kind: "call", call: { tool: "make_exercise", args: { root: "C", scale: "minorPentatonic" } } });
  });

  it("a never-list word is still `yours`", () => {
    for (const text of ["record a minor pentatonic eighths 5th fret", "delete my a minor pentatonic exercise", "a minor pentatonic eighths grading"]) {
      expect(route(text).kind, text).toBe("yours");
    }
  });

  it("show still shows the scale; a recipe on a Session's screen still only proposes", () => {
    expect(route("show me a minor pentatonic")).toEqual({ kind: "call", call: { tool: "show_scale", args: { root: "A", scale: "minorPentatonic" } } });
    const ready = commandFacts(toolCtx({ screen: "session", run: runIn("ready") }), "session");
    const r = route("a minor pentatonic eighths 5th fret", ready);
    expect(r.kind).toBe("call");
    if (r.kind === "call") {
      const host = fakeHost({ session: true });
      const out = runCoachTool(r.call, host, toolCtx({ screen: "session", run: runIn("ready") }));
      expect(out.ok && "proposal" in out).toBe(true);
      expect(host.changes()).toEqual([]);
    }
    const take = commandFacts(toolCtx({ screen: "session", run: runIn("playing") }), "session");
    expect(route("a minor pentatonic eighths 5th fret", take).kind).toBe("none");
  });
});
