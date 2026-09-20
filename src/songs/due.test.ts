// "Come back to this" — the promise, written down and read back.
//
// Days rather than timestamps, one promise per passage, and a file a person
// can edit by hand without the library sprouting a mark for a song that does
// not exist.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SONG_DUE_KEY,
  clearSongDue,
  dayOf,
  listSongDue,
  promiseToComeBack,
  songsDueOn,
} from "./due";

/**
 * A store that remembers, over the suite-wide one that does not.
 *
 * `src/test/mocks.ts` stubs `plugin-store` with a `get` that always answers
 * `undefined`, which is right for every test that only needs the app to
 * start. This file is about what comes BACK out of the store, so it needs a
 * real map behind it, and a file-local `vi.mock` wins over the setup one.
 */
const kept = new Map<string, unknown>();
vi.mock("@tauri-apps/plugin-store", () => ({
  load: vi.fn().mockResolvedValue({
    get: vi.fn((key: string) => Promise.resolve(kept.get(key))),
    set: vi.fn((key: string, value: unknown) => {
      kept.set(key, value);
      return Promise.resolve();
    }),
    save: vi.fn().mockResolvedValue(undefined),
  }),
}));

beforeEach(() => {
  kept.clear();
});

describe("what day it is", () => {
  it("is a whole number of days on the player's own calendar", () => {
    const morning = dayOf(new Date(2026, 8, 20, 9, 0));
    const evening = dayOf(new Date(2026, 8, 20, 23, 30));
    const tomorrow = dayOf(new Date(2026, 8, 21, 0, 30));
    expect(morning).toBe(evening);
    expect(tomorrow).toBe(morning + 1);
  });
});

describe("making a promise", () => {
  it("writes one down and reads it back", async () => {
    const today = dayOf();
    await promiseToComeBack({ scoreId: "s1", startBar: 16, endBar: 23, dueDay: today + 3 });
    const all = await listSongDue();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ scoreId: "s1", startBar: 16, endBar: 23, dueDay: today + 3 });
    expect(all[0].madeOn).toBe(today);
  });

  it("moves the date rather than growing a list nobody asked for", async () => {
    const today = dayOf();
    await promiseToComeBack({ scoreId: "s1", startBar: 16, endBar: 23, dueDay: today + 3 });
    await promiseToComeBack({ scoreId: "s1", startBar: 16, endBar: 23, dueDay: today + 1 });
    const all = await listSongDue();
    expect(all).toHaveLength(1);
    expect(all[0].dueDay).toBe(today + 1);
  });

  it("keeps two different passages of the same song apart", async () => {
    const today = dayOf();
    await promiseToComeBack({ scoreId: "s1", startBar: 16, endBar: 23, dueDay: today + 1 });
    await promiseToComeBack({ scoreId: "s1", startBar: 0, endBar: 7, dueDay: today + 2 });
    expect(await listSongDue()).toHaveLength(2);
  });

  it("forgets one when it is played or dropped", async () => {
    const today = dayOf();
    await promiseToComeBack({ scoreId: "s1", startBar: 16, endBar: 23, dueDay: today + 1 });
    await clearSongDue("s1", 16, 23);
    expect(await listSongDue()).toEqual([]);
  });
});

describe("what the library marks", () => {
  it("marks a song due today and one that is overdue, and nothing else", () => {
    const today = 20_000;
    const items = [
      { scoreId: "yesterday", startBar: 0, endBar: 1, dueDay: today - 1, madeOn: today - 3 },
      { scoreId: "today", startBar: 0, endBar: 1, dueDay: today, madeOn: today - 1 },
      { scoreId: "later", startBar: 0, endBar: 1, dueDay: today + 2, madeOn: today },
    ];
    expect([...songsDueOn(items, today)].sort()).toEqual(["today", "yesterday"]);
  });
});

describe("a file a person can edit", () => {
  it("drops a row that is not a row rather than marking a song nobody promised", async () => {
    kept.set(SONG_DUE_KEY, [
      { scoreId: "good", startBar: 0, endBar: 3, dueDay: 1, madeOn: 0 },
      { scoreId: "", startBar: 0, endBar: 3, dueDay: 1, madeOn: 0 },
      { startBar: 0, endBar: 3, dueDay: 1, madeOn: 0 },
      { scoreId: "half", startBar: 1.5, endBar: 3, dueDay: 1, madeOn: 0 },
      "not even an object",
      null,
    ]);
    const all = await listSongDue();
    expect(all.map((d) => d.scoreId)).toEqual(["good"]);
  });

  it("answers with nothing when the key holds something that is not a list", async () => {
    kept.set(SONG_DUE_KEY, { nope: true });
    expect(await listSongDue()).toEqual([]);
  });
});
