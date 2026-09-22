// "Come back to this" — the promise, written down and read back.
//
// It moved off `settings.json` and onto migration three's `score_due`, so
// three things are pinned here: the store is what answers, the old key is
// moved across exactly once and never resurrects a promise that was cleared,
// and a build whose Rust half has none of the three commands goes on marking
// the library from the file it always used.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SONG_DUE_KEY,
  SONG_DUE_MOVED_KEY,
  __resetDueBackingForTests,
  SONG_DUE_TEMPO_KEY,
  clearSongDue,
  dayOf,
  listSongDue,
  promiseToComeBack,
  songDueNow,
  songsDueOn,
} from "./due";
import { mockInvoke, setInvokeResponse } from "../test/mocks";
import type { ScoreDue } from "../ipc";

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

/** The `score_due` table, in as much of SQLite as its three commands need. */
const rows = new Map<string, ScoreDue>();
const key = (d: { scoreId: string; rangeStartBar: number; rangeEndBar: number }) =>
  `${d.scoreId}|${String(d.rangeStartBar)}|${String(d.rangeEndBar)}`;

function withTheStore() {
  setInvokeResponse("save_due", (args?: Record<string, unknown>) => {
    const due = args?.due as ScoreDue;
    rows.set(key(due), due);
    return undefined;
  });
  setInvokeResponse("list_due", () =>
    [...rows.values()].sort((a, b) => a.dueDay - b.dueDay),
  );
  setInvokeResponse("clear_due", (args?: Record<string, unknown>) => {
    rows.delete(
      key({
        scoreId: args?.scoreId as string,
        rangeStartBar: args?.startBar as number,
        rangeEndBar: args?.endBar as number,
      }),
    );
    return undefined;
  });
}

/** A build whose engine has none of the three. */
function withoutTheStore() {
  const refuse = () => {
    throw new Error("no such command");
  };
  setInvokeResponse("save_due", refuse);
  setInvokeResponse("list_due", refuse);
  setInvokeResponse("clear_due", refuse);
}

beforeEach(() => {
  kept.clear();
  rows.clear();
  __resetDueBackingForTests();
  withTheStore();
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
    await promiseToComeBack({
      scoreId: "s1",
      startBar: 16,
      endBar: 23,
      dueDay: today + 3,
      reason: "rushing",
    });
    const all = await listSongDue();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      scoreId: "s1",
      startBar: 16,
      endBar: 23,
      dueDay: today + 3,
      reason: "rushing",
    });
  });

  it("goes to the store, not to settings.json", async () => {
    await promiseToComeBack({ scoreId: "s1", startBar: 0, endBar: 3, dueDay: 1 });
    expect(mockInvoke).toHaveBeenCalledWith("save_due", expect.anything());
    expect(kept.get(SONG_DUE_KEY)).toBeUndefined();
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

describe("the move off settings.json", () => {
  it("carries what the old key holds across, once", async () => {
    kept.set(SONG_DUE_KEY, [
      { scoreId: "s1", startBar: 0, endBar: 3, dueDay: 5, madeOn: 1 },
      { scoreId: "s2", startBar: 4, endBar: 7, dueDay: 9, madeOn: 1 },
    ]);

    const all = await listSongDue();
    expect(all.map((d) => d.scoreId)).toEqual(["s1", "s2"]);
    expect(kept.get(SONG_DUE_MOVED_KEY)).toBe(true);
    // The old array is left exactly where it was: a downgraded build still
    // finds its promises, and nothing here deletes a user's data.
    expect(Array.isArray(kept.get(SONG_DUE_KEY))).toBe(true);
  });

  /**
   * THE ONE FAILURE A REMINDER MUST NOT HAVE.
   *
   * Without the marker, clearing a promise and restarting would bring it
   * back out of the file it was cleared from, for ever.
   */
  it("never resurrects a promise that was cleared", async () => {
    kept.set(SONG_DUE_KEY, [{ scoreId: "s1", startBar: 0, endBar: 3, dueDay: 5, madeOn: 1 }]);
    await listSongDue();
    await clearSongDue("s1", 0, 3);
    expect(await listSongDue()).toEqual([]);

    // A new session: the file is still there, and the marker is what stops it.
    __resetDueBackingForTests();
    expect(await listSongDue()).toEqual([]);
  });

  it("moves nothing a second time", async () => {
    kept.set(SONG_DUE_KEY, [{ scoreId: "s1", startBar: 0, endBar: 3, dueDay: 5 }]);
    await listSongDue();
    mockInvoke.mockClear();
    __resetDueBackingForTests();
    await listSongDue();
    expect(mockInvoke).not.toHaveBeenCalledWith("save_due", expect.anything());
  });

  it("does not move a row that is not a row", async () => {
    kept.set(SONG_DUE_KEY, [
      { scoreId: "good", startBar: 0, endBar: 3, dueDay: 1 },
      { scoreId: "", startBar: 0, endBar: 3, dueDay: 1 },
      { startBar: 0, endBar: 3, dueDay: 1 },
      { scoreId: "half", startBar: 1.5, endBar: 3, dueDay: 1 },
      "not even an object",
      null,
    ]);
    expect((await listSongDue()).map((d) => d.scoreId)).toEqual(["good"]);
  });
});

describe("a build whose engine has none of this", () => {
  beforeEach(() => {
    withoutTheStore();
  });

  it("goes on reading and writing the file it always used", async () => {
    await promiseToComeBack({ scoreId: "s1", startBar: 0, endBar: 3, dueDay: 4 });
    expect(await listSongDue()).toHaveLength(1);
    expect(Array.isArray(kept.get(SONG_DUE_KEY))).toBe(true);
    // And nothing was marked as moved, so the move still happens on the day
    // the player upgrades.
    expect(kept.get(SONG_DUE_MOVED_KEY)).toBeUndefined();
  });

  it("still clears one", async () => {
    await promiseToComeBack({ scoreId: "s1", startBar: 0, endBar: 3, dueDay: 4 });
    await clearSongDue("s1", 0, 3);
    expect(await listSongDue()).toEqual([]);
  });

  it("answers with nothing when the key holds something that is not a list", async () => {
    kept.set(SONG_DUE_KEY, { nope: true });
    expect(await listSongDue()).toEqual([]);
  });
});

describe("what the library marks", () => {
  it("marks a song due today and one that is overdue, and nothing else", () => {
    const today = 20_000;
    const items = [
      { scoreId: "yesterday", startBar: 0, endBar: 1, dueDay: today - 1 },
      { scoreId: "today", startBar: 0, endBar: 1, dueDay: today },
      { scoreId: "later", startBar: 0, endBar: 1, dueDay: today + 2 },
    ];
    expect([...songsDueOn(items, today)].sort()).toEqual(["today", "yesterday"]);
  });
});

/**
 * And what opening that song is handed (W22 item 2).
 *
 * Pressing the marked row has to arrive at the passage that was promised,
 * repeating, at the speed the promise was made at — the same three things
 * the review's own button sets, offered a day later.
 */
describe("the passage a due song opens at", () => {
  beforeEach(() => {
    withTheStore();
  });

  it("is the one that has been waiting longest, and nothing that is not due yet", () => {
    const today = 20_000;
    const items = [
      { scoreId: "s1", startBar: 16, endBar: 19, dueDay: today - 2 },
      { scoreId: "s1", startBar: 4, endBar: 7, dueDay: today },
      { scoreId: "s1", startBar: 0, endBar: 3, dueDay: today + 3 },
      { scoreId: "s2", startBar: 8, endBar: 9, dueDay: today - 5 },
    ];
    expect(songDueNow(items, "s1", today)).toEqual(items[0]);
    // A promise for later is not an offer for today.
    expect(songDueNow(items, "s3", today)).toBeNull();
    expect(songDueNow([items[2]], "s1", today)).toBeNull();
  });

  it("comes back at the speed the promise was made at", async () => {
    await promiseToComeBack({
      scoreId: "s1",
      startBar: 4,
      endBar: 7,
      dueDay: 10,
      tempoPercent: 70,
    });
    const [waiting] = await listSongDue();
    expect(waiting.tempoPercent).toBe(70);

    // The table has no column for it, so it is beside the promise rather
    // than in it — and forgetting the promise forgets the speed with it.
    expect(kept.get(SONG_DUE_TEMPO_KEY)).toEqual({ "s1|4|7": 70 });
    await clearSongDue("s1", 4, 7);
    expect(kept.get(SONG_DUE_TEMPO_KEY)).toEqual({});
  });

  it("carries no speed when the promise was made before there was one", async () => {
    await promiseToComeBack({ scoreId: "s1", startBar: 0, endBar: 3, dueDay: 10 });
    const [waiting] = await listSongDue();
    expect(waiting.tempoPercent).toBeUndefined();
  });

  it("holds a hand-edited speed inside the range the chips offer", async () => {
    await promiseToComeBack({
      scoreId: "s1",
      startBar: 0,
      endBar: 3,
      dueDay: 10,
      tempoPercent: 70,
    });
    kept.set(SONG_DUE_TEMPO_KEY, { "s1|0|3": 4000, "s1|9|9": "fast" });
    const [waiting] = await listSongDue();
    expect(waiting.tempoPercent).toBe(100);
  });
});
