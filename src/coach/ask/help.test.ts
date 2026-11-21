/**
 * The help set (leg c2cb): every screen and every Session phase has an entry,
 * every entry has its words in English, `explain_screen` answers with the
 * screen's entry, and typed English reaches exactly the entry it names.
 */
import { describe, expect, it } from "vitest";
import en from "../../locales/en/help.json";
import type { CoachScreen } from "../context";
import type { RunPhase } from "../../session/runner";
import { fakeHost, toolCtx } from "../tools/fakeHost";
import { runCoachTool } from "../tools/run";
import { HELP, helpForScreen, helpKey, type HelpId } from "./help";
import { asksAboutTuning, matchHelp } from "./helpMatch";

function words(key: string): unknown {
  let at: unknown = en;
  for (const part of key.split(".")) at = (at as Record<string, unknown> | undefined)?.[part];
  return at;
}

const SCREENS: Record<CoachScreen, HelpId | null> = {
  today: "screen.today",
  paths: "screen.paths",
  path: "screen.path",
  step: "screen.step",
  session: null,
  progress: "screen.progress",
  jam: "screen.jam",
  songs: "screen.songs",
  beat: "screen.metronome",
  drill: "screen.drill",
  setlist: "screen.setlist",
  tools: "screen.tools",
};

const PHASES: Record<RunPhase, HelpId> = {
  idle: "screen.sessionReady",
  ready: "screen.sessionReady",
  looping: "screen.sessionReady",
  playing: "screen.sessionTake",
  listening: "screen.sessionTake",
  result: "screen.sessionResult",
  timedReady: "screen.sessionTimed",
  timed: "screen.sessionTimed",
  recap: "screen.sessionRecap",
};

describe("the help set", () => {
  it("has about forty entries, each with English words of at most three sentences, never 'the bar' and nothing about tuning", () => {
    expect(HELP.length).toBeGreaterThanOrEqual(36);
    expect(new Set(HELP.map((e) => e.id)).size).toBe(HELP.length);
    for (const e of HELP) {
      const text = words(helpKey(e.id));
      expect(typeof text, e.id).toBe("string");
      const s = text as string;
      expect(s.split(/(?<=[.!?])\s+(?=[A-Z"“])/).length, e.id).toBeLessThanOrEqual(3);
      expect(s, e.id).not.toMatch(/\bthe bar\b(?! by bar)/i);
      expect(s, e.id).not.toMatch(/\btun(e|ing|er)\b/i);
    }
  });

  it("names no entry in en/help.json that the table lacks", () => {
    const listed = new Set(HELP.map((e) => helpKey(e.id)));
    const entry = (en as { help: { entry: Record<string, Record<string, string>> } }).help.entry;
    for (const [kind, group] of Object.entries(entry)) {
      for (const id of Object.keys(group)) expect(listed.has(`help.entry.${kind}.${id}`), `${kind}.${id}`).toBe(true);
    }
  });
});

describe("explain_screen", () => {
  for (const [screen, id] of Object.entries(SCREENS) as Array<[CoachScreen, HelpId | null]>) {
    if (id === null) continue;
    it(`on ${screen} answers with ${id}`, () => {
      expect(helpForScreen({ screen })).toBe(id);
      const out = runCoachTool({ tool: "explain_screen", args: {} }, fakeHost(), toolCtx({ screen }));
      expect(out).toMatchObject({ ok: true, receipt: { key: helpKey(id) } });
      expect(typeof words(helpKey(id))).toBe("string");
    });
  }

  for (const [phase, id] of Object.entries(PHASES) as Array<[RunPhase, HelpId]>) {
    it(`in a Session, ${phase}, has ${id}`, () => {
      expect(helpForScreen({ screen: "session", run: { phase } as never })).toBe(id);
      expect(typeof words(helpKey(id))).toBe("string");
    });
  }

  it("is refused during a Take (Ask is not there either)", () => {
    const ctx = toolCtx({ screen: "session" });
    const out = runCoachTool({ tool: "explain_screen", args: {} }, fakeHost(), { ...ctx, run: { ...(ctx.run ?? {}), phase: "playing" } as never });
    expect(out.ok).toBe(false);
  });
});

describe("matchHelp (typed English)", () => {
  const YES: Array<[string, HelpId]> = [
    ["What is a rung?", "word.rung"],
    ["what's a take", "word.take"],
    ["What does parked mean?", "word.parked"],
    ["what is a benchmark", "word.benchmark"],
    ["What does ungraded mean?", "word.grading"],
    ["what is the notebook", "word.notebook"],
    ["What are My exercises?", "word.myExercises"],
    ["what is a pass mark?", "word.passMark"],
    ["define clean tempo", "word.cleanTempo"],
    ["what does it mean when a take is marked not fair", "word.notFair"],
    ["What is Listen?", "word.listen"],
    ["what are tool runs", "word.toolRuns"],
    ["rung?", "word.rung"],
    ["What is the metronome for?", "screen.metronome"],
    ["how does the drill work", "screen.drill"],
    ["what does the setlist screen do", "screen.setlist"],
    ["What is Today?", "screen.today"],
    ["what is the step page for", "screen.step"],
    ["what is the result screen", "screen.sessionResult"],
    ["what does the model selector do?", "screen.modelSelector"],
    ["how do I use jam", "screen.jam"],
    ["what can I do on progress", "screen.progress"],
  ];
  for (const [text, id] of YES) it(`"${text}" is ${id}`, () => expect(matchHelp(text)).toBe(id));

  const NO = [
    "rung",
    "how do I play a pull-off",
    "where did it slip?",
    "should I anchor my pinky",
    "what is a pentatonic scale",
    "what is the session",
    "what is a step for the blues path",
    "open the metronome",
    "slower",
    "why didn't that take count",
    "what tempo should I play the drill at",
    "my hand gets tired after the metronome",
  ];
  for (const text of NO) it(`"${text}" is not a help question`, () => expect(matchHelp(text)).toBeNull());
});

describe("asksAboutTuning", () => {
  const YES = [
    "is my guitar in tune?",
    "how do I tune",
    "How do I tune my guitar?",
    "my G string sounds flat",
    "can you check my tuning",
    "is there a tuner",
    "should I play in drop D",
    "my guitar is out of tune",
  ];
  for (const text of YES) it(`"${text}" is about tuning`, () => expect(asksAboutTuning(text)).toBe(true));
  const NO = ["what tune is this", "Tunes on one string", "where did it slip?", "what is a rung?", "play a tune for me", "open paths"];
  for (const text of NO) it(`"${text}" is not about tuning`, () => expect(asksAboutTuning(text)).toBe(false));
});
