/**
 * "My exercises" on the Paths screen: shown only when there is one, each row its
 * line and tempo, Play starting a Session on it, Remove with an Undo, and a
 * recipe that no longer builds kept and said.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PathsView } from "./PathsView";
import type { SessionRun } from "./hooks/useSessionRun";
import { ALT, NOW } from "../../session/testKit";
import type { PlayerProgress } from "../../session/progress";
import { CUSTOM_PATH_ID, CUSTOM_STEP_ID, customExerciseId } from "../../paths/custom";
import type { Recipe } from "../../paths/custom";
import { MY_EXERCISES_KEY, resetMyExercisesForTest, updateMyExercises } from "../../session/myExercises";
import { installSettings } from "../../test/parity/store";
import { load } from "@tauri-apps/plugin-store";
import { loadMyExercisesList } from "./MyExercisesSection";
import { CHOSEN_TODAY_KEY, resetChosenTodayForTest } from "../../session/chosenToday";
import { dayKey } from "../../session/swap";

afterEach(() => {
  cleanup();
  resetMyExercisesForTest();
});

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

function fake(progress: PlayerProgress = { states: [], takes: [], ceilings: [] }, planClock = Date.now()) {
  // `todayNow`, as the runner's: the plan's clock moved to now, and now returned.
  const actions = {
    playExercise: vi.fn(),
    findEdge: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    todayNow: vi.fn(() => Date.now()),
  };
  const session = { paths: [ALT], progress, actions, planClock } as unknown as SessionRun;
  return { session, actions };
}

async function withStored(list: unknown) {
  return installSettings(list === undefined ? {} : { [MY_EXERCISES_KEY]: list });
}

describe("My exercises on the Paths screen", () => {
  it("is not shown at all when there are none", async () => {
    await withStored(undefined);
    const { session } = fake();
    render(<PathsView session={session} />);
    await act(async () => {});
    expect(screen.getByTestId("paths")).toBeInTheDocument();
    expect(screen.queryByTestId("my-exercises")).toBeNull();
  });

  it("lists each one after the Paths, with its line and its tempo", async () => {
    await withStored([
      { recipe: MOCK_17, addedAt: NOW },
      { recipe: CHROMATIC, addedAt: NOW - 1 },
    ]);
    const { session } = fake();
    render(<PathsView session={session} />);
    const rows = await screen.findAllByTestId("my-exercise");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("A minor pentatonic, the box at fret 5: up and back down. 3 bars.");
    expect(rows[0]).toHaveTextContent(/8ths · 60.+BPM/);
    expect(rows[1]).toHaveTextContent("Chromatic, one finger a fret from fret 5: up. 6 bars.");
    // After the Paths: the last section on the page.
    const sections = screen.getByTestId("paths").querySelectorAll("section");
    expect(sections[sections.length - 1]).toBe(screen.getByTestId("my-exercises"));
  });

  it("Play starts a Session on it, from a one-Step document of its own, in the player's words", async () => {
    await withStored([{ recipe: MOCK_17, addedAt: NOW }]);
    const { session, actions } = fake();
    render(<PathsView session={session} />);
    fireEvent.click(await screen.findByTestId("my-exercise-play"));
    expect(actions.playExercise).toHaveBeenCalledTimes(1);
    const [path, step, exercise] = actions.playExercise.mock.calls[0];
    expect(path.id).toBe(CUSTOM_PATH_ID);
    expect(path.title).toBe("My exercises");
    expect(step.id).toBe(CUSTOM_STEP_ID);
    expect(exercise.id).toBe(customExerciseId(MOCK_17));
    expect(exercise.title).toBe("A minor pentatonic, the box at fret 5: up and back down. 3 bars.");
    expect(exercise.howTo).toEqual(["Play it as written, with the click."]);
    expect(path.steps[0].exercises[0]).toBe(exercise);
  });

  it("says what was played on it, from Takes kept under My exercises", async () => {
    await withStored([{ recipe: MOCK_17, addedAt: NOW }]);
    const id = customExerciseId(MOCK_17);
    const { session } = fake({
      states: [],
      takes: [
        { id: "a", pathId: CUSTOM_PATH_ID, stepId: CUSTOM_STEP_ID, exerciseId: id, startedAt: NOW, bpm: 80, bars: 8, caught: true, passed: true, facts: {} },
      ],
      ceilings: [{ exerciseKey: `${CUSTOM_PATH_ID}/${id}`, cleanBpm: 80, lastPracticed: NOW }],
    });
    render(<PathsView session={session} />);
    const row = await screen.findByTestId("my-exercise");
    expect(row).toHaveTextContent(/80/);
  });

  it("Remove takes it out and keeps the list; Undo puts it back; the last one removed leaves the Undo", async () => {
    const store = await withStored([
      { recipe: MOCK_17, addedAt: NOW },
      { recipe: CHROMATIC, addedAt: NOW - 1 },
    ]);
    const { session } = fake();
    render(<PathsView session={session} />);
    const rows = await screen.findAllByTestId("my-exercise");
    fireEvent.click(within(rows[0]).getByTestId("my-exercise-remove"));
    await waitFor(() => expect(screen.getAllByTestId("my-exercise")).toHaveLength(1));
    await waitFor(() => expect(store.values.get(MY_EXERCISES_KEY)).toEqual([{ recipe: CHROMATIC, addedAt: NOW - 1 }]));
    fireEvent.click(screen.getByTestId("my-exercise-undo"));
    await waitFor(() => expect(screen.getAllByTestId("my-exercise")).toHaveLength(2));
    expect(screen.getAllByTestId("my-exercise")[0]).toHaveTextContent("A minor pentatonic");
    await waitFor(() => expect(store.values.get(MY_EXERCISES_KEY)).toHaveLength(2));
    expect(screen.queryByTestId("my-exercise-undo")).toBeNull();

    for (const row of screen.getAllByTestId("my-exercise")) fireEvent.click(within(row).getByTestId("my-exercise-remove"));
    // Two presses, one Undo: the last one removed.
    await waitFor(() => expect(screen.queryAllByTestId("my-exercise")).toHaveLength(0));
    expect(screen.getByTestId("my-exercise-undo")).toBeInTheDocument();
    expect(store.values.get(MY_EXERCISES_KEY)).toEqual([]);
  });

  it("an Undo the store refuses stays, and says why; the same notes back already: no second row", async () => {
    const store = await withStored([
      { recipe: MOCK_17, addedAt: NOW },
      { recipe: CHROMATIC, addedAt: NOW - 1 },
    ]);
    const { session } = fake();
    render(<PathsView session={session} />);
    const rows = await screen.findAllByTestId("my-exercise");
    fireEvent.click(within(rows[0]).getByTestId("my-exercise-remove"));
    await waitFor(() => expect(screen.getAllByTestId("my-exercise")).toHaveLength(1));
    // Meanwhile the same notes come back (as t2c's Add would: another object, another date).
    await act(async () => {
      await updateMyExercises((list) => [{ recipe: { ...MOCK_17, position: "root" }, addedAt: NOW + 5 }, ...list]);
    });
    fireEvent.click(screen.getByTestId("my-exercise-undo"));
    await waitFor(() => expect(screen.getByTestId("my-exercise-notice")).toHaveTextContent("already back"));
    expect(screen.getAllByTestId("my-exercise")).toHaveLength(2);
    expect(store.values.get(MY_EXERCISES_KEY)).toHaveLength(2);
    expect(screen.queryByTestId("my-exercise-undo")).toBeNull();
  });

  it("an Undo refused as full says only that, and goes: no press could bring that one back", async () => {
    const fifty = Array.from({ length: 50 }, (_, i) => ({
      recipe: { ...CHROMATIC, position: 1 + (i % 12), bars: 1 + Math.floor(i / 12) },
      addedAt: NOW - i,
    }));
    const store = await withStored(fifty);
    const { session } = fake();
    render(<PathsView session={session} />);
    const rows = await screen.findAllByTestId("my-exercise");
    fireEvent.click(within(rows[0]).getByTestId("my-exercise-remove"));
    await waitFor(() => expect(store.values.get(MY_EXERCISES_KEY)).toHaveLength(49));
    // Meanwhile one is added (t2c's Add, after a yes): the list is full again.
    await act(async () => {
      await updateMyExercises((list) => [{ recipe: MOCK_17, addedAt: NOW + 5 }, ...list]);
    });
    fireEvent.click(screen.getByTestId("my-exercise-undo"));
    await waitFor(() => expect(screen.getByTestId("my-exercise-notice")).toHaveTextContent("full (50), so Undo can't put this one back"));
    expect(screen.getByTestId("my-exercise-notice")).not.toHaveTextContent(/Remove one/);
    expect(screen.queryByTestId("my-exercise-undo")).toBeNull();
    expect(store.values.get(MY_EXERCISES_KEY)).toHaveLength(50);
  });

  it("a write that fails says nothing changed and keeps the Undo", async () => {
    const store = await withStored([
      { recipe: MOCK_17, addedAt: NOW },
      { recipe: CHROMATIC, addedAt: NOW - 1 },
    ]);
    const { session } = fake();
    render(<PathsView session={session} />);
    const rows = await screen.findAllByTestId("my-exercise");
    fireEvent.click(within(rows[0]).getByTestId("my-exercise-remove"));
    await waitFor(() => expect(screen.getAllByTestId("my-exercise")).toHaveLength(1));
    const settings = (await load("settings.json")) as unknown as { set: (k: string, v: unknown) => Promise<void> };
    settings.set = async () => {
      throw new Error("disk full");
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fireEvent.click(screen.getByTestId("my-exercise-undo"));
    await waitFor(() => expect(screen.getByTestId("my-exercise-notice")).toHaveTextContent("nothing changed"));
    expect(screen.getByTestId("my-exercise-undo")).toBeInTheDocument();
    expect(screen.getAllByTestId("my-exercise")).toHaveLength(1);
    expect(store.values.get(MY_EXERCISES_KEY)).toHaveLength(1);
    warn.mockRestore();
  });

  it("the list's chunk failing to load shows nothing, never an error to the app's root", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const Loaded = (await loadMyExercisesList<object>(() => Promise.reject(new Error("chunk")))).default;
    const { container } = render(<Loaded />);
    expect(container.innerHTML).toBe("");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("keeps a recipe that can't be built any more, says so, and lets the player remove it", async () => {
    const store = await withStored([{ recipe: { ...MOCK_17, position: 6 }, addedAt: NOW }]);
    const { session, actions } = fake();
    render(<PathsView session={session} />);
    const row = await screen.findByTestId("my-exercise");
    expect(row).toHaveAttribute("data-broken");
    expect(row).toHaveTextContent("can't be built any more");
    expect(within(row).queryByTestId("my-exercise-play")).toBeNull();
    expect(store.writes).toEqual([]);
    fireEvent.click(within(row).getByTestId("my-exercise-remove"));
    expect(actions.playExercise).not.toHaveBeenCalled();
    await waitFor(() => expect(store.values.get(MY_EXERCISES_KEY)).toEqual([]));
  });
});

describe("Add to today (t2e)", () => {
  afterEach(() => resetChosenTodayForTest());
  const today = () => dayKey(Date.now());

  it("Add to today writes today's key and nothing else; Take off today and each Undo write it back", async () => {
    const store = await withStored([
      { recipe: MOCK_17, addedAt: NOW },
      { recipe: CHROMATIC, addedAt: NOW - 1 },
    ]);
    const { session } = fake();
    render(<PathsView session={session} />);
    const rows = await screen.findAllByTestId("my-exercise");
    // Nothing written by showing the list.
    expect(store.writes).toEqual([]);
    const press = within(rows[1]).getByTestId("my-exercise-today");
    expect(press).toHaveTextContent("Add to today");
    expect(press).toHaveAccessibleName("Add Chromatic, one finger a fret from fret 5: up. 6 bars. to today's Session");
    fireEvent.click(press);
    const key = customExerciseId(CHROMATIC).replace(/^my\./, "");
    await waitFor(() => expect(store.values.get(CHOSEN_TODAY_KEY)).toEqual({ day: today(), keys: [key] }));
    expect(store.writes.map(([k]) => k)).toEqual([CHOSEN_TODAY_KEY]);
    await waitFor(() => expect(within(rows[1]).getByTestId("my-exercise-today")).toHaveTextContent("Take off today"));
    expect(within(rows[1]).getByTestId("my-exercise-in-today")).toBeInTheDocument();
    expect(within(rows[0]).queryByTestId("my-exercise-in-today")).toBeNull();
    expect(screen.getByTestId("my-exercise-notice")).toHaveTextContent("Added to today's Session");
    // Undo of the Add.
    fireEvent.click(screen.getByTestId("my-exercise-undo"));
    await waitFor(() => expect(store.values.get(CHOSEN_TODAY_KEY)).toEqual({ day: today(), keys: [] }));
    await waitFor(() => expect(within(rows[1]).getByTestId("my-exercise-today")).toHaveTextContent("Add to today"));
    // Add, Take off, Undo of the Take off: back in today.
    fireEvent.click(within(rows[1]).getByTestId("my-exercise-today"));
    await waitFor(() => expect(store.values.get(CHOSEN_TODAY_KEY)).toEqual({ day: today(), keys: [key] }));
    await waitFor(() => expect(within(rows[1]).getByTestId("my-exercise-today")).toHaveTextContent("Take off today"));
    fireEvent.click(within(rows[1]).getByTestId("my-exercise-today"));
    await waitFor(() => expect(store.values.get(CHOSEN_TODAY_KEY)).toEqual({ day: today(), keys: [] }));
    expect(screen.getByTestId("my-exercise-notice")).toHaveTextContent("Taken off today's Session");
    fireEvent.click(screen.getByTestId("my-exercise-undo"));
    await waitFor(() => expect(store.values.get(CHOSEN_TODAY_KEY)).toEqual({ day: today(), keys: [key] }));
    // The list itself was never written.
    expect(store.writes.some(([k]) => k === MY_EXERCISES_KEY)).toBe(false);
  });

  it("yesterday's choice shows as not in today, and is not written over until a press", async () => {
    const key = customExerciseId(MOCK_17).replace(/^my\./, "");
    const store = await installSettings({
      [MY_EXERCISES_KEY]: [{ recipe: MOCK_17, addedAt: NOW }],
      [CHOSEN_TODAY_KEY]: { day: "2020-01-01", keys: [key] },
    });
    const { session } = fake();
    render(<PathsView session={session} />);
    const row = await screen.findByTestId("my-exercise");
    await act(async () => {});
    expect(within(row).getByTestId("my-exercise-today")).toHaveTextContent("Add to today");
    expect(within(row).queryByTestId("my-exercise-in-today")).toBeNull();
    expect(store.writes).toEqual([]);
  });

  const BOX_E: Recipe = { v: 1, shape: "box", root: "E", scale: "minorPentatonic", position: "root", subdivision: "eighths", bars: 3, direction: "upAndBack" };
  const BOX_G: Recipe = { v: 1, shape: "box", root: "G", scale: "minorPentatonic", position: "root", subdivision: "eighths", bars: 3, direction: "upAndBack" };
  const keyOfRecipe = (r: Recipe) => customExerciseId(r).replace(/^my\./, "");
  const rowOf = (r: Recipe) =>
    screen.getAllByTestId("my-exercise").find((el) => el.getAttribute("data-id") === customExerciseId(r))!;

  it("a removed exercise's key fills no place: with three chosen and one removed, a fourth goes in (t2eb M2)", async () => {
    const store = await installSettings({
      [MY_EXERCISES_KEY]: [MOCK_17, CHROMATIC, BOX_E, BOX_G].map((recipe, i) => ({ recipe, addedAt: NOW - i })),
      [CHOSEN_TODAY_KEY]: { day: today(), keys: [MOCK_17, CHROMATIC, BOX_E].map(keyOfRecipe) },
    });
    const { session } = fake();
    render(<PathsView session={session} />);
    await screen.findAllByTestId("my-exercise");
    await waitFor(() => expect(screen.getAllByTestId("my-exercise-in-today")).toHaveLength(3));
    // Remove BOX_E: its row goes, its key stays stored (for the Remove's Undo).
    fireEvent.click(within(rowOf(BOX_E)).getByTestId("my-exercise-remove"));
    await waitFor(() => expect(screen.getAllByTestId("my-exercise")).toHaveLength(3));
    expect((store.values.get(CHOSEN_TODAY_KEY) as { keys: string[] }).keys).toContain(keyOfRecipe(BOX_E));
    expect(screen.getAllByTestId("my-exercise-in-today")).toHaveLength(2);
    // Add BOX_G: not "Today already holds 3"; it goes in, and the press drops the removed one's key.
    fireEvent.click(within(rowOf(BOX_G)).getByTestId("my-exercise-today"));
    await waitFor(() =>
      expect(store.values.get(CHOSEN_TODAY_KEY)).toEqual({ day: today(), keys: [MOCK_17, CHROMATIC, BOX_G].map(keyOfRecipe) }),
    );
    expect(screen.getByTestId("my-exercise-notice")).toHaveTextContent("Added to today's Session");
    // Now three on the list are chosen: the next press says today is full, and why.
    fireEvent.click(within(rowOf(BOX_G)).getByTestId("my-exercise-today")); // take it off
    await waitFor(() => expect((store.values.get(CHOSEN_TODAY_KEY) as { keys: string[] }).keys).toHaveLength(2));
    fireEvent.click(within(rowOf(BOX_G)).getByTestId("my-exercise-today")); // and back
    await waitFor(() => expect((store.values.get(CHOSEN_TODAY_KEY) as { keys: string[] }).keys).toHaveLength(3));
  });

  it("the limit, said with its reason, when three on the list are chosen (t2eb M3)", async () => {
    const store = await installSettings({
      [MY_EXERCISES_KEY]: [MOCK_17, CHROMATIC, BOX_E, BOX_G].map((recipe, i) => ({ recipe, addedAt: NOW - i })),
      [CHOSEN_TODAY_KEY]: { day: today(), keys: [MOCK_17, CHROMATIC, BOX_E].map(keyOfRecipe) },
    });
    const { session } = fake();
    render(<PathsView session={session} />);
    await screen.findAllByTestId("my-exercise");
    await waitFor(() => expect(screen.getAllByTestId("my-exercise-in-today")).toHaveLength(3));
    fireEvent.click(within(rowOf(BOX_G)).getByTestId("my-exercise-today"));
    await waitFor(() =>
      expect(screen.getByTestId("my-exercise-notice")).toHaveTextContent(
        "Today already holds 3 of your exercises, the most it takes: a Session plays 4 exercises at most, and one place is kept for your Paths.",
      ),
    );
    expect(store.writes).toEqual([]);
  });

  describe("across midnight: one clock, the plan's (t2eb M4, L4)", () => {
    const EVENING = new Date(2026, 10, 21, 23, 59).getTime();
    const AFTER = new Date(2026, 10, 22, 0, 1).getTime();
    let clock = EVENING;
    // Only the clock's spy: `restoreAllMocks` would also undo the store plugin's mock.
    afterEach(() => {
      if (vi.isMockFunction(Date.now)) Date.now.mockRestore();
    });

    it("the row reads the plan's day; a press at 00:01 writes the new day, and yesterday's part is gone", async () => {
      clock = EVENING;
      vi.spyOn(Date, "now").mockImplementation(() => clock);
      const store = await installSettings({
        [MY_EXERCISES_KEY]: [MOCK_17, CHROMATIC].map((recipe, i) => ({ recipe, addedAt: NOW - i })),
        [CHOSEN_TODAY_KEY]: { day: dayKey(EVENING), keys: [keyOfRecipe(MOCK_17)] },
      });
      const { session, actions } = fake(undefined, EVENING);
      const view = render(<PathsView session={session} />);
      await screen.findAllByTestId("my-exercise");
      await waitFor(() => expect(within(rowOf(MOCK_17)).getByTestId("my-exercise-in-today")).toBeInTheDocument());
      // 00:01, the plan's clock not moved yet: the row agrees with Today (both still read 23:59's day).
      clock = AFTER;
      view.rerender(<PathsView session={{ ...session, planClock: EVENING } as SessionRun} />);
      expect(within(rowOf(MOCK_17)).getByTestId("my-exercise-in-today")).toBeInTheDocument();
      // The press moves the plan's clock and writes the day it was pressed on.
      fireEvent.click(within(rowOf(CHROMATIC)).getByTestId("my-exercise-today"));
      await waitFor(() =>
        expect(store.values.get(CHOSEN_TODAY_KEY)).toEqual({ day: dayKey(AFTER), keys: [keyOfRecipe(CHROMATIC)] }),
      );
      expect(actions.todayNow).toHaveBeenCalled();
      // The runner's clock is now 00:01: the new part is in, yesterday's is not.
      view.rerender(<PathsView session={{ ...session, planClock: AFTER } as SessionRun} />);
      await waitFor(() => expect(within(rowOf(CHROMATIC)).getByTestId("my-exercise-in-today")).toBeInTheDocument());
      expect(within(rowOf(MOCK_17)).queryByTestId("my-exercise-in-today")).toBeNull();
    });

    it("a stale row's Take off does not add it on the new day", async () => {
      clock = AFTER;
      vi.spyOn(Date, "now").mockImplementation(() => clock);
      const store = await installSettings({
        [MY_EXERCISES_KEY]: [{ recipe: MOCK_17, addedAt: NOW }],
        [CHOSEN_TODAY_KEY]: { day: dayKey(EVENING), keys: [keyOfRecipe(MOCK_17)] },
      });
      const { session } = fake(undefined, EVENING);
      render(<PathsView session={session} />);
      const row = await screen.findByTestId("my-exercise");
      await waitFor(() => expect(within(row).getByTestId("my-exercise-today")).toHaveTextContent("Take off today"));
      fireEvent.click(within(row).getByTestId("my-exercise-today"));
      await act(async () => {});
      expect(store.writes).toEqual([]);
    });

    it("an Undo pressed after midnight writes nothing and goes (L4)", async () => {
      clock = EVENING;
      vi.spyOn(Date, "now").mockImplementation(() => clock);
      const store = await installSettings({
        [MY_EXERCISES_KEY]: [{ recipe: MOCK_17, addedAt: NOW }],
        [CHOSEN_TODAY_KEY]: { day: dayKey(EVENING), keys: [keyOfRecipe(MOCK_17)] },
      });
      const { session } = fake(undefined, EVENING);
      render(<PathsView session={session} />);
      const row = await screen.findByTestId("my-exercise");
      await waitFor(() => expect(within(row).getByTestId("my-exercise-today")).toHaveTextContent("Take off today"));
      fireEvent.click(within(row).getByTestId("my-exercise-today"));
      await waitFor(() => expect(store.values.get(CHOSEN_TODAY_KEY)).toEqual({ day: dayKey(EVENING), keys: [] }));
      const writes = store.writes.length;
      clock = AFTER;
      fireEvent.click(screen.getByTestId("my-exercise-undo"));
      await waitFor(() => expect(screen.queryByTestId("my-exercise-undo")).toBeNull());
      expect(store.writes).toHaveLength(writes);
    });
  });
});
