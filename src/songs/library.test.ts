// The library holds the score AND the bytes it came from, so the two things
// worth pinning are that the bytes survive a round trip through a JSON store
// and that re-importing a file the player already has does not leave them
// with two rows and the wrong name on one of them.
import { describe, expect, it } from "vitest";
import {
  addSong,
  decodeSource,
  deleteSong,
  encodeSource,
  newSongRecord,
  renameSong,
} from "./library";
import { importSong } from "./import";
import { REPEAT_WITH_ENDINGS, SECTIONS, texBytes } from "./fixtures";

function record(tex: string, name?: string) {
  const bytes = texBytes(tex);
  const rec = newSongRecord(importSong(bytes, "fixture.alphatex", 0).score, bytes);
  return name ? { ...rec, name } : rec;
}

describe("the source bytes", () => {
  it("come back exactly as they went in", () => {
    const bytes = texBytes(REPEAT_WITH_ENDINGS);
    expect([...decodeSource(encodeSource(bytes))]).toEqual([...bytes]);
  });

  it("survive every byte value, not just text", () => {
    // A Guitar Pro file is a zip, so the encoder meets all 256 of these.
    const bytes = new Uint8Array(256).map((_, i) => i);
    expect([...decodeSource(encodeSource(bytes))]).toEqual([...bytes]);
  });

  it("survive a file too big for one spread call", () => {
    // `String.fromCharCode(...bytes)` throws past the argument limit, which a
    // real Guitar Pro file passes comfortably. The encoder chunks for this.
    const bytes = new Uint8Array(200_000).map((_, i) => i % 256);
    const round = decodeSource(encodeSource(bytes));
    expect(round.length).toBe(bytes.length);
    expect(round[0]).toBe(0);
    expect(round[199_999]).toBe(bytes[199_999]);
  });

  it("are kept on the record, so the tab can be drawn again", () => {
    const rec = record(SECTIONS);
    expect(rec.sourceBase64.length).toBeGreaterThan(0);
    expect(new TextDecoder().decode(decodeSource(rec.sourceBase64))).toBe(SECTIONS);
  });
});

describe("adding a song", () => {
  it("puts the newest at the top", () => {
    const a = record(SECTIONS, "First");
    const b = record(REPEAT_WITH_ENDINGS, "Second");
    expect(addSong(addSong([], a), b).map((r) => r.name)).toEqual(["Second", "First"]);
  });

  it("replaces a re-import rather than making a second row", () => {
    const first = record(SECTIONS);
    const again = record(SECTIONS);
    const list = addSong(addSong([], first), again);
    expect(list).toHaveLength(1);
  });

  it("keeps the name the player gave it when they import the file again", () => {
    // The id is a hash of the bytes and the track, so this IS the same song.
    // Taking their name away because they re-imported would be a bug they
    // could not undo.
    const mine = { ...record(SECTIONS), name: "Bridge practice" };
    const again = record(SECTIONS);
    const list = addSong([mine], again);
    expect(list[0].name).toBe("Bridge practice");
    expect(list[0].addedAt).toBe(mine.addedAt);
    expect(list[0].score).toEqual(again.score);
  });
});

describe("renaming and removing", () => {
  it("renames one song and leaves the rest alone", () => {
    const list = [record(SECTIONS, "A"), record(REPEAT_WITH_ENDINGS, "B")];
    const next = renameSong(list, list[1].id, "Verse loop");
    expect(next.map((r) => r.name)).toEqual(["A", "Verse loop"]);
  });

  it("refuses a name that is only whitespace", () => {
    const list = [record(SECTIONS, "Keep me")];
    expect(renameSong(list, list[0].id, "   ")).toEqual(list);
  });

  it("trims the name it is given", () => {
    const list = [record(SECTIONS, "A")];
    expect(renameSong(list, list[0].id, "  Chorus  ")[0].name).toBe("Chorus");
  });

  it("removes the one asked for", () => {
    const list = [record(SECTIONS, "A"), record(REPEAT_WITH_ENDINGS, "B")];
    expect(deleteSong(list, list[0].id).map((r) => r.name)).toEqual(["B"]);
  });
});

describe("a new record", () => {
  it("is named after the song, and keeps the score's own id", () => {
    const rec = record(REPEAT_WITH_ENDINGS);
    expect(rec.name).toBe("Repeat and endings");
    expect(rec.id).toBe(rec.score.id);
  });
});
