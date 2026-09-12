// Compiling is the one place the record the user edits becomes the table the
// audio thread reads. A config whose lanes are the wrong length is refused by
// the engine and heard as a plain click — a jam that looks loaded and sounds
// like a metronome — so the length check runs over every starter jam and
// every combination of groove and feel.
import { describe, expect, it } from "vitest";
import { compileJam, jamMeter } from "./compile";
import { GROOVES } from "./grooves";
import { STARTER_JAMS, createJam } from "./jams";
import { JAM_INTENSITY_GAIN, JAM_LANES } from "./types";
import type { Jam, JamFeel, JamIntensity } from "./types";

const FEELS: JamFeel[] = ["straight", "shuffle", "swing"];

function expectWellFormed(jam: Jam, label: string) {
  const config = compileJam(jam);
  const ticks = config.beatsPerBar * config.ticksPerBeat;
  for (const lane of JAM_LANES) {
    expect(config.bar[lane], `${label} bar.${lane}`).toHaveLength(ticks);
    if (config.fill) expect(config.fill[lane], `${label} fill.${lane}`).toHaveLength(ticks);
  }
  expect([1, 2, 3, 4, 6], `${label} ticksPerBeat`).toContain(config.ticksPerBeat);
  expect(config.beatsPerBar, label).toBeGreaterThan(0);
  expect(config.formBars, label).toBeGreaterThan(0);
}

describe("compileJam", () => {
  it("compiles every starter jam into a bar the engine will accept", () => {
    for (const jam of STARTER_JAMS) expectWellFormed(jam, jam.name);
  });

  it("compiles every groove in every feel", () => {
    for (const groove of GROOVES) {
      for (const feel of FEELS) {
        expectWellFormed(
          createJam("test", { grooveId: groove.id, feel, form: { kind: "blues12", bars: 12 } }),
          `${groove.id} ${feel}`,
        );
      }
    }
  });

  it("says the same meter the UI has to set on the engine first", () => {
    // The contract: subdivision = ticksPerBeat, beat groups = [beatsPerBar].
    // Two answers that disagree is the mismatch the engine refuses.
    for (const jam of STARTER_JAMS) {
      const config = compileJam(jam);
      expect(jamMeter(jam), jam.name).toEqual({
        beatsPerBar: config.beatsPerBar,
        ticksPerBeat: config.ticksPerBeat,
      });
    }
  });

  it("takes the chorus length from the form", () => {
    expect(compileJam(createJam("x", { form: { kind: "blues12", bars: 0 } })).formBars).toBe(12);
    expect(compileJam(createJam("x", { form: { kind: "custom", bars: 24 } })).formBars).toBe(24);
  });

  it("turns the fill and the crash on together, and off together", () => {
    // They are one gesture. A crash with no fill in front of it is a mistake.
    const on = compileJam(createJam("x", { fills: true }));
    expect(on.fill).not.toBeNull();
    expect(on.crashOnOne).toBe(true);

    const off = compileJam(createJam("x", { fills: false }));
    expect(off.fill).toBeNull();
    expect(off.crashOnOne).toBe(false);
  });

  it("hands the engine a gain rather than the word", () => {
    for (const intensity of ["soft", "normal", "loud"] as JamIntensity[]) {
      expect(compileJam(createJam("x", { intensity })).intensity).toBe(
        JAM_INTENSITY_GAIN[intensity],
      );
    }
  });

  it("keeps the kit on the record even though the engine ignores it", () => {
    expect(compileJam(createJam("x")).kit).toBe("room");
  });

  it("falls back to a groove that exists when the record names one that does not", () => {
    expectWellFormed(createJam("x", { grooveId: "moon-drums" }), "missing groove");
  });

  it("is pure — compiling twice gives the same table", () => {
    const jam = STARTER_JAMS[0];
    expect(compileJam(jam)).toEqual(compileJam(jam));
  });
});
