// A promise that has fallen due is where the song opens (W22 item 2).
//
// `COACH_UX.md` C2 says at most a few things, each one tap to start. The tap
// is the marked row in the library, so pressing it has to arrive at the bars
// the coach promised, repeating, at the speed the promise was made at — the
// same three things the review's own button sets, offered a day later. W18
// left this as a stated gap, and until now the mark beside a song's name was
// a badge that did nothing.
//
// The library is injected rather than mocked — the hook takes one — and only
// two modules are stubbed: the engine, which talks to Rust and is not what
// this is about, and the schedule push for the same reason. `listSongDue` is
// the one function replaced inside `songs/due`; the shape of a promise and
// the real `songDueNow` are what is being tested through.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useSongsSession } from "./useSongsSession";
import { DEFAULT_MIX_SETTING } from "../../../songs/songEngine";
import type { SongDue } from "../../../songs/due";
import type { SongLibrary, SongRecord } from "../../../songs/library";
import type { SongScore } from "../../../songs/types";

/** What `listSongDue` answers with. Set per test. */
let promises: SongDue[] = [];
/** What the engine says this song was left at. */
let stored = { ...DEFAULT_MIX_SETTING };

vi.mock("../../../songs/due", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../songs/due")>();
  return { ...real, listSongDue: () => Promise.resolve(promises) };
});

vi.mock("./useSongEngine", () => ({
  useSongEngine: () => ({
    mixSetting: stored,
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

vi.mock("../../../ipc", () => ({ loadScoreSchedule: () => Promise.resolve() }));

/** Eight bars of 4/4, which is enough to promise four of them. */
const SCORE: SongScore = {
  schema: 1,
  id: "s1",
  title: "Practice piece",
  artist: "",
  source: { fileName: "p.alphatex", format: "alphatex", trackIndex: 0, trackName: "Guitar" },
  tuning: [64, 59, 55, 50, 45, 40],
  capo: 0,
  ticksPerQuarter: 960,
  tempoMap: [{ tick: 0, bpm: 96 }],
  meterMap: [{ bar: 0, numerator: 4, denominator: 4 }],
  bars: Array.from({ length: 8 }, (_, i) => ({
    index: i,
    startTick: i * 3840,
    lengthTicks: 3840,
    printedBar: i,
  })),
  notes: [],
  sections: [],
};

const RECORD: SongRecord = {
  id: "s1",
  name: "Practice piece",
  score: SCORE,
  sourceBase64: "",
  addedAt: 1,
};

const library: SongLibrary = {
  list: () => Promise.resolve([RECORD]),
  save: () => Promise.resolve(),
};

/** Days since the epoch, local — the axis a promise is written on. */
const today = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60_000) / 86_400_000);

/** Open the song the way the library row does, and wait for it to be there. */
async function openTheSong() {
  const hook = renderHook(() => useSongsSession(library));
  await waitFor(() => {
    expect(hook.result.current.songs).toHaveLength(1);
  });
  await act(async () => {
    hook.result.current.loadSong("s1");
    // One turn for the promise read to come back.
    await Promise.resolve();
  });
  return hook.result;
}

/** A turn of the event loop, for a late answer to be wrong in. */
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 10))));

describe("opening a song with something due", () => {
  beforeEach(() => {
    promises = [];
    stored = { ...DEFAULT_MIX_SETTING };
  });

  it("opens at the promised bars, repeating, at the speed it was promised at", async () => {
    // Left off on the whole song at full speed, so nothing but the promise
    // could put the stage where the assertions below expect it.
    promises = [{ scoreId: "s1", startBar: 4, endBar: 7, dueDay: today - 1, tempoPercent: 70 }];
    const result = await openTheSong();
    await settle();

    expect(result.current.selection).toEqual({ startBar: 4, endBar: 7 });
    expect(result.current.loop, "a promised passage that does not repeat").toBe(true);
    expect(result.current.tempoPercent, "opened at the wrong speed").toBe(70);
    // And the engine is told about those bars, not about the whole song.
    expect(result.current.range).toEqual({ startBar: 4, endBar: 7 });
  });

  it("leaves the song where the player left it when nothing is due yet", async () => {
    promises = [{ scoreId: "s1", startBar: 4, endBar: 7, dueDay: today + 3, tempoPercent: 70 }];
    stored = { ...DEFAULT_MIX_SETTING, selection: { startBar: 1, endBar: 2 }, loop: true };
    const result = await openTheSong();
    await settle();

    expect(result.current.selection).toEqual({ startBar: 1, endBar: 2 });
    expect(result.current.tempoPercent).toBe(100);
  });

  it("keeps the song's own speed when the promise carries none", async () => {
    promises = [{ scoreId: "s1", startBar: 2, endBar: 3, dueDay: today }];
    stored = { ...DEFAULT_MIX_SETTING, tempoPercent: 80 };
    const result = await openTheSong();
    await settle();

    expect(result.current.selection).toEqual({ startBar: 2, endBar: 3 });
    expect(result.current.loop).toBe(true);
    expect(result.current.tempoPercent).toBe(80);
  });

  it("ignores a promise about another song", async () => {
    promises = [{ scoreId: "s2", startBar: 4, endBar: 7, dueDay: today - 9, tempoPercent: 60 }];
    const result = await openTheSong();
    await settle();

    expect(result.current.selection).toBeNull();
    expect(result.current.tempoPercent).toBe(100);
  });

  it("holds a promise about bars the file no longer has inside the song", async () => {
    // A song whose file was replaced by a shorter one. The promise is stale
    // and must not become a loop over bars that are not there.
    promises = [{ scoreId: "s1", startBar: 40, endBar: 48, dueDay: today }];
    const result = await openTheSong();
    await settle();

    expect(result.current.range.startBar).toBeLessThanOrEqual(7);
    expect(result.current.range.endBar).toBeLessThanOrEqual(7);
  });
});
