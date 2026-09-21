// The library is a list of SONGS (W35).
//
// The owner imported one tab on his Mac and got two rows, one per instrument.
// These are the four things that had to become true in the session: the list
// groups by file, the migration takes the part back off the names W29 wrote,
// a row opens the part that was open last, and renaming or removing a song
// takes every part of it.
//
// The library is injected rather than mocked — the hook takes one — and the
// records are built by the real importer out of a real fixture, so the ids
// and the grouping are the app's own arithmetic rather than a story about it.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useSongsSession } from "./useSongsSession";
import { DEFAULT_MIX_SETTING } from "../../../songs/songEngine";
import { importSong } from "../../../songs/import";
import { newSongRecord } from "../../../songs/library";
import type { SongLibrary, SongRecord } from "../../../songs/library";
import { GUITAR_AND_BASS, SECTIONS, texBytes } from "../../../songs/fixtures";

vi.mock("../../../songs/due", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../songs/due")>();
  return { ...real, listSongDue: () => Promise.resolve([]) };
});

vi.mock("./useSongEngine", () => ({
  useSongEngine: () => ({
    mixSetting: DEFAULT_MIX_SETTING,
    setGain: vi.fn(),
    setMute: vi.fn(),
    setCountInBars: vi.fn(),
    setTakes: vi.fn(),
    setStageSetting: vi.fn(),
    lanes: [],
    leftOut: [],
    loaded: null,
    engineError: null,
    dismissEngineError: vi.fn(),
  }),
}));

/** The mix a deleted song leaves behind. Counted, not performed. */
const forgotten: string[] = [];
vi.mock("../../../songs/songEngine", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../songs/songEngine")>();
  return {
    ...real,
    forgetMixSetting: (id: string) => {
      forgotten.push(id);
      return Promise.resolve();
    },
  };
});

/** The shelf is W19's and is seeded elsewhere; this is about the list. */
vi.mock("../../../songs/starter/shelf", () => ({
  seedStarterShelf: () => Promise.resolve([]),
  markStarterSeeded: () => Promise.resolve(),
  starterIds: () => Promise.resolve(new Set<string>()),
}));

vi.mock("../../../ipc", () => ({
  loadScoreSchedule: () => Promise.resolve(),
  markScoreOpened: () => Promise.resolve(),
  seekSong: () => Promise.resolve(),
}));

const FILE = "Two tracks.gp";
const BYTES = texBytes(GUITAR_AND_BASS);

function part(trackIndex: number, over: Partial<SongRecord> = {}): SongRecord {
  return { ...newSongRecord(importSong(BYTES, FILE, trackIndex).score, BYTES), ...over };
}

/** His Mac: one file, two part records, the later one named with its part. */
function macLibrary(): SongRecord[] {
  return [
    part(1, { name: "Two tracks · Lead", addedAt: 1000, openedAt: 2000 }),
    part(0, { name: "Two tracks", addedAt: 1000, openedAt: 1000 }),
  ];
}

function fakeLibrary(records: SongRecord[]) {
  const saved: SongRecord[][] = [];
  const library: SongLibrary = {
    list: () => Promise.resolve(records),
    save: (next) => {
      saved.push(next);
      return Promise.resolve();
    },
  };
  return { library, saved };
}

async function openSession(records: SongRecord[]) {
  const { library, saved } = fakeLibrary(records);
  const hook = renderHook(() => useSongsSession(library));
  await waitFor(() => expect(hook.result.current.songs.length).toBe(records.length));
  return { hook, saved };
}

beforeEach(() => {
  forgotten.length = 0;
});

describe("the list the sidebar draws", () => {
  it("shows one row for the file the owner imported", async () => {
    const { hook } = await openSession(macLibrary());
    expect(hook.result.current.songFiles).toHaveLength(1);
    expect(hook.result.current.songFiles[0].parts).toHaveLength(2);
    // Both records are still there. The takes and the promises hang off them.
    expect(hook.result.current.songs).toHaveLength(2);
  });

  it("runs the migration once, and writes it down", async () => {
    const { hook, saved } = await openSession(macLibrary());
    await waitFor(() => expect(saved.length).toBe(1));
    expect(saved[0].map((r) => r.name)).toEqual(["Two tracks", "Two tracks"]);
    expect(hook.result.current.songFiles[0].name).toBe("Two tracks");
  });

  it("writes nothing when there is nothing to migrate", async () => {
    const already = macLibrary().map((r) => ({ ...r, name: "Two tracks" }));
    const { saved } = await openSession(already);
    // A turn for a save that should not be coming.
    await act(async () => void (await new Promise((r) => setTimeout(r, 10))));
    expect(saved).toEqual([]);
  });

  it("opens the part that was open last", async () => {
    const { hook } = await openSession(macLibrary());
    const file = hook.result.current.songFiles[0];
    // The guitar part (track 1) was opened after the bass part.
    const guitar = file.parts.find((p) => p.score.source.trackIndex === 1)!;
    expect(file.openId).toBe(guitar.id);
  });

  it("remembers the part just opened, without waiting for a restart", async () => {
    const { hook } = await openSession(macLibrary());
    const bass = hook.result.current.songs.find((s) => s.score.source.trackIndex === 0)!;
    await act(async () => {
      hook.result.current.loadSong(bass.id);
    });
    expect(hook.result.current.songFiles[0].openId).toBe(bass.id);
  });
});

describe("renaming and removing a song", () => {
  it("renames every part of the file", async () => {
    const { hook } = await openSession(macLibrary());
    const key = hook.result.current.songFiles[0].key;
    await act(async () => {
      hook.result.current.renameSong(key, "Ballad in A");
    });
    expect(hook.result.current.songs.map((s) => s.name)).toEqual([
      "Ballad in A",
      "Ballad in A",
    ]);
    expect(hook.result.current.songFiles[0].name).toBe("Ballad in A");
  });

  it("removes every part of the file, and its band with it", async () => {
    const other = newSongRecordOf(SECTIONS, "o.alphatex");
    const { hook } = await openSession([...macLibrary(), other]);
    const key = hook.result.current.songFiles[0].key;
    const going = hook.result.current.songFiles[0].parts.map((p) => p.id);

    await act(async () => {
      hook.result.current.deleteSong(key);
    });

    expect(hook.result.current.songs.map((s) => s.id)).toEqual([other.id]);
    expect(hook.result.current.songFiles).toHaveLength(1);
    expect(forgotten.sort()).toEqual([...going].sort());
  });

  it("clears the stage when the song on it is the one removed", async () => {
    const { hook } = await openSession(macLibrary());
    const key = hook.result.current.songFiles[0].key;
    const bass = hook.result.current.songs.find((s) => s.score.source.trackIndex === 0)!;
    await act(async () => {
      hook.result.current.loadSong(bass.id);
    });
    expect(hook.result.current.song?.id).toBe(bass.id);

    await act(async () => {
      hook.result.current.deleteSong(key);
    });
    expect(hook.result.current.song).toBeNull();
  });
});

describe("choosing another part on the stage", () => {
  it("leaves the row where it was in the list", async () => {
    // The instrument menu is about the song you are already looking at. A
    // new record at the top of the list would carry its row to the top with
    // it, under the hand that opened the menu.
    const other = newSongRecordOf(SECTIONS, "first.alphatex");
    const { hook } = await openSession([
      { ...other, addedAt: 9000, openedAt: 9000 },
      part(0, { name: "Two tracks", addedAt: 1000, openedAt: 1000 }),
    ]);
    const bass = hook.result.current.songs[1];
    await act(async () => {
      hook.result.current.loadSong(bass.id);
    });
    await waitFor(() => expect(hook.result.current.tracks.length).toBeGreaterThan(1));

    const before = hook.result.current.songFiles.map((f) => f.key);
    await act(async () => {
      await hook.result.current.switchTrack(1);
    });
    expect(
      hook.result.current.songFiles.map((f) => f.key),
      "the row moved when the part changed",
    ).toEqual(before);
  });

  it("adds no row, renames nothing, and leaves the song selected", async () => {
    const { hook } = await openSession([part(0, { name: "Two tracks", addedAt: 1000 })]);
    const first = hook.result.current.songs[0];
    await act(async () => {
      hook.result.current.loadSong(first.id);
    });
    await waitFor(() => expect(hook.result.current.tracks.length).toBeGreaterThan(1));

    const before = hook.result.current.songFiles[0].key;
    await act(async () => {
      await hook.result.current.switchTrack(1);
    });

    const files = hook.result.current.songFiles;
    expect(files, "the sidebar grew a row when the part changed").toHaveLength(1);
    expect(files[0].key, "the row moved").toBe(before);
    expect(files[0].name, "the row was renamed after the part").toBe("Two tracks");
    // And the row is still the selected one: the part on the stage is one of
    // this file's.
    expect(files[0].parts.some((p) => p.id === hook.result.current.song?.id)).toBe(true);
  });
});

/** Another file entirely, for the tests that need two rows. */
function newSongRecordOf(tex: string, file: string): SongRecord {
  const bytes = texBytes(tex);
  return newSongRecord(importSong(bytes, file, 0).score, bytes);
}
