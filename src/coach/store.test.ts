/**
 * The coach's four stored keys: each reads anything as a valid value and never
 * throws, a stored null is "no choice", nothing is written until a writer is
 * called, and the 6.6 / 6.7 rules hold as pure functions.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const disk = new Map<string, unknown>();
const saves: Array<[string, unknown]> = [];
let failLoad: string | null = null;
let failSave: string | null = null;

vi.mock("../ipc", () => ({
  storeLoad: vi.fn(async (key: string) => {
    if (key === failLoad) throw new Error("store unreadable");
    return disk.get(key);
  }),
  storeSave: vi.fn(async (key: string, value: unknown) => {
    if (key === failSave) throw new Error("store unwritable");
    saves.push([key, value]);
    disk.set(key, value);
  }),
}));

import {
  CARD_QUIET_DAYS,
  cardMayShow,
  COACH_STORED_DEFAULTS,
  coachGoalKnown,
  coachKeyStates,
  coachPressSettled,
  coachStored,
  coachStoredLoaded,
  coachStoredUnread,
  isSuppressed,
  loadCoachStored,
  readCards,
  readGoal,
  readSuggestions,
  readSuppressed,
  resetCoachStored,
  saveCardAsked,
  saveCardDismissed,
  saveGoal,
  saveSuggestions,
  saveSuppressed,
  saveUnsuppressed,
  subscribeCoachStored,
  SUPPRESS_DAYS,
  withCardAsked,
  withCardDismissed,
  withCardStopLifted,
  withSuppressed,
} from "./store";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 20, 12);
const MALFORMED: unknown[] = [undefined, null, 0, 1, true, "", "nonsense", [], [1, 2], {}, { a: 1 }, NaN];
const READ = { suggestions: "read", cards: "read", goal: "read", suppressed: "read" } as const;

beforeEach(() => {
  disk.clear();
  saves.length = 0;
  failLoad = null;
  failSave = null;
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
    for (const raw of MALFORMED) expect(readCards(raw, NOW)).toEqual({});
  });

  it("keeps good records, drops bad ones, and keeps a kind it does not know", () => {
    const raw = {
      weekly: { dismissed: 1, lastDismissed: NOW },
      milestone: { dismissed: 0, lastDismissed: null },
      future: {},
      plateau: { lastDismissed: "yesterday", dismissed: 0 },
      goal: { dismissed: -1 },
      other: { dismissed: 1.5 },
      bare: 3,
    };
    expect(readCards(raw, NOW)).toEqual({
      weekly: { dismissed: 1, lastDismissed: NOW },
      milestone: { dismissed: 0, lastDismissed: null },
      future: { dismissed: 0, lastDismissed: null },
    });
  });

  it("stores no \"last shown\": an older record's is not read back (c4a1b, M2)", () => {
    expect(readCards({ weekly: { lastShown: NOW, dismissed: 1, lastDismissed: NOW } }, NOW)).toEqual({
      weekly: { dismissed: 1, lastDismissed: NOW },
    });
  });

  it("a dismissal dated in the future reads as the moment it was read (c4a1b, L7)", () => {
    const cards = readCards({ weekly: { dismissed: 1, lastDismissed: NOW + 365 * DAY } }, NOW);
    expect(cards.weekly.lastDismissed).toBe(NOW);
    expect(cardMayShow({ suggestions: "on", cards }, "weekly", NOW + CARD_QUIET_DAYS * DAY, READ)).toBe(true);
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
      expect(readSuppressed(raw, NOW)).toEqual({});
    }
    expect(readSuppressed({ a: "x", b: null }, NOW)).toEqual({});
  });

  it("keeps ids with a date and drops the rest", () => {
    expect(readSuppressed({ "lean:first:late": NOW, bad: "x", neg: -5, "": NOW }, NOW)).toEqual({ "lean:first:late": NOW });
  });

  it("a line left out at a date in the future reads as left out when it was read (c4a1b, L7)", () => {
    const s = readSuppressed({ "lean:first:late": NOW + 365 * DAY }, NOW);
    expect(s).toEqual({ "lean:first:late": NOW });
    expect(isSuppressed(s, "lean:first:late", NOW + SUPPRESS_DAYS * DAY)).toBe(false);
  });
});

describe("the rules of DESIGN 6.6", () => {
  const on = { suggestions: "on" as const, cards: {} };

  it("a card never shown may show", () => {
    expect(cardMayShow(on, "weekly", NOW, READ)).toBe(true);
  });

  it("\"Only when I ask\" shows no card of any kind", () => {
    expect(cardMayShow({ suggestions: "asked", cards: {} }, "weekly", NOW, READ)).toBe(false);
    expect(cardMayShow({ suggestions: "asked", cards: {} }, "milestone", NOW, READ)).toBe(false);
  });

  it("a dismissed kind does not return for seven days, then may", () => {
    const cards = withCardDismissed({}, "weekly", NOW);
    expect(cardMayShow({ suggestions: "on", cards }, "weekly", NOW + (CARD_QUIET_DAYS * DAY - 1), READ)).toBe(false);
    expect(cardMayShow({ suggestions: "on", cards }, "weekly", NOW + CARD_QUIET_DAYS * DAY, READ)).toBe(true);
    // Another kind is not held by it.
    expect(cardMayShow({ suggestions: "on", cards }, "plateau", NOW, READ)).toBe(true);
  });

  it("after two dismissals, not until asked", () => {
    let cards = withCardDismissed({}, "plateau", NOW);
    cards = withCardDismissed(cards, "plateau", NOW + 8 * DAY);
    expect(cards.plateau.dismissed).toBe(2);
    expect(cardMayShow({ suggestions: "on", cards }, "plateau", NOW + 400 * DAY, READ)).toBe(false);
    cards = withCardAsked(cards, "plateau");
    expect(cardMayShow({ suggestions: "on", cards }, "plateau", NOW + 400 * DAY, READ)).toBe(true);
  });

  // Owner, 2026-11-21: On lifts "until you ask" from now, never a Hide's seven days.
  it("On (withCardStopLifted) keeps the last Hide's seven days and leaves a kind hidden once alone", () => {
    const once = withCardDismissed({}, "weekly", NOW);
    expect(withCardStopLifted(once, "weekly")).toBe(once);
    let twice = withCardDismissed({}, "plateau", NOW);
    twice = withCardDismissed(twice, "plateau", NOW + 8 * DAY);
    const lifted = withCardStopLifted(twice, "plateau");
    expect(lifted.plateau).toEqual({ dismissed: 0, lastDismissed: NOW + 8 * DAY });
    expect(cardMayShow({ suggestions: "on", cards: lifted }, "plateau", NOW + 9 * DAY, READ)).toBe(false);
    expect(cardMayShow({ suggestions: "on", cards: lifted }, "plateau", NOW + 15 * DAY, READ)).toBe(true);
  });

  // c4a1c, F1: either key may hold "Only when I ask" or two dismissals.
  it.each(["loading", "unreadable"] as const)("no card while coach.suggestions or coach.cards is %s", (state) => {
    expect(cardMayShow(on, "weekly", NOW, { ...READ, suggestions: state })).toBe(false);
    expect(cardMayShow(on, "weekly", NOW, { ...READ, cards: state })).toBe(false);
    // The two other keys do not hold a card back.
    expect(cardMayShow(on, "weekly", NOW, { ...READ, goal: state, suppressed: state })).toBe(true);
  });

  it("the states as the store has them: loading until the load, unreadable after a failed read", async () => {
    expect(coachKeyStates()).toEqual({ suggestions: "loading", cards: "loading", goal: "loading", suppressed: "loading" });
    expect(cardMayShow(coachStored(), "weekly", NOW, coachKeyStates())).toBe(false);
    failLoad = "coach.suggestions";
    await loadCoachStored();
    expect(coachKeyStates()).toEqual({ suggestions: "unreadable", cards: "read", goal: "read", suppressed: "read" });
    // The same object until something changes (a `useSyncExternalStore` snapshot).
    expect(coachKeyStates()).toBe(coachKeyStates());
    expect(cardMayShow(coachStored(), "weekly", NOW, coachKeyStates())).toBe(false);
    // Settings → Coach's row sets the whole value: now it is known.
    saveSuggestions("on");
    expect(coachKeyStates().suggestions).toBe("read");
    expect(cardMayShow(coachStored(), "weekly", NOW, coachKeyStates())).toBe(true);
  });
});

describe("the rule of DESIGN 6.7: thirty days left out", () => {
  it("a line left out is out for thirty days, then may return", () => {
    const s = withSuppressed({}, "tempoEvenness:100:90", NOW);
    expect(isSuppressed(s, "tempoEvenness:100:90", NOW + SUPPRESS_DAYS * DAY - 1)).toBe(true);
    expect(isSuppressed(s, "tempoEvenness:100:90", NOW + SUPPRESS_DAYS * DAY)).toBe(false);
    expect(isSuppressed(s, "other", NOW)).toBe(false);
  });

  // c4a2b, L6: nothing is removed that the player did not press; an expired entry is ignored when read.
  it("leaving a line out keeps the ids whose thirty days are over; they read as not left out", () => {
    const old = withSuppressed({}, "old", NOW - 31 * DAY);
    const both = withSuppressed(old, "new", NOW);
    expect(both).toEqual({ old: NOW - 31 * DAY, new: NOW });
    expect(isSuppressed(both, "old", NOW)).toBe(false);
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
    expect(saveCardDismissed("weekly", NOW + 1)).toBe("saved");
    expect(saveSuppressed("lean:last:late", NOW)).toBe("saved");
    await Promise.resolve();
    expect(saves.map(([key]) => key)).toEqual(["coach.suggestions", "coach.goal", "coach.cards", "coach.suppressed"]);
    expect(disk.get("coach.goal")).toEqual({ text: "Play in a band", at: NOW });
    expect(disk.get("coach.cards")).toEqual({ weekly: { dismissed: 1, lastDismissed: NOW + 1 } });
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
    expect(saveCardAsked("weekly")).toBe("unchanged");
    expect(saves).toEqual([]);
    saveCardDismissed("weekly", NOW);
    expect(saveCardAsked("weekly")).toBe("saved");
    expect(coachStored().cards.weekly).toEqual({ dismissed: 0, lastDismissed: null });
  });

  it("leave out and its undo", async () => {
    await loadCoachStored();
    saveSuppressed("place:afterHeld:late", NOW);
    expect(isSuppressed(coachStored().suppressed, "place:afterHeld:late", NOW)).toBe(true);
    saveUnsuppressed("place:afterHeld:late");
    expect(coachStored().suppressed).toEqual({});
    const before = saves.length;
    expect(saveUnsuppressed("never-left-out")).toBe("unchanged");
    expect(saves.length).toBe(before);
  });

  // c4a1b, M1: a map is written whole, so a press before the load must not start from `{}`.
  it("a dismissal and a leave-out before the load are replayed onto what is on disk, not over it", async () => {
    disk.set("coach.cards", { weekly: { dismissed: 2, lastDismissed: NOW - DAY } });
    disk.set("coach.suppressed", { "lean:first:late": NOW - DAY });
    expect(saveCardDismissed("plateau", NOW)).toBe("queued");
    expect(saveSuppressed("place:shift:early", NOW)).toBe("queued");
    // Shown at once, and nothing on disk replaced before the read.
    expect(coachStored().cards.plateau).toEqual({ dismissed: 1, lastDismissed: NOW });
    expect(saves).toEqual([]);
    await loadCoachStored();
    const cards = { weekly: { dismissed: 2, lastDismissed: NOW - DAY }, plateau: { dismissed: 1, lastDismissed: NOW } };
    const suppressed = { "lean:first:late": NOW - DAY, "place:shift:early": NOW };
    expect(coachStored().cards).toEqual(cards);
    expect(coachStored().suppressed).toEqual(suppressed);
    expect(disk.get("coach.cards")).toEqual(cards);
    expect(disk.get("coach.suppressed")).toEqual(suppressed);
  });

  it("an asked card before the load acts on what is on disk; an undo with no leave-out of its own before it touches nothing", async () => {
    disk.set("coach.cards", { weekly: { dismissed: 2, lastDismissed: NOW - DAY } });
    disk.set("coach.suppressed", { "lean:first:late": NOW - DAY, "lean:last:early": NOW - DAY });
    // c4a1c, F3: an entry nobody has read yet is not deleted by an Undo that never saw it.
    expect(saveUnsuppressed("lean:first:late")).toBe("unchanged");
    expect(saveCardAsked("weekly")).toBe("queued");
    await loadCoachStored();
    expect(coachStored().suppressed).toEqual({ "lean:first:late": NOW - DAY, "lean:last:early": NOW - DAY });
    expect(coachStored().cards.weekly).toEqual({ dismissed: 0, lastDismissed: null });
    expect(disk.get("coach.cards")).toEqual({ weekly: { dismissed: 0, lastDismissed: null } });
    // F7: the press on coach.cards writes coach.cards alone.
    expect(saves.map(([key]) => key)).toEqual(["coach.cards"]);
  });

  // c4a1c, F7: a press on one map key before the load leaves the other key unwritten.
  it("a press on one map key before the load writes that key and not the other", async () => {
    disk.set("coach.cards", { weekly: { dismissed: 1, lastDismissed: NOW - DAY } });
    disk.set("coach.suppressed", { "lean:first:late": NOW - DAY });
    expect(saveSuppressed("place:shift:early", NOW)).toBe("queued");
    await loadCoachStored();
    expect(saves.map(([key]) => key)).toEqual(["coach.suppressed"]);
    expect(disk.get("coach.cards")).toEqual({ weekly: { dismissed: 1, lastDismissed: NOW - DAY } });
  });

  // c4a1c, F3.
  it("a leave-out and its undo, both before the load, leave the stored entry exactly as it was", async () => {
    disk.set("coach.suppressed", { "lean:first:late": NOW - 10 * DAY });
    expect(saveSuppressed("lean:first:late", NOW)).toBe("queued");
    expect(isSuppressed(coachStored().suppressed, "lean:first:late", NOW)).toBe(true);
    expect(saveUnsuppressed("lean:first:late")).toBe("queued");
    // Back at once on screen.
    expect(coachStored().suppressed).toEqual({});
    await loadCoachStored();
    expect(coachStored().suppressed).toEqual({ "lean:first:late": NOW - 10 * DAY });
    expect(disk.get("coach.suppressed")).toEqual({ "lean:first:late": NOW - 10 * DAY });
    expect(saves).toEqual([]);
  });

  it("an undo before the load cancels only its own line's leave-out", async () => {
    disk.set("coach.suppressed", { old: NOW - DAY });
    saveSuppressed("a", NOW);
    saveSuppressed("b", NOW);
    saveUnsuppressed("a");
    expect(coachStored().suppressed).toEqual({ b: NOW });
    await loadCoachStored();
    expect(disk.get("coach.suppressed")).toEqual({ old: NOW - DAY, b: NOW });
  });

  it("a press before the load that changes nothing on what is read writes nothing", async () => {
    expect(saveCardAsked("weekly")).toBe("queued");
    await loadCoachStored();
    expect(saves).toEqual([]);
  });

  // c4a1c, F4.
  it("a caller told \"queued\" hears how it ended: saved when the key reads, not saved when it does not", async () => {
    disk.set("coach.cards", { weekly: { dismissed: 1, lastDismissed: NOW - DAY } });
    failLoad = "coach.suppressed";
    expect(saveCardDismissed("plateau", NOW)).toBe("queued");
    expect(saveSuppressed("early", NOW)).toBe("queued");
    expect(await coachPressSettled("cards")).toBe("saved");
    expect(await coachPressSettled("suppressed")).toBe("notSaved");
    expect(disk.get("coach.suppressed")).toBeUndefined();
  });

  it("a save that fails is reported as not saved", async () => {
    await loadCoachStored();
    failSave = "coach.cards";
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(saveCardDismissed("weekly", NOW)).toBe("saved");
      expect(await coachPressSettled("cards")).toBe("notSaved");
      failSave = null;
      saveCardDismissed("weekly", NOW + 1);
      expect(await coachPressSettled("cards")).toBe("saved");
    } finally {
      quiet.mockRestore();
    }
  });

  it("a map key that could not be read is never written over: refused after the load, kept in memory only before", async () => {
    disk.set("coach.suppressed", { "lean:first:late": NOW - DAY });
    failLoad = "coach.suppressed";
    expect(saveSuppressed("early", NOW)).toBe("queued");
    await loadCoachStored();
    expect(coachStoredUnread("suppressed")).toBe(true);
    expect(saveSuppressed("late", NOW)).toBe("notRead");
    expect(saves).toEqual([]);
    expect(disk.get("coach.suppressed")).toEqual({ "lean:first:late": NOW - DAY });
  });

  // c4a1b, L5.
  it("a goal that could not be read is unknown, not \"no goal\": nothing replaces it", async () => {
    disk.set("coach.goal", { text: "Learn the blues", at: NOW - DAY });
    failLoad = "coach.goal";
    await loadCoachStored();
    expect(coachStoredUnread("goal")).toBe(true);
    expect(coachGoalKnown()).toBe(false);
    expect(saveGoal("Play in a band", NOW)).toBeNull();
    expect(saves).toEqual([]);
  });

  it("before the load, the goal is not known and is not written", () => {
    expect(coachGoalKnown()).toBe(false);
    expect(saveGoal("Play in a band", NOW)).toBeNull();
    expect(saves).toEqual([]);
  });

  // c4a1b, L4.
  it("putting back the goal a new one replaced brings back its own date", async () => {
    disk.set("coach.goal", { text: "Learn the blues", at: NOW - 10 * DAY });
    await loadCoachStored();
    saveGoal("Play in a band", NOW);
    expect(saveGoal("Learn the blues", NOW + 1, { restore: true })).toEqual({ text: "Learn the blues", at: NOW - 10 * DAY });
    expect(disk.get("coach.goal")).toEqual({ text: "Learn the blues", at: NOW - 10 * DAY });
    // Any other text is dated now.
    expect(saveGoal("Join a band", NOW + 2)?.at).toBe(NOW + 2);
  });

  // c4a2b, L3: the same words typed again are a new press, dated the day they were typed.
  it("a replaced goal typed again (not an Undo) is dated now", async () => {
    disk.set("coach.goal", { text: "Blues in A", at: NOW - 17 * DAY });
    await loadCoachStored();
    saveGoal("Sweep at 90", NOW - DAY);
    expect(saveGoal("Blues in A", NOW)).toEqual({ text: "Blues in A", at: NOW });
    expect(disk.get("coach.goal")).toEqual({ text: "Blues in A", at: NOW });
  });

  // c4a1c, F2: not only the last one replaced.
  it("undo, undo: each goal comes back with its own date", async () => {
    await loadCoachStored();
    saveGoal("A", NOW + 1);
    saveGoal("B", NOW + 2);
    saveGoal("C", NOW + 3);
    expect(saveGoal("B", NOW + 4, { restore: true })).toEqual({ text: "B", at: NOW + 2 });
    expect(disk.get("coach.goal")).toEqual({ text: "B", at: NOW + 2 });
    expect(saveGoal("A", NOW + 5, { restore: true })).toEqual({ text: "A", at: NOW + 1 });
    expect(disk.get("coach.goal")).toEqual({ text: "A", at: NOW + 1 });
  });

  // c4a2b, L2: the goal and Suggestions say how their save ended, as the map keys do.
  it("a goal or a Suggestions choice that could not be saved is reported as not saved", async () => {
    await loadCoachStored();
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      failSave = "coach.goal";
      expect(saveGoal("Join a band", NOW)).not.toBeNull();
      expect(await coachPressSettled("goal")).toBe("notSaved");
      failSave = "coach.suggestions";
      saveSuggestions("asked");
      expect(await coachPressSettled("suggestions")).toBe("notSaved");
      failSave = null;
      saveGoal("Learn the blues", NOW + 1);
      saveSuggestions("on");
      expect(await coachPressSettled("goal")).toBe("saved");
      expect(await coachPressSettled("suggestions")).toBe("saved");
    } finally {
      quiet.mockRestore();
    }
  });

  // c4a1c, F6.
  it("a whole value of a shape this build does not read is unreadable, and nothing replaces it", async () => {
    disk.set("coach.suggestions", "never");
    disk.set("coach.cards", [1, 2]);
    disk.set("coach.goal", "Join a band");
    disk.set("coach.suppressed", "x");
    await loadCoachStored();
    expect(coachKeyStates()).toEqual({ suggestions: "unreadable", cards: "unreadable", goal: "unreadable", suppressed: "unreadable" });
    expect(coachGoalKnown()).toBe(false);
    expect(saveGoal("Play in a band", NOW)).toBeNull();
    expect(saveCardDismissed("weekly", NOW)).toBe("notRead");
    expect(saveSuppressed("lean:first:late", NOW)).toBe("notRead");
    expect(saves).toEqual([]);
  });

  it("a press keeps the map entries it could not read, and a kept card's unknown fields", async () => {
    const odd = { dismissed: "many" };
    disk.set("coach.cards", { weekly: { dismissed: 1, lastDismissed: NOW - DAY, colour: "red" }, later: odd });
    disk.set("coach.suppressed", { "lean:first:late": NOW - DAY, bad: "x", "": NOW - DAY });
    await loadCoachStored();
    expect(saveCardDismissed("weekly", NOW)).toBe("saved");
    expect(saveSuppressed("place:shift:early", NOW)).toBe("saved");
    expect(disk.get("coach.cards")).toEqual({ weekly: { dismissed: 2, lastDismissed: NOW, colour: "red" }, later: odd });
    expect(disk.get("coach.suppressed")).toEqual({ "lean:first:late": NOW - DAY, bad: "x", "": NOW - DAY, "place:shift:early": NOW });
    // A press on the kind it could not read writes that kind over its own fields, the press's two
    // changed; it counts from "closed" (two dismissals, c4a2b L6), which is what it was read as.
    saveCardDismissed("later", NOW);
    expect((disk.get("coach.cards") as Record<string, unknown>).later).toEqual({ dismissed: 3, lastDismissed: NOW });
  });

  // c4a2b, L6: an entry this build cannot read, inside a key it can, fails closed.
  it("a malformed entry reads as dismissed until asked / left out, and is written back as it was", async () => {
    const odd = { dismissed: "2" };
    disk.set("coach.cards", { goal: odd });
    disk.set("coach.suppressed", { x: { at: NOW - DAY, why: "later build" } });
    await loadCoachStored();
    expect(coachKeyStates()).toEqual(READ);
    expect(cardMayShow(coachStored(), "goal", NOW, coachKeyStates())).toBe(false);
    expect(isSuppressed(coachStored().suppressed, "x", NOW + 365 * DAY)).toBe(true);
    // A press on another entry writes both malformed entries back exactly.
    saveCardDismissed("weekly", NOW);
    saveSuppressed("y", NOW);
    expect(disk.get("coach.cards")).toEqual({ goal: odd, weekly: { dismissed: 1, lastDismissed: NOW } });
    expect(disk.get("coach.suppressed")).toEqual({ x: { at: NOW - DAY, why: "later build" }, y: NOW });
  });

  // c4a2b, L6: a press on line B neither deletes line A's expired entry nor rewrites a future date.
  it("a press on one line leaves every other entry on disk exactly as it was", async () => {
    const later = Date.now() + 365 * DAY;
    const stale = { "lean:first:late": Date.now() - 40 * DAY, "lean:last:early": later };
    disk.set("coach.suppressed", stale);
    disk.set("coach.cards", { weekly: { dismissed: 1, lastDismissed: later } });
    await loadCoachStored();
    const at = Date.now();
    saveSuppressed("place:shift:early", at);
    saveCardDismissed("plateau", at);
    expect(disk.get("coach.suppressed")).toEqual({ ...stale, "place:shift:early": at });
    expect(disk.get("coach.cards")).toEqual({ weekly: { dismissed: 1, lastDismissed: later }, plateau: { dismissed: 1, lastDismissed: at } });
  });

  it("a goal with fields this build does not know: one press replaces it, and its Undo puts the stored value back exactly", async () => {
    const raw = { text: "  Learn the blues ", at: "monday", mood: "keen" };
    disk.set("coach.goal", raw);
    await loadCoachStored();
    expect(coachStored().goal).toEqual({ text: "Learn the blues", at: null });
    expect(saveGoal("Join a band", NOW)).toEqual({ text: "Join a band", at: NOW });
    expect(saveGoal("Learn the blues", NOW + 1, { restore: true })).toEqual({ text: "Learn the blues", at: null });
    expect(disk.get("coach.goal")).toEqual(raw);
  });

  // c4a1b, L7.
  it("a date in the future on disk reads as now and the file is not rewritten", async () => {
    const later = Date.now() + 365 * DAY;
    disk.set("coach.suppressed", { "lean:first:late": later });
    disk.set("coach.cards", { weekly: { dismissed: 1, lastDismissed: later } });
    await loadCoachStored();
    expect(coachStored().suppressed["lean:first:late"]).toBeLessThanOrEqual(Date.now());
    expect(coachStored().cards.weekly.lastDismissed).toBeLessThanOrEqual(Date.now());
    expect(saves).toEqual([]);
    expect(disk.get("coach.suppressed")).toEqual({ "lean:first:late": later });
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
