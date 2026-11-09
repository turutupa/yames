/**
 * The library on top of the practice store.
 *
 * `library.test.ts` covers the pure list functions; this covers the half that
 * talks to the store — the one-time move out of `songs.json`, and turning a
 * whole-list `save` into the rows that actually changed.
 *
 * The store is a `Map` behind spies on `ipc`, rather than the Tauri store
 * plugin: what is being tested is which calls the library makes and in what
 * order, and a fake that answers them is the only way to see that.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import * as ipc from "../ipc";
import { newSongRecord, songLibrary, type SongRecord } from "./library";
import { importSong } from "./import";
import { REPEAT_WITH_ENDINGS, SECTIONS, texBytes } from "./fixtures";

/** One `scores` row, as the store holds it. */
type Row = {
  score: SongRecord["score"];
  name?: string;
  sourceBase64?: string;
  importedAt: number;
};

const rows = new Map<string, Row>();
/** What was in `songs.json` when the app started, and whether it was moved. */
let json: SongRecord[] | undefined;
let moved = false;

function record(tex: string, name?: string, addedAt?: number): SongRecord {
  const bytes = texBytes(tex);
  const rec = newSongRecord(importSong(bytes, "fixture.alphatex", 0).score, bytes);
  return { ...rec, ...(name ? { name } : {}), ...(addedAt ? { addedAt } : {}) };
}

function summaries(): ipc.ScoreSummary[] {
  return [...rows.entries()]
    .map(([id, r]) => ({
      id,
      title: r.score.title,
      artist: r.score.artist,
      sourceFile: r.score.source.fileName,
      format: r.score.source.format,
      trackIndex: r.score.source.trackIndex,
      trackName: r.score.source.trackName,
      importedAt: r.importedAt,
      ...(r.name === undefined ? {} : { name: r.name }),
    }))
    .sort((a, b) => b.importedAt - a.importedAt);
}

let saveScore: ReturnType<typeof vi.spyOn>;
let deleteScore: ReturnType<typeof vi.spyOn>;
let saveSongs: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  rows.clear();
  json = undefined;
  moved = false;

  saveScore = vi.spyOn(ipc, "saveScore").mockImplementation(async (score, opts = {}) => {
    const existing = rows.get(score.id);
    rows.set(score.id, {
      score,
      // `undefined` says nothing about a field rather than clearing it, the
      // way `COALESCE` does on the real row.
      name: opts.name ?? existing?.name,
      sourceBase64: opts.sourceBase64 ?? existing?.sourceBase64,
      importedAt: opts.importedAt ?? Date.now(),
    });
    return score.id;
  });
  vi.spyOn(ipc, "listScores").mockImplementation(async () => summaries());
  vi.spyOn(ipc, "getScore").mockImplementation(async (id) => rows.get(id)?.score ?? null);
  vi.spyOn(ipc, "getScoreSource").mockImplementation(
    async (id) => rows.get(id)?.sourceBase64 ?? null,
  );
  deleteScore = vi.spyOn(ipc, "deleteScore").mockImplementation(async (id) => {
    rows.delete(id);
  });

  vi.spyOn(ipc, "listSongs").mockImplementation(async () => json);
  saveSongs = vi.spyOn(ipc, "saveSongs").mockImplementation(async (next) => {
    json = next;
  });
  vi.spyOn(ipc, "songsMovedToStore").mockImplementation(async () => moved);
  vi.spyOn(ipc, "markSongsMovedToStore").mockImplementation(async () => {
    moved = true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the one-time move out of songs.json", () => {
  it("takes every song across, keeps its name and its date, and empties the file", async () => {
    const mine = record(SECTIONS, "Bridge practice", 1_700_000_000_000);
    json = [mine];

    const list = await songLibrary.list();

    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Bridge practice");
    expect(list[0].addedAt).toBe(1_700_000_000_000);
    expect(list[0].score).toEqual(mine.score);
    // The bytes are the reason the tab can be drawn at all.
    expect(list[0].sourceBase64).toBe(mine.sourceBase64);
    // The file stays; only its songs are taken out.
    expect(json).toEqual([]);
    expect(moved).toBe(true);
  });

  it("runs once, however many times the library is read", async () => {
    json = [record(SECTIONS)];
    await songLibrary.list();
    const writes = saveScore.mock.calls.length;
    await songLibrary.list();
    await songLibrary.list();
    expect(saveScore.mock.calls.length).toBe(writes);
    expect(saveSongs.mock.calls.length).toBe(1);
  });

  it("records that it looked, even with nothing to move", async () => {
    json = undefined;
    expect(await songLibrary.list()).toEqual([]);
    expect(moved).toBe(true);
    // Nothing to empty, so the file is not written at all.
    expect(saveSongs).not.toHaveBeenCalled();
  });

  it("leaves songs.json alone when a song does not reach the store", async () => {
    // The failure that must not lose anything: the write throws, or the row
    // is not there afterwards. Either way the old file is still the only
    // copy, so emptying it would be the bug.
    const mine = record(SECTIONS, "Keep me");
    json = [mine];
    saveScore.mockImplementation(async () => "written-nowhere");

    await expect(songLibrary.list()).rejects.toThrow(/did not reach/);
    expect(json).toEqual([mine]);
    expect(moved).toBe(false);
  });

  it("does not read the old file again once the move has run", async () => {
    moved = true;
    json = [record(SECTIONS, "Left behind")];
    expect(await songLibrary.list()).toEqual([]);
    expect(ipc.listSongs).not.toHaveBeenCalled();
  });
});

describe("reading the library", () => {
  beforeEach(() => {
    moved = true;
  });

  it("comes back newest import first", async () => {
    const a = record(SECTIONS, "Older", 100);
    const b = record(REPEAT_WITH_ENDINGS, "Newer", 200);
    await songLibrary.save([b, a]);
    expect((await songLibrary.list()).map((r) => r.name)).toEqual(["Newer", "Older"]);
  });

  it("skips a song whose score will not come back rather than emptying the list", async () => {
    const a = record(SECTIONS, "Fine", 100);
    const b = record(REPEAT_WITH_ENDINGS, "Broken", 200);
    await songLibrary.save([b, a]);
    vi.spyOn(ipc, "getScore").mockImplementation(async (id) =>
      id === b.id ? null : (rows.get(id)?.score ?? null),
    );
    expect((await songLibrary.list()).map((r) => r.name)).toEqual(["Fine"]);
  });

  it("falls back to the song's own title when the player never renamed it", async () => {
    const a = record(REPEAT_WITH_ENDINGS, undefined, 100);
    rows.set(a.id, { score: a.score, sourceBase64: a.sourceBase64, importedAt: 100 });
    expect((await songLibrary.list())[0].name).toBe(a.score.title);
  });
});

describe("writing the library", () => {
  beforeEach(() => {
    moved = true;
  });

  it("writes a song that is new", async () => {
    const a = record(SECTIONS, "A", 100);
    await songLibrary.save([a]);
    expect(rows.get(a.id)?.name).toBe("A");
  });

  it("writes a rename, and nothing else", async () => {
    const a = record(SECTIONS, "A", 100);
    const b = record(REPEAT_WITH_ENDINGS, "B", 200);
    await songLibrary.save([a, b]);
    saveScore.mockClear();

    await songLibrary.save([{ ...a, name: "Verse loop" }, b]);
    expect(saveScore).toHaveBeenCalledTimes(1);
    expect(rows.get(a.id)?.name).toBe("Verse loop");
    expect(rows.get(b.id)?.name).toBe("B");
  });

  it("writes nothing at all when nothing changed", async () => {
    const a = record(SECTIONS, "A", 100);
    await songLibrary.save([a]);
    saveScore.mockClear();
    await songLibrary.save([a]);
    expect(saveScore).not.toHaveBeenCalled();
    expect(deleteScore).not.toHaveBeenCalled();
  });

  it("does not let two writes in flight undo each other", async () => {
    // `useSongsSession` commits the whole list on every change and does not
    // await it. A whole-file write could overlap safely because the last one
    // won; a diff cannot — both would read the library before either wrote,
    // and the second would delete the song the first had just added.
    const a = record(SECTIONS, "A", 100);
    const b = record(REPEAT_WITH_ENDINGS, "B", 200);
    await Promise.all([songLibrary.save([a]), songLibrary.save([a, b])]);
    expect(new Set(rows.keys())).toEqual(new Set([a.id, b.id]));
  });

  it("deletes the song that left the list, and only that one", async () => {
    const a = record(SECTIONS, "A", 100);
    const b = record(REPEAT_WITH_ENDINGS, "B", 200);
    await songLibrary.save([a, b]);
    deleteScore.mockClear();

    await songLibrary.save([b]);
    expect(deleteScore).toHaveBeenCalledTimes(1);
    expect(deleteScore).toHaveBeenCalledWith(a.id);
    expect([...rows.keys()]).toEqual([b.id]);
  });
});
