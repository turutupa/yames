// What the importer had to say — said once, then put away (W36 item 2).
//
// It was a bordered banner above the music for the life of the song. The two
// things worth a test are the two that are easy to get wrong: the toast is
// shown the FIRST time a song is opened and not the second, and the lines are
// still reachable for ever after — a "quiet" warning that becomes an
// unreachable one is worse than the banner it replaced.
//
// How it LOOKS — one bar at the top, nothing clipped, nothing on a second row
// — is `tests/layout/songs-room.spec.ts`: happy-dom computes no geometry.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SongNotesMark, SongNotesToast, useSongNotesSeen } from "./SongNotes";
import * as notesSeen from "../../songs/notesSeen";

const LINES = ["The tempo slides in 1 bar. Yames steps it at the bar line instead."];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the list of songs whose notes have been read", () => {
  it("reads nothing at all out of an empty or broken store", () => {
    expect(notesSeen.readNotesSeen(undefined)).toEqual([]);
    expect(notesSeen.readNotesSeen("nonsense")).toEqual([]);
    expect(notesSeen.readNotesSeen([1, "a", null, "b"])).toEqual(["a", "b"]);
  });

  it("never lists a song twice", () => {
    expect(notesSeen.withSeen(["a"], "a")).toEqual(["a"]);
    expect(notesSeen.withSeen(["a"], "b")).toEqual(["a", "b"]);
  });

  it("keeps the newest two hundred and lets the rest go", () => {
    const many = Array.from({ length: 200 }, (_, i) => `s${String(i)}`);
    const after = notesSeen.withSeen(many, "new");
    expect(after).toHaveLength(200);
    expect(after[199]).toBe("new");
    expect(after[0]).toBe("s1");
  });
});

describe("the mark beside the song's name", () => {
  it("draws nothing at all when the importer had nothing to say", () => {
    const { container } = render(<SongNotesMark notes={[]} />);
    expect(container.querySelector(".songs-notes-mark")).toBeNull();
  });

  it("opens the same lines the toast said", async () => {
    const user = userEvent.setup();
    render(<SongNotesMark notes={LINES} />);
    const mark = screen.getByRole("button", { name: "Notes on this file" });
    expect(screen.queryByText(LINES[0])).toBeNull();
    await user.click(mark);
    expect(screen.getByText(LINES[0])).toBeTruthy();
    expect(mark.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("the toast, the first time a song is opened", () => {
  it("is shown for a song nobody has opened, and the song is written down", async () => {
    vi.spyOn(notesSeen, "loadNotesSeen").mockResolvedValue([]);
    const wrote = vi.spyOn(notesSeen, "saveNotesSeen").mockResolvedValue(undefined);
    const { result } = renderHook(() => useSongNotesSeen("song-1", true));
    await waitFor(() => {
      expect(result.current.showToast).toBe(true);
    });
    await waitFor(() => {
      expect(wrote).toHaveBeenCalledWith(["song-1"]);
    });
  });

  it("is not shown again for a song that has already had it", async () => {
    vi.spyOn(notesSeen, "loadNotesSeen").mockResolvedValue(["song-1"]);
    const wrote = vi.spyOn(notesSeen, "saveNotesSeen").mockResolvedValue(undefined);
    const { result } = renderHook(() => useSongNotesSeen("song-1", true));
    // Given every chance to appear: the read is a promise, so a failure here
    // would be a toast arriving a tick later rather than never.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(result.current.showToast).toBe(false);
    expect(wrote).not.toHaveBeenCalled();
  });

  it("says nothing about a song the importer had no comment on", async () => {
    const read = vi.spyOn(notesSeen, "loadNotesSeen").mockResolvedValue([]);
    const { result } = renderHook(() => useSongNotesSeen("song-2", false));
    await Promise.resolve();
    expect(result.current.showToast).toBe(false);
    expect(read, "the store was read about a song with nothing to say").not.toHaveBeenCalled();
  });

  it("goes away when it is dismissed", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<SongNotesToast notes={LINES} onDismiss={onDismiss} />);
    expect(screen.getByText(LINES[0])).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(onDismiss).toHaveBeenCalled();
  });
});
