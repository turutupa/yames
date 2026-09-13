/**
 * Which door Escape opens on the Jam tab.
 *
 * The bug this file exists for: the chord picker was not in the list at all.
 * It is a panel rather than a dialog, so nothing above it catches Escape on
 * its behalf — the key went past it and closed the jam, which is to say it
 * threw away the screen you were editing the changes on because you changed
 * your mind about one bar's chord.
 */
import { describe, expect, it } from "vitest";
import { jamEscapeTarget } from "./jamEscape";

const OPEN = { typing: false, dialogOpen: false, editorOpen: false, editingBar: null };

describe("jamEscapeTarget", () => {
  it("closes the jam when nothing else is open", () => {
    expect(jamEscapeTarget(OPEN)).toBe("jam");
  });

  it("closes the chord picker instead of the jam behind it", () => {
    expect(jamEscapeTarget({ ...OPEN, editingBar: 4 })).toBe("chordPicker");
  });

  it("counts bar one, which is falsy and is still a bar", () => {
    expect(jamEscapeTarget({ ...OPEN, editingBar: 0 })).toBe("chordPicker");
  });

  it("takes no key from a field being typed into", () => {
    expect(jamEscapeTarget({ ...OPEN, typing: true })).toBe("nothing");
    // Not even to close the picker: the field is inside something, and
    // whatever that is gets the key first.
    expect(jamEscapeTarget({ ...OPEN, typing: true, editingBar: 4 })).toBe("nothing");
  });

  it("leaves a dialog to close itself", () => {
    expect(jamEscapeTarget({ ...OPEN, dialogOpen: true })).toBe("nothing");
  });

  it("leaves the groove editor to its own Done", () => {
    expect(jamEscapeTarget({ ...OPEN, editorOpen: true })).toBe("nothing");
  });
});
