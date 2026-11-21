/**
 * (Its own file since the merge with `coach`, whose `useAskHost.test.tsx`
 * mocks the context another way; leg chip1c.)
 * `useAskHost`'s two chip-Undo effects (leg chip1b, review L4), with the
 * panel and the tool functions stubbed so only the hook's own timing is
 * under test: `noteAskTake` once per Take (never per beat, never per
 * render), `noteAskUndos` when the panel opens or the screen / run moves
 * (never during a Take, never under the Settings overlay), and a loop's
 * start in a Session retiring the chip Undos whether the panel is open or
 * closed (review L2 c).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import "../../i18n";
import type { MainView } from "../main-window/MainHeader";
import type { SessionRun } from "../session/hooks/useSessionRun";
import { useAskHost, type AskHostInput } from "./useAskHost";
import { noteAskLoad, noteAskTake, noteAskUndos } from "./askTools";

const panel = vi.hoisted(() => ({ open: false }));

vi.mock("./askTools", async (importOriginal) => {
  const real = await importOriginal<typeof import("./askTools")>();
  return {
    ...real,
    noteAskTake: vi.fn(),
    noteAskUndos: vi.fn(),
    noteAskLoad: vi.fn(),
    noteAskToolView: vi.fn(),
    registerAskToolContext: () => () => {},
  };
});

vi.mock("./useCoachPanel", async (importOriginal) => {
  const real = await importOriginal<typeof import("./useCoachPanel")>();
  return { ...real, useCoachPanel: () => ({ open: panel.open, deferred: false }), useAskSessionRules: () => {} };
});

vi.mock("../../coach/context", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../coach/context")>();
  return { ...real, buildCoachContext: () => ({}), contextForModel: () => "" };
});

vi.mock("./askContext", async (importOriginal) => {
  const real = await importOriginal<typeof import("./askContext")>();
  return { ...real, askScreenKey: () => "k", lookingAtParts: () => [], askModelContext: () => "" };
});

/** A fresh object every call, as `MainWindow`'s per-beat render hands the hook. */
function input(view: MainView, phase: string, now = 0): AskHostInput {
  const session = {
    run: { phase, stepIndex: 0, outcomes: [], paused: false, ended: false, now },
    exercise: { id: "ex" },
    actions: { togglePause: () => {} },
  } as unknown as SessionRun;
  return { view, session, listening: false, isPlaying: phase === "playing", jam: null, song: null };
}

beforeEach(() => {
  panel.open = false;
  vi.mocked(noteAskTake).mockClear();
  vi.mocked(noteAskUndos).mockClear();
  vi.mocked(noteAskLoad).mockClear();
});

describe("useAskHost's chip-Undo effects", () => {
  it("noteAskTake runs once per Take: not per beat, not per render, not again while the Take listens", () => {
    const { rerender } = renderHook((p: AskHostInput) => useAskHost(p), { initialProps: input("session", "ready") });
    for (let i = 0; i < 5; i++) rerender(input("session", "ready", i));
    expect(noteAskTake).not.toHaveBeenCalled();
    for (let beat = 0; beat < 40; beat++) rerender(input("session", "playing", beat));
    expect(noteAskTake).toHaveBeenCalledTimes(1);
    for (let beat = 0; beat < 5; beat++) rerender(input("session", "listening", beat));
    rerender(input("session", "result"));
    expect(noteAskTake).toHaveBeenCalledTimes(1);
    rerender(input("session", "playing"));
    expect(noteAskTake).toHaveBeenCalledTimes(2);
  });

  it("noteAskUndos: when the panel opens and when the run moves, never per render, never during a Take, never under Settings", () => {
    const { rerender } = renderHook((p: AskHostInput) => useAskHost(p), { initialProps: input("beat", "idle") });
    expect(noteAskUndos).not.toHaveBeenCalled();
    panel.open = true;
    rerender(input("beat", "idle"));
    expect(noteAskUndos).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 10; i++) rerender(input("beat", "idle", i));
    expect(noteAskUndos).toHaveBeenCalledTimes(1);
    // The Settings overlay: nothing asked.
    rerender(input("settings", "idle"));
    expect(noteAskUndos).toHaveBeenCalledTimes(1);
    rerender(input("beat", "idle"));
    expect(noteAskUndos).toHaveBeenCalledTimes(2);
    // In a Session: the ready screen asks; a Take does not, at its start or per beat.
    rerender(input("session", "ready"));
    expect(noteAskUndos).toHaveBeenCalledTimes(3);
    for (let beat = 0; beat < 20; beat++) rerender(input("session", "playing", beat));
    rerender(input("session", "listening"));
    expect(noteAskUndos).toHaveBeenCalledTimes(3);
    rerender(input("session", "result"));
    expect(noteAskUndos).toHaveBeenCalledTimes(4);
  });

  it("a loop's start in a Session retires the chip Undos, panel closed or open, once per loop", () => {
    const { rerender } = renderHook((p: AskHostInput) => useAskHost(p), { initialProps: input("session", "ready") });
    for (let beat = 0; beat < 10; beat++) rerender(input("session", "looping", beat));
    expect(noteAskLoad).toHaveBeenCalledTimes(1);
    rerender(input("session", "ready"));
    panel.open = true;
    rerender(input("session", "ready"));
    rerender(input("session", "looping"));
    expect(noteAskLoad).toHaveBeenCalledTimes(2);
  });
});
