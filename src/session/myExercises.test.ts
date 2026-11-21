/**
 * My exercises: the stored list (`myExercises`), its words, and that its Takes
 * stay out of Path standing, the per-Path totals, Today's plan and the
 * tendencies (NEXT-LEGS judgement call 15).
 */
import { afterEach, describe, expect, it } from "vitest";
import i18n from "../i18n";
import { CUSTOM_PATH_ID, CUSTOM_STEP_ID, buildCustomExercise, customExerciseId } from "../paths/custom";
import type { Recipe } from "../paths/custom";
import { addMyExercise, buildMyExercises, keyOf, myExerciseLine } from "./myExerciseBuild";
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
  myExercisesState,
  myExercisesStoredEntries,
  updateMyExercises,
} from "./myExercises";
import type { MyExercise, RemovedMyExercise } from "./myExercises";
import { load } from "@tauri-apps/plugin-store";
import { installSettings } from "../test/parity/store";
import { ALT, DAY, NOW, SWEEP, passed, progress, state, take } from "./testKit";
import { currentStepOf, isStepPassed } from "./progress";
import type { PlayerProgress } from "./progress";
import { planSession } from "./planner";
import { totalsFrom } from "./totals";
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
    const out = removeMyExercise(list, list[1]);
    expect(out.list).toEqual([list[0], list[2]]);
    expect(out.removed).toEqual({ entry: list[1], index: 1, entriesBefore: 3 });
    const back = restoreMyExercise(out.list, out.removed!);
    expect(back).toEqual({ list, refused: null });
    expect(restoreMyExercise(back.list, out.removed!)).toEqual({ list, refused: "already" });
    expect(removeMyExercise(list, entry(MOCK_17, 9))).toEqual({ list, removed: null });
  });

  it("undo at fifty is refused as full (the caller keeps the Undo); the same notes added again: already, never a second row", () => {
    const full = Array.from({ length: MY_EXERCISES_MAX }, (_, i) => entry({ ...CHROMATIC, position: i % 12, bars: 1 + (i % 4) } as Recipe, i));
    const gone = entry(MOCK_17, 999);
    expect(restoreMyExercise(full, { entry: gone, index: 0 }, keyOf)).toMatchObject({ refused: "full" });
    // Removed, then added again as a new entry (another object, another date): the recipe key says it is there.
    const readded = addMyExercise([entry(CHROMATIC)], { ...MOCK_17, position: "root" }, 5);
    if (!readded.ok) throw new Error("adds");
    const undo = restoreMyExercise(readded.list, { entry: gone, index: 1 }, keyOf);
    expect(undo.refused).toBe("already");
    expect(undo.list).toHaveLength(2);
  });
});

/** A settings store whose `get` is held until the test lets it answer (or fail). */
async function heldStore(initial: Record<string, unknown>) {
  const fake = await installSettings(initial);
  const store = (await load("settings.json")) as unknown as { get: (k: string) => Promise<unknown> };
  const real = store.get;
  let open!: () => void;
  let fail!: (e: unknown) => void;
  const gate = new Promise<void>((res, rej) => {
    open = res;
    fail = rej;
  });
  store.get = async (k: string) => {
    await gate;
    return real(k);
  };
  return { fake, open, fail };
}

describe("the store", () => {
  it("loads the key once; a writer writes the whole stored array", async () => {
    const fake = await installSettings({ [MY_EXERCISES_KEY]: [entry(MOCK_17)] });
    await loadMyExercises();
    expect(myExercisesNow()).toEqual([entry(MOCK_17)]);
    expect(myExercisesState()).toBe("read");
    expect(await updateMyExercises((list) => [entry(CHROMATIC), ...list])).toBe("saved");
    expect(myExercisesNow()).toHaveLength(2);
    expect(fake.writes).toEqual([[MY_EXERCISES_KEY, [entry(CHROMATIC), entry(MOCK_17)]]]);
  });

  it("a press before the load waits for it and works on what it read, never on an empty stand-in", async () => {
    const stored = [entry(MOCK_17, 2), entry(CHROMATIC, 1)];
    const { fake, open } = await heldStore({ [MY_EXERCISES_KEY]: stored });
    expect(myExercisesNow()).toEqual([]);
    const seen: number[] = [];
    const add = updateMyExercises((list) => {
      seen.push(list.length);
      return [entry(NO_LONGER, 3), ...list];
    });
    void loadMyExercises();
    expect(fake.writes).toEqual([]);
    open();
    expect(await add).toBe("saved");
    expect(seen).toEqual([2]);
    expect(fake.writes).toEqual([[MY_EXERCISES_KEY, [entry(NO_LONGER, 3), ...stored]]]);
    // The load's answer does not land after the write and undo it.
    expect(myExercisesNow()).toHaveLength(3);
  });

  it("a failed read: unreadable, every writer refused, nothing written; the next load tries again", async () => {
    const { fake, fail } = await heldStore({ [MY_EXERCISES_KEY]: [entry(MOCK_17)] });
    const press = updateMyExercises((list) => [entry(CHROMATIC), ...list]);
    fail(new Error("disk"));
    expect(await press).toBe("unreadable");
    expect(myExercisesState()).toBe("unreadable");
    expect(fake.writes).toEqual([]);
  });

  it("a whole value this build cannot read (a later shape, a hand edit) is never written over", async () => {
    for (const value of ["not a list", { v: 2, items: [entry(MOCK_17)] }, 7]) {
      resetMyExercisesForTest();
      const fake = await installSettings({ [MY_EXERCISES_KEY]: value });
      await loadMyExercises();
      expect(myExercisesNow()).toEqual([]);
      expect(myExercisesState()).toBe("unreadable");
      expect(await updateMyExercises((list) => [entry(CHROMATIC), ...list])).toBe("unreadable");
      expect(fake.writes).toEqual([]);
    }
  });

  it("missing or null reads as an empty list that may be written", async () => {
    const fake = await installSettings({ [MY_EXERCISES_KEY]: null });
    expect(await updateMyExercises((list) => [entry(CHROMATIC), ...list])).toBe("saved");
    expect(fake.writes).toEqual([[MY_EXERCISES_KEY, [entry(CHROMATIC)]]]);
  });

  const removeAt = async (at: number) => {
    const which = myExercisesNow()[at];
    const removed = { r: null as RemovedMyExercise | null };
    const result = await updateMyExercises((list) => {
      const out = removeMyExercise(list, which, myExercisesStoredEntries());
      removed.r = out.removed;
      return out.list;
    });
    return { result, removed: removed.r! };
  };
  const removeSecond = () => removeAt(1);
  const undo = (removed: RemovedMyExercise) =>
    updateMyExercises((list) => {
      const out = restoreMyExercise(list, removed, keyOf, myExercisesStoredEntries());
      return out.refused ? null : out.list;
    });

  it("Remove and Undo write back the rows the reader left out, unchanged: a bad entry, an unknown field", async () => {
    const bad = { recipe: CHROMATIC, addedAt: "2026-11-20" };
    const pinned = { ...entry(MOCK_17, 70), pinned: true };
    const rows: unknown[] = [pinned, bad, entry({ ...CHROMATIC, bars: 1 }, 3), entry({ ...CHROMATIC, bars: 2 }, 2), entry({ ...CHROMATIC, bars: 3 }, 1)];
    const fake = await installSettings({ [MY_EXERCISES_KEY]: rows });
    await loadMyExercises();
    expect(myExercisesNow()).toHaveLength(4);
    const { result, removed } = await removeSecond();
    expect(result).toBe("saved");
    const afterRemove = fake.writes[0][1] as unknown[];
    expect(afterRemove).toEqual([pinned, bad, rows[3], rows[4]]);
    expect(afterRemove[0]).toBe(pinned);
    expect(await undo(removed)).toBe("saved");
    expect(fake.writes[1][1]).toEqual(rows);
  });

  it("Undo puts an unread row that followed the removed one back behind it: the stored array exactly as it was", async () => {
    const bad = { recipe: CHROMATIC, addedAt: "2026-11-20" };
    const rows: unknown[] = [entry({ ...CHROMATIC, bars: 1 }, 3), bad, entry({ ...CHROMATIC, bars: 2 }, 2)];
    const fake = await installSettings({ [MY_EXERCISES_KEY]: rows });
    await loadMyExercises();
    const { result, removed } = await removeAt(0);
    expect(result).toBe("saved");
    expect(fake.writes[0][1]).toEqual([bad, rows[2]]);
    expect(await undo(removed)).toBe("saved");
    expect(fake.writes[1][1]).toEqual(rows);
    expect((fake.writes[1][1] as unknown[])[1]).toBe(bad);
  });

  it("entries past the fifty shown stay in the store, and an Undo gives back the place its Remove freed", async () => {
    const rows = Array.from({ length: 53 }, (_, i) => entry({ ...CHROMATIC, position: i % 12, bars: 1 + Math.floor(i / 12) } as Recipe, 100 - i));
    const fake = await installSettings({ [MY_EXERCISES_KEY]: rows });
    await loadMyExercises();
    expect(myExercisesNow()).toHaveLength(MY_EXERCISES_MAX);
    expect(myExercisesStoredEntries()).toBe(53);
    const { result, removed } = await removeSecond();
    expect(result).toBe("saved");
    expect(fake.writes[0][1]).toEqual(rows.filter((_, i) => i !== 1));
    // 52 stored, 50 shown again: the Undo still puts it back, every row where it was.
    expect(await undo(removed)).toBe("saved");
    expect(fake.writes[1][1]).toEqual(rows);
    expect(myExercisesNow()).toHaveLength(MY_EXERCISES_MAX);
  });

  it("an Add since the Remove filled the list: the Undo is refused as full and nothing is written", async () => {
    const rows = Array.from({ length: MY_EXERCISES_MAX }, (_, i) => entry({ ...CHROMATIC, position: i % 12, bars: 1 + Math.floor(i / 12) } as Recipe, 100 - i));
    const fake = await installSettings({ [MY_EXERCISES_KEY]: rows });
    await loadMyExercises();
    const { removed } = await removeSecond();
    expect(await updateMyExercises((list) => [entry(MOCK_17, 500), ...list])).toBe("saved");
    expect(restoreMyExercise(myExercisesNow(), removed, keyOf, myExercisesStoredEntries()).refused).toBe("full");
    expect(await undo(removed)).toBe("unchanged");
    expect(fake.writes).toHaveLength(2);
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

  /** `count` Sessions of nothing but My exercises, an hour apart yesterday, newer than any pack Take here. */
  const customSessions = (count: number) =>
    Array.from({ length: count }, (_u, i) => {
      const at = NOW - DAY + 1000 + i * 3_600_000;
      return take(id, { pathId: CUSTOM_PATH_ID, stepId: CUSTOM_STEP_ID, bpm: 100, startedAt: at, facts: { verdict: "belowBar", session: at - 1 } });
    }).reverse();

  it("Today's plan otherwise ignores them: the warm-up it picks and the 'your turn' cadence read Path Sessions only", () => {
    const many: PlayerProgress = progress({
      states: [state(), state({ pathId: SWEEP.id })],
      takes: [1, 2, 3, 4, 5, 6].map((n) =>
        passed(ALT.steps[0].exercises[0].id, 60, 0.87, (2 + n) * DAY),
      ),
    });
    for (const minutes of [10, 15, 20] as const) {
      const base = planSession({ minutes, now: NOW, paths: [ALT, SWEEP], progress: many });
      for (let k = 1; k <= 6; k += 1) {
        const plan = planSession({
          minutes,
          now: NOW,
          paths: [ALT, SWEEP],
          progress: { ...many, takes: [...customSessions(k), ...many.takes] },
        });
        expect(plan.steps).toEqual(base.steps);
      }
    }
  });

  it("the days away count them: a custom Session yesterday is not a break", () => {
    const old: PlayerProgress = progress({
      states: [state(), state({ pathId: SWEEP.id })],
      takes: [passed(ALT.steps[0].exercises[0].id, 60, 0.87, 12 * DAY)],
    });
    expect(planSession({ minutes: 15, now: NOW, paths: [ALT, SWEEP], progress: old }).mood).toBe("back");
    const after = planSession({ minutes: 15, now: NOW, paths: [ALT, SWEEP], progress: { ...old, takes: [...customSessions(1), ...old.takes] } });
    expect(after.mood).toBe("returning");
    expect(after.daysAway).toBeLessThanOrEqual(1);
  });

  it("minutes, Sessions and the streak count them: it is practice", () => {
    const without = totalsFrom(packOnly.takes, [ALT, SWEEP], NOW);
    const withThem = totalsFrom(withMine.takes, [ALT, SWEEP], NOW);
    expect(withThem.sessions).toBe(without.sessions + 1);
    expect(withThem.seconds).toBeGreaterThan(without.seconds);
    // Yesterday's custom Session joins the day before's Path Session: a streak of two.
    expect(without.streak).toBe(0);
    expect(withThem.streak).toBe(2);
  });

  it("the tendencies' reader can leave them out with one test", () => {
    // c4a1's tendencies read the Takes; `isCustomTake` is what keeps these out.
    expect(withMine.takes.filter((t) => !isCustomTake(t))).toEqual(packOnly.takes);
  });
});
