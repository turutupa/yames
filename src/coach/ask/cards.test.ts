/**
 * The fact cards (leg c2b1a): a table test per card over fixture Takes, the
 * source the app attaches, and "a text block without a source is not drawn".
 */
import { describe, expect, it } from "vitest";
import enAsk from "../../locales/en/ask.json";
import enSession from "../../locales/en/session.json";
import { bannedClaimsIn } from "../../paths/honesty";
import type { Line } from "../tools/types";
import { askCardBlocks, cardAnswer, earlyOrLate, isCard, whereSlipped, whyNotCounted, type FactCard, type NoCard } from "./cards";
import { BPM, finding, fixture, said } from "./cardFixtures";

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
    ["a Take not caught", { verdict: "notCaught" }, ["ask.card.count.notCaught"], "app"],
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
    expect(c.lines.map((l) => l.key)).toContain("session.note.direction.late");
    expect(text(c)).toMatch(/^Bar 1 of the tune slipped on 2 of 3 rounds\. The notes there landed late\.$/);
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

  it("names the bars that leaned, by bar of the tune, in milliseconds", () => {
    const c = card(earlyOrLate(fixture({ failOn: "timingEvenness", slipped: [0, 4], deviation: (bar) => (bar % 4 === 0 ? 40 : 0) }).ctx, "early"));
    expect(text(c)).toBe(
      "In Take 2 your notes landed late, not early. Bar 1 of the tune slipped on 2 of 3 rounds. The notes there landed late. Bar 1 of the tune: 40 ms later than the rest of the Take.",
    );
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
    ["a Take not caught", { verdict: "notCaught" }, "take", ["ask.card.count.notCaught", "session.noCatch.*"], "app"],
    ["a Take too short", { verdict: "tooShort" }, "take", ["ask.card.count.tooShort"], "measured"],
    ["the Take for the eyes", { ungraded: "eyes" }, "take", ["ask.card.count.ungraded.eyes"], "app"],
    ["a pass: it did count (the premise, first)", {}, "take", ["ask.card.count.passed"], "measured"],
    ["below the pass mark: it counted, and what decided it", { failOn: "timingEvenness", slipped: [0, 4] }, "take", ["ask.card.count.below", "session.coach.below.even"], "measured"],
    ["marked not fair", { failOn: "timingEvenness", slipped: [0, 4], stored: { fair: "no" } }, "take", ["ask.card.count.below", "session.coach.below.even", "ask.card.count.unfair"], "measured"],
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
    const off = card(whyNotCounted({ ...ctx, exercise: timed }, "pitch"));
    expect(off.lines.map((l) => l.key)).toEqual(["ask.card.notMeasured.pitch"]);
    expect(off.uncertain).toBe(true);
  });

  it("the answer for one fixture Take, in English", () => {
    const c = card(whyNotCounted(fixture({ verdict: "notCaught" }).ctx));
    expect(english(c.lines[0])).toBe("I didn't measure Take 2: I heard 9 of 60 notes, too few to grade, so it doesn't count against you.");
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
  expect(c.lines.map((l) => l.key)).not.toContain("session.note.direction.late");
});
