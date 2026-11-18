// One key, one meaning, wherever you are (acceptance 4, P1-4).
//
// C was both "Coach panel" and "Record the picture" in Jam and Songs, and the
// metronome's subdivision steppers sat on the Songs tab's loop brackets. A key
// may mean different things on different views (R records on a jam and goes
// again in a Session); it may not mean two things on the SAME view.
import { describe, expect, it } from "vitest";
import { HOTKEYS, HOTKEY_VIEWS, actionForCombo, activeIn, sameViewClashes, scopeNote } from "./hotkeys";

const DEFAULTS: Record<string, string> = Object.fromEntries(HOTKEYS.map((hk) => [hk.id, hk.key]));

describe("default keys by view", () => {
  it("no two actions that answer on the same view share a default key", () => {
    expect(sameViewClashes(DEFAULTS)).toEqual([]);
  });

  it("finds a clash when one is made", () => {
    const clash = sameViewClashes({ ...DEFAULTS, "jam-camera": "C" });
    expect(clash).toContainEqual({ view: "jam", key: "C", actions: ["toggle-coach", "jam-camera"] });
  });

  it("every key a view answers resolves to the action that answers it there", () => {
    for (const view of HOTKEY_VIEWS) {
      for (const hk of HOTKEYS) {
        if (!hk.key || !activeIn(hk, view)) continue;
        if (hk.id === "session-exit" && view !== "session") continue;
        expect(actionForCombo(DEFAULTS, hk.key, view), `${hk.key} on ${view}`).toBe(hk.id);
      }
    }
  });

  it("Record the picture is ⇧R in Jam and Songs, beside the take's R", () => {
    expect(DEFAULTS["jam-camera"]).toBe("⇧R");
    expect(DEFAULTS["songs-camera"]).toBe("⇧R");
    expect(actionForCombo(DEFAULTS, "C", "jam")).toBe("toggle-coach");
  });
});

describe("the scope a shared key's row says", () => {
  it("names the mode for a mode's own action", () => {
    expect(scopeNote("songs-loop-start", DEFAULTS)).toEqual({ kind: "in", views: ["songs"] });
    expect(scopeNote("jam-take", DEFAULTS)).toEqual({ kind: "in", views: ["jam"] });
    expect(scopeNote("session-faster", DEFAULTS)).toEqual({ kind: "in", views: ["session"] });
  });

  it("says where an app-wide action stands aside", () => {
    expect(scopeNote("sub-prev", DEFAULTS)).toEqual({ kind: "notIn", views: ["songs"] });
    expect(scopeNote("bpm-up", DEFAULTS)).toEqual({ kind: "notIn", views: ["session"] });
  });

  it("says nothing for a key that is the action's alone", () => {
    expect(scopeNote("toggle-coach", DEFAULTS)).toBeNull();
    expect(scopeNote("play", DEFAULTS)).toBeNull();
  });
});
