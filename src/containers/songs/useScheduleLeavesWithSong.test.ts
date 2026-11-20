/**
 * Review M7, B1: opening a song loads its schedule into the engine, and
 * nothing cleared it when the player left Songs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useScheduleLeavesWithSong } from "./useScheduleLeavesWithSong";

vi.mock("../../ipc", () => ({
  clearScoreSchedule: vi.fn(() => Promise.resolve()),
}));

const ipc = (await import("../../ipc")) as unknown as Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  ipc.clearScoreSchedule.mockClear();
});

describe("useScheduleLeavesWithSong", () => {
  it("clears the schedule when the app leaves Songs with a song open", () => {
    const view = renderHook(({ open }) => useScheduleLeavesWithSong(open), { initialProps: { open: true } });
    // another render with the song still open (another song, a new range)
    view.rerender({ open: true });
    expect(ipc.clearScoreSchedule).not.toHaveBeenCalled();
    view.unmount();
    expect(ipc.clearScoreSchedule).toHaveBeenCalledTimes(1);
  });

  it("clears it when the song is closed, and not again on unmount", () => {
    const view = renderHook(({ open }) => useScheduleLeavesWithSong(open), { initialProps: { open: true } });
    view.rerender({ open: false });
    expect(ipc.clearScoreSchedule).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(ipc.clearScoreSchedule).toHaveBeenCalledTimes(1);
  });

  it("does nothing when no song was ever open", () => {
    renderHook(() => useScheduleLeavesWithSong(false)).unmount();
    expect(ipc.clearScoreSchedule).not.toHaveBeenCalled();
  });
});
