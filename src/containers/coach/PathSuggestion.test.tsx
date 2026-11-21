/**
 * The Path suggestion on Paths (`PathSuggestion.tsx`, leg c4b3; review L5):
 * hidden under "Only when I ask", hidden while that setting is unread, hidden
 * during a Take; its button only opens the Path, and nothing is written by
 * showing it or by the press.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const store = vi.hoisted(() => ({
  disk: new Map<string, unknown>(),
  saves: [] as Array<[string, unknown]>,
}));

vi.mock("../../ipc", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../ipc")>();
  return {
    ...real,
    storeLoad: vi.fn(async (key: string) => store.disk.get(key)),
    storeSave: vi.fn(async (key: string, value: unknown) => {
      store.saves.push([key, value]);
      store.disk.set(key, value);
    }),
  };
});

import type { PathTakeRow } from "../../ipc";
import type { Exercise, Level, PathDoc, Step } from "../../paths/format";
import { loadCoachStored, resetCoachStored } from "../../coach/store";
import { ALT, DAY, NOW, progress, SWEEP, take } from "../../session/testKit";
import type { SessionRun } from "../session/hooks/useSessionRun";
import { PathSuggestion } from "./PathSuggestion";

const SWEEP_OPEN: PathDoc = { ...SWEEP, prerequisites: { paths: [], skills: [] } };
const base = ALT.steps[0];
const ex = (id: string): Exercise => ({ ...base.exercises[0], id, title: id, grading: "graded", tempo: { ...base.exercises[0].tempo, passAtBpm: 100 } });
const step = (id: string): Step => ({ ...base, id, title: id, exercises: [ex(`${id}a`)] });
const level: Level = { id: "beginner", title: "Beginner", summary: "", entry: "open", placement: { startHereIf: [] }, stepIds: ["s1", "s2"], warmups: [] };
const DONE: PathDoc = { ...ALT, id: "done-path", title: "Done Path", steps: [step("s1"), step("s2"), step("s3")], levels: [level] };
const clean = (exId: string, session: number): PathTakeRow =>
  take(exId, { pathId: DONE.id, bpm: 100, startedAt: NOW - (10 - session) * DAY, passed: true, facts: { verdict: "passed", newClean: true, session } });

/** The last Session finished the Beginner Level of Done Path: Sweep Picking is suggested. */
function sessionRun(phase = "idle"): SessionRun {
  const takes = [clean("s1a", 1), clean("s2a", 9)];
  const p = progress({
    takes,
    ceilings: takes.map((t) => ({ exerciseKey: `${DONE.id}/${t.exerciseId}`, cleanBpm: 100, lastPracticed: t.startedAt })),
    states: [{ pathId: DONE.id, startedAt: NOW - 30 * DAY, updatedAt: NOW - DAY }],
  });
  return { progress: p, paths: [DONE, SWEEP_OPEN], grading: "on", run: { phase } } as unknown as SessionRun;
}

async function loaded() {
  await act(async () => {
    await loadCoachStored();
  });
}

beforeEach(() => {
  store.disk.clear();
  store.saves.length = 0;
  resetCoachStored();
  vi.spyOn(Date, "now").mockReturnValue(NOW);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("PathSuggestion", () => {
  it("with Suggestions on: shown, and its button only opens the Path; nothing written", async () => {
    store.disk.set("coach.suggestions", "on");
    const onOpen = vi.fn();
    render(<PathSuggestion session={sessionRun()} onOpen={onOpen} />);
    await loaded();
    expect(screen.getByTestId("path-suggestion")).toHaveTextContent(SWEEP.title);
    fireEvent.click(screen.getByTestId("path-suggestion-open"));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][0].id).toBe(SWEEP.id);
    expect(store.saves).toEqual([]);
  });

  it("hidden while the Suggestions setting is not read yet", () => {
    store.disk.set("coach.suggestions", "on");
    render(<PathSuggestion session={sessionRun()} onOpen={() => {}} />);
    expect(screen.queryByTestId("path-suggestion")).toBeNull();
  });

  it("hidden under \"Only when I ask\"", async () => {
    store.disk.set("coach.suggestions", "asked");
    render(<PathSuggestion session={sessionRun()} onOpen={() => {}} />);
    await loaded();
    expect(screen.queryByTestId("path-suggestion")).toBeNull();
    expect(store.saves).toEqual([]);
  });

  it("hidden during a Take", async () => {
    store.disk.set("coach.suggestions", "on");
    const { rerender } = render(<PathSuggestion session={sessionRun("playing")} onOpen={() => {}} />);
    await loaded();
    expect(screen.queryByTestId("path-suggestion")).toBeNull();
    rerender(<PathSuggestion session={sessionRun("listening")} onOpen={() => {}} />);
    expect(screen.queryByTestId("path-suggestion")).toBeNull();
  });
});
