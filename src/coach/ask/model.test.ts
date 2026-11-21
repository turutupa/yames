/**
 * The model's choice for Ask (leg c3b2a): the switch, the budgets, the speed
 * gate's clauses, and what every outcome means, against the typed mock of
 * `coach_ask` (`src/test/mocks.ts`: it can only answer what Rust can).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CoachAskOutcome } from "../../ipc";
import { mockInvoke, setInvokeResponse } from "../../test/mocks";
import { estimateTokens } from "../context";
import {
  ASK_CHOICE_OUTPUT_TOKENS,
  ASK_CONTEXT_TOKENS,
  ASK_DEADLINE_MS,
  ASK_EXCHANGE_TOKENS,
  ASK_PREFIX_TOKENS,
  MODEL_LANGS,
  __resetModelForTests,
  askChoicePrefix,
  askModelChoice,
  asksUseModel,
  choiceMedianMs,
  choiceRequest,
  exchangeLine,
  fitContext,
  modelLangOn,
  noteChoiceTime,
  readChoice,
  type GateCaps,
} from "./model";
import type { ChoiceFacts } from "./choicePrompt";

beforeEach(() => __resetModelForTests());
afterEach(() => __resetModelForTests());

const FACTS: ChoiceFacts = { screen: "beat", session: "none", grading: "on", tempo: 90, possible: ["set_tempo", "go_to", "show_scale"] };
const ON = { standard: ["en", "de"], full: ["en"] } as const;

describe("the switch", () => {
  it("ships dark: both tiers empty", () => {
    expect(MODEL_LANGS.standard).toEqual([]);
    expect(MODEL_LANGS.full).toEqual([]);
    for (const lang of ["en", "de", "es", "ja", "pt-BR", "zh-CN"]) {
      expect(modelLangOn("standard", lang)).toBe(false);
      expect(modelLangOn("full", lang)).toBe(false);
    }
  });

  it("a language is on per tier, by its code or its base language; Off is never on", () => {
    expect(modelLangOn("standard", "de", ON)).toBe(true);
    expect(modelLangOn("full", "de", ON)).toBe(false);
    expect(modelLangOn("full", "en-GB", ON)).toBe(true);
    expect(modelLangOn("off", "en", ON)).toBe(false);
  });
});

describe("the budgets (DESIGN 5.5)", () => {
  it("prefix within 900, byte-identical turn to turn; output 48; deadline 8 s", () => {
    const a = choiceRequest("slower please", FACTS, 1);
    const b = choiceRequest("what is a clean tempo", { ...FACTS, screen: "today" }, 2, "slower please");
    expect(a.prefix).toBe(b.prefix);
    expect(a.prefix).toBe(askChoicePrefix());
    expect(estimateTokens(a.prefix)).toBeLessThanOrEqual(ASK_PREFIX_TOKENS);
    expect(ASK_CHOICE_OUTPUT_TOKENS).toBe(48);
    expect(a).toMatchObject({ mode: "choice", deadlineMs: ASK_DEADLINE_MS, generationId: 1, question: "slower please" });
    expect(a.grammar).toContain("root ::=");
  });

  it("the grammar is narrowed to the tools that can run here", () => {
    const req = choiceRequest("x", FACTS, 1);
    expect(req.grammar).toContain("set_tempo");
    expect(req.grammar).not.toContain("start_today");
  });

  it("the last exchange is at most 150 tokens, cut at a word", () => {
    const long = Array.from({ length: 400 }, (_, i) => `word${i}`).join(" ");
    const line = exchangeLine(long)!;
    expect(estimateTokens(line)).toBeLessThanOrEqual(ASK_EXCHANGE_TOKENS);
    expect(line.endsWith("…")).toBe(true);
    expect(exchangeLine("  ")).toBeNull();
    expect(exchangeLine("set 80")).toBe("Before: set 80");
  });

  it("a context that would pass 450 is cut by rule, oldest first: the last exchange goes, then facts from the end", () => {
    const previous = Array.from({ length: 60 }, (_, i) => `w${i}`).join(" ");
    let dropped = 0;
    for (let n = 0; n <= 120; n++) {
      const facts: ChoiceFacts = { ...FACTS, presets: Array.from({ length: n }, (_, i) => `Preset number ${i}`) };
      const text = fitContext(facts, previous);
      expect(estimateTokens(text)).toBeLessThanOrEqual(ASK_CONTEXT_TOKENS);
      expect(text.startsWith("Screen: beat")).toBe(true);
      if (!text.includes("Before:")) {
        dropped += 1;
        // The exchange went first; the facts about now are all still there.
        expect(text).toBe(fitContext(facts, null));
      }
    }
    expect(dropped).toBeGreaterThan(0);
    const small = fitContext(FACTS, "set the tempo to eighty");
    expect(small).toContain("Before: set the tempo to eighty");
    expect(estimateTokens(small)).toBeLessThanOrEqual(ASK_CONTEXT_TOKENS);
  });
});

describe("asksUseModel: the speed gate, one clause at a time", () => {
  const GPU: GateCaps = { modelResident: true, backend: "vulkan" };
  const CPU: GateCaps = { modelResident: true, backend: "cpu" };
  const rows: Array<[string, GateCaps | null, "off" | "standard" | "full", string, boolean, number | null, boolean]> = [
    ["all clauses hold (GPU, nothing measured yet)", GPU, "standard", "en", false, null, true],
    ["no model resident", { ...GPU, modelResident: false }, "standard", "en", false, null, false],
    ["no capabilities read", null, "standard", "en", false, null, false],
    ["a build without a backend", { modelResident: true, backend: "none" }, "standard", "en", false, null, false],
    ["the tier is Off", GPU, "off", "en", false, null, false],
    ["the language is off for this tier", GPU, "full", "de", false, null, false],
    ["the language is off for every tier", GPU, "standard", "ja", false, null, false],
    ["measured median within 8 s", GPU, "standard", "en", false, 7_900, true],
    ["measured median over 8 s", GPU, "standard", "en", false, 8_100, false],
    ["CPU before any measurement: no", CPU, "standard", "en", false, null, false],
    ["CPU measured fast, nothing sounding", CPU, "standard", "en", false, 3_000, true],
    ["CPU measured fast, something sounding", CPU, "standard", "en", true, 3_000, false],
    ["GPU, something sounding", GPU, "standard", "en", true, 3_000, true],
  ];
  for (const [name, caps, tier, lang, sounding, medianMs, want] of rows) {
    it(name, () => {
      expect(asksUseModel(caps, tier, lang, sounding, { medianMs, langs: ON })).toBe(want);
    });
  }

  it("with the shipped switch it is false whatever else holds", () => {
    expect(asksUseModel(GPU, "standard", "en", false, { medianMs: 500 })).toBe(false);
    expect(asksUseModel(GPU, "full", "en", false, { medianMs: 500 })).toBe(false);
  });

  it("the median is this run's measured turns", () => {
    expect(choiceMedianMs()).toBeNull();
    noteChoiceTime(1_000);
    noteChoiceTime(9_000);
    noteChoiceTime(2_000);
    expect(choiceMedianMs()).toBe(2_000);
  });
});

describe("what an outcome means", () => {
  const timings = { prefixCached: true, promptMs: 10, totalMs: 600 };
  it("answered with a call, a card, or an answer", () => {
    expect(readChoice({ status: "answered", text: '{"tool":"set_tempo","args":{"bpm":80}}', ...timings })).toEqual({ kind: "call", call: { tool: "set_tempo", args: { bpm: 80 } } });
    expect(readChoice({ status: "answered", text: '{"card":"lean","args":{"take":"last"}}', ...timings })).toEqual({ kind: "card", card: "lean", args: { take: "last" } });
    expect(readChoice({ status: "answered", text: '{"answer":"none"}', ...timings })).toEqual({ kind: "none" });
    expect(readChoice({ status: "answered", text: '{"answer":"which"}', ...timings })).toEqual({ kind: "none" });
    expect(readChoice({ status: "answered", text: '{"answer":"yours"}', ...timings })).toEqual({ kind: "none" });
  });

  it("a malformed object is none", () => {
    expect(readChoice({ status: "answered", text: '{"tool":"set_tempo","args":', ...timings })).toEqual({ kind: "none" });
    expect(readChoice({ status: "answered", text: '{"tool":"set_tempo","args":[1]}', ...timings })).toEqual({ kind: "none" });
    expect(readChoice({ status: "answered", text: "slower", ...timings })).toEqual({ kind: "none" });
  });

  const statuses: CoachAskOutcome[] = [
    { status: "truncated", text: '{"tool":"set_tempo","args":{"bpm":80}}', by: "budget", ...timings },
    { status: "truncated", text: '{"tool":"go_to"', by: "whitespace", ...timings },
    { status: "deadEnd", why: "no token the grammar allows" },
    { status: "cancelled" },
    { status: "timedOut" },
    { status: "noModel" },
  ];
  for (const outcome of statuses) {
    it(`${outcome.status}${"by" in outcome ? ` (${outcome.by})` : ""} is none`, () => {
      expect(readChoice(outcome)).toEqual({ kind: "none" });
    });
  }
});

describe("askModelChoice, against the typed mock", () => {
  it("sends one choice request and reads the answer; an answered turn is timed", async () => {
    setInvokeResponse("coach_ask", (): CoachAskOutcome => ({ status: "answered", text: '{"tool":"show_scale","args":{"root":"A","scale":"minorPentatonic"}}', prefixCached: false, promptMs: 300, totalMs: 900 }));
    const req = choiceRequest("show me A minor pentatonic", FACTS, 42);
    const got = await askModelChoice(req);
    expect(got).toEqual({ status: "answered", choice: { kind: "call", call: { tool: "show_scale", args: { root: "A", scale: "minorPentatonic" } } } });
    const sent = mockInvoke.mock.calls.filter(([cmd]) => cmd === "coach_ask");
    expect(sent).toHaveLength(1);
    expect((sent[0][1] as { request: { mode: string; generationId: number } }).request).toMatchObject({ mode: "choice", generationId: 42, deadlineMs: ASK_DEADLINE_MS });
    expect(choiceMedianMs()).toBe(900);
  });

  it("a timed-out turn counts as over the deadline for the gate", async () => {
    setInvokeResponse("coach_ask", (): CoachAskOutcome => ({ status: "timedOut" }));
    expect((await askModelChoice(choiceRequest("x", FACTS, 1))).choice).toEqual({ kind: "none" });
    expect(choiceMedianMs()).toBeGreaterThan(ASK_DEADLINE_MS);
  });

  it("a grammar: rejection is none, logged once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setInvokeResponse("coach_ask", () => {
      throw new Error("grammar: rule root is malformed");
    });
    for (let i = 0; i < 3; i++) {
      expect(await askModelChoice(choiceRequest("x", FACTS, i))).toEqual({ choice: { kind: "none" }, status: "rejected" });
    }
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
