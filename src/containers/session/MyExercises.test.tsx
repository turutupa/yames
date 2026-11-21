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
import { MY_EXERCISES_KEY, resetMyExercisesForTest } from "../../session/myExercises";
import { installSettings } from "../../test/parity/store";

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

function fake(progress: PlayerProgress = { states: [], takes: [], ceilings: [] }) {
  const actions = { playExercise: vi.fn(), findEdge: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn() };
  const session = { paths: [ALT], progress, actions } as unknown as SessionRun;
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
    expect(screen.getAllByTestId("my-exercise")).toHaveLength(1);
    await waitFor(() => expect(store.values.get(MY_EXERCISES_KEY)).toEqual([{ recipe: CHROMATIC, addedAt: NOW - 1 }]));
    fireEvent.click(screen.getByTestId("my-exercise-undo"));
    expect(screen.getAllByTestId("my-exercise")).toHaveLength(2);
    expect(screen.getAllByTestId("my-exercise")[0]).toHaveTextContent("A minor pentatonic");
    await waitFor(() => expect(store.values.get(MY_EXERCISES_KEY)).toHaveLength(2));
    expect(screen.queryByTestId("my-exercise-undo")).toBeNull();

    for (const row of screen.getAllByTestId("my-exercise")) fireEvent.click(within(row).getByTestId("my-exercise-remove"));
    // Two presses, one Undo: the last one removed.
    expect(screen.queryAllByTestId("my-exercise")).toHaveLength(0);
    expect(screen.getByTestId("my-exercise-undo")).toBeInTheDocument();
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
