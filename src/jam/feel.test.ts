// A feel is a regrid, not a rewrite. What has to survive it is the bar: the
// form counts bars, so a feel that changed `beatsPerBar` would silently make a
// twelve-bar blues something else.
import { describe, expect, it } from "vitest";
import { applyFeel } from "./feel";
import { GROOVES, grooveById, grooveTickCount } from "./grooves";
import { JAM_LANES, JAM_PERC_LANES } from "./types";
import type { JamFeel } from "./types";

const FEELS: JamFeel[] = ["straight", "shuffle", "swing"];

describe("applyFeel", () => {
  it("leaves a groove exactly as it is when the feel is straight", () => {
    for (const g of GROOVES) expect(applyFeel(g, "straight")).toBe(g);
  });

  it("never changes the bar, whatever the feel", () => {
    for (const g of GROOVES) {
      for (const feel of FEELS) {
        expect(applyFeel(g, feel).beatsPerBar, `${g.id} ${feel}`).toBe(g.beatsPerBar);
      }
    }
  });

  it("keeps every lane the right length for the grid it ends up on", () => {
    for (const g of GROOVES) {
      for (const feel of FEELS) {
        const out = applyFeel(g, feel);
        const ticks = grooveTickCount(out);
        for (const lane of JAM_LANES) {
          expect(out.bar[lane], `${g.id} ${feel} bar.${lane}`).toHaveLength(ticks);
          expect(out.fill[lane], `${g.id} ${feel} fill.${lane}`).toHaveLength(ticks);
        }
      }
    }
  });

  it("moves an eighth-note groove onto triplets with the off-beat on the third tick", () => {
    const rock = grooveById("rock8");
    const shuffled = applyFeel(rock, "shuffle");
    expect(shuffled.ticksPerBeat).toBe(3);
    for (let beat = 0; beat < rock.beatsPerBar; beat++) {
      for (const lane of JAM_LANES) {
        expect(shuffled.bar[lane][beat * 3], `${lane} downbeat ${beat}`).toBe(
          rock.bar[lane][beat * 2],
        );
        // The middle triplet is the one a shuffle leaves out.
        expect(shuffled.bar[lane][beat * 3 + 1], `${lane} middle ${beat}`).toBe(0);
        expect(shuffled.bar[lane][beat * 3 + 2], `${lane} off-beat ${beat}`).toBe(
          rock.bar[lane][beat * 2 + 1],
        );
      }
    }
  });

  it("loses no hits in the conversion", () => {
    const rock = grooveById("rock8");
    const shuffled = applyFeel(rock, "shuffle");
    for (const lane of JAM_LANES) {
      const before = rock.bar[lane].filter((l) => l !== 0).length;
      const after = shuffled.bar[lane].filter((l) => l !== 0).length;
      expect(after, lane).toBe(before);
    }
  });

  it("brushes the hat's off-beat on swing but not on shuffle", () => {
    const rock = grooveById("rock8");
    const shuffled = applyFeel(rock, "shuffle");
    const swung = applyFeel(rock, "swing");
    for (let beat = 0; beat < rock.beatsPerBar; beat++) {
      const i = beat * 3 + 2;
      expect(shuffled.bar.hat[i], `shuffle beat ${beat}`).toBe(1);
      expect(swung.bar.hat[i], `swing beat ${beat}`).toBe(3);
    }
    // Only the hat and the ride. A kick demoted to a ghost stops being a kick.
    expect(swung.bar.kick).toEqual(shuffled.bar.kick);
    expect(swung.bar.snare).toEqual(shuffled.bar.snare);
  });

  it("leaves a groove already written in triplets alone", () => {
    // The shuffle and the swing ride ARE the thing the conversion makes;
    // running them through it again would push their off-beats out of place.
    for (const id of ["shuffle", "swingRide"]) {
      const g = grooveById(id);
      expect(applyFeel(g, "shuffle"), id).toBe(g);
      expect(applyFeel(g, "swing"), id).toBe(g);
    }
  });

  it("leaves a groove written at any other resolution alone", () => {
    // Sixteenths and the 6/8 eighth grid have no two-to-three conversion, so
    // the honest answer is the groove as written rather than a guess.
    for (const id of ["rock16", "bossa", "sixEight"]) {
      const g = grooveById(id);
      expect(applyFeel(g, "swing"), id).toBe(g);
    }
  });

  it("shuffles the fill along with the groove, toms and all", () => {
    const swung = applyFeel(grooveById("rock8"), "shuffle");
    const ticks = grooveTickCount(swung);
    expect(swung.fill.snare).toHaveLength(ticks);
    // The run-up: two snare hits on beat three, now long-short.
    expect(swung.fill.snare.slice(6)).toEqual([1, 0, 1, 0, 0, 0]);
    // And the gesture the fill IS — the high tom's accent and the low tom's
    // peak on the last beat — moved with it rather than being dropped on the
    // floor by the conversion, which is the bug this catches.
    expect(swung.fill.tomHi).toHaveLength(ticks);
    expect(swung.fill.tomLo).toHaveLength(ticks);
    expect(swung.fill.tomHi?.slice(9)).toEqual([2, 0, 0]);
    expect(swung.fill.tomLo?.slice(9)).toEqual([0, 0, 4]);
  });

  it("takes the percussionist along when a groove swings", () => {
    // The same bug as the toms, one player further out. A cha-cha set to
    // Shuffle that arrived with no güiro and no congas would have lost them
    // here, silently, with nothing on the screen saying so.
    const straight = grooveById("chaCha");
    const swung = applyFeel(straight, "shuffle");
    const ticks = grooveTickCount(swung);
    for (const lane of ["guiro", "congaHi", "congaLo"] as const) {
      expect(swung.bar[lane], lane).toHaveLength(ticks);
      expect(swung.bar[lane]!.some((level) => level !== 0), lane).toBe(true);
    }
    // The tumbao's two open tones were on four and the "and" of four — the
    // last two eighths — and land on the last beat's first and third triplet.
    expect(swung.bar.congaHi?.slice(9)).toEqual([2, 0, 2]);
  });

  it("does not brush the percussion the way swing brushes a hat", () => {
    // Swing is what a pair of hands does to a cymbal's off-beat. A conga's
    // dynamics are written into its row, and `intensity` is the one thing
    // allowed to move them.
    // Motown: the hat and the tambourine play the same eighths, which is the
    // cleanest possible statement of the rule — one row is brushed and the
    // other, note for note identical, is not.
    const straight = grooveById("motown");
    const shuffled = applyFeel(straight, "shuffle");
    const swung = applyFeel(straight, "swing");
    expect(shuffled.bar.tambourine).toEqual(shuffled.bar.hat);
    expect(swung.bar.tambourine).toEqual(shuffled.bar.tambourine);
    expect(swung.bar.hat).not.toEqual(shuffled.bar.hat);
  });

  it("never invents a percussion row for a groove that has none", () => {
    for (const g of GROOVES) {
      for (const feel of FEELS) {
        const out = applyFeel(g, feel);
        for (const lane of JAM_PERC_LANES) {
          if (g.bar[lane]) continue;
          expect(out.bar[lane], `${g.id} ${feel} ${lane}`).toBeUndefined();
        }
      }
    }
  });
});
