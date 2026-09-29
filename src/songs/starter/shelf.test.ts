// Putting the shelf in the library, once and only once.
//
// The two failures this is here to stop are both things a player would
// report as "it keeps doing that": seven pieces arriving again every launch,
// and a piece they deleted coming back.
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, unknown>();

vi.mock("../../ipc", () => ({
  storeLoad: vi.fn(async (key: string) => store.get(key)),
  storeSave: vi.fn(async (key: string, value: unknown) => {
    store.set(key, value);
  }),
}));

import {
  NO_STARTER_STATE,
  STARTER_KEY,
  markStarterSeeded,
  readStarterState,
  seedStarterShelf,
  starterIds,
} from "./shelf";
import { STARTER_SHELF } from "./pieces";

beforeEach(() => store.clear());

describe("the shelf Yames ships with", () => {
  it("seeds every piece on a machine that has never seen it", async () => {
    const records = await seedStarterShelf();
    expect(records).toHaveLength(STARTER_SHELF.length);
    for (const record of records) {
      // A real score, through the real importer, with the file's own bytes
      // kept — exactly what an imported file produces.
      expect(record.id.length).toBeGreaterThan(0);
      expect(record.name.length).toBeGreaterThan(0);
      expect(record.score.bars.length).toBe(8);
      expect(record.sourceBase64.length).toBeGreaterThan(0);
    }
    // No two pieces are the same song.
    expect(new Set(records.map((r) => r.id)).size).toBe(records.length);
  });

  it("does nothing on every launch after the first", async () => {
    const first = await seedStarterShelf();
    await markStarterSeeded(first);
    expect(await seedStarterShelf()).toEqual([]);
    // ...and again, because "once" has to survive being asked repeatedly.
    expect(await seedStarterShelf()).toEqual([]);
  });

  it("remembers a piece the player deleted", async () => {
    // The flag is the memory. "Seeded" is a fact about this installation and
    // not about what the library currently holds, so deleting the blues lick
    // deletes it — it does not come back tomorrow.
    await markStarterSeeded(await seedStarterShelf());
    expect(await seedStarterShelf()).toEqual([]);
  });

  it("keeps the ids, so the library can say where a song came from", async () => {
    const records = await seedStarterShelf();
    await markStarterSeeded(records);
    const ids = await starterIds();
    expect(ids.size).toBe(records.length);
    for (const record of records) expect(ids.has(record.id)).toBe(true);
    // And a song the player imported themselves is not one of them.
    expect(ids.has("some-other-song")).toBe(false);
  });

  it("does not claim to have seeded until the flag is written", async () => {
    // The order that matters: a crash between building the records and
    // writing the flag must leave the next launch able to try again.
    await seedStarterShelf();
    expect(store.get(STARTER_KEY)).toBeUndefined();
    expect(await seedStarterShelf()).toHaveLength(STARTER_SHELF.length);
  });

  it("mistrusts what it reads back", () => {
    expect(readStarterState(undefined)).toEqual(NO_STARTER_STATE);
    // Only an explicit `true` counts as "we have looked".
    for (const junk of [{ seeded: "yes" }, { seeded: 1 }, {}, null, "seeded"]) {
      expect(readStarterState(junk).seeded, JSON.stringify(junk)).toBe(false);
    }
    expect(readStarterState({ seeded: true, ids: ["a", 4, null, "b"] }).ids).toEqual(["a", "b"]);
    expect(readStarterState({ seeded: true, ids: "a,b" }).ids).toEqual([]);
  });

  it("has no id in common with a file a player brings in", async () => {
    // The id is a hash of the bytes and the track, so this is really a check
    // that the shelf's bytes are the shelf's: a collision would mean
    // importing a real file silently replaced a starter piece.
    const records = await seedStarterShelf();
    const { importSong } = await import("../import");
    const other = importSong(
      new TextEncoder().encode(
        `\\title "Somebody's own file"\n\\tempo 120\n.\n\\track "G"\n\\tuning e5 b4 g4 d4 a3 e3\n\\ts 4 4 3.3.4 3.3.4 3.3.4 3.3.4 |`,
      ),
      "mine.alphatex",
      0,
    );
    expect(records.some((r) => r.id === other.score.id)).toBe(false);
  });
});
