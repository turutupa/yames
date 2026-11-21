/**
 * The coach's four stored keys: each reads anything as a valid value and never
 * throws, a stored null is "no choice", nothing is written until a writer is
 * called, and the 6.6 / 6.7 rules hold as pure functions.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const disk = new Map<string, unknown>();
const saves: Array<[string, unknown]> = [];
let failLoad: string | null = null;

vi.mock("../ipc", () => ({
  storeLoad: vi.fn(async (key: string) => {
    if (key === failLoad) throw new Error("store unreadable");
    return disk.get(key);
  }),
  storeSave: vi.fn(async (key: string, value: unknown) => {
    saves.push([key, value]);
    disk.set(key, value);
  }),
}));

import {
  CARD_QUIET_DAYS,
  cardMayShow,
  COACH_STORED_DEFAULTS,
  coachStored,
  coachStoredLoaded,
  isSuppressed,
  loadCoachStored,
  readCards,
  readGoal,
  readSuggestions,
  readSuppressed,
  resetCoachStored,
  saveCardAsked,
  saveCardDismissed,
  saveCardShown,
  saveGoal,
  saveSuggestions,
  saveSuppressed,
  saveUnsuppressed,
  subscribeCoachStored,
  SUPPRESS_DAYS,
  withCardAsked,
  withCardDismissed,
  withCardShown,
  withSuppressed,
} from "./store";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 20, 12);
const MALFORMED: unknown[] = [undefined, null, 0, 1, true, "", "nonsense", [], [1, 2], {}, { a: 1 }, NaN];

beforeEach(() => {
  disk.clear();
  saves.length = 0;
  failLoad = null;
  resetCoachStored();
});

describe("coach.suggestions", () => {
  it("reads \"asked\" as asked and everything else, null included, as the default \"on\"", () => {
    expect(readSuggestions("asked")).toBe("asked");
    expect(readSuggestions("on")).toBe("on");
    for (const raw of MALFORMED) expect(readSuggestions(raw)).toBe("on");
    expect(readSuggestions("ASKED")).toBe("on");
  });
});

describe("coach.cards", () => {
  it("reads a malformed value, or null, as no cards", () => {
    for (const raw of MALFORMED) expect(readCards(raw)).toEqual({});
  });

  it("keeps good records, drops bad ones, and keeps a kind it does not know", () => {
    const raw = {
      weekly: { lastShown: NOW, dismissed: 1, lastDismissed: NOW },
      milestone: { lastShown: null, dismissed: 0, lastDismissed: null },
      future: { lastShown: NOW },
      plateau: { lastShown: "yesterday", dismissed: 0 },
      goal: { dismissed: -1 },
      other: { dismissed: 1.5 },
      bare: 3,
    };
    expect(readCards(raw)).toEqual({
      weekly: { lastShown: NOW, dismissed: 1, lastDismissed: NOW },
      milestone: { lastShown: null, dismissed: 0, lastDismissed: null },
      future: { lastShown: NOW, dismissed: 0, lastDismissed: null },
    });
  });
});

describe("coach.goal", () => {
  it("reads a malformed value, or null, as no goal", () => {
    for (const raw of MALFORMED) expect(readGoal(raw)).toBeNull();
    expect(readGoal({ text: "   " })).toBeNull();
    expect(readGoal({ text: 42, at: NOW })).toBeNull();
    expect(readGoal({ text: "x".repeat(201), at: NOW })).toBeNull();
  });

  it("reads one sentence and its date; a missing date is null, not now", () => {
    expect(readGoal({ text: "  Play Sultans at 140  ", at: NOW })).toEqual({ text: "Play Sultans at 140", at: NOW });
    expect(readGoal({ text: "Funk", at: "monday" })).toEqual({ text: "Funk", at: null });
    expect(readGoal({ text: "x".repeat(200) })?.text).toHaveLength(200);
  });
});

describe("coach.suppressed", () => {
  it("reads a malformed value, or null, as nothing left out", () => {
    // `{ a: 1 }` is a well-formed entry (id "a", left out at 1 ms), so it is not in this list.
    for (const raw of MALFORMED.filter((r) => !(typeof r === "object" && r !== null && "a" in r))) {
      expect(readSuppressed(raw)).toEqual({});
    }
    expect(readSuppressed({ a: "x", b: null })).toEqual({});
  });

  it("keeps ids with a date and drops the rest", () => {
    expect(readSuppressed({ "lean:first:late": NOW, bad: "x", neg: -5, "": NOW })).toEqual({ "lean:first:late": NOW });
  });
});

describe("the rules of DESIGN 6.6", () => {
  const on = { suggestions: "on" as const, cards: {} };

  it("a card never shown may show", () => {
    expect(cardMayShow(on, "weekly", NOW)).toBe(true);
  });

  it("\"Only when I ask\" shows no card of any kind", () => {
    expect(cardMayShow({ suggestions: "asked", cards: {} }, "weekly", NOW)).toBe(false);
    expect(cardMayShow({ suggestions: "asked", cards: {} }, "milestone", NOW)).toBe(false);
  });

  it("a dismissed kind does not return for seven days, then may", () => {
    const cards = withCardDismissed(withCardShown({}, "weekly", NOW), "weekly", NOW);
    expect(cardMayShow({ suggestions: "on", cards }, "weekly", NOW + (CARD_QUIET_DAYS * DAY - 1))).toBe(false);
    expect(cardMayShow({ suggestions: "on", cards }, "weekly", NOW + CARD_QUIET_DAYS * DAY)).toBe(true);
    // Another kind is not held by it.
    expect(cardMayShow({ suggestions: "on", cards }, "plateau", NOW)).toBe(true);
  });

  it("after two dismissals, not until asked", () => {
    let cards = withCardDismissed({}, "plateau", NOW);
    cards = withCardDismissed(cards, "plateau", NOW + 8 * DAY);
    expect(cards.plateau.dismissed).toBe(2);
    expect(cardMayShow({ suggestions: "on", cards }, "plateau", NOW + 400 * DAY)).toBe(false);
    cards = withCardAsked(cards, "plateau");
    expect(cardMayShow({ suggestions: "on", cards }, "plateau", NOW + 400 * DAY)).toBe(true);
  });

  it("being shown does not by itself hold a kind back", () => {
    const cards = withCardShown({}, "weekly", NOW);
    expect(cards.weekly).toEqual({ lastShown: NOW, dismissed: 0, lastDismissed: null });
    expect(cardMayShow({ suggestions: "on", cards }, "weekly", NOW + 1)).toBe(true);
  });
});

describe("the rule of DESIGN 6.7: thirty days left out", () => {
  it("a line left out is out for thirty days, then may return", () => {
    const s = withSuppressed({}, "tempoEvenness:100:90", NOW);
    expect(isSuppressed(s, "tempoEvenness:100:90", NOW + SUPPRESS_DAYS * DAY - 1)).toBe(true);
    expect(isSuppressed(s, "tempoEvenness:100:90", NOW + SUPPRESS_DAYS * DAY)).toBe(false);
    expect(isSuppressed(s, "other", NOW)).toBe(false);
  });

  it("leaving a line out drops the ids whose thirty days are over", () => {
    const old = withSuppressed({}, "old", NOW - 31 * DAY);
    expect(Object.keys(withSuppressed(old, "new", NOW))).toEqual(["new"]);
  });
});

describe("the values in memory and the store", () => {
  it("before the load: the defaults, and not loaded", () => {
    expect(coachStoredLoaded()).toBe(false);
    expect(coachStored()).toEqual(COACH_STORED_DEFAULTS);
  });

  it("a player who never opened the coach: the load reads defaults and writes nothing", async () => {
    const got = await loadCoachStored();
    expect(got).toEqual({ suggestions: "on", cards: {}, goal: null, suppressed: {} });
    expect(coachStoredLoaded()).toBe(true);
    expect(saves).toEqual([]);
  });

  it("stored nulls read back as no choice, and are not rewritten", async () => {
    for (const key of ["coach.suggestions", "coach.cards", "coach.goal", "coach.suppressed"]) disk.set(key, null);
    expect(await loadCoachStored()).toEqual(COACH_STORED_DEFAULTS);
    expect(saves).toEqual([]);
  });

  it("an unreadable key is its default; the others still load", async () => {
    disk.set("coach.goal", { text: "Learn the blues", at: NOW });
    disk.set("coach.suggestions", "asked");
    failLoad = "coach.suggestions";
    const got = await loadCoachStored();
    expect(got.suggestions).toBe("on");
    expect(got.goal).toEqual({ text: "Learn the blues", at: NOW });
  });

  it("each writer writes its own key and only that", async () => {
    await loadCoachStored();
    saveSuggestions("asked");
    saveGoal("  Play in a band  ", NOW);
    saveCardShown("weekly", NOW);
    saveCardDismissed("weekly", NOW + 1);
    saveSuppressed("lean:last:late", NOW);
    await Promise.resolve();
    expect(saves.map(([key]) => key)).toEqual(["coach.suggestions", "coach.goal", "coach.cards", "coach.cards", "coach.suppressed"]);
    expect(disk.get("coach.goal")).toEqual({ text: "Play in a band", at: NOW });
    expect(disk.get("coach.cards")).toEqual({ weekly: { lastShown: NOW, dismissed: 1, lastDismissed: NOW + 1 } });
    expect(coachStored().suggestions).toBe("asked");
  });

  it("a goal that is empty or too long is not written", async () => {
    await loadCoachStored();
    expect(saveGoal("   ", NOW)).toBeNull();
    expect(saveGoal("x".repeat(201), NOW)).toBeNull();
    expect(saves).toEqual([]);
  });

  it("asking for a card with nothing to clear writes nothing; with dismissals it clears them", async () => {
    await loadCoachStored();
    saveCardAsked("weekly");
    expect(saves).toEqual([]);
    saveCardDismissed("weekly", NOW);
    saveCardAsked("weekly");
    expect(coachStored().cards.weekly).toEqual({ lastShown: null, dismissed: 0, lastDismissed: null });
  });

  it("leave out and its undo", async () => {
    await loadCoachStored();
    saveSuppressed("place:afterHeld:late", NOW);
    expect(isSuppressed(coachStored().suppressed, "place:afterHeld:late", NOW)).toBe(true);
    saveUnsuppressed("place:afterHeld:late");
    expect(coachStored().suppressed).toEqual({});
    const before = saves.length;
    saveUnsuppressed("never-left-out");
    expect(saves.length).toBe(before);
  });

  it("a press made before the load finished is not undone by the load", async () => {
    disk.set("coach.suggestions", "on");
    disk.set("coach.goal", { text: "Old goal", at: NOW - DAY });
    const loading = loadCoachStored();
    saveSuggestions("asked");
    await loading;
    expect(coachStored().suggestions).toBe("asked");
    expect(coachStored().goal?.text).toBe("Old goal");
  });

  it("listeners hear each change", async () => {
    await loadCoachStored();
    const heard = vi.fn();
    const off = subscribeCoachStored(heard);
    saveSuggestions("asked");
    off();
    saveSuggestions("on");
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
