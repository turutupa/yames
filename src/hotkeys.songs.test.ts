// Every key on the Songs screen, asked whether it reaches anything.
//
// The owner, 2026-09-21: *"space not working for play pause is by far the most
// annoying thing ever"*. That one was the dispatcher having no branch for the
// Songs tab, and it was fixed on `songs-v1` while W34's brief was being
// written. The brief's remaining job was to check every OTHER key the same
// way — and two of them were broken in a way nobody would ever have found by
// reading the table:
//
//   ⇧[ and ⇧]  nudge a portion a bar earlier or later, and could not be
//              pressed. `eventToCombo` builds the combo out of `event.key`,
//              and the browser reports `{` for Shift and the bracket — so the
//              combo was `⇧{`, which is bound to nothing. Two hotkeys in the
//              settings list that did not exist.
//
// So this asks the question of a real KeyboardEvent, for every key the Songs
// tab binds: press it, build the combo the window builds, look the action up
// the way the window looks it up, and check the answer is the action the
// settings list promises.
import { describe, expect, it } from "vitest";
import { HOTKEYS, actionForCombo, eventToCombo, isTypingTarget } from "./hotkeys";

/** The bindings as they ship — what `useKeybindings` starts with. */
const DEFAULTS: Record<string, string> = Object.fromEntries(
  HOTKEYS.map((hk) => [hk.id, hk.key]),
);

/**
 * A key press, the way a browser reports one.
 *
 * `code` as well as `key`, because the browser sends both and the shifted
 * punctuation can only be read with both. happy-dom's `KeyboardEvent` takes
 * them straight.
 */
function press(key: string, over: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  return new KeyboardEvent("keydown", { key, ...over });
}

/** What the window would do with that press on a given tab. */
function actionOf(event: KeyboardEvent, view: string): string | undefined {
  if (isTypingTarget(event.target)) return undefined;
  const combo = eventToCombo(event);
  return combo ? actionForCombo(DEFAULTS, combo, view) : undefined;
}

describe("the keys the Songs tab binds", () => {
  /**
   * Every one of them, by its shipped key, with the tab open. The table is
   * the source: a key added to `hotkeys.ts` under the songs group and never
   * wired up fails here rather than in somebody's practice session.
   */
  const songsKeys = HOTKEYS.filter((hk) => hk.id.startsWith("songs-"));

  it("has some", () => {
    expect(songsKeys.length).toBeGreaterThanOrEqual(8);
  });

  for (const hk of songsKeys) {
    it(`reaches ${hk.id} when ${hk.key} is pressed on the Songs tab`, () => {
      const shift = hk.key.startsWith("⇧");
      const plain = shift ? hk.key.slice(1) : hk.key;
      // The physical key and the character the browser reports for it — which
      // are not the same thing once Shift is held.
      const SHIFTED: Record<string, { key: string; code: string }> = {
        "[": { key: "{", code: "BracketLeft" },
        "]": { key: "}", code: "BracketRight" },
        "\\": { key: "|", code: "Backslash" },
      };
      const asTyped = shift ? (SHIFTED[plain]?.key ?? plain) : plain;
      const code = shift ? SHIFTED[plain]?.code : undefined;
      const event = press(asTyped, { shiftKey: shift, ...(code ? { code } : {}) });
      expect(
        actionOf(event, "songs"),
        `${hk.key} reaches nothing on the Songs tab — ${hk.action} cannot be pressed`,
      ).toBe(hk.id);
    });
  }

  /**
   * And the two that were dead, said in their own words rather than as a
   * loop, because this is the actual bug.
   */
  it("nudges the portion with shift and a bracket", () => {
    expect(actionOf(press("{", { shiftKey: true, code: "BracketLeft" }), "songs")).toBe(
      "songs-loop-earlier",
    );
    expect(actionOf(press("}", { shiftKey: true, code: "BracketRight" }), "songs")).toBe(
      "songs-loop-later",
    );
  });

  /**
   * A keyboard whose bracket position is not a bracket keeps what the browser
   * said. A German layout has `ü` there, so Shift gives `Ü` and the mapping
   * must not turn that into `[`.
   */
  it("leaves a layout whose bracket position is a letter alone", () => {
    expect(eventToCombo(press("Ü", { shiftKey: true, code: "BracketLeft" }))).toBe("⇧Ü");
  });

  /** The plain brackets are still the metronome's subdivision everywhere else. */
  it("keeps the brackets for the subdivision off the Songs tab", () => {
    expect(actionOf(press("["), "beat")).toBe("sub-prev");
    expect(actionOf(press("]"), "beat")).toBe("sub-next");
    expect(actionOf(press("["), "songs")).toBe("songs-loop-start");
    expect(actionOf(press("]"), "songs")).toBe("songs-loop-end");
  });

  /** R and C mean the recorder and the camera here, not the jam's or the coach's. */
  it("gives R and C to the song's own recorder and camera", () => {
    expect(actionOf(press("r"), "songs")).toBe("songs-take");
    expect(actionOf(press("c"), "songs")).toBe("songs-camera");
    expect(actionOf(press("r"), "jam")).toBe("jam-take");
    expect(actionOf(press("c"), "beat")).toBe("toggle-coach");
  });

  it("gives L to the portion here and to the section in Jam", () => {
    expect(actionOf(press("l"), "songs")).toBe("songs-loop");
    expect(actionOf(press("l"), "jam")).toBe("jam-loop-section");
  });

  it("plays and stops with the space bar", () => {
    expect(actionOf(press(" "), "songs")).toBe("play");
  });

  /**
   * The arrows, Home and Esc belong to the TAB and not to the window.
   *
   * They move the playhead a bar at a time and put a portion away, and
   * `TabStage`'s own handler is what does it — so nothing app-wide may claim
   * them, or the same press would do two things. ↑ and ↓ are the metronome's
   * tempo and are left alone deliberately; they are not the song's.
   */
  it("leaves the tab's own navigation keys unclaimed", () => {
    for (const key of ["ArrowLeft", "ArrowRight", "Home", "Escape"]) {
      expect(actionOf(press(key), "songs"), `${key} is claimed app-wide`).toBeUndefined();
    }
  });

  /**
   * And the space bar types a space in the bar fields rather than starting
   * the song.
   *
   * The strip's two number fields are the one place on this screen where a
   * key means a character. `isTypingTarget` is what decides it, and a number
   * input is a text field as far as this question goes.
   */
  it("types in the bar fields instead of playing", () => {
    const field = document.createElement("input");
    field.type = "number";
    const event = press(" ");
    Object.defineProperty(event, "target", { value: field });
    expect(actionOf(event, "songs")).toBeUndefined();
    // ...and a fader is not typing: the band's levels are ranges, and a
    // hotkey pressed with one focused is still a hotkey.
    const fader = document.createElement("input");
    fader.type = "range";
    const onFader = press(" ");
    Object.defineProperty(onFader, "target", { value: fader });
    expect(actionOf(onFader, "songs")).toBe("play");
  });

  /** Nothing the Songs tab binds is claimed twice on the Songs tab. */
  it("gives every Songs key exactly one meaning here", () => {
    const seen = new Map<string, string>();
    for (const hk of songsKeys) {
      expect(seen.has(hk.key), `${hk.key} is bound to two Songs actions`).toBe(false);
      seen.set(hk.key, hk.id);
    }
  });
});
