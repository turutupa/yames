// "My exercises": a recipe in, an Exercise the validator accepts or a reason out.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCustomExercise,
  customExerciseId,
  customPathDoc,
  nextRecipe,
  PATH_ONLY_RULES,
  positionsFor,
  recipeKey,
} from "./custom";
import type { BoxRecipe, Recipe, WhyKind } from "./custom";
import { STANDARD_TUNING } from "./format";
import type { PathDoc } from "./format";
import { customGrid, customScheduleFixtures } from "./customGrid";
import { parseTab } from "./tabDsl";
import { pentatonic } from "./templates";
import { validatePath } from "./validate";
import { gradedRungs } from "../session/ladder";

/** Mock 17: "A minor pentatonic at the 5th fret: up the box and back down, in eighths. Three bars." */
const MOCK_17: BoxRecipe = {
  v: 1,
  shape: "box",
  root: "A",
  scale: "minorPentatonic",
  position: 5,
  subdivision: "eighths",
  bars: 3,
  direction: "upAndBack",
};

const REFUSALS: readonly WhyKind[] = ["noShapeHere", "outOfRange", "tooManyNotes", "tooFewNotes", "unreachable"];
const TIMING_ONLY = ["timingEvenness", "notesHeard", "extraNotes", "cleanTempo"];

const PACKS = Object.values(import.meta.glob("./packs/*.json", { eager: true, import: "default" })) as PathDoc[];

describe("the recipe grid", () => {
  // Every seventh recipe of the grid (about 1,270 of 8,880): every shape, root,
  // position, grid, length and direction is in it. `node scripts/custom-exercises.mjs
  // report` runs all of it.
  const recipes = customGrid().filter((_r, i) => i % 7 === 0);

  it("builds an Exercise the validator accepts, or refuses with a reason; never throws, never notValid", () => {
    const counts: Record<string, number> = {};
    for (const recipe of recipes) {
      const result = buildCustomExercise(recipe);
      const name = JSON.stringify(recipe);
      if (!result.ok) {
        counts[result.why.why] = (counts[result.why.why] ?? 0) + 1;
        expect(REFUSALS, `${name}: ${JSON.stringify(result.why)}`).toContain(result.why.why);
        continue;
      }
      counts.built = (counts.built ?? 0) + 1;
      const ex = result.exercise;
      const errors = validatePath(customPathDoc(ex)).filter((i) => i.severity === "error" && !PATH_ONLY_RULES.includes(i.rule));
      expect(errors.map((e) => `${e.rule} ${e.where}: ${e.message}`), name).toEqual([]);
      expect(ex.id).toBe(customExerciseId(recipe));
      expect(ex.bars).toBe(recipe.bars);
      expect(ex.notesRole).toBe("target");
      expect(ex.grading).toBe("graded");
      expect(ex.subdivision).toBe(recipe.subdivision);
      // Timing and notes heard; nothing else is graded, and the rest is said not to be.
      expect(TIMING_ONLY).toEqual(expect.arrayContaining(ex.graded));
      expect(ex.notGraded.length).toBeGreaterThan(0);
      for (const bar of ex.passBars) expect(ex.graded).toContain(bar.metric);
      // The ladder: graded, starting at the summary's tempo, the pass on a rung.
      const rungs = gradedRungs(ex);
      expect(rungs[0], name).toBe(result.summary.startBpm);
      expect(rungs).toContain(result.summary.passBpm);
      expect(result.summary.startBpm).toBeLessThanOrEqual(60);
      expect(result.summary.passBpm).toBeLessThanOrEqual(ex.computed.maxPlayableBpm);
    }
    // The grid is not refused wholesale: every refusal kind it can reach is there, and builds outnumber any one of them.
    expect(counts.built).toBeGreaterThan(300);
    for (const why of ["noShapeHere", "outOfRange", "tooManyNotes", "tooFewNotes"]) expect(counts[why], why).toBeGreaterThan(0);
  }, 300_000);
});

describe("mock 17", () => {
  const result = buildCustomExercise(MOCK_17);

  it("builds: A on the low E at fret 5 first, up the box and back down, in eighths, three bars, from 60 BPM", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ex = result.exercise;
    expect(ex.notes[0]).toMatchObject({ string: 6, fret: 5, midi: 45 });
    expect(result.summary.firstNote).toEqual({ string: 6, fret: 5, midi: 45, name: "A" });
    expect(ex.bars).toBe(3);
    expect(result.summary.startBpm).toBe(60);
    expect(result.summary.notesPerPass).toBe(22);
    expect(result.summary.passes).toBe(1);
    expect(ex.position.fret).toBe(5);
    expect(ex.loops).toBe(true);
  });

  it("plays exactly the notes the blues Path's box line is written with", () => {
    if (!result.ok) throw new Error("mock 17 did not build");
    // The same template call a shipped Exercise uses (`blues-pentatonics`, box 1 up and back).
    const shipped = parseTab(`/8 ${pentatonic({ root: "A", box: 1, sequence: "updown" })} hold`, STANDARD_TUNING, 3840);
    const strip = (n: { string: number; fret: number; tick: number; dur: number }) => [n.string, n.fret, n.tick, n.dur];
    expect(result.exercise.notes.map(strip)).toEqual(shipped.notes.map(strip));
  });

  it("the same recipe gives the same notes and id twice; 'root' and its fret are one Exercise", () => {
    const again = buildCustomExercise({ ...MOCK_17 });
    const byRoot = buildCustomExercise({ ...MOCK_17, position: "root" });
    if (!result.ok || !again.ok || !byRoot.ok) throw new Error("did not build");
    expect(again.exercise).toEqual(result.exercise);
    expect(byRoot.exercise).toEqual(result.exercise);
    expect(result.exercise.id).toBe("my.v1-box-a-minorpentatonic-s61-f5-eighths-3b-upandback");
    expect(recipeKey({ ...MOCK_17, position: "root" })).toBe(recipeKey(MOCK_17));
  });

  it("does not touch the recipe it was given", () => {
    const frozen = Object.freeze({ ...MOCK_17 });
    expect(buildCustomExercise(frozen).ok).toBe(true);
  });

  it("the chips: sixteenths instead, next position, and the ones that say why not", () => {
    const sixteenths = nextRecipe(MOCK_17, { change: "subdivision", to: "sixteenths" });
    expect(sixteenths.ok).toBe(true);
    if (sixteenths.ok) {
      expect(sixteenths.summary.passes).toBe(2);
      expect(sixteenths.exercise.bars).toBe(3);
    }
    const next = nextRecipe(MOCK_17, { change: "nextPosition" });
    expect(next.ok).toBe(true);
    expect(next.recipe?.position).toBe(8);
    if (next.ok) expect(next.exercise.notes[0]).toMatchObject({ string: 6, fret: 8 });
    const previous = nextRecipe(MOCK_17, { change: "previousPosition" });
    expect(previous.recipe?.position).toBe(3);
    // Four bars of a 22-note line leave a bar and a quarter empty.
    expect(nextRecipe(MOCK_17, { change: "moreBars" })).toMatchObject({ ok: false, recipe: { bars: 4 }, why: { why: "tooFewNotes" } });
    expect(nextRecipe(MOCK_17, { change: "fewerBars" })).toMatchObject({ ok: false, recipe: { bars: 2 }, why: { why: "tooManyNotes", needsBars: 3 } });
    expect(nextRecipe(MOCK_17, { change: "otherDirection" })).toEqual({ ok: false, recipe: null, why: { why: "atLimit" } });
    expect(nextRecipe(MOCK_17, { change: "subdivision", to: "eighths" })).toEqual({ ok: false, recipe: null, why: { why: "atLimit" } });
    const up: Recipe = { ...MOCK_17, direction: "up" };
    const down = nextRecipe(up, { change: "otherDirection" });
    expect(down.ok).toBe(true);
    if (down.ok) expect(down.exercise.notes[0]).toMatchObject({ string: 1, fret: 8 });
    const top = nextRecipe({ ...MOCK_17, position: 15 }, { change: "nextPosition" });
    expect(top).toEqual({ ok: false, recipe: null, why: { why: "atLimit" } });
  });
});

describe("refusals", () => {
  it("a field outside its set is badRecipe, naming the field: no free text reaches the generator", () => {
    const bad = (patch: Record<string, unknown>) => buildCustomExercise({ ...MOCK_17, ...patch } as unknown as Recipe);
    expect(bad({ root: "H" })).toEqual({ ok: false, why: { why: "badRecipe", field: "root" } });
    expect(bad({ root: "A minor, and play it fast" })).toEqual({ ok: false, why: { why: "badRecipe", field: "root" } });
    expect(bad({ scale: "major" })).toEqual({ ok: false, why: { why: "badRecipe", field: "scale" } });
    expect(bad({ position: 16 })).toEqual({ ok: false, why: { why: "badRecipe", field: "position" } });
    expect(bad({ position: 2.5 })).toEqual({ ok: false, why: { why: "badRecipe", field: "position" } });
    expect(bad({ bars: 9 })).toEqual({ ok: false, why: { why: "badRecipe", field: "bars" } });
    expect(bad({ subdivision: "quintuplets" })).toEqual({ ok: false, why: { why: "badRecipe", field: "subdivision" } });
    expect(bad({ strings: { low: 1, high: 6 } })).toEqual({ ok: false, why: { why: "badRecipe", field: "strings" } });
    expect(bad({ v: 2 })).toEqual({ ok: false, why: { why: "badRecipe", field: "v" } });
    expect(buildCustomExercise({ ...MOCK_17, shape: "arpeggio", chord: "min", strings: { low: 2, high: 1 } } as Recipe)).toEqual({
      ok: false,
      why: { why: "badRecipe", field: "strings" },
    });
    expect(buildCustomExercise(null as unknown as Recipe)).toEqual({ ok: false, why: { why: "badRecipe", field: "recipe" } });
  });

  it("no shape at that fret: noShapeHere, with the nearest frets it does start at", () => {
    const result = buildCustomExercise({ ...MOCK_17, position: 6 });
    expect(result).toEqual({ ok: false, why: { why: "noShapeHere", nearest: [5, 8] } });
    expect(positionsFor(MOCK_17)).toEqual(expect.arrayContaining([5, 8]));
    // F is not in A minor: no three-per-string start on fret 1 of the low E.
    const nps = buildCustomExercise({ ...MOCK_17, shape: "threePerString", scale: "naturalMinor", position: 1 } as Recipe);
    expect(nps).toEqual({ ok: false, why: { why: "noShapeHere", nearest: [0, 3] } });
  });

  it("off the neck: outOfRange", () => {
    const climb: Recipe = { v: 1, shape: "oneString", root: "A", scale: "naturalMinor", string: 1, position: 15, subdivision: "eighths", bars: 3, direction: "up" };
    expect(buildCustomExercise(climb)).toEqual({ ok: false, why: { why: "outOfRange" } });
  });

  it("too many notes for the bars, or too few: how many bars it needs, or fills", () => {
    expect(buildCustomExercise({ ...MOCK_17, subdivision: "sixteenths", bars: 1 })).toEqual({ ok: false, why: { why: "tooManyNotes", needsBars: 2 } });
    const chromatic: Recipe = { v: 1, shape: "chromatic", position: 5, subdivision: "eighths", bars: 8, direction: "up" };
    expect(buildCustomExercise(chromatic)).toEqual({ ok: false, why: { why: "tooFewNotes", fillsBars: 6 } });
    expect(buildCustomExercise({ ...chromatic, bars: 6 }).ok).toBe(true);
  });
});

describe("ids", () => {
  it("never collide with a pack Exercise", () => {
    const ids = PACKS.flatMap((doc) => [...doc.steps.flatMap((s) => s.exercises), ...(doc.levels ?? []).flatMap((l) => l.warmups)].map((e) => e.id));
    expect(ids.length).toBeGreaterThan(500);
    expect(ids.filter((id) => id.startsWith("my."))).toEqual([]);
    expect(PACKS.flatMap((doc) => doc.steps.map((s) => s.id))).not.toContain("my");
  });

  it("differ when the notes differ", () => {
    const a = customExerciseId(MOCK_17);
    expect(customExerciseId({ ...MOCK_17, bars: 4 })).not.toBe(a);
    expect(customExerciseId({ ...MOCK_17, strings: { low: 3, high: 1 } })).not.toBe(a);
    expect(customExerciseId({ ...MOCK_17, root: "C#" })).toBe("my.v1-box-cs-minorpentatonic-s61-f5-eighths-3b-upandback");
    expect(customExerciseId({ ...MOCK_17, root: "C#", position: "root" })).toBe("my.v1-box-cs-minorpentatonic-s61-f9-eighths-3b-upandback");
  });
});

describe("the Rust scorer's fixture", () => {
  it("custom_schedules.jsonl is what `node scripts/custom-exercises.mjs gen` writes now", () => {
    const file = path.join(process.cwd(), "src-tauri/tests/path_fixtures/custom_schedules.jsonl");
    expect(readFileSync(file, "utf8")).toBe(customScheduleFixtures());
  }, 120_000);
});
