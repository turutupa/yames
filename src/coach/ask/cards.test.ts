/**
 * The fact cards (leg c2b1a): a table test per card over fixture Takes, the
 * source the app attaches, and "a text block without a source is not drawn".
 */
import { describe, expect, it } from "vitest";
import enAsk from "../../locales/en/ask.json";
import enSession from "../../locales/en/session.json";
import { bannedClaimsIn } from "../../paths/honesty";
import type { Line } from "../tools/types";
import { takeLean } from "../rounds";
import { biasThresholdMs } from "../takeNote";
import type { TakeFacts } from "../../session/progress";
import { NOW, take as row } from "../../session/testKit";
import { askCardBlocks, cardAnswer, earlyOrLate, isCard, whereSlipped, whyNotCounted, type FactCard, type NoCard } from "./cards";
import { BPM, finding, fixture, said, TUNE } from "./cardFixtures";

/** English, as i18next would say it (no plurals needed by these keys' `count` use: the bare key is the singular). */
function english(l: Line): string {
  const tree = { ...enAsk, ...enSession } as unknown as Record<string, unknown>;
  const parts = l.key.split(".");
  const leaf = parts.pop()!;
  let parent: unknown = tree;
  for (const p of parts) parent = (parent as Record<string, unknown> | undefined)?.[p];
  const at = parent as Record<string, unknown>;
  // A plural key: the bare key is the singular, `_other` beside it the rest.
  const count = l.values.count;
  let node = count !== undefined && count !== 1 && typeof at[`${leaf}_other`] === "string" ? at[`${leaf}_other`] : at[leaf];
  if (typeof node !== "string") node = at[`${leaf}_other`];
  if (typeof node !== "string") throw new Error(`no English for ${l.key}`);
  return node.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(l.values[name] ?? `{{${name}}}`));
}

function card(x: FactCard | NoCard): FactCard {
  if (!isCard(x)) throw new Error(`no card: ${said(x.line)}`);
  return x;
}

const text = (c: FactCard) => c.lines.map(english).join(" ");

describe("where did it slip", () => {
  const rows: Array<[string, Parameters<typeof fixture>[0], string[], string]> = [
    [
      "the tune's first bar on two rounds",
      { failOn: "timingEvenness", slipped: [0, 4] },
      ["session.note.place.slipped.bar"],
      "measured",
    ],
    [
      "a pass with one bar that caught it",
      { slipped: [8] },
      ["session.note.place.caught.bar"],
      "measured",
    ],
    ["a clean Take", {}, ["ask.card.slip.none"], "measured"],
    ["a Take not caught", { verdict: "notCaught", noCatchReason: "tooFewHeard" }, ["ask.card.count.notCaught.tooFewHeard"], "app"],
    ["a Take too short", { verdict: "tooShort" }, ["ask.card.tooShort"], "measured"],
  ];
  it.each(rows)("%s", (_name, shape, keys, source) => {
    const c = card(whereSlipped(fixture(shape).ctx));
    expect(c.lines.slice(0, keys.length).map((l) => l.key)).toEqual(keys);
    expect(c.source.kind).toBe(source);
    if (source === "measured") expect(c.source).toEqual({ kind: "measured", take: 2 });
  });

  it("says which way the notes there leaned, as the note does", () => {
    const c = card(whereSlipped(fixture({ failOn: "timingEvenness", slipped: [0, 4], deviation: (bar) => (bar % 4 === 0 ? 40 : 0) }).ctx));
    expect(c.lines.map((l) => l.key)).toContain("ask.card.direction.late");
    // Relative to the rest of the Take, as the lean is measured (c2b1d): never "landed late".
    expect(text(c)).toMatch(/^Bar 1 of the tune slipped on 2 of 3 rounds\. The notes there sat later than the rest of the Take\.$/);
  });

  it("below the pass mark with no bar slipped: says what decided it, not only that no bar slipped (F4)", () => {
    const c = card(whereSlipped(fixture({ failOn: "notesHeard" }).ctx));
    expect(c.lines[0].key).toBe("ask.card.slip.none");
    expect(c.lines).toHaveLength(2);
    expect(said(c.lines[1])).toMatch(/^ask\.card\.below\.heard\(take=2,heard=48,expected=60,bar=\d+\)$/);
  });

  it("below the pass mark with no bar-by-bar data: a lead line says so (c2b1d L3)", () => {
    const { ctx, outcome } = fixture({ failOn: "timingEvenness", slipped: [0, 4] });
    const noBars = { ...ctx, lastTake: { ...outcome, measures: { ...outcome.measures, perBar: undefined } } };
    const c = card(whereSlipped(noBars));
    expect(c.lines.map((l) => l.key)).toEqual(["ask.card.below.even", "ask.card.slip.noBars"]);
    expect(text(c)).toMatch(/^Take 2 was \d+% even, against a pass mark of \d+%\. I didn't measure Take 2 bar by bar/);
    // A pass with no bar-by-bar data: no below line.
    const passed = fixture({});
    const clean = { ...passed.ctx, lastTake: { ...passed.outcome, measures: { ...passed.outcome.measures, perBar: undefined } } };
    expect(card(whereSlipped(clean)).lines.map((l) => l.key)).toEqual(["ask.card.slip.noBars"]);
  });

  it("a Take stopped in its first bar: 'after 1 bar' (F9)", () => {
    const { ctx, outcome } = fixture({ verdict: "tooShort" });
    const one = { ...ctx, lastTake: { ...outcome, measures: { ...outcome.measures, barsPlayed: 1 } } };
    expect(text(card(whereSlipped(one)))).toBe("Take 2 stopped after 1 bar, too few to judge.");
    expect(text(card(whyNotCounted(one)))).toBe("Take 2 stopped after 1 bar, too short to judge, so it doesn't count either way.");
    expect(text(card(whereSlipped(fixture({ verdict: "tooShort" }).ctx)))).toBe("Take 2 stopped after 2 bars, too few to judge.");
  });

  it("reads the Take with the variant it was played on, not the step's now (F8)", () => {
    const f = fixture({ failOn: "timingEvenness", slipped: [0, 4] });
    const perBar = f.outcome.measures.perBar!.map(() => ({ due: 6, heard: 6, evenness: 0.95 }));
    const now = { ...row(TUNE.id, { bpm: BPM, startedAt: NOW, variantSeed: 7, facts: {} as TakeFacts }), id: "now" };
    const before = row(TUNE.id, { bpm: BPM, startedAt: NOW - 1000, variantSeed: 7, facts: { verdict: "belowBar", measures: { perBar } } as unknown as TakeFacts });
    // The player changed the variant on the ready screen after the Take: the step's seed is 3 now.
    const ctx = { ...f.ctx, variantSeed: 3, progress: { states: [], ceilings: [], takes: [now, before] } };
    const c = card(whereSlipped(ctx));
    // Compared with the Take before it, on the same notes (seed 7): it held there last time.
    expect(c.lines.map((l) => l.key)).toContain("session.note.place.lastTakeHeld");
  });

  it("a Take of another Exercise than the one on screen: no card, one line", () => {
    const { ctx } = fixture({ slipped: [0] });
    const out = whereSlipped({ ...ctx, lastTake: { ...ctx.lastTake!, exerciseId: "other" } });
    expect(isCard(out)).toBe(false);
    expect(said((out as NoCard).line)).toBe("ask.card.notNow.noTake");
  });
});

describe("early or late, with the premise answered first (mock 15)", () => {
  const late = (bar: number) => (bar % 4 === 0 ? 40 : 0);
  const early = (bar: number) => (bar % 4 === 1 ? -40 : 0);
  const rows: Array<[string, Parameters<typeof fixture>[0], "early" | "late" | null, string, boolean]> = [
    ["asked about rushing, the Take says late", { failOn: "timingEvenness", slipped: [0, 4], deviation: late }, "early", "ask.card.lean.premise.late", true],
    ["asked about dragging, the Take says early", { failOn: "timingEvenness", slipped: [1, 5], deviation: early }, "late", "ask.card.lean.premise.early", true],
    ["asked about dragging, the Take says late: no premise line", { failOn: "timingEvenness", slipped: [0, 4], deviation: late }, "late", "session.note.place.slipped.bar", false],
    ["asked about rushing, nothing leaned", { deviation: () => 0 }, "early", "ask.card.lean.premiseNone.early", true],
    ["no premise, nothing leaned", { deviation: () => 0 }, null, "ask.card.lean.none", false],
  ];
  it.each(rows)("%s", (_name, shape, premise, first, contradicted) => {
    const c = card(earlyOrLate(fixture(shape).ctx, premise));
    expect(c.lines[0].key).toBe(first);
    expect(c.premise === true).toBe(contradicted);
    expect(c.source).toEqual({ kind: "measured", take: 2 });
  });

  it("answers the premise relative to the rest of the Take, and says the whole Take's lean is not measured (F2)", () => {
    const c = card(earlyOrLate(fixture({ failOn: "timingEvenness", slipped: [0, 4], deviation: (bar) => (bar % 4 === 0 ? 40 : 0) }).ctx, "early"));
    // The place's own bar is said once, by the place (F7).
    expect(text(c)).toBe(
      "In Take 2 the bars that leaned sat later than the rest of it, not earlier. A lean the whole Take shares is something I don't measure. Bar 1 of the tune slipped on 2 of 3 rounds. The notes there sat later than the rest of the Take.",
    );
  });

  it("no correction when the bars that leaned disagree: the place late, another bar early (c2b1d H2)", () => {
    // Bar 3 of the tune slipped on round 1 only, its notes there +30 ms; bar 1 sat -25 ms on every round.
    const deviation = (bar: number) => (bar === 2 ? 30 : bar % 4 === 0 ? -25 : 0);
    const f = fixture({ failOn: "timingEvenness", slipped: [2], deviation });
    // The fixture really has both: bar 1 leans early past the threshold, and the place's notes late.
    expect(takeLean(f.review, 4)![0]!).toBeLessThanOrEqual(-biasThresholdMs(BPM));
    const c = card(earlyOrLate(f.ctx, "early"));
    expect(c.premise).toBeUndefined();
    const keys = c.lines.map((l) => l.key);
    expect(keys.filter((k) => k.startsWith("ask.card.lean.premise"))).toEqual([]);
    expect(keys).toContain("ask.card.direction.late");
    expect(c.lines.map(said)).toContain("ask.card.lean.bar.early(bar=1,ms=25)");
    // Asked the other way round, still no correction.
    expect(card(earlyOrLate(f.ctx, "late")).premise).toBeUndefined();
  });

  it("nothing leaned: says what was checked, on how many bars, relative to the rest (c2b1d M1)", () => {
    const c = card(earlyOrLate(fixture({ deviation: () => 0 }).ctx));
    expect(said(c.lines[0])).toBe("ask.card.lean.none(take=2,ms=16,measured=4,bars=4)");
    expect(text(c)).toBe("In Take 2, none of the bars I could measure (4 of 4) sat more than 16 ms earlier or later than the rest of it.");
    // Two bars never measured: they are not counted as "didn't lean".
    const some = card(earlyOrLate(fixture({ deviation: null, stored: { lean: [null, 3, null, -2] } }).ctx));
    expect(said(some.lines[0])).toBe("ask.card.lean.none(take=2,ms=16,measured=2,bars=4)");
  });

  it("asked about rushing, nothing leaned: says what was checked, as lean.none does (c2b1b)", () => {
    // Two of the four bars were never measured: "no bar" would cover them too.
    const c = card(earlyOrLate(fixture({ deviation: null, stored: { lean: [null, 3, null, -2] } }).ctx, "early"));
    expect(said(c.lines[0])).toBe("ask.card.lean.premiseNone.early(take=2,ms=16,measured=2,bars=4)");
    expect(text(c)).toMatch(/^In Take 2, none of the bars I could measure \(2 of 4\) sat more than 16 ms earlier than the rest of it\./);
  });

  it("a stored lean with no bar measured: not measured, never 'none leaned' (c2b1d M1)", () => {
    for (const premise of [null, "early", "late"] as const) {
      const c = card(earlyOrLate(fixture({ deviation: null, stored: { lean: [null, null, null, null] } }).ctx, premise));
      expect(c.lines.map((l) => l.key)).toEqual(["ask.card.lean.notMeasured"]);
      expect(c.uncertain).toBe(true);
    }
  });

  it("every premise line is relative to the Take and names what is not measured (F2)", () => {
    const keys = ["ask.card.lean.premise.early", "ask.card.lean.premise.late", "ask.card.lean.premiseNone.early", "ask.card.lean.premiseNone.late"];
    for (const key of keys) {
      const s = english({ key, values: { take: 2, ms: 16 } });
      expect(s, key).toMatch(/than the rest of it/);
      expect(s, key).toMatch(/A lean the whole Take shares is something I don't measure\./);
      // Never "your notes landed …" or "didn't lean …": a claim about the whole Take.
      expect(s, key).not.toMatch(/your notes|didn't lean/);
    }
  });

  it("names the other bars that leaned, by bar of the tune, in milliseconds", () => {
    const c = card(
      earlyOrLate(fixture({ failOn: "timingEvenness", slipped: [0, 4], deviation: (bar) => (bar % 4 === 0 ? 40 : bar % 4 === 2 ? -40 : 0) }).ctx),
    );
    expect(c.lines.map(said)).toContain("ask.card.lean.bar.early(bar=3,ms=40)");
  });

  it("the place's bars are not also said from every round, where the two could disagree (F7)", () => {
    // Bar 1 of the tune: late on the two rounds that slipped, far early on the one that held.
    const deviation = (bar: number) => (bar === 0 || bar === 4 ? 40 : bar === 8 ? -200 : 0);
    const f = fixture({ failOn: "timingEvenness", slipped: [0, 4], deviation });
    // The mean over every round says early: the contradiction this guards against is real.
    const lean = takeLean(f.review, 4)!;
    expect(lean[0]!).toBeLessThanOrEqual(-biasThresholdMs(BPM));
    const c = card(earlyOrLate(f.ctx));
    expect(c.lines.map((l) => l.key)).toContain("ask.card.direction.late");
    expect(c.lines.filter((l) => l.key.startsWith("ask.card.lean.bar.") && l.values.bar === 1)).toEqual([]);
  });

  it("reads the stored lean when the Take has no review to hand", () => {
    const c = card(earlyOrLate(fixture({ deviation: null, stored: { lean: [null, -25, 0, 2] } }).ctx));
    expect(c.lines.map(said)).toEqual(["ask.card.lean.bar.early(bar=2,ms=25)"]);
  });

  it("no timing note by note at all: I didn't measure that", () => {
    const c = card(earlyOrLate(fixture({ deviation: null }).ctx, "early"));
    expect(c.uncertain).toBe(true);
    expect(c.source.kind).toBe("app");
    expect(c.lines.map((l) => l.key)).toEqual(["ask.card.lean.notMeasured"]);
  });
});

describe("why didn't that count", () => {
  const rows: Array<[string, Parameters<typeof fixture>[0], string, string[], "measured" | "app"]> = [
    // c2b1d H1: one sentence per reason the scorer gives, and no hint after it (L2).
    ["a Take not caught: nothing heard", { verdict: "notCaught", noCatchReason: "nothingHeard", heard: 0 }, "take", ["ask.card.count.notCaught.nothingHeard"], "app"],
    ["a Take not caught: too few heard", { verdict: "notCaught", noCatchReason: "tooFewHeard" }, "take", ["ask.card.count.notCaught.tooFewHeard"], "app"],
    ["a Take not caught: more extras than hits", { verdict: "notCaught", noCatchReason: "tooManyExtras", heard: 52, extras: 70 }, "take", ["ask.card.count.notCaught.tooManyExtras"], "app"],
    ["a Take not caught: the detector unsure", { verdict: "notCaught", noCatchReason: "lowConfidence", heard: 60 }, "take", ["ask.card.count.notCaught.lowConfidence"], "app"],
    ["a Take not caught: no reason given", { verdict: "notCaught" }, "take", ["ask.card.count.notCaught.unknown"], "app"],
    ["a Take too short", { verdict: "tooShort" }, "take", ["ask.card.count.tooShort"], "measured"],
    ["the Take for the eyes", { ungraded: "eyes" }, "take", ["ask.card.count.ungraded.eyes"], "app"],
    ["a pass: it did count (the premise, first)", {}, "take", ["ask.card.count.passed"], "measured"],
    ["below the pass mark: it is kept, and what decided it", { failOn: "timingEvenness", slipped: [0, 4] }, "take", ["ask.card.count.below", "ask.card.below.even"], "measured"],
    ["below with notes missing too", { failOn: "notesHeard", slipped: [0, 4] }, "take", ["ask.card.count.below", "ask.card.below.heard"], "measured"],
    ["marked not fair", { failOn: "timingEvenness", slipped: [0, 4], stored: { fair: "no" } }, "take", ["ask.card.count.below", "ask.card.below.even", "ask.card.count.unfair"], "measured"],
    // F1: grading on, the grade said "ungraded": the Exercise or this tempo is the player's to check.
    ["an Exercise the player checks themselves, grading on", { exercise: { ...TUNE, grading: "selfChecked" } }, "take", ["ask.card.count.ungraded.selfChecked"], "app"],
    // c2b1d M2: a key per grading mode.
    ["a practice-only Exercise, grading on", { exercise: { ...TUNE, grading: "practiceOnly" } }, "take", ["ask.card.count.ungraded.practiceOnly"], "app"],
    ["an Exercise graded at its landings, grading on", { exercise: { ...TUNE, grading: "landings" } }, "take", ["ask.card.count.ungraded.landings"], "app"],
    [
      "a tempo the player checks themselves, grading on",
      { exercise: { ...TUNE, tempo: { ...TUNE.tempo, rungs: [...TUNE.tempo.rungs.filter((r) => r.bpm !== BPM), { bpm: BPM, grading: "selfChecked" }] } } },
      "take",
      ["ask.card.count.ungraded.selfCheckedTempo"],
      "app",
    ],
    // F3: a pass that held 5 bars in a row did not move the clean tempo: say so, and how far it got.
    // Its held stretch (from bar 1) has crossed bars inside it: the run's length is not said (c2b1d L1).
    ["a pass without a clean tempo", { slipped: [0, 1, 2, 3, 4] }, "take", ["ask.card.count.passed", "ask.card.count.notCleanPlain"], "measured"],
    ["pick direction: not graded", {}, "pickDirection", ["ask.card.notMeasured.pickDirection"], "app"],
    ["tone: not graded", {}, "tone", ["ask.card.notMeasured.tone"], "app"],
  ];
  it.each(rows)("%s", (_name, shape, what, keys, source) => {
    const c = card(whyNotCounted(fixture(shape).ctx, what as never));
    // The hint after "not caught" is whichever the measures chose: only its family is fixed.
    const got = c.lines.map((l) => (l.key.startsWith("session.noCatch.") ? "session.noCatch.*" : l.key));
    expect(got).toEqual(keys);
    expect(c.source.kind).toBe(source);
  });

  it("pitch: graded where the pass marks check the notes, 'I didn't measure that' where not", () => {
    const { ctx, exercise } = fixture({});
    const checksNotes = exercise.passBars.some((b) => b.metric === "noteIdentity") && !exercise.notGraded.includes("notesWritten");
    const c = card(whyNotCounted(ctx, "pitch"));
    expect(c.lines[0].key).toBe(checksNotes ? "ask.card.count.pitchGraded" : "ask.card.notMeasured.pitch");
    const timed = { ...exercise, passBars: exercise.passBars.filter((b) => b.metric !== "noteIdentity") };
    // No Take to read the pitches of (c2b1d: with one, the measured share is said; see below).
    const off = card(whyNotCounted({ ...ctx, exercise: timed, lastTake: undefined }, "pitch"));
    expect(off.lines.map((l) => l.key)).toEqual(["ask.card.notMeasured.pitch"]);
    expect(off.uncertain).toBe(true);
  });

  it("grading on and the Exercise self-checked: never 'grading is off' (F1)", () => {
    const { ctx } = fixture({ exercise: { ...TUNE, grading: "selfChecked" } });
    expect(ctx.grading).not.toBe("off");
    for (const c of [card(whyNotCounted(ctx)), card(whereSlipped(ctx)), card(earlyOrLate(ctx, "early"))]) {
      expect(text(c)).not.toMatch(/grading is off/);
      expect(text(c)).toBe("I didn't measure Take 2: this Exercise is one you check yourself, so nothing was graded.");
    }
  });

  it("the answer for one fixture Take, in English", () => {
    const c = card(whyNotCounted(fixture({ verdict: "notCaught", noCatchReason: "tooFewHeard" }).ctx));
    expect(text(c)).toBe("I couldn't grade Take 2: I heard 9 of 60 notes, too few to grade, so it doesn't count against you.");
  });

  it("a Take not caught says 'too few' only when too few were heard, and nothing after the reason (c2b1d H1)", () => {
    const tv = card(whyNotCounted(fixture({ verdict: "notCaught", noCatchReason: "tooManyExtras", heard: 52, extras: 70 }).ctx));
    expect(text(tv)).toBe("I couldn't grade Take 2: I heard more notes that weren't written than ones that were, so it doesn't count against you.");
    const unsure = card(whyNotCounted(fixture({ verdict: "notCaught", noCatchReason: "lowConfidence", heard: 60 }).ctx));
    expect(text(unsure)).not.toMatch(/too few/);
    const unknown = card(whyNotCounted(fixture({ verdict: "notCaught" }).ctx));
    expect(text(unknown)).toBe("I couldn't grade Take 2.");
    // The same on the other two cards: the reason, and nothing after it.
    for (const c of [card(whereSlipped(fixture({ verdict: "notCaught", noCatchReason: "tooManyExtras", heard: 52, extras: 70 }).ctx)), card(earlyOrLate(fixture({ verdict: "notCaught", noCatchReason: "tooManyExtras" }).ctx, "early"))]) {
      expect(c.lines.map((l) => l.key)).toEqual(["ask.card.count.notCaught.tooManyExtras"]);
    }
  });

  it("a Take below the pass mark is kept, never 'did count' (F11)", () => {
    const c = card(whyNotCounted(fixture({ failOn: "timingEvenness", slipped: [0, 4] }).ctx));
    expect(english(c.lines[0])).toBe("Take 2 is kept, below the pass mark at 90 BPM.");
    expect(text(c)).not.toMatch(/did count|watch the frets|idle strings|Same notes, same tempo/);
  });

  it("practice only: never 'one you check yourself' (c2b1d M2)", () => {
    const c = card(whyNotCounted(fixture({ exercise: { ...TUNE, grading: "practiceOnly" } }).ctx));
    expect(text(c)).toBe("I didn't measure Take 2: this Exercise is practice only, not graded.");
  });

  it("the longest run is named only when no bar inside it is crossed on the strip (c2b1d L1)", () => {
    // A pass whose held stretch (8 bars from bar 1, pooled over windows) has a crossed bar inside it.
    const f = fixture({ slipped: [3] });
    const pass = { ...f.outcome.measures.pass!, heldBars: 6, heldFromBar: 0 };
    const crossed = { ...f.ctx, lastTake: { ...f.outcome, grade: { ...f.outcome.grade, cleanBpm: null }, measures: { ...f.outcome.measures, pass } } };
    const c = card(whyNotCounted(crossed));
    expect(c.lines.map((l) => l.key)).toEqual(["ask.card.count.passed", "ask.card.count.notCleanPlain"]);
    // The same run with no crossed bar inside it: the number is said.
    const g = fixture({ slipped: [7] });
    const clean = { ...g.ctx, lastTake: { ...g.outcome, grade: { ...g.outcome.grade, cleanBpm: null }, measures: { ...g.outcome.measures, pass: { ...g.outcome.measures.pass!, heldBars: 6, heldFromBar: 0 } } } };
    expect(card(whyNotCounted(clean)).lines.map(said)).toContain("ask.card.count.notClean(take=2,held=6,need=8)");
  });

  it("pitch reported but not graded: says so, with the measured share, never 'I didn't measure that' (c2b1d)", () => {
    const { ctx, exercise } = fixture({});
    const timed = { ...exercise, passBars: exercise.passBars.filter((b) => b.metric !== "noteIdentity") };
    const c = card(whyNotCounted({ ...ctx, exercise: timed }, "pitch"));
    expect(c.lines.map((l) => l.key)).toEqual(["ask.card.count.pitchNotGraded", "ask.card.count.rightNotes"]);
    expect(c.source).toEqual({ kind: "measured", take: 2 });
  });
});

describe("the app attaches the source; a text block without one is not drawn", () => {
  it("every block of a card carries the card's source", () => {
    const c = card(whereSlipped(fixture({ failOn: "timingEvenness", slipped: [0, 4] }).ctx));
    const blocks = cardAnswer(c, english);
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) expect(b.source).toEqual({ kind: "measured", take: 2 });
  });

  it("Ask drops a text block that came out without a source, and keeps the rest", () => {
    const blocks = [
      { type: "text" as const, text: "From a Take.", source: { kind: "measured" as const, take: 2 } },
      { type: "text" as const, text: "From nowhere." },
    ];
    expect(askCardBlocks(blocks).map((b) => (b.type === "text" ? b.text : b.type))).toEqual(["From a Take."]);
  });

  it("a long card is cut between sentences, never inside one, each block under the catalogue's 240", () => {
    const c: FactCard = {
      shape: "early_or_late",
      lines: Array.from({ length: 8 }, (_u, i) => ({ key: "ask.card.lean.bar.late", values: { bar: i + 1, ms: 30 } })),
      source: { kind: "measured", take: 4 },
    };
    const blocks = cardAnswer(c, english);
    expect(blocks.length).toBeGreaterThan(1);
    for (const b of blocks) {
      expect(b.type).toBe("text");
      if (b.type === "text") {
        expect(b.text.length).toBeLessThanOrEqual(240);
        expect(b.text.endsWith(".")).toBe(true);
      }
    }
  });
});

describe("the cards' English", () => {
  const strings: Array<[string, string]> = [];
  const walk = (node: unknown, prefix: string) => {
    if (typeof node === "string") strings.push([prefix, node]);
    else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) walk(v, `${prefix}.${k}`);
  };
  walk((enAsk as { ask: { card: unknown } }).ask.card, "ask.card");

  it("has strings to check", () => expect(strings.length).toBeGreaterThan(30));
  it.each(strings)("%s claims nothing the app cannot measure", (_k, s) => {
    expect(bannedClaimsIn(s, true).map((c) => c.name)).toEqual([]);
  });
  it.each(strings)("%s never calls the threshold \"the bar\"", (_k, s) => {
    expect(s).not.toMatch(/\bthe bar\b|\bpass bar\b|\bclears? the bar\b/i);
  });
  it.each(strings)("%s praises nothing and claims no cause", (_k, s) => {
    expect(s).not.toMatch(/\b(great|well done|nice|good job|awesome|excellent|perfect|amazing|because you|since you|due to your)\b/i);
  });
  it.each(strings)("%s says nothing about tuning", (_k, s) => {
    expect(s).not.toMatch(/\btuning\b|\bin tune\b|\bout of tune\b/i);
  });
});

it("fixture tempo is the one the cards report", () => {
  expect(card(whyNotCounted(fixture({}).ctx)).lines[0].values.bpm).toBe(BPM);
});

it("a stored Take's single notes: the review is gone, the card does not guess", () => {
  const c = card(whereSlipped(fixture({ failOn: "timingEvenness", slipped: [0, 4], deviation: null, findings: [finding("consistentMiss", [0, 0])] }).ctx));
  // The strip still says where; with no per-note timing, no direction is claimed.
  expect(c.lines.map((l) => l.key)).not.toContain("ask.card.direction.late");
});
