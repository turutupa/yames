/**
 * My exercises: the stored list (`myExercises`), its words, and that its Takes
 * stay out of Path standing, the per-Path totals, Today's plan and the
 * tendencies (NEXT-LEGS judgement call 15).
 */
import { afterEach, describe, expect, it } from "vitest";
import i18n from "../i18n";
import { CUSTOM_PATH_ID, CUSTOM_STEP_ID, buildCustomExercise, customExerciseId } from "../paths/custom";
import type { Recipe } from "../paths/custom";
import { addMyExercise, buildMyExercises, myExerciseLine } from "./myExerciseBuild";
import {
  MY_EXERCISES_KEY,
  MY_EXERCISES_MAX,
  MY_EXERCISES_PATH_ID,
  isCustomTake,
  loadMyExercises,
  myExercisesNow,
  readMyExercises,
  removeMyExercise,
  resetMyExercisesForTest,
  restoreMyExercise,
  saveMyExercises,
} from "./myExercises";
import type { MyExercise } from "./myExercises";
import { installSettings } from "../test/parity/store";
import { ALT, DAY, NOW, SWEEP, passed, progress, state, take } from "./testKit";
import { currentStepOf, isStepPassed } from "./progress";
import type { PlayerProgress } from "./progress";
import { planSession } from "./planner";
import { groupsFrom } from "../containers/session/ProgressView";

const t = i18n.t.bind(i18n);

const MOCK_17: Recipe = {
  v: 1,
  shape: "box",
  root: "A",
  scale: "minorPentatonic",
  position: 5,
  subdivision: "eighths",
  bars: 3,
  direction: "upAndBack",
};
const CHROMATIC: Recipe = { v: 1, shape: "chromatic", position: 5, subdivision: "eighths", bars: 6, direction: "up" };
/** A recipe this generator refuses: no box starts at fret 6. */
const NO_LONGER: Recipe = { ...MOCK_17, position: 6 } as Recipe;

const entry = (recipe: Recipe, addedAt = NOW): MyExercise => ({ recipe, addedAt });

afterEach(() => resetMyExercisesForTest());

describe("reading the stored list", () => {
  it("missing or not a list: empty", () => {
    for (const v of [undefined, null, 7, "x", {}, { recipe: MOCK_17 }]) expect(readMyExercises(v)).toEqual([]);
  });

  it("drops what was never a recipe entry, keeps the rest in order", () => {
    const saved = [
      entry(MOCK_17, 2),
      null,
      "box",
      { recipe: "box", addedAt: 1 },
      { recipe: MOCK_17 },
      { recipe: MOCK_17, addedAt: Number.NaN },
      { ...entry(CHROMATIC, 1), name: "  " },
      { ...entry(CHROMATIC, 0), name: "warm-up" },
    ];
    expect(readMyExercises(saved)).toEqual([entry(MOCK_17, 2), entry(CHROMATIC, 1), { ...entry(CHROMATIC, 0), name: "warm-up" }]);
  });

  it("keeps a recipe that no longer builds, or of a later version, and says it does not build", () => {
    const later = { ...MOCK_17, v: 2 } as unknown as Recipe;
    const list = readMyExercises([entry(NO_LONGER), entry(later), entry(MOCK_17)]);
    expect(list).toHaveLength(3);
    const built = buildMyExercises(list);
    expect(built.map((b) => b.built.ok)).toEqual([false, false, true]);
  });

  it("reads at most fifty", () => {
    const many = Array.from({ length: 60 }, (_, i) => entry(MOCK_17, i));
    expect(readMyExercises(many)).toHaveLength(MY_EXERCISES_MAX);
  });
});

describe("adding, removing, undo", () => {
  it("adds at the top; the same notes twice, a bad recipe and a full list are refused", () => {
    const one = addMyExercise([], MOCK_17, 1);
    expect(one).toEqual({ ok: true, list: [entry(MOCK_17, 1)] });
    const two = addMyExercise(one.list, CHROMATIC, 2);
    expect(two.list.map((e) => e.recipe)).toEqual([CHROMATIC, MOCK_17]);
    // "root" and fret 5 are the same notes, the same key.
    const same = addMyExercise(two.list, { ...MOCK_17, position: "root" }, 3);
    expect(same).toMatchObject({ ok: false, why: "already" });
    expect(addMyExercise([], { ...MOCK_17, bars: 99 }, 1)).toMatchObject({ ok: false, why: "badRecipe", list: [] });
    const full = Array.from({ length: MY_EXERCISES_MAX }, (_, i) => entry({ ...CHROMATIC, position: i % 12 } as Recipe, i));
    const refused = addMyExercise(full, MOCK_17, 99);
    expect(refused).toMatchObject({ ok: false, why: "full" });
    expect(refused.list).toHaveLength(MY_EXERCISES_MAX);
  });

  it("remove takes one out; undo puts it back where it was, once", () => {
    const list = [entry(MOCK_17, 3), entry(CHROMATIC, 2), entry(NO_LONGER, 1)];
    const out = removeMyExercise(list, 1);
    expect(out.list).toEqual([list[0], list[2]]);
    expect(out.removed).toEqual({ entry: list[1], index: 1 });
    const back = restoreMyExercise(out.list, out.removed!);
    expect(back).toEqual(list);
    expect(restoreMyExercise(back, out.removed!)).toEqual(list);
    expect(removeMyExercise(list, 9)).toEqual({ list, removed: null });
  });
});

describe("the store", () => {
  it("loads the key once, and saving writes the whole list under it", async () => {
    const fake = await installSettings({ [MY_EXERCISES_KEY]: [entry(MOCK_17), { junk: true }] });
    await loadMyExercises();
    expect(myExercisesNow()).toEqual([entry(MOCK_17)]);
    saveMyExercises([entry(CHROMATIC), entry(MOCK_17)]);
    expect(myExercisesNow()).toHaveLength(2);
    await Promise.resolve();
    await Promise.resolve();
    expect(fake.writes).toEqual([[MY_EXERCISES_KEY, [entry(CHROMATIC), entry(MOCK_17)]]]);
  });

  it("a malformed value reads as an empty list", async () => {
    await installSettings({ [MY_EXERCISES_KEY]: "not a list" });
    await loadMyExercises();
    expect(myExercisesNow()).toEqual([]);
  });
});

describe("the words", () => {
  it("one line from the summary, in the language on screen", () => {
    const box = buildCustomExercise(MOCK_17);
    const chromatic = buildCustomExercise(CHROMATIC);
    if (!box.ok || !chromatic.ok) throw new Error("the fixtures build");
    expect(myExerciseLine(t, box.summary)).toBe("A minor pentatonic, the box at fret 5: up and back down. 3 bars.");
    expect(myExerciseLine(t, chromatic.summary)).toBe("Chromatic, one finger a fret from fret 5: up. 6 bars.");
  });

  it("every shape and direction has words, and an arpeggio is named by its chord symbol", () => {
    const arp = buildMyExercises([
      entry({ v: 1, shape: "arpeggio", root: "A", chord: "m7", position: "root", subdivision: "eighths", bars: 2, direction: "upAndBack" } as Recipe),
    ])[0].built;
    if (arp.ok) expect(myExerciseLine(t, arp.summary)).toMatch(/^Am7 arpeggio from fret \d+: up and back down\. 2 bars\.$/);
    for (const key of ["box", "threePerString", "arpeggio", "oneString", "chromatic"]) {
      expect(i18n.exists(`session.myExercises.shape.${key}`)).toBe(true);
    }
    for (const key of ["up", "down", "upAndBack"]) expect(i18n.exists(`session.myExercises.direction.${key}`)).toBe(true);
  });
});

describe("custom Takes stay out of the Paths", () => {
  const built = buildCustomExercise(MOCK_17);
  if (!built.ok) throw new Error("mock 17 builds");
  const id = customExerciseId(MOCK_17);
  /** Three passed Takes of the custom Exercise, the newest of everything. */
  const mine = [1, 2, 3].map((n) =>
    take(id, {
      pathId: CUSTOM_PATH_ID,
      stepId: CUSTOM_STEP_ID,
      bpm: 100,
      passed: true,
      startedAt: NOW - DAY + n,
      facts: { verdict: "passed", session: NOW - DAY, role: "focus" },
    }),
  );
  const packOnly: PlayerProgress = progress({
    states: [state(), state({ pathId: SWEEP.id })],
    takes: [passed(ALT.steps[0].exercises[0].id, 60, 0.87, 2 * DAY)],
  });
  const withMine: PlayerProgress = {
    ...packOnly,
    takes: [...mine].reverse().concat(packOnly.takes),
    ceilings: [{ exerciseKey: `${CUSTOM_PATH_ID}/${id}`, cleanBpm: 100, lastPracticed: NOW - DAY }],
  };

  it("are told apart by their Path id, which no pack uses", () => {
    // The store's copy of the id is the generator's.
    expect(MY_EXERCISES_PATH_ID).toBe(CUSTOM_PATH_ID);
    expect(mine.every(isCustomTake)).toBe(true);
    expect(isCustomTake(packOnly.takes[0])).toBe(false);
    const packs = Object.values(import.meta.glob("../paths/packs/*.json", { eager: true, import: "default" })) as Array<{ id: string }>;
    expect(packs.length).toBeGreaterThan(10);
    expect(packs.map((p) => p.id)).not.toContain(CUSTOM_PATH_ID);
  });

  it("Path standing: the Step a player is on and the Steps passed do not move", () => {
    for (const path of [ALT, SWEEP]) {
      expect(currentStepOf(withMine, path).id).toBe(currentStepOf(packOnly, path).id);
      for (const step of path.steps) expect(isStepPassed(withMine, path.id, step)).toBe(isStepPassed(packOnly, path.id, step));
    }
  });

  it("the per-Path totals on Progress have no group for them", () => {
    const groups = groupsFrom(withMine.takes, [ALT, SWEEP]);
    expect(groups.map((g) => g.path.id)).toEqual(groupsFrom(packOnly.takes, [ALT, SWEEP]).map((g) => g.path.id));
    expect(groups.map((g) => g.path.id)).toEqual([ALT.id]);
  });

  it("Today's plan never plans one, even when it was the last thing played", () => {
    for (const minutes of [5, 10, 20] as const) {
      const plan = planSession({ minutes, now: NOW, paths: [ALT, SWEEP], progress: withMine });
      expect(plan.steps.length).toBeGreaterThan(0);
      for (const step of plan.steps) {
        if ("pathId" in step) expect(step.pathId).not.toBe(CUSTOM_PATH_ID);
        if ("exerciseId" in step) expect(step.exerciseId).not.toBe(id);
      }
      expect(plan.focusPathId).not.toBe(CUSTOM_PATH_ID);
    }
  });

  it("the tendencies' reader can leave them out with one test", () => {
    // c4a1's tendencies read the Takes; `isCustomTake` is what keeps these out.
    expect(withMine.takes.filter((t) => !isCustomTake(t))).toEqual(packOnly.takes);
  });
});
