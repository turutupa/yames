import { describe, expect, it } from "vitest";
import { bandDescription, lineupFor, startingBand } from "./lineup";
import type { InstrumentId } from "../types";

const EVERY_INSTRUMENT: InstrumentId[] = [
  "drums",
  "electric-guitar",
  "acoustic-guitar",
  "bass",
  "piano",
  "other",
];

describe("the band never plays your instrument", () => {
  it("holds for every instrument the app knows", () => {
    // JAM_MODE.md 3.1. This is the whole rule; everything else in this file
    // is the detail of who is left.
    for (const instrument of EVERY_INSTRUMENT) {
      const lineup = lineupFor(instrument);
      const doubles =
        (lineup.you === "drums" && lineup.drums) ||
        (lineup.you === "bass" && lineup.bass) ||
        (lineup.you === "keys" && lineup.keys);
      expect({ instrument, doubles }).toEqual({ instrument, doubles: false });
    }
  });

  it("leaves a drummer a bass and keys to play against", () => {
    expect(lineupFor("drums")).toEqual({ drums: false, bass: true, keys: true, you: "drums" });
  });

  it("leaves a bass player the kick, unclouded", () => {
    // Section 5 measures a bass player's "kick lock", so nothing else may be
    // sitting on the bottom end.
    expect(lineupFor("bass")).toEqual({ drums: true, bass: false, keys: false, you: "bass" });
  });

  it("gives a piano player the rest of the trio", () => {
    expect(lineupFor("piano")).toEqual({ drums: true, bass: true, keys: false, you: "keys" });
  });

  it("gives both guitars drums and bass", () => {
    for (const id of ["electric-guitar", "acoustic-guitar"] as InstrumentId[]) {
      expect(lineupFor(id)).toEqual({ drums: true, bass: true, keys: false, you: "guitar" });
    }
  });

  it("treats a horn, a voice or anything else as a front line", () => {
    expect(lineupFor("other")).toEqual({ drums: true, bass: true, keys: false, you: "other" });
  });
});

describe("keys wait for their release", () => {
  it("is only the drummer who gets them today", () => {
    // Keys are a third-release feature (4.3); the drummer is the one player
    // with no drums to listen to, so harmony is not optional there.
    const withKeys = EVERY_INSTRUMENT.filter((id) => lineupFor(id).keys);
    expect(withKeys).toEqual(["drums"]);
  });
});

describe("lineupFor", () => {
  it("gives every player somebody to play with", () => {
    for (const instrument of EVERY_INSTRUMENT) {
      const lineup = lineupFor(instrument);
      expect({ instrument, empty: !lineup.drums && !lineup.bass && !lineup.keys }).toEqual({
        instrument,
        empty: false,
      });
    }
  });

  it("hands back a fresh object, so a caller cannot edit the table", () => {
    const first = lineupFor("bass");
    first.bass = true;
    expect(lineupFor("bass").bass).toBe(false);
  });
});

describe("bandDescription", () => {
  it("names the band in stage order", () => {
    expect(bandDescription(lineupFor("electric-guitar"))).toEqual([
      "jam.band.drums",
      "jam.band.bass",
    ]);
    expect(bandDescription(lineupFor("drums"))).toEqual([
      "jam.band.bass",
      "jam.band.keys",
    ]);
    expect(bandDescription(lineupFor("bass"))).toEqual(["jam.band.drums"]);
  });

  it("returns keys, not words - the UI translates them", () => {
    for (const instrument of EVERY_INSTRUMENT) {
      for (const key of bandDescription(lineupFor(instrument))) {
        expect(key.startsWith("jam.band.")).toBe(true);
      }
    }
  });

  it("says nothing rather than something wrong for an empty band", () => {
    expect(bandDescription({ drums: false, bass: false, keys: false, you: "other" })).toEqual([]);
  });
});

/**
 * Who a brand new jam starts with (plans/JAM_UX_DECISIONS.md B1).
 *
 * The first session's verdict: a guitarist's jam opened with a bass player
 * already under everything, and "drums alone" was one toggle away that nobody
 * would find. `lineupFor` still says what is OFFERED; this says what is ON.
 */
describe("startingBand", () => {
  it("gives everyone the drummer and nobody else", () => {
    for (const instrument of ["electric-guitar", "acoustic-guitar", "bass", "piano", "other"]) {
      expect(startingBand(instrument)).toEqual({ drums: true, bass: false, keys: false });
    }
  });

  it("gives a drummer a bass player, because drums alone is nothing to play against", () => {
    expect(startingBand("drums")).toEqual({ drums: false, bass: true, keys: false });
  });

  it("never puts your own instrument on stage", () => {
    // The rule the mode is built on still governs the default, even though
    // the default is now smaller than the lineup.
    for (const instrument of EVERY_INSTRUMENT) {
      const band = startingBand(instrument);
      const you = lineupFor(instrument).you;
      if (you === "drums") expect(band.drums).toBe(false);
      if (you === "bass") expect(band.bass).toBe(false);
      if (you === "keys") expect(band.keys).toBe(false);
    }
  });

  it("gives an instrument it has never heard of the drummer", () => {
    expect(startingBand("theremin")).toEqual({ drums: true, bass: false, keys: false });
  });
});
