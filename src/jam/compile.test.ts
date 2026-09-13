// Compiling is the one place the record the user edits becomes the table the
// audio thread reads. A config whose lanes are the wrong length is refused by
// the engine and heard as a plain click — a jam that looks loaded and sounds
// like a metronome — so the length check runs over every starter jam and
// every combination of groove and feel.
import { describe, expect, it } from "vitest";
import { compileJam, jamKey, jamMeter, type JamBand } from "./compile";
import { GROOVES } from "./grooves";
import { STARTER_JAMS, createJam } from "./jams";
import { JAM_INTENSITY_GAIN, JAM_LANES } from "./types";
import type { Jam, JamFeel, JamIntensity, JamPattern } from "./types";

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

  it("passes the fills-every-N count through, and zeroes it when fills are off", () => {
    // The contract: absent or 0 is the chorus end only, 4 and 8 add the bars
    // in between. Both fields go out together so the engine never has to hold
    // "no fills, every four bars" and decide which half to believe.
    expect(compileJam(createJam("x", { fills: true })).fillEvery).toBe(0);
    expect(compileJam(createJam("x", { fills: true, fillEvery: 4 })).fillEvery).toBe(4);
    expect(compileJam(createJam("x", { fills: true, fillEvery: 8 })).fillEvery).toBe(8);
    expect(compileJam(createJam("x", { fills: false, fillEvery: 4 })).fillEvery).toBe(0);
  });

  it("zeroes the count for a custom groove that has no fill drawn yet", () => {
    // Nothing to play every four bars either. `fill` is null here, and a
    // `fillEvery` beside a null fill is a number the engine cannot act on.
    const jam = createJam("x", { fills: true, fillEvery: 4 });
    const mine = compileJam({
      ...jam,
      customGroove: {
        name: "Mine",
        beatsPerBar: 4,
        ticksPerBeat: 2,
        bar: {
          kick: [1, 0, 0, 0, 1, 0, 0, 0],
          snare: [0, 0, 0, 0, 0, 0, 0, 0],
          hat: [0, 0, 0, 0, 0, 0, 0, 0],
          ride: [0, 0, 0, 0, 0, 0, 0, 0],
          crash: [0, 0, 0, 0, 0, 0, 0, 0],
        },
        fill: null,
      },
    });
    expect(mine.fill).toBeNull();
    expect(mine.fillEvery).toBe(0);
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

/**
 * The band. The drums are one bar that repeats and the bass is not, which is
 * the whole reason compiling now takes a bar number; these are the properties
 * that go wrong quietly if the bar number is ignored or the chord is read off
 * the wrong bar.
 */
describe("compileJam, the band", () => {
  const GUITARIST: JamBand = { drums: true, bass: true };

  it("gives the bass one note per tick of the bar, same width as the drums", () => {
    for (const jam of STARTER_JAMS) {
      const config = compileJam(jam, { lineup: GUITARIST });
      const ticks = config.beatsPerBar * config.ticksPerBeat;
      expect(config.bass, jam.name).not.toBeNull();
      expect(config.bass?.pitches, jam.name).toHaveLength(ticks);
      for (const pitch of config.bass?.pitches ?? []) {
        // 0 is a rest; everything else has to be a note a bass can reach.
        expect(pitch === 0 || (pitch >= 28 && pitch <= 55), `${jam.name} ${pitch}`).toBe(true);
      }
    }
  });

  it("follows the changes — bar 5 of a blues is not bar 1", () => {
    const blues = STARTER_JAMS.find((j) => j.form.kind === "blues12");
    if (!blues) throw new Error("a starter jam in twelve bars went missing");
    const one = compileJam(blues, { formBar: 0, lineup: GUITARIST }).bass?.pitches ?? [];
    const five = compileJam(blues, { formBar: 4, lineup: GUITARIST }).bass?.pitches ?? [];
    // Bar 1 is the I and bar 5 is the IV. A bass that played the same notes
    // under both is a bass that is not reading the chart.
    expect(five).not.toEqual(one);
    expect(compileJam(blues, { formBar: 12, lineup: GUITARIST }).bass?.pitches).toEqual(one);
  });

  it("takes the band from the lineup when the record has not been asked", () => {
    const jam = createJam("x", { key: "A" });
    expect(compileJam(jam, { lineup: { drums: true, bass: false } }).bass).toBeNull();
    expect(compileJam(jam, { lineup: { drums: true, bass: true } }).bass).not.toBeNull();
  });

  it("lets the record overrule the lineup once a toggle has been touched", () => {
    const jam = createJam("x", { key: "A", band: { drums: true, bass: false } });
    expect(compileJam(jam, { lineup: { drums: true, bass: true } }).bass).toBeNull();
  });

  it("silences the drummer without changing the width of the table", () => {
    const jam = createJam("x", { key: "A", band: { drums: false, bass: true }, fills: true });
    const config = compileJam(jam);
    const ticks = config.beatsPerBar * config.ticksPerBeat;
    for (const lane of JAM_LANES) {
      expect(config.bar[lane], lane).toHaveLength(ticks);
      expect(config.bar[lane].every((cell) => cell === 0), lane).toBe(true);
    }
    // A crash is a drum. Nothing about "drums off" should leave one ringing.
    expect(config.crashOnOne).toBe(false);
    expect(config.bass).not.toBeNull();
  });

  it("compiles the practice windows, and sends null when every tool is off", () => {
    expect(compileJam(createJam("x")).practice).toBeNull();
    const practising = createJam("x", {
      practice: {
        dropOutEvery: 8,
        dropOutBars: 2,
        tradeBars: 4,
        tempoStep: 0,
        tempoEveryChoruses: 0,
      },
    });
    expect(compileJam(practising).practice).toEqual({
      dropOut: { everyBars: 8, bars: 2 },
      trade: { bandBars: 4, youBars: 4 },
    });
  });

  it("plays the groove you drew instead of the one you started from", () => {
    const preset = compileJam(createJam("x", { grooveId: "rock8" }));
    const mine = compileJam(
      createJam("x", {
        grooveId: "rock8",
        customGroove: {
          name: "Mine",
          beatsPerBar: 4,
          ticksPerBeat: 2,
          bar: { ...emptyLanes(8), kick: [1, 0, 0, 0, 1, 0, 0, 0] },
          fill: null,
        },
      }),
    );
    expect(mine.bar.kick).toEqual([1, 0, 0, 0, 1, 0, 0, 0]);
    expect(mine.bar.kick).not.toEqual(preset.bar.kick);
    // A custom groove with no fill drawn yet is a jam with no fill, even with
    // fills switched on — there is nothing to play.
    expect(mine.fill).toBeNull();
  });

  it("swings a groove you drew, the same way it swings a preset", () => {
    const mine = compileJam(
      createJam("x", {
        feel: "shuffle",
        customGroove: {
          name: "Mine",
          beatsPerBar: 4,
          ticksPerBeat: 2,
          bar: { ...emptyLanes(8), hat: [1, 1, 1, 1, 1, 1, 1, 1] },
          fill: null,
        },
      }),
    );
    expect(mine.ticksPerBeat).toBe(3);
    expect(mine.bar.hat).toHaveLength(12);
    // The off-beat moved from the second tick of two to the third of three.
    expect(mine.bar.hat).toEqual([1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1]);
  });

  it("reads a key with no mode in it as major, and an unreadable one as C", () => {
    expect(jamKey(createJam("x", { key: "A" }))).toEqual({ root: 9, mode: "major" });
    expect(jamKey(createJam("x", { key: "Dm" }))).toEqual({ root: 2, mode: "minor" });
    expect(jamKey(createJam("x", { key: "A blues" }))).toEqual({ root: 9, mode: "blues" });
    expect(jamKey(createJam("x"))).toEqual({ root: 0, mode: "major" });
    expect(jamKey(createJam("x", { key: "wombat" }))).toEqual({ root: 0, mode: "major" });
  });
});

/** Five silent lanes of `length` ticks, for building a pattern by hand. */
function emptyLanes(length: number): JamPattern {
  const out = {} as JamPattern;
  for (const lane of JAM_LANES) out[lane] = new Array(length).fill(0);
  return out;
}
