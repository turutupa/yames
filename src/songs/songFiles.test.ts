// One row per FILE, and the migration that gets an existing library there.
//
// The fixture is the owner's Mac library on 2026-09-21: he imported one tab
// and the sidebar showed two rows, because W29 files the second part of a
// file as its own record named `<song> · <part>`. The records stay — the
// attempts, the takes and the promises hang off them — and the LIST becomes
// one row.
import { describe, expect, it } from "vitest";
import { importSong, songId } from "./import";
import { newSongRecord } from "./library";
import type { SongRecord } from "./library";
import {
  fileKeyOf,
  fileKeyOfRecord,
  fileOf,
  groupByFile,
  matchesQuery,
  migrateSongNames,
  nameWithoutPart,
  partToOpen,
} from "./songFiles";
import { GUITAR_AND_BASS, REPEAT_WITH_ENDINGS, SECTIONS, texBytes } from "./fixtures";

/** The file the owner imported: a bass part and a guitar part in one file. */
const FILE = "Two tracks.gp";

function part(trackIndex: number, name?: string): SongRecord {
  const bytes = texBytes(GUITAR_AND_BASS);
  const record = newSongRecord(importSong(bytes, FILE, trackIndex).score, bytes);
  return name ? { ...record, name } : record;
}

/**
 * His library: one file, two part records, the second named `<song> · <part>`.
 *
 * Track 0 is the bass and is what he chose at import; track 1 is the guitar,
 * opened later through the stage's instrument menu, which is what made the
 * second row.
 */
function macLibrary(): SongRecord[] {
  const chosen = { ...part(0, "Two tracks"), addedAt: 1000, openedAt: 1000 };
  const second = { ...part(1, "Two tracks · Lead"), addedAt: 1000, openedAt: 2000 };
  // The library lists most recently opened first.
  return [second, chosen];
}

describe("which file a record came out of", () => {
  it("is the same for every part of one file", () => {
    const bytes = texBytes(GUITAR_AND_BASS);
    const keys = new Set([0, 1].map((t) => fileKeyOf(songId(bytes, t), t)));
    expect(keys.size).toBe(1);
  });

  it("differs between files", () => {
    const a = fileKeyOf(songId(texBytes(GUITAR_AND_BASS), 0), 0);
    const b = fileKeyOf(songId(texBytes(SECTIONS), 0), 0);
    expect(a).not.toBe(b);
  });

  it("survives a track index that is not zero or one", () => {
    // The inverse is arithmetic, not a table: it has to hold for any index a
    // real file can carry.
    const bytes = texBytes(GUITAR_AND_BASS);
    const keys = new Set([0, 3, 12, 64, 255].map((t) => fileKeyOf(songId(bytes, t), t)));
    expect(keys.size).toBe(1);
  });

  it("leaves an id it does not recognise alone", () => {
    // A row from somewhere unexpected becomes a file of its own rather than
    // joining somebody else's.
    expect(fileKeyOf("not-a-hash", 0)).toBe("not-a-hash");
  });

  it("reads the track off the record", () => {
    expect(fileKeyOfRecord(part(0))).toBe(fileKeyOfRecord(part(1)));
  });
});

describe("the migration", () => {
  it("takes the part back off the name W29 wrote", () => {
    const [second] = macLibrary();
    expect(nameWithoutPart(second)).toBe("Two tracks");
  });

  it("leaves a name the player gave the song alone", () => {
    // The suffix has to be this record's OWN part. "Étude · Lead" on the bass
    // part is a name somebody typed.
    const bass = part(0, "Étude · Lead");
    expect(nameWithoutPart(bass)).toBe("Étude · Lead");
  });

  it("keeps a name that is nothing but the part", () => {
    const guitar = part(1, "· Lead");
    expect(nameWithoutPart(guitar)).toBe("· Lead");
  });

  it("turns his two rows into two records under one name", () => {
    const before = macLibrary();
    expect(before.map((r) => r.name)).toEqual(["Two tracks · Lead", "Two tracks"]);

    const after = migrateSongNames(before);
    expect(after).toHaveLength(2);
    expect(after.map((r) => r.name)).toEqual(["Two tracks", "Two tracks"]);
    // Nothing is deleted and no id moves: the attempts, takes and promises
    // hanging off each record stay where they are.
    expect(after.map((r) => r.id)).toEqual(before.map((r) => r.id));
    expect(after[0].score).toBe(before[0].score);
  });

  it("is idempotent, and says so by returning the same array", () => {
    const once = migrateSongNames(macLibrary());
    expect(migrateSongNames(once)).toBe(once);
  });
});

describe("the list", () => {
  it("shows one row for a file with two parts", () => {
    const files = groupByFile(migrateSongNames(macLibrary()));
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("Two tracks");
    expect(files[0].parts).toHaveLength(2);
  });

  it("keeps two files apart", () => {
    const other = { ...newSongRecordOf(SECTIONS), name: "Sections" };
    const files = groupByFile(migrateSongNames([...macLibrary(), other]));
    expect(files.map((f) => f.name)).toEqual(["Two tracks", "Sections"]);
  });

  it("takes the name from the part that arrived first", () => {
    const chosen = { ...part(0, "The song"), addedAt: 1000, openedAt: 1000 };
    const later = { ...part(1, "Something else"), addedAt: 5000, openedAt: 9000 };
    expect(groupByFile([later, chosen])[0].name).toBe("The song");
  });

  it("carries the artist, for the small line under the title", () => {
    // Only when the file has one: a study written for practice does not.
    expect(groupByFile([newSongRecordOf(REPEAT_WITH_ENDINGS)])[0].artist).toBe("Nobody");
    expect(groupByFile([newSongRecordOf(SECTIONS)])[0].artist).toBe("");
  });

  it("opens the part that was open last", () => {
    const files = groupByFile(macLibrary());
    // The guitar part was opened at 2000, the bass at 1000.
    expect(partToOpen(files[0])).toBe(macLibrary()[0].id);
  });

  it("falls back to the part chosen at import", () => {
    const chosen = { ...part(0, "Two tracks"), addedAt: 1000, openedAt: 1000 };
    const second = { ...part(1, "Two tracks"), addedAt: 1000, openedAt: 1000 };
    expect(partToOpen(groupByFile([chosen, second])[0])).toBe(chosen.id);
  });

  it("opens the part the coach promised to come back to", () => {
    const files = groupByFile(macLibrary());
    const bass = files[0].parts.find((p) => p.score.source.trackIndex === 0)!;
    expect(partToOpen(files[0], new Set([bass.id]))).toBe(bass.id);
  });

  it("finds the file a record belongs to", () => {
    const files = groupByFile(macLibrary());
    for (const p of files[0].parts) expect(fileOf(files, p.id)).toBe(files[0]);
    expect(fileOf(files, "nobody")).toBeNull();
    expect(fileOf(files, null)).toBeNull();
  });

  it("searches the title and the artist, not the part", () => {
    const files = groupByFile(migrateSongNames(macLibrary()));
    expect(matchesQuery(files[0], "two")).toBe(true);
    expect(matchesQuery(files[0], "")).toBe(true);
    // The part is not on the row, so it is not what the field searches.
    expect(matchesQuery(files[0], "lead")).toBe(false);
  });
});

function newSongRecordOf(tex: string): SongRecord {
  const bytes = texBytes(tex);
  return newSongRecord(importSong(bytes, "other.alphatex", 0).score, bytes);
}
