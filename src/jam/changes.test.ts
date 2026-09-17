/**
 * The changes library (`./changes`) — every progression is playable, fills
 * its form, and the style defaults say what they claim.
 */
import { describe, expect, it } from "vitest";
import {
  CHANGES,
  FORM_CLASSICS,
  changesFor,
  defaultChangesFor,
  resolveChanges,
} from "./changes";
import { barsForForm, romanToChord } from "./harmony";
import type { Key, KeyMode } from "./harmony";
import { scalesForChord } from "./scales";
import { GROOVE_FAMILIES } from "./grooves";
import { JAM_FORM_BARS } from "./types";

const MODES: KeyMode[] = ["major", "minor", "blues"];
const romans = (bar: string | readonly [string, string]) => (typeof bar === "string" ? [bar] : [...bar]);

describe("the changes library", () => {
  it("has unique ids", () => {
    const ids = CHANGES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("fills every form exactly", () => {
    for (const c of CHANGES) {
      expect(c.bars.length, c.id).toBe(JAM_FORM_BARS[c.form]);
    }
  });

  it("names only real styles and real modes", () => {
    for (const c of CHANGES) {
      expect(c.modes.length, c.id).toBeGreaterThan(0);
      for (const m of c.modes) expect(MODES).toContain(m);
      for (const f of c.families) expect(GROOVE_FAMILIES as readonly string[]).toContain(f);
    }
  });

  it("reads as chords in all twelve keys, and every chord has scales to play", () => {
    for (const c of CHANGES) {
      for (const mode of c.modes) {
        for (let root = 0; root < 12; root++) {
          const key: Key = { root, mode };
          for (const bar of c.bars) {
            for (const symbol of romans(bar)) {
              const chord = romanToChord(symbol, key);
              expect(scalesForChord(chord, key).length, `${c.id} ${symbol} in ${root} ${mode}`)
                .toBeGreaterThan(0);
            }
          }
        }
      }
    }
  });

  it("keeps each form's classic as a named entry, bar for bar", () => {
    // `auto` falls back to these, so a jam in a style the library has no
    // opinion on plays exactly what it played before the library existed.
    for (const [form, byMode] of Object.entries(FORM_CLASSICS)) {
      for (const [mode, id] of Object.entries(byMode ?? {})) {
        const entry = CHANGES.find((c) => c.id === id)!;
        expect(entry, `${form} ${mode}`).toBeDefined();
        const key: Key = { root: 9, mode: mode as KeyMode };
        const k = form as keyof typeof JAM_FORM_BARS;
        expect(barsForForm(k, JAM_FORM_BARS[k], key, entry.bars)).toEqual(
          barsForForm(k, JAM_FORM_BARS[k], key),
        );
      }
    }
  });

  it("offers every form except rhythm changes a choice in every mode it has", () => {
    for (const form of ["loop8", "blues12", "bars16", "one"] as const) {
      for (const mode of MODES) {
        if (form === "blues12" && mode === "minor") continue;
        expect(changesFor(form, mode).length, `${form} ${mode}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("what auto plays", () => {
  it.each([
    ["loop8", "major", "pop", "pop"],
    ["loop8", "major", "rock", "rock"],
    ["loop8", "major", "country", "country"],
    ["loop8", "major", "funk", "funkVamp"],
    ["loop8", "minor", "metal", "minorRock"],
    ["loop8", "minor", "funk", "dorianVamp"],
    ["loop8", "minor", "latin", "minorTwoFive"],
    ["blues12", "blues", "blues", "blues"],
    ["blues12", "major", "jazz", "jazzBlues"],
    ["blues12", "blues", "rock", "quickChange"],
  ] as const)("%s in %s for %s is %s", (form, mode, family, id) => {
    expect(defaultChangesFor(form, mode, family)?.id).toBe(id);
  });

  it("falls back to the form's classic for a style with no opinion", () => {
    expect(defaultChangesFor("loop8", "major", null)?.id).toBe("axis");
    expect(defaultChangesFor("loop8", "minor", "world")?.id).toBe("dorianVamp");
    expect(defaultChangesFor("aaba32", "major", "jazz")).toBeUndefined();
  });

  it("ignores a named progression written for another mode or form", () => {
    expect(resolveChanges("pop", "loop8", "minor", "pop")?.id).toBe("aeolian");
    expect(resolveChanges("pop", "blues12", "major", "pop")?.id).toBe("blues");
    expect(resolveChanges("doowop", "loop8", "major", "rock")?.id).toBe("doowop");
    expect(resolveChanges("auto", "loop8", "major", "rock")?.id).toBe("rock");
    expect(resolveChanges("nonsense", "loop8", "major", "rock")?.id).toBe("rock");
  });
});
