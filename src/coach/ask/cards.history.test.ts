/**
 * The four cards of leg c2b1b, a table test each over fixture Takes: what
 * changed since the last Take, am I improving, what the score is made of, how
 * far the pass mark is. Every sentence has a test with the Take for which it
 * would be false if the code picked it wrongly (the rule of c2b1d's table).
 */
import { describe, expect, it } from "vitest";
import enAsk from "../../locales/en/ask.json";
import type { PathTakeRow } from "../../ipc";
import type { Exercise } from "../../paths/format";
import type { TakeFacts } from "../../session/progress";
import { ALT, DAY, NOW, take as row } from "../../session/testKit";
import type { CoachContext } from "../context";
import type { Line } from "../tools/types";
import { improving, isCard, markedNotFair, passMarkDistance, scoreMadeOf, whatChanged, type FactCard, type NoCard } from "./cards";
import { BPM, fixture, said, TUNE } from "./cardFixtures";
import { CUSTOM_PATH_ID } from "../../paths/custom";
import { isMarkedNotFair } from "../../session/progress";
import { cardsHere, runFactCard } from "./intents";

/** English, as i18next would say it: the bare key is the singular, `_other` the rest. */
function english(l: Line): string {
  const tree = enAsk as unknown as Record<string, unknown>;
  const parts = l.key.split(".");
  const leaf = parts.pop()!;
  let parent: unknown = tree;
  for (const p of parts) parent = (parent as Record<string, unknown> | undefined)?.[p];
  const at = parent as Record<string, unknown>;
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

const keys = (c: FactCard) => c.lines.map((l) => l.key.replace(/^ask\.card\./, ""));
const text = (c: FactCard) => c.lines.map(english).join(" ");
const PATH = { id: ALT.id } as NonNullable<CoachContext["path"]>;

type Stored = {
  bpm?: number;
  verdict?: "passed" | "belowBar" | "notCaught" | "ungraded";
  /** Evenness, 0..1: the scorer's check and the headline. */
  even?: number;
  /** A headline on another metric instead of evenness. */
  headline?: { metric: string; value: number; min?: number; max?: number };
  fair?: "yes" | "no";
  /** The scorer's "counts for a clean tempo"; absent: no scorer pass kept at all. */
  counts?: boolean;
  newClean?: boolean;
  ago?: number;
  exerciseId?: string;
  pathId?: string;
  variantSeed?: number;
};

/** A stored Take of the tune, as `useSessionRun` keeps one. */
function stored(s: Stored): PathTakeRow {
  const verdict = s.verdict ?? "belowBar";
  const even = s.even ?? 0.8;
  const headline = s.headline ?? { metric: "timingEvenness", value: even, min: 0.85 };
  const facts: TakeFacts = {
    verdict: verdict === "notCaught" ? "notCaught" : verdict === "ungraded" ? "ungraded" : verdict,
    headlineMetric: headline.metric,
    headlineValue: headline.value,
    ...(headline.min === undefined ? {} : { headlineMin: headline.min }),
    ...(headline.max === undefined ? {} : { headlineMax: headline.max }),
    ...(s.fair ? { fair: s.fair } : {}),
    ...(s.newClean ? { newClean: true } : {}),
    ...(verdict === "ungraded" ? { ungraded: "chosen" as const } : {}),
    ...(s.counts === undefined
      ? {}
      : {
          measures: {
            pass: { countsForCleanTempo: s.counts, checks: [{ metric: "timingEvenness", overBars: 4, min: 0.85, measured: even, held: even >= 0.85 }] },
          } as unknown as TakeFacts["measures"],
        }),
  };
  return row(s.exerciseId ?? TUNE.id, {
    bpm: s.bpm ?? BPM,
    startedAt: NOW - (s.ago ?? 1) * DAY,
    caught: verdict !== "notCaught",
    passed: verdict === "passed",
    facts,
    ...(s.pathId ? { pathId: s.pathId } : {}),
    ...(s.variantSeed === undefined ? {} : { variantSeed: s.variantSeed }),
  });
}

/** The tune with two variants (the same notes here; what matters is which one a Take was on). */
const VARIED: Exercise = {
  ...TUNE,
  variation: {
    dimensions: ["position"],
    pooled: ["position"],
    notPooled: [],
    variants: ["a", "b"].map((id) => ({
      id,
      label: id,
      params: { position: id },
      tab: TUNE.tab,
      position: TUNE.position,
      crossing: TUNE.crossing,
      notes: TUNE.notes,
      rests: TUNE.rests,
      backing: TUNE.backing,
      computed: TUNE.computed,
    })),
  } as unknown as NonNullable<Exercise["variation"]>,
};

/** A fixture Take with these stored Takes before it (newest first), on the tune's Path. */
function withHistory(shape: Parameters<typeof fixture>[0], history: PathTakeRow[], over: Partial<CoachContext> = {}) {
  const f = fixture(shape, over);
  const ctx: CoachContext = { ...f.ctx, path: PATH, progress: { ...f.ctx.progress, takes: [...f.ctx.progress.takes, ...history] } };
  return { ...f, ctx };
}

// ---------------------------------------------------------------------------

describe("what changed since the last Take", () => {
  it("the first measured Take: nothing to compare, never a guess", () => {
    const c = card(whatChanged(withHistory({}, []).ctx));
    expect(keys(c)).toEqual(["changed.first"]);
    expect(c.source).toEqual({ kind: "app" });
    expect(text(c)).toBe("I have no measured Take of this Exercise before Take 2, so there is nothing to compare it with.");
  });

  it("79 → 90: the number each Take kept, the tempo of each, and the verdict of each", () => {
    // The current Take passes at 90 with 90% even; the one before was below at 85 BPM with 79%.
    const c = card(whatChanged(withHistory({}, [stored({ bpm: 85, even: 0.79 })]).ctx));
    expect(c.lines.map(said)).toEqual([
      "ask.card.changed.tempo(take=2,before=85,bpm=90)",
      "ask.card.changed.metric.even(take=2,before=79,now=90)",
      "ask.card.changed.verdict.nowPassed(take=2)",
    ]);
    expect(text(c)).toBe(
      "The last measured Take before Take 2 was at 85 BPM; Take 2 was at 90 BPM. Even: 79% in that Take, 90% in Take 2. That Take was below the pass mark; Take 2 met it.",
    );
    expect(c.source).toEqual({ kind: "measured", take: 2 });
  });

  it("the same tempo is said as one, never as a change", () => {
    const c = card(whatChanged(withHistory({}, [stored({ bpm: BPM, even: 0.8 })]).ctx));
    expect(said(c.lines[0])).toBe("ask.card.changed.sameTempo(take=2,bpm=90)");
  });

  it("compares with the last MEASURED Take: one not caught or played ungraded in between is passed over", () => {
    const history = [stored({ verdict: "notCaught", ago: 1 }), stored({ verdict: "ungraded", ago: 2 }), stored({ bpm: 80, even: 0.7, ago: 3 })];
    const c = card(whatChanged(withHistory({}, history).ctx));
    expect(c.lines.map(said)).toContain("ask.card.changed.metric.even(take=2,before=70,now=90)");
    expect(c.lines.map(said)[0]).toBe("ask.card.changed.tempo(take=2,before=80,bpm=90)");
  });

  it("a Take marked not fair is left out, and the card says it left one out", () => {
    // Without the rule the 99% Take would be the one compared with.
    const history = [stored({ even: 0.99, verdict: "passed", fair: "no", ago: 1 }), stored({ bpm: 80, even: 0.7, ago: 2 })];
    const c = card(whatChanged(withHistory({}, history).ctx));
    expect(c.lines.map(said)).toContain("ask.card.changed.metric.even(take=2,before=70,now=90)");
    expect(c.lines.map(said)).not.toContain("ask.card.changed.metric.even(take=2,before=99,now=90)");
    expect(english(c.lines[c.lines.length - 1])).toBe("I left out 1 Take you marked as not fair.");
  });

  it("only Takes marked not fair before it: says that, never 'no measured Take'", () => {
    const c = card(whatChanged(withHistory({}, [stored({ fair: "no" }), stored({ fair: "no", ago: 2 })]).ctx));
    expect(keys(c)).toEqual(["changed.onlyUnfair", "history.leftOut"]);
    expect(text(c)).toMatch(/I left out 2 Takes you marked as not fair\.$/);
    expect(text(c)).not.toMatch(/I have no measured Take/);
  });

  it("this Take marked not fair: not compared", () => {
    const c = card(whatChanged(withHistory({ stored: { fair: "no" } }, [stored({ bpm: 80 })]).ctx));
    expect(keys(c)).toEqual(["changed.thisUnfair"]);
  });

  it("the stored headline was on another metric: this Take's check on THAT metric is the pair", () => {
    // The Take before was below on notes heard (80%); this one heard every note (100%).
    const c = card(whatChanged(withHistory({}, [stored({ headline: { metric: "notesHeard", value: 0.8, min: 0.95 } })]).ctx));
    expect(c.lines.map(said)).toContain("ask.card.changed.metric.heard(take=2,before=80,now=100)");
  });

  it("a pass mark that changed since: no pair is set side by side", () => {
    const c = card(whatChanged(withHistory({}, [stored({ headline: { metric: "timingEvenness", value: 0.8, min: 0.7 } })]).ctx));
    expect(keys(c)).toContain("changed.noPair");
    expect(keys(c).some((k) => k.startsWith("changed.metric."))).toBe(false);
  });

  it("each verdict pair is said as it was", () => {
    const below = withHistory({ failOn: "timingEvenness", slipped: [0, 4] }, [stored({ verdict: "belowBar" })]).ctx;
    expect(keys(card(whatChanged(below)))).toContain("changed.verdict.bothBelow");
    const fell = withHistory({ failOn: "timingEvenness", slipped: [0, 4] }, [stored({ verdict: "passed", even: 0.9 })]).ctx;
    expect(keys(card(whatChanged(fell)))).toContain("changed.verdict.nowBelow");
    const held = withHistory({}, [stored({ verdict: "passed", even: 0.9 })]).ctx;
    expect(keys(card(whatChanged(held)))).toContain("changed.verdict.bothPassed");
  });

  it("another Exercise's Takes are never the one before", () => {
    const c = card(whatChanged(withHistory({}, [stored({ exerciseId: "other.exercise", bpm: 60 })]).ctx));
    expect(keys(c)).toEqual(["changed.first"]);
  });

  it("a Take of the player's own exercises is never the one before (int1)", () => {
    const c = card(whatChanged(withHistory({}, [stored({ pathId: CUSTOM_PATH_ID, bpm: 60, verdict: "passed" })]).ctx));
    expect(keys(c)).toEqual(["changed.first"]);
  });

  it("a Take on another variant is never the one before: passed over, and counted (int1b)", () => {
    // This Take is on variant b (seed 3 of two variants); the newest Take before it was on a.
    const history = [stored({ variantSeed: 0, bpm: 100, even: 0.82, ago: 1 }), stored({ variantSeed: 1, bpm: 80, even: 0.7, ago: 2 })];
    const c = card(whatChanged(withHistory({ exercise: VARIED }, history, { exercise: VARIED, variantSeed: 3 }).ctx));
    expect(c.lines.map(said)).toContain("ask.card.changed.metric.even(take=2,before=70,now=90)");
    expect(c.lines.map(said)[0]).toBe("ask.card.changed.tempo(take=2,before=80,bpm=90)");
    expect(text(c)).not.toMatch(/100|82%/);
    expect(english(c.lines[c.lines.length - 1])).toBe("I left out 1 Take played on another version of this Exercise.");
  });

  it("only Takes on other variants before it: says so, never 'no measured Take of this Exercise'", () => {
    const history = [stored({ variantSeed: 0, ago: 1 }), stored({ variantSeed: 0, ago: 2 })];
    const c = card(whatChanged(withHistory({ exercise: VARIED }, history, { exercise: VARIED, variantSeed: 1 }).ctx));
    expect(keys(c)).toEqual(["changed.noneAlike", "history.otherNotes"]);
    expect(text(c)).toBe(
      "I have no measured Take of this version of the Exercise before Take 2 that I can compare it with. I left out 2 Takes played on other versions of this Exercise.",
    );
  });

  it("no Path and the Take not stored yet: says it isn't saved, never 'no Take'", () => {
    const f = withHistory({}, [stored({})]);
    const ctx = { ...f.ctx, path: undefined };
    for (const out of [whatChanged(ctx), improving(ctx)]) {
      expect(isCard(out)).toBe(false);
      expect(said((out as NoCard).line)).toBe("ask.card.notNow.notSaved(take=2)");
    }
  });

  it("this Take not caught: its reason, nothing compared", () => {
    const c = card(whatChanged(withHistory({ verdict: "notCaught", noCatchReason: "nothingHeard", heard: 0 }, [stored({})]).ctx));
    expect(keys(c)).toEqual(["count.notCaught.nothingHeard"]);
  });
});

// ---------------------------------------------------------------------------

describe("am I improving", () => {
  it("fewer than three measured Takes: says how many, and that it takes three", () => {
    const c = card(improving(withHistory({}, [stored({}), stored({ ago: 2 })]).ctx));
    expect(c.lines.map(said)).toEqual(["ask.card.improving.tooFew(count=2,need=3)"]);
    expect(text(c)).toBe("I can compare 2 measured Takes of this Exercise, and it takes 3.");
    expect(c.source).toEqual({ kind: "app" });
  });

  it("a named window: the tempo of the oldest and newest, the clean tempos earned, the evenness", () => {
    const history = [
      stored({ bpm: 90, even: 0.9, verdict: "passed", counts: true, newClean: true, ago: 1 }),
      stored({ bpm: 85, even: 0.88, verdict: "passed", counts: true, ago: 2 }),
      stored({ bpm: 80, even: 0.84, verdict: "belowBar", counts: false, ago: 3 }),
      stored({ bpm: 70, even: 0.8, verdict: "belowBar", counts: false, ago: 4 }),
    ];
    const c = card(improving(withHistory({}, history).ctx));
    expect(c.lines.map(said)).toEqual([
      "ask.card.improving.window(count=4,from=70,to=90)",
      "ask.card.improving.clean(count=2,bpm=90)",
      "ask.card.improving.even(count=4,first=80,firstBpm=70,last=90,lastBpm=90,best=90,bestBpm=90)",
    ]);
    expect(text(c)).toBe(
      "In your last 4 measured Takes of this Exercise, the tempo went from 70 BPM in the oldest to 90 BPM in the newest. 2 of them earned a clean tempo; the fastest was 90 BPM. Evenness, in the 4 of them that kept it: 80% in the oldest of those, at 70 BPM; 90% in the newest of those, at 90 BPM; 90% at best, at 90 BPM.",
    );
    expect(c.source).toEqual({ kind: "measured" });
  });

  it("a Take marked not fair is left out of every number, and counted", () => {
    // The 99% / 120 BPM clean Take is marked not fair: no number of it may appear.
    const history = [
      stored({ bpm: 120, even: 0.99, verdict: "passed", counts: true, fair: "no", ago: 1 }),
      stored({ bpm: 90, even: 0.9, verdict: "passed", counts: true, ago: 2 }),
      stored({ bpm: 85, even: 0.86, verdict: "passed", counts: false, ago: 3 }),
      stored({ bpm: 80, even: 0.8, verdict: "belowBar", counts: false, ago: 4 }),
    ];
    const c = card(improving(withHistory({}, history).ctx));
    expect(c.lines.map(said)).toEqual([
      "ask.card.improving.window(count=3,from=80,to=90)",
      "ask.card.improving.clean(count=1,bpm=90)",
      "ask.card.improving.even(count=3,first=80,firstBpm=80,last=90,lastBpm=90,best=90,bestBpm=90)",
      "ask.card.history.leftOut(count=1)",
    ]);
    expect(text(c)).not.toMatch(/120|99%/);
  });

  it("Takes of the player's own exercises are not in the window, nor counted as left out (int1)", () => {
    const own = (ago: number) => stored({ pathId: CUSTOM_PATH_ID, bpm: 120, even: 0.99, verdict: "passed", counts: true, ago });
    const history = [own(1), stored({ bpm: 90, even: 0.9, verdict: "passed", counts: true, ago: 2 }), own(3), stored({ bpm: 80, even: 0.8, counts: false, ago: 4 })];
    const c = card(improving(withHistory({}, history).ctx));
    expect(c.lines.map(said)).toEqual(["ask.card.improving.tooFew(count=2,need=3)"]);
    expect(text(c)).not.toMatch(/120|99%/);
  });

  it("a stored Take that cannot say whether it earned a clean tempo: no count of them, and the card says it can't count them", () => {
    const history = [stored({ verdict: "passed", even: 0.9 }), stored({ ago: 2, counts: false }), stored({ ago: 3, counts: false })];
    const c = card(improving(withHistory({}, history).ctx));
    expect(keys(c).filter((k) => k.startsWith("improving.clean"))).toEqual(["improving.cleanUnknown"]);
  });

  it("evenness at two tempos: each figure with its own Take's tempo, and the oldest of those is not the window's oldest (int1b)", () => {
    // Newest first: 120 BPM at 71%, 110 BPM on notes heard (no evenness), a 60 BPM Take at 96%; the oldest, at 50, kept none.
    const heard = { metric: "notesHeard", value: 0.9, min: 0.95 };
    const history = [
      stored({ bpm: 120, even: 0.71, counts: false, ago: 1 }),
      stored({ bpm: 110, headline: heard, ago: 2 }),
      stored({ bpm: 60, even: 0.96, counts: false, ago: 3 }),
      stored({ bpm: 50, headline: heard, ago: 4 }),
    ];
    const c = card(improving(withHistory({}, history).ctx));
    expect(c.lines.map(said)).toContain("ask.card.improving.even(count=2,first=96,firstBpm=60,last=71,lastBpm=120,best=96,bestBpm=60)");
    expect(text(c)).toContain("96% in the oldest of those, at 60 BPM; 71% in the newest of those, at 120 BPM; 96% at best, at 60 BPM.");
  });

  it("the window holds the last Take's variant only, and says how many Takes on other variants it left out (int1b)", () => {
    const history = [
      stored({ variantSeed: 1, bpm: 90, even: 0.9, counts: false, ago: 1 }),
      stored({ variantSeed: 0, bpm: 140, even: 0.99, counts: false, ago: 2 }),
      stored({ variantSeed: 1, bpm: 85, even: 0.86, counts: false, ago: 3 }),
      stored({ variantSeed: 3, bpm: 80, even: 0.8, counts: false, ago: 4 }),
    ];
    const c = card(improving(withHistory({ exercise: VARIED }, history, { exercise: VARIED, variantSeed: 1 }).ctx));
    expect(said(c.lines[0])).toBe("ask.card.improving.window(count=3,from=80,to=90)");
    expect(text(c)).not.toMatch(/140|99%/);
    expect(english(c.lines[c.lines.length - 1])).toBe("I left out 1 Take played on another version of this Exercise.");
  });

  it("none earned one: says none", () => {
    const history = [stored({ counts: false }), stored({ ago: 2, counts: false }), stored({ ago: 3, counts: false })];
    expect(keys(card(improving(withHistory({}, history).ctx)))).toContain("improving.cleanNone");
  });

  it("the same tempo at both ends: never 'went from 90 to 90'", () => {
    const history = [stored({ counts: false }), stored({ ago: 2, counts: false }), stored({ ago: 3, counts: false })];
    const c = card(improving(withHistory({}, history).ctx));
    expect(said(c.lines[0])).toBe("ask.card.improving.windowSame(count=3,to=90)");
  });

  it("no evenness kept: says so, never a number", () => {
    const heard = { metric: "notesHeard", value: 0.9, min: 0.95 };
    const history = [stored({ headline: heard }), stored({ headline: heard, ago: 2 }), stored({ headline: heard, ago: 3 })];
    expect(keys(card(improving(withHistory({}, history).ctx)))).toContain("improving.evenNone");
  });

  it("Takes not caught or played ungraded are not in the window", () => {
    const history = [stored({ verdict: "notCaught" }), stored({ verdict: "ungraded", ago: 2 }), stored({ ago: 3 }), stored({ ago: 4 })];
    expect(said(card(improving(withHistory({}, history).ctx)).lines[0])).toBe("ask.card.improving.tooFew(count=2,need=3)");
  });
});

// ---------------------------------------------------------------------------

describe("what the score is made of", () => {
  it("the tune: each check in its own numbers, the clean tempo, the tempo it is passed at, and what is not graded", () => {
    const { ctx, exercise } = fixture({});
    const c = card(scoreMadeOf(ctx));
    const got = c.lines.map(said);
    const pitch = exercise.passBars.some((b) => b.metric === "noteIdentity") && !exercise.notGraded.includes("notesWritten");
    expect(got.slice(0, 4)).toEqual([
      `ask.card.made.intro(count=${pitch ? 4 : 3})`,
      "ask.card.made.check.even(bar=85,over=4)",
      "ask.card.made.check.heard(bar=95,over=4)",
      "ask.card.made.check.extras(bar=2,over=4)",
    ]);
    expect(got).toContain("ask.card.made.clean(need=8)");
    expect(got).toContain(`ask.card.made.tempo(passAt=${exercise.tempo.passAtBpm})`);
    for (const id of exercise.notGraded) expect(got).toContain(`ask.card.made.not.${id}`);
    expect(c.source).toEqual({ kind: "path" });
  });

  it("pitch is said as a check only where the Exercise grades it", () => {
    const { ctx } = fixture({});
    const timed: Exercise = { ...TUNE, notGraded: [...TUNE.notGraded.filter((n) => n !== "notesWritten"), "notesWritten"] };
    const c = card(scoreMadeOf({ ...ctx, exercise: timed }));
    expect(keys(c)).not.toContain("made.check.notes");
    expect(keys(c)).toContain("made.not.notesWritten");
  });

  it("an Exercise the app does not grade says that alone", () => {
    for (const [grading, key] of [
      ["selfChecked", "made.ungraded.selfChecked"],
      ["practiceOnly", "made.ungraded.practiceOnly"],
      ["landings", "made.ungraded.landings"],
    ] as const) {
      const { ctx } = fixture({ exercise: { ...TUNE, grading } });
      expect(keys(card(scoreMadeOf(ctx)))).toEqual([key]);
    }
  });

  it("evenness held to the end has its own words, never 'even over N bars'", () => {
    const { ctx } = fixture({});
    const stamina: Exercise = { ...TUNE, passBars: [{ metric: "evennessHold", min: 0.75, overBars: 4 }] };
    expect(card(scoreMadeOf({ ...ctx, exercise: stamina })).lines.map(said)).toContain("ask.card.made.check.hold(bar=75,over=4)");
  });

  it("a check with no words is still counted in the intro, and said as one (int1b)", () => {
    const { ctx } = fixture({});
    const rests: Exercise = {
      ...TUNE,
      notGraded: [...TUNE.notGraded.filter((n) => n !== "notesWritten"), "notesWritten"],
      passBars: [{ metric: "timingEvenness", min: 0.85, overBars: 4 }, { metric: "restsKept", min: 0.9, overBars: 4 } as unknown as Exercise["passBars"][number]],
    };
    const c = card(scoreMadeOf({ ...ctx, exercise: rests }));
    expect(c.lines.map(said).slice(0, 3)).toEqual(["ask.card.made.intro(count=2)", "ask.card.made.check.even(bar=85,over=4)", "ask.card.made.unnamed(count=1)"]);
    expect(english(c.lines[2])).toBe("1 of them is a check I can't describe yet.");
  });

  it("the clean-tempo sentence says a Take must pass, and moves it only when faster (int1b)", () => {
    const { ctx } = fixture({});
    const l = card(scoreMadeOf(ctx)).lines.find((x) => x.key === "ask.card.made.clean")!;
    expect(english(l)).toBe("A Take that passes, with 8 clean bars in a row, earns a clean tempo at its own tempo, and moves your clean tempo up when it is faster.");
  });

  it("no tempo it is passed at: no tempo line", () => {
    const { ctx } = fixture({});
    const open: Exercise = { ...TUNE, tempo: { ...TUNE.tempo, passAtBpm: null } };
    expect(keys(card(scoreMadeOf({ ...ctx, exercise: open })))).not.toContain("made.tempo");
  });

  it("needs no Take: it reads the Exercise", () => {
    const { ctx } = fixture({});
    expect(isCard(scoreMadeOf({ ...ctx, lastTake: undefined }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe("how far the pass mark is", () => {
  it("below on evenness: the gap first, the checks met after, and the tempo the Exercise is passed at", () => {
    const { ctx, exercise } = fixture({ failOn: "timingEvenness", slipped: [0, 4] });
    const c = card(passMarkDistance(ctx));
    const got = c.lines.map(said);
    expect(got[0]).toBe("ask.card.distance.short.even(take=2,value=79,bar=85,over=4,count=6)");
    expect(got).toContain("ask.card.distance.met.heard(take=2,value=100,bar=95,over=4)");
    expect(got).toContain("ask.card.distance.met.extras(take=2,value=0,bar=2,over=4)");
    expect(got[got.length - 1]).toBe(`ask.card.distance.tempo(take=2,bpm=90,passAt=${exercise.tempo.passAtBpm})`);
    expect(english(c.lines[0])).toBe("Even: 79% in Take 2, 6 points short of the pass mark of 85%.");
    expect(c.source).toEqual({ kind: "measured", take: 2 });
  });

  it("at or above the tempo the Exercise is passed at: no tempo line", () => {
    const { ctx } = fixture({});
    const easy: Exercise = { ...TUNE, tempo: { ...TUNE.tempo, passAtBpm: 80 } };
    expect(keys(card(passMarkDistance({ ...ctx, exercise: easy })))).not.toContain("distance.tempo");
  });

  it("short by less than the rounding shows: 'less than a point short', never '85%, < 1 points short of 85%' (int1b)", () => {
    const f = fixture({ failOn: "timingEvenness", slipped: [0, 4] });
    const checks = f.outcome.grade.checks.map((c) => (c.metric === "timingEvenness" ? { ...c, value: 0.846, met: false } : c));
    const ctx = { ...f.ctx, lastTake: { ...f.outcome, grade: { ...f.outcome.grade, checks } } };
    const c = card(passMarkDistance(ctx));
    expect(said(c.lines[0])).toBe("ask.card.distance.under.even(take=2,bar=85)");
    expect(english(c.lines[0])).toBe("Even in Take 2: less than a point short of the pass mark of 85%.");
  });

  it("short by one point: '1 point', never '1 points' (int1b)", () => {
    const f = fixture({ failOn: "timingEvenness", slipped: [0, 4] });
    const checks = f.outcome.grade.checks.map((c) => (c.metric === "timingEvenness" ? { ...c, value: 0.84, met: false } : c));
    const ctx = { ...f.ctx, lastTake: { ...f.outcome, grade: { ...f.outcome.grade, checks } } };
    expect(english(card(passMarkDistance(ctx)).lines[0])).toBe("Even: 84% in Take 2, 1 point short of the pass mark of 85%.");
  });

  it("a check the cards have no words for is counted and said, never skipped (int1b)", () => {
    const f = fixture({});
    const checks = [...f.outcome.grade.checks, { metric: "restsKept", value: 0.5, min: 0.9, met: false } as unknown as (typeof f.outcome.grade.checks)[number]];
    const ctx = { ...f.ctx, lastTake: { ...f.outcome, grade: { ...f.outcome.grade, checks } } };
    const c = card(passMarkDistance(ctx));
    expect(c.lines.map(said)).toContain("ask.card.distance.unnamed(take=2,count=1)");
    // Only unnamed checks: never "I didn't measure any check".
    const only = { ...f.ctx, lastTake: { ...f.outcome, grade: { ...f.outcome.grade, checks: [checks[checks.length - 1]] } } };
    expect(keys(card(passMarkDistance(only)))).not.toContain("distance.none");
    expect(keys(card(passMarkDistance(only)))).toContain("distance.unnamed");
  });

  it("extra notes over the ceiling: how many more than it allows", () => {
    const f = fixture({ failOn: "timingEvenness", slipped: [0, 4] });
    const checks = f.outcome.grade.checks.map((c) => (c.metric === "extraNotes" ? { ...c, value: 4, met: false } : c));
    const ctx = { ...f.ctx, lastTake: { ...f.outcome, grade: { ...f.outcome.grade, checks } } };
    expect(card(passMarkDistance(ctx)).lines.map(said)).toContain("ask.card.distance.short.extras(take=2,value=4,bar=2,over=4,gap=2)");
  });

  it("a check not measured is counted, never given a number", () => {
    const f = fixture({});
    const checks = f.outcome.grade.checks.map((c) => (c.metric === "notesHeard" ? { ...c, value: null, met: null } : c));
    const ctx = { ...f.ctx, lastTake: { ...f.outcome, grade: { ...f.outcome.grade, checks } } };
    const c = card(passMarkDistance(ctx));
    expect(c.lines.map(said)).toContain("ask.card.distance.unmeasured(take=2,count=1)");
    expect(keys(c).some((k) => k.endsWith(".heard"))).toBe(false);
  });

  it("a Take not caught: its reason, no distance", () => {
    expect(keys(card(passMarkDistance(fixture({ verdict: "notCaught", noCatchReason: "tooFewHeard" }).ctx)))).toEqual(["count.notCaught.tooFewHeard"]);
  });
});

// ---------------------------------------------------------------------------

describe("the four cards and an ungraded player", () => {
  const NEW = ["what_changed", "improving", "score_made_of", "pass_mark_distance"] as const;

  it("grading off: none of the four is offered, and asked, each says the ungraded line", () => {
    const { ctx } = withHistory({}, [stored({})], { grading: "off" });
    expect(cardsHere(ctx).filter((n) => (NEW as readonly string[]).includes(n))).toEqual([]);
    for (const tool of NEW) {
      const out = runFactCard({ tool, args: {} }, ctx);
      expect(isCard(out) ? "card" : out.line.key).toBe("ask.card.notNow.ungraded");
    }
  });

  it("graded, on the result screen: all four are here", () => {
    const { ctx } = withHistory({}, [stored({})]);
    expect(cardsHere(ctx)).toEqual(expect.arrayContaining([...NEW]));
  });

  it("the one fairness rule is the stored row's own answer", () => {
    expect(markedNotFair(stored({ fair: "no" }))).toBe(true);
    expect(markedNotFair(stored({ fair: "yes" }))).toBe(false);
    expect(markedNotFair(stored({}))).toBe(false);
    // The app's one rule (int1): the cards read Progress's own reading, row for row.
    for (const r of [stored({ fair: "no" }), stored({ fair: "yes" }), stored({})]) {
      expect(markedNotFair(r)).toBe(isMarkedNotFair(r));
    }
  });
});
