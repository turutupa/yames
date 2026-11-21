/**
 * Choosing the due Songs passage for Today's line (c5a2, judgement call 18):
 * the one due longest ago, of a song still in the library, in printed bars.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { duePassagesOn, printedPassage, songDueLine } from "./songDue";
import { readSongDue } from "../containers/session/hooks/useSongDue";
import { getScore, listDue, listScores } from "../ipc";
import type { ScoreDue, ScoreSummary } from "../ipc";
import type { SongScore } from "../songs/types";

vi.mock("../ipc", () => ({
  listDue: vi.fn(),
  listScores: vi.fn(),
  getScore: vi.fn(),
}));

/**
 * A pickup bar, then printed bars 1 to 4 with a repeat, then 5 and 6. As
 * played (repeats unrolled), with `printedBar` from 0 as the importer writes
 * it: pickup 0, then 1 2 3 4 1 2 3 4 5 6 (printed numbers 1, 2..5, 2..5, 6, 7).
 */
const PRINTED = [0, 1, 2, 3, 4, 1, 2, 3, 4, 5, 6];
function score(id: string, title = "Song"): SongScore {
  return {
    schema: 1,
    id,
    title,
    artist: "",
    source: { fileName: "s.gp", format: "gp", trackIndex: 0, trackName: "Guitar" },
    tuning: [64, 59, 55, 50, 45, 40],
    capo: 0,
    ticksPerQuarter: 960,
    tempoMap: [{ tick: 0, bpm: 100 }],
    meterMap: [{ bar: 0, numerator: 4, denominator: 4 }],
    bars: PRINTED.map((printedBar, index) => ({ index, startTick: index * 3840, lengthTicks: 3840, printedBar })),
    notes: [],
    sections: [],
  };
}

const due = (scoreId: string, start: number, end: number, dueDay: number): ScoreDue => ({
  scoreId,
  rangeStartBar: start,
  rangeEndBar: end,
  dueDay,
});

const summary = (id: string, title: string, name?: string): ScoreSummary => ({
  id,
  title,
  artist: "",
  sourceFile: "s.gp",
  format: "gp",
  trackIndex: 0,
  trackName: "Guitar",
  importedAt: 0,
  ...(name === undefined ? {} : { name }),
});

const TODAY = 20_000;

describe("which passage", () => {
  const library = new Set(["a", "b"]);

  it("today or earlier, the one due longest ago first; tomorrow's is not due", () => {
    const rows = [due("a", 1, 2, TODAY), due("b", 3, 4, TODAY - 3), due("a", 5, 6, TODAY + 1)];
    expect(duePassagesOn(rows, library, TODAY).map((r) => [r.scoreId, r.dueDay])).toEqual([
      ["b", TODAY - 3],
      ["a", TODAY],
    ]);
  });

  it("skips a song no longer in the library", () => {
    expect(duePassagesOn([due("gone", 1, 2, TODAY - 9), due("a", 1, 2, TODAY)], library, TODAY)[0].scoreId).toBe("a");
  });

  it("is stable on a tie: the song, then its bars", () => {
    const rows = [due("b", 1, 2, TODAY), due("a", 5, 6, TODAY), due("a", 1, 2, TODAY)];
    expect(duePassagesOn(rows, library, TODAY).map((r) => `${r.scoreId}${r.rangeStartBar}`)).toEqual(["a1", "a5", "b1"]);
  });

  it("nothing from no answer", () => {
    expect(duePassagesOn(null, library, TODAY)).toEqual([]);
  });
});

describe("in printed bars, as printedBarsOf counts them", () => {
  it("a pickup bar: played 1..2 are printed 2 and 3", () => {
    expect(printedPassage(score("a"), 1, 2)).toEqual({ from: 2, to: 3 });
  });

  it("the second time through a repeat is the same printed bars", () => {
    // Played 5..8 is the repeat of printed 2..5.
    expect(printedPassage(score("a"), 5, 8)).toEqual({ from: 2, to: 5 });
  });

  it("a passage across the repeat names the lowest and highest printed bar it covers", () => {
    // Played 3..6: printed 4, 5, then back to 2, 3.
    expect(printedPassage(score("a"), 3, 6)).toEqual({ from: 2, to: 5 });
  });

  it("one bar", () => {
    expect(printedPassage(score("a"), 9, 9)).toEqual({ from: 6, to: 6 });
  });

  it("says one bar or a range", () => {
    expect(songDueLine({ song: "X", from: 6, to: 6 })).toEqual({
      key: "session.today.line.songDue.one",
      values: { bar: 6, song: "X" },
    });
    expect(songDueLine({ song: "X", from: 2, to: 5 }).key).toBe("session.today.line.songDue.range");
  });
});

describe("reading it once, from the store", () => {
  beforeEach(() => {
    vi.mocked(listDue).mockReset();
    vi.mocked(listScores).mockReset();
    vi.mocked(getScore).mockReset();
  });

  it("the passage due longest ago, with the player's name for the song", async () => {
    vi.mocked(listDue).mockResolvedValue([due("a", 5, 8, TODAY - 1), due("b", 1, 2, TODAY - 4)]);
    vi.mocked(listScores).mockResolvedValue([summary("a", "A"), summary("b", "B", "My B")]);
    vi.mocked(getScore).mockImplementation((id) => Promise.resolve(score(id, id.toUpperCase())));
    expect(await readSongDue(TODAY)).toEqual({ song: "My B", from: 2, to: 3 });
    expect(getScore).toHaveBeenCalledTimes(1);
  });

  it("a song whose score will not come back is skipped, and the next tried", async () => {
    vi.mocked(listDue).mockResolvedValue([due("a", 5, 8, TODAY - 1), due("b", 1, 2, TODAY - 4)]);
    vi.mocked(listScores).mockResolvedValue([summary("a", "A"), summary("b", "B")]);
    vi.mocked(getScore).mockImplementation((id) => Promise.resolve(id === "b" ? null : score(id, "A")));
    expect(await readSongDue(TODAY)).toEqual({ song: "A", from: 2, to: 5 });
  });

  it("nothing due today or earlier: the library is not even read", async () => {
    vi.mocked(listDue).mockResolvedValue([due("a", 1, 2, TODAY + 1)]);
    expect(await readSongDue(TODAY)).toBeNull();
    expect(listScores).not.toHaveBeenCalled();
  });

  it("a build without the store says nothing", async () => {
    vi.mocked(listDue).mockRejectedValue(new Error("unknown command"));
    expect(await readSongDue(TODAY)).toBeNull();
    vi.mocked(listDue).mockResolvedValue(null as unknown as ScoreDue[]);
    expect(await readSongDue(TODAY)).toBeNull();
  });
});
