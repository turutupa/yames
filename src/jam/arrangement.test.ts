// The arrangement is the difference between a band that loops and a band that
// plays a tune, and the only way to check a plan across choruses is to write
// the plan down and compare it bar by bar. So the two tables below are the
// headline of this file: a twelve-bar blues over eight choruses in Build, and
// the same tune as a three-chorus Song, each written out as one line per bar
// in a shorthand a drummer could read back.
//
// They are literal on purpose. A test that computed the expectation would be a
// second copy of `bandMoment` checking the first, and the two would agree about
// whatever they were both wrong about.
import { describe, expect, it } from "vitest";
import {
  FAMILY_FOR_GROOVE,
  FAMILY_FOR_VIBE,
  FAMILY_PLAN,
  JAM_BREAKDOWN_CHOICES,
  bandMoment,
  isBreakdownChorus,
  jamArrangement,
  momentKey,
  momentsForChorus,
  previousBar,
  sameMoment,
  shiftIntensity,
  styleFamily,
  stylePlan,
} from "./arrangement";
import type { BandMoment } from "./arrangement";
import { compileJam } from "./compile";
import { GROOVES } from "./grooves";
import { createJam } from "./jams";
import { VIBE_IDS } from "./vibesContract";
import type { Jam, JamArrangement } from "./types";

/**
 * One bar as one line: how hard, who is playing what, what lands on it.
 *
 * `—` is "nothing here", which is most bars of most tunes — a table where
 * every row says something says nothing.
 */
function sketch(moment: BandMoment): string {
  return [
    moment.intensity,
    `${moment.drums}/${moment.bass}/${moment.keys}`,
    moment.fill === "none" ? "—" : moment.fill,
    moment.crash ? "crash" : "—",
    moment.ending ? `end:${moment.ending}` : "",
  ]
    .join(" ")
    .trim();
}

/** Every bar of one chorus, sketched. */
function chorusSketch(jam: Jam, chorus: number): string[] {
  return momentsForChorus(jam, chorus).map(sketch);
}

function blues(arrangement: JamArrangement): Jam {
  return createJam("blues", {
    grooveId: "shuffle",
    form: { kind: "blues12", bars: 12 },
    key: "A blues",
    intensity: "normal",
    fills: true,
    arrangement,
  });
}

// The lines that repeat, named once so the tables below read as music rather
// than as a wall of the same string.
const HELD_BACK = "soft full/sparse/sparse — —";
const HELD_BACK_SEAM = "soft full/sparse/sparse small —";
const NORMAL = "normal full/full/full — —";
const NORMAL_SEAM = "normal full/full/full small —";
const LOUD = "loud full/full/full — —";
const LOUD_SEAM = "loud full/full/full small —";

describe("a twelve-bar blues over eight choruses, in Build", () => {
  const jam = blues({ mode: "build" });

  // Chorus one: the band holds back. A rung below the record, the bass on
  // roots and fifths, one voicing a bar from the keys, and a crash on the one
  // because the intro is a pickup. Small fills at the two seams of the blues
  // (the bar before the four chord and the bar before the turnaround), and the
  // big one into the top of chorus two.
  it("holds chorus one back and comes in on the one", () => {
    expect(chorusSketch(jam, 1)).toEqual([
      "soft full/sparse/sparse — crash",
      HELD_BACK,
      HELD_BACK,
      HELD_BACK_SEAM,
      HELD_BACK,
      HELD_BACK,
      HELD_BACK,
      HELD_BACK_SEAM,
      HELD_BACK,
      HELD_BACK,
      HELD_BACK,
      "soft full/sparse/sparse big —",
    ]);
  });

  // Chorus two: the record's own loudness, the whole band in — and the blues's
  // oldest gesture on the last bar. Stop-time lands every second chorus, so
  // this is the first one that can have it: the band hits one and leaves the
  // soloist out there for the turnaround.
  it("puts the whole band in on chorus two, and stop-time on its last bar", () => {
    expect(chorusSketch(jam, 2)).toEqual([
      "normal full/full/full — crash",
      NORMAL,
      NORMAL,
      NORMAL_SEAM,
      NORMAL,
      NORMAL,
      NORMAL,
      NORMAL_SEAM,
      NORMAL,
      NORMAL,
      NORMAL,
      "normal stopTime/full/full — —",
    ]);
  });

  // Chorus three: the blues digs in. A rung up, and it stays there — a band
  // that got louder every chorus for nine minutes would be a joke. No
  // stop-time, because this is an odd chorus.
  it("digs in on chorus three and stays there", () => {
    expect(chorusSketch(jam, 3)).toEqual([
      "loud full/full/full — crash",
      LOUD,
      LOUD,
      LOUD_SEAM,
      LOUD,
      LOUD,
      LOUD,
      LOUD_SEAM,
      LOUD,
      LOUD,
      LOUD,
      "loud full/full/full big —",
    ]);
  });

  // Chorus four is the breakdown. Six bars of the kick and the hats with the
  // bass walking over them and the keys out, a rung quieter than the chorus it
  // sits in; a big fill on bar six; everything back on bar seven with a crash
  // on it. No stop-time: this chorus has already had its event.
  it("drops to the kick and the hats for half of chorus four, and comes back with a crash", () => {
    const breakdown = "normal hatsAndKick/full/off — —";
    expect(chorusSketch(jam, 4)).toEqual([
      "normal hatsAndKick/full/off — crash",
      breakdown,
      breakdown,
      "normal hatsAndKick/full/off small —",
      breakdown,
      "normal hatsAndKick/full/off big —",
      "loud full/full/full — crash",
      LOUD_SEAM,
      LOUD,
      LOUD,
      LOUD,
      "loud full/full/full big —",
    ]);
  });

  it("plays chorus five as it played chorus three", () => {
    expect(chorusSketch(jam, 5)).toEqual(chorusSketch(jam, 3));
  });

  it("takes stop-time again on chorus six, loud this time", () => {
    expect(chorusSketch(jam, 6)[11]).toBe("loud stopTime/full/full — —");
    expect(chorusSketch(jam, 6).slice(0, 11)).toEqual(chorusSketch(jam, 3).slice(0, 11));
  });

  it("plays chorus seven as it played chorus three", () => {
    expect(chorusSketch(jam, 7)).toEqual(chorusSketch(jam, 3));
  });

  it("breaks down again on chorus eight", () => {
    expect(chorusSketch(jam, 8)).toEqual(chorusSketch(jam, 4));
    expect(isBreakdownChorus(jam, 8)).toBe(true);
    expect(isBreakdownChorus(jam, 7)).toBe(false);
  });

  it("never ends, because a Build has no last chorus", () => {
    for (let chorus = 1; chorus <= 8; chorus += 1) {
      for (const moment of momentsForChorus(jam, chorus)) {
        expect(moment.ending, `chorus ${chorus}`).toBeUndefined();
      }
    }
  });
});

describe("the same blues as a Song of three choruses", () => {
  const jam = blues({ mode: "song", choruses: 3 });

  it("plays its first two choruses exactly as the Build does", () => {
    const built = blues({ mode: "build" });
    expect(chorusSketch(jam, 1)).toEqual(chorusSketch(built, 1));
    expect(chorusSketch(jam, 2)).toEqual(chorusSketch(built, 2));
  });

  // The last chorus. Everything as chorus three of the Build until bar eleven,
  // which is the run-up — a big fill wherever it falls, because a seam's small
  // one into the end of a tune is the band not knowing the tune is ending —
  // and then one downbeat with a crash under it and silence after. A blues
  // rings out, so the ending is a hold.
  it("runs up to the ending and holds the last one", () => {
    expect(chorusSketch(jam, 3)).toEqual([
      "loud full/full/full — crash",
      LOUD,
      LOUD,
      LOUD_SEAM,
      LOUD,
      LOUD,
      LOUD,
      LOUD_SEAM,
      LOUD,
      LOUD,
      "loud full/full/full big —",
      "loud stopTime/full/full — crash end:hold",
    ]);
  });

  it("ends the form on that bar and on no other", () => {
    const ending: string[] = [];
    for (let chorus = 1; chorus <= 3; chorus += 1) {
      momentsForChorus(jam, chorus).forEach((moment, bar) => {
        if (moment.ending) ending.push(`${chorus}:${bar}`);
      });
    }
    expect(ending).toEqual(["3:11"]);
  });

  it("holds the last chorus if a beat event ever arrives past it", () => {
    expect(chorusSketch(jam, 9)).toEqual(chorusSketch(jam, 3));
  });
});

describe("the styles that do not do what the blues does", () => {
  it("stops a funk tune dead rather than letting it ring", () => {
    const jam = createJam("funk", {
      grooveId: "funk",
      form: { kind: "loop8", bars: 8 },
      arrangement: { mode: "song", choruses: 2 },
    });
    const last = bandMoment(jam, 2, 7);
    expect(last.ending).toBe("stop");
    // No crash: the hit IS the ending, and a cymbal ringing over it is the
    // sound of a band that meant to hold.
    expect(last.crash).toBe(false);
    expect(last.drums).toBe("stopTime");
  });

  it("stops a hard rock tune dead too, though its family rings out", () => {
    const jam = createJam("hard", {
      grooveId: "hardRock",
      form: { kind: "loop8", bars: 8 },
      arrangement: { mode: "song", choruses: 2 },
    });
    expect(styleFamily(jam)).toBe("rock");
    expect(FAMILY_PLAN.rock.ending).toBe("hold");
    expect(bandMoment(jam, 2, 7).ending).toBe("stop");
  });

  it("opens a jazz tune up instead of making it louder", () => {
    const jam = createJam("jazz", {
      grooveId: "swingRide",
      form: { kind: "aaba32", bars: 32 },
      arrangement: { mode: "build" },
    });
    expect(stylePlan(jam).bigChorus).toBe("open");
    // Chorus three of a rock tune is a rung up; chorus three of a jazz tune is
    // where it was, with the cymbal marking the top of every A and the B.
    const third = momentsForChorus(jam, 3);
    expect(third.map((m) => m.intensity)).toEqual(new Array(32).fill("normal"));
    expect(third.flatMap((m, bar) => (m.crash ? [bar] : []))).toEqual([0, 8, 16, 24]);
    // And on chorus two it is only the top of the chorus.
    expect(momentsForChorus(jam, 2).flatMap((m, bar) => (m.crash ? [bar] : []))).toEqual([0]);
  });

  it("never plays stop-time on a bossa", () => {
    const jam = createJam("bossa", {
      grooveId: "bossa",
      form: { kind: "blues12", bars: 12 },
      arrangement: { mode: "build", breakdownEvery: 0 },
    });
    for (let chorus = 1; chorus <= 6; chorus += 1) {
      for (const moment of momentsForChorus(jam, chorus)) {
        expect(moment.drums, `chorus ${chorus}`).not.toBe("stopTime");
      }
    }
  });

  it("lets a ballad lift by opening up, whatever family it is filed under", () => {
    const jam = createJam("ballad", {
      grooveId: "ballad",
      form: { kind: "bars16", bars: 16 },
      arrangement: { mode: "build" },
    });
    expect(styleFamily(jam)).toBe("pop");
    expect(FAMILY_PLAN.pop.bigChorus).toBe("loud");
    expect(stylePlan(jam).bigChorus).toBe("open");
    expect(stylePlan(jam).stopTime).toBe(false);
  });

  it("reads the groove before the vibe, so a bossa dropped on a rock jam is a bossa", () => {
    const jam = createJam("mixed", { grooveId: "bossa", vibe: "rock" });
    expect(styleFamily(jam)).toBe("latin");
    // A groove of your own has no id to look up, so the vibe is all there is.
    const drawn = createJam("drawn", {
      vibe: "jazz",
      customGroove: {
        name: "mine",
        beatsPerBar: 4,
        ticksPerBeat: 2,
        bar: { kick: [], snare: [], hat: [], ride: [], crash: [] },
        fill: null,
      },
    });
    expect(styleFamily(drawn)).toBe("jazz");
  });
});

describe("the ladder moves with the record, not over the top of it", () => {
  it("plays the brief's table at Normal", () => {
    expect(shiftIntensity("normal", -1)).toBe("soft");
    expect(shiftIntensity("normal", 0)).toBe("normal");
    expect(shiftIntensity("normal", 1)).toBe("loud");
  });

  it("lifts a soft tune without ever shouting at it", () => {
    const jam = createJam("soft", {
      grooveId: "rock8",
      intensity: "soft",
      arrangement: { mode: "build" },
    });
    expect([1, 2, 3, 4].map((c) => bandMoment(jam, c, 0).intensity)).toEqual([
      // Chorus four is the breakdown, a rung below the chorus it sits in —
      // and soft is the bottom of the ladder, so it stays there.
      "soft",
      "soft",
      "normal",
      "soft",
    ]);
  });

  it("starts a loud tune where it means to", () => {
    const jam = createJam("loud", {
      grooveId: "hardRock",
      intensity: "loud",
      arrangement: { mode: "build", breakdownEvery: 0 },
    });
    expect([1, 2, 3].map((c) => bandMoment(jam, c, 0).intensity)).toEqual([
      "normal",
      "loud",
      "loud",
    ]);
  });
});

describe("the arrangement on the record", () => {
  it("reads an absent one as a loop, so nothing anybody saved changes", () => {
    const saved = createJam("old");
    delete saved.arrangement;
    expect(jamArrangement(saved).mode).toBe("loop");
    for (let chorus = 1; chorus <= 5; chorus += 1) {
      for (const moment of momentsForChorus(saved, chorus)) {
        expect(sketch(moment)).toBe("normal full/full/full — —");
      }
    }
  });

  it("gives a new jam a band that plays a tune", () => {
    expect(createJam("new").arrangement).toEqual({ mode: "build" });
  });

  it("fills the blanks in, and clamps what it is given", () => {
    expect(jamArrangement({ arrangement: { mode: "song" } })).toEqual({
      mode: "song",
      choruses: 4,
      intro: "fill",
      breakdownEvery: 4,
    });
    expect(jamArrangement({ arrangement: { mode: "song", choruses: 1 } }).choruses).toBe(2);
    expect(jamArrangement({ arrangement: { mode: "song", choruses: 999 } }).choruses).toBe(32);
    expect(jamArrangement({ arrangement: { mode: "build", breakdownEvery: 0 } }).breakdownEvery).toBe(
      0,
    );
  });

  it("lets the intro decide whether the band crashes into bar one", () => {
    const pickup = blues({ mode: "build", intro: "fill" });
    const cold = blues({ mode: "build", intro: "none" });
    expect(bandMoment(pickup, 1, 0).crash).toBe(true);
    expect(bandMoment(cold, 1, 0).crash).toBe(false);
    // Only the FIRST bar of the FIRST chorus. Every chorus after it is a top
    // the band is coming round to, and those are always marked.
    expect(bandMoment(cold, 2, 0).crash).toBe(true);
  });

  it("plays no fills and no crashes at all where the Fills switch is off", () => {
    const jam = createJam("quiet", {
      grooveId: "shuffle",
      form: { kind: "blues12", bars: 12 },
      fills: false,
      arrangement: { mode: "build" },
    });
    for (let chorus = 1; chorus <= 4; chorus += 1) {
      for (const moment of momentsForChorus(jam, chorus)) {
        expect(moment.fill, `chorus ${chorus}`).toBe("none");
      }
    }
    // With one exception, and it is the one gesture that is not decoration:
    // the band coming back out of a breakdown. That crash is how you know.
    const fourth = momentsForChorus(jam, 4);
    expect(fourth.flatMap((m, bar) => (m.crash ? [bar] : []))).toEqual([6]);
  });

  it("never breaks down a one-bar form, because there is nothing to break down from", () => {
    const jam = createJam("one", {
      grooveId: "rock8",
      form: { kind: "custom", bars: 1 },
      arrangement: { mode: "build" },
    });
    expect(bandMoment(jam, 4, 0).drums).toBe("full");
  });

  it("folds a strange bar back into the form rather than throwing at it", () => {
    const jam = blues({ mode: "build" });
    expect(sameMoment(bandMoment(jam, 2, 12), bandMoment(jam, 2, 0))).toBe(true);
    expect(sameMoment(bandMoment(jam, 2, -1), bandMoment(jam, 2, 11))).toBe(true);
    expect(sameMoment(bandMoment(jam, 0, 0), bandMoment(jam, 1, 0))).toBe(true);
  });
});

describe("the bar before this one", () => {
  const jam = blues({ mode: "build" });

  it("is the bar before it, and the last bar of the chorus before that", () => {
    expect(previousBar(jam, 3, 5)).toEqual({ chorus: 3, formBar: 4 });
    expect(previousBar(jam, 3, 0)).toEqual({ chorus: 2, formBar: 11 });
  });

  it("is nothing at all at the very top, because a start is not a change", () => {
    expect(previousBar(jam, 1, 0)).toBeNull();
  });
});

describe("the tables cover the content", () => {
  it("files every groove in the picker under a family", () => {
    // Through `styleFamily` rather than through the table alone: the content
    // pass landed `Groove.family`, so the table in front of it is now only the
    // eighteen grooves whose arrangement differs from their shelf, and the
    // other ninety-seven answer for themselves.
    const missing = GROOVES.filter((groove) => !FAMILY_PLAN[styleFamily({ grooveId: groove.id })]);
    expect(missing.map((g) => g.id)).toEqual([]);
    // And the table's own entries still win where they disagree with a shelf.
    for (const [id, family] of Object.entries(FAMILY_FOR_GROOVE)) {
      expect(styleFamily({ grooveId: id }), id).toBe(family);
    }
  });

  it("files every vibe tile under a family", () => {
    expect(VIBE_IDS.filter((id) => !(id in FAMILY_FOR_VIBE))).toEqual([]);
  });

  it("gives every family a plan", () => {
    for (const [family, plan] of Object.entries(FAMILY_PLAN)) {
      expect(["loud", "open"], family).toContain(plan.bigChorus);
      expect(["hold", "stop"], family).toContain(plan.ending);
    }
  });

  it("offers no breakdown every one chorus, which would not be a breakdown", () => {
    expect(JAM_BREAKDOWN_CHOICES).not.toContain(1);
    expect(JAM_BREAKDOWN_CHOICES[0]).toBe(0);
  });

  it("compares two moments by everything they say", () => {
    const a = bandMoment(blues({ mode: "build" }), 1, 0);
    expect(momentKey(a)).toBe(momentKey({ ...a }));
    expect(sameMoment(a, { ...a, crash: !a.crash })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// And what the compiler does with it
// ---------------------------------------------------------------------------

describe("compileJam applies the moment", () => {
  const rock = (arrangement: JamArrangement, fields: Partial<Jam> = {}) =>
    createJam("rock", {
      grooveId: "rock8",
      form: { kind: "blues12", bars: 12 },
      key: "C",
      band: { drums: true, bass: true, keys: true },
      fills: true,
      arrangement,
      ...fields,
    });

  it("leaves a looping jam byte for byte what it always was", () => {
    const jam = rock({ mode: "loop" });
    const config = compileJam(jam, { formBar: 3, chorus: 7 });
    // The engine's own fill machinery, exactly as it was: the fill travels,
    // the crash on the one is on, and nothing waits for a bar line.
    expect(config.fill).not.toBeNull();
    expect(config.crashOnOne).toBe(true);
    expect(config.applyAt).toBeUndefined();
    expect(config.endsForm).toBeUndefined();
    // And the chorus makes no difference to any of it.
    expect(compileJam(jam, { formBar: 3, chorus: 1 })).toEqual(config);
  });

  it("switches the engine's own fills off under an arrangement, so nothing doubles", () => {
    const config = compileJam(rock({ mode: "build" }), { formBar: 0, chorus: 2 });
    expect(config.fill).toBeNull();
    expect(config.fillEvery).toBe(0);
    expect(config.crashOnOne).toBe(false);
  });

  it("puts the fill's last beat over the bar at a seam, and the whole fill into a chorus", () => {
    const jam = rock({ mode: "build" });
    // rock8 is four beats of eighths: the last beat is ticks 6 and 7.
    const seam = compileJam(jam, { formBar: 3, chorus: 2 });
    const plain = compileJam(jam, { formBar: 2, chorus: 2 });
    expect(seam.bar.snare.slice(0, 6)).toEqual(plain.bar.snare.slice(0, 6));
    expect(seam.bar.snare.slice(6)).not.toEqual(plain.bar.snare.slice(6));
    // The big one is the whole fill, with its last tick taken to peak. Chorus
    // three, not two: rock plays stop-time on the last bar of every second
    // chorus, and a stop-time bar has no fill in it by design.
    const top = compileJam(jam, { formBar: 11, chorus: 3 });
    const lanes = [top.bar.kick, top.bar.snare, top.bar.tomHi ?? [], top.bar.tomLo ?? []];
    expect(lanes.some((lane) => lane[lane.length - 1] === 4)).toBe(true);
  });

  it("keeps the kick and the hats through a breakdown and sends nobody else", () => {
    const config = compileJam(rock({ mode: "build" }), { formBar: 0, chorus: 4 });
    expect(config.bar.snare.every((level) => level === 0)).toBe(true);
    expect(config.bar.ride.every((level) => level === 0)).toBe(true);
    expect(config.bar.tomHi).toBeUndefined();
    expect(config.bar.tomLo).toBeUndefined();
    expect(config.bar.kick.some((level) => level !== 0)).toBe(true);
    expect(config.bar.hat.some((level) => level !== 0)).toBe(true);
    // The keys are out for the first half; the bass walks on.
    expect(config.keys!.voicings.every((v) => v.length === 0)).toBe(true);
    expect(config.bass!.pitches.some((pitch) => pitch !== 0)).toBe(true);
  });

  it("keeps only the downbeat on a stop-time bar, on the drums and on both lines", () => {
    // A blues takes stop-time on the last bar of every second chorus.
    const jam = createJam("blues", {
      grooveId: "shuffle",
      form: { kind: "blues12", bars: 12 },
      key: "A blues",
      band: { drums: true, bass: true, keys: true },
      arrangement: { mode: "build" },
    });
    const config = compileJam(jam, { formBar: 11, chorus: 2 });
    expect(config.bar.kick[0]).toBe(2);
    expect(config.bar.kick.slice(1).every((level) => level === 0)).toBe(true);
    expect(config.bar.snare.slice(1).every((level) => level === 0)).toBe(true);
    // No cymbal over a gesture whose point is the silence after the hit.
    expect(config.bar.crash.every((level) => level === 0)).toBe(true);
    expect(config.bass!.pitches[0]).toBeGreaterThan(0);
    expect(config.bass!.pitches.slice(1).every((pitch) => pitch === 0)).toBe(true);
    expect(config.keys!.voicings[0].length).toBeGreaterThan(0);
    expect(config.keys!.voicings.slice(1).every((v) => v.length === 0)).toBe(true);
  });

  it("holds the bass on the strong beats through a held-back chorus", () => {
    const config = compileJam(rock({ mode: "build" }), { formBar: 0, chorus: 1 });
    const pitches = config.bass!.pitches;
    // Eight ticks, two strong beats: one and three. Each note is HELD to the
    // next, because a one-tick bass note is a blip rather than a bass player.
    expect(pitches.slice(0, 4).every((p) => p === pitches[0])).toBe(true);
    expect(pitches.slice(4).every((p) => p === pitches[4])).toBe(true);
    expect(pitches[0]).toBeGreaterThan(0);
  });

  it("leaves a waltz's held-back bass on the one alone, because a waltz has no three", () => {
    const jam = createJam("waltz", {
      grooveId: "waltz",
      form: { kind: "loop8", bars: 8 },
      key: "C",
      band: { drums: true, bass: true, keys: false },
      arrangement: { mode: "build" },
    });
    const pitches = compileJam(jam, { formBar: 0, chorus: 1 }).bass!.pitches;
    expect(new Set(pitches.filter((p) => p !== 0)).size).toBe(1);
  });

  it("keeps one voicing a bar from the keys while they are holding back", () => {
    const config = compileJam(rock({ mode: "build" }), { formBar: 4, chorus: 1 });
    expect(config.keys!.voicings.filter((v) => v.length > 0)).toHaveLength(1);
  });

  it("forces the crash to peak AFTER the intensity has had its say", () => {
    // Chorus one is soft, and Soft clears the crash lane — which is exactly
    // the bar a band most wants a crash on. Applied last, it survives.
    const config = compileJam(rock({ mode: "build" }), { formBar: 0, chorus: 1 });
    expect(config.intensity).toBe(0.7);
    expect(config.bar.crash[0]).toBe(4);
  });

  it("waits for the bar line only where the bar asks for something new", () => {
    const jam = rock({ mode: "build" });
    // Bar 0 of chorus 2 is the top of a chorus after the last bar of chorus 1:
    // a different loudness, a different bass, a crash. That waits.
    expect(compileJam(jam, { formBar: 0, chorus: 2 }).applyAt).toBe("barLine");
    // Bar 5 is the same as bar 4 was. Nothing to wait for.
    expect(compileJam(jam, { formBar: 5, chorus: 2 }).applyAt).toBeUndefined();
    // And the very first bar of a take is a start, not a change.
    expect(compileJam(jam, { formBar: 0, chorus: 1 }).applyAt).toBeUndefined();
  });

  it("ends the form on the last bar of a song, and on nothing else", () => {
    const jam = rock({ mode: "song", choruses: 3 });
    expect(compileJam(jam, { formBar: 11, chorus: 3 }).endsForm).toBe(true);
    expect(compileJam(jam, { formBar: 10, chorus: 3 }).endsForm).toBeUndefined();
    expect(compileJam(jam, { formBar: 11, chorus: 2 }).endsForm).toBeUndefined();
    expect(compileJam(rock({ mode: "build" }), { formBar: 11, chorus: 3 }).endsForm).toBeUndefined();
  });

  it("keeps every lane the width of the bar, whatever the moment asks for", () => {
    const jam = createJam("wide", {
      grooveId: "shuffle",
      form: { kind: "blues12", bars: 12 },
      key: "A blues",
      band: { drums: true, bass: true, keys: true },
      arrangement: { mode: "song", choruses: 4 },
    });
    for (let chorus = 1; chorus <= 4; chorus += 1) {
      for (let bar = 0; bar < 12; bar += 1) {
        const config = compileJam(jam, { formBar: bar, chorus });
        const ticks = config.beatsPerBar * config.ticksPerBeat;
        for (const lane of ["kick", "snare", "hat", "ride", "crash"] as const) {
          expect(config.bar[lane], `${chorus}:${bar} ${lane}`).toHaveLength(ticks);
        }
        for (const lane of ["hatOpen", "tomHi", "tomLo"] as const) {
          const row = config.bar[lane];
          if (row) expect(row, `${chorus}:${bar} ${lane}`).toHaveLength(ticks);
        }
        expect(config.bass!.pitches, `${chorus}:${bar} bass`).toHaveLength(ticks);
        expect(config.keys!.voicings, `${chorus}:${bar} keys`).toHaveLength(ticks);
      }
    }
  });

  it("still silences a drummer nobody asked for, arrangement or not", () => {
    const jam = rock({ mode: "build" }, { band: { drums: false, bass: true, keys: true } });
    const config = compileJam(jam, { formBar: 0, chorus: 3 });
    for (const lane of ["kick", "snare", "hat", "ride", "crash"] as const) {
      expect(config.bar[lane].every((level) => level === 0), lane).toBe(true);
    }
  });
});
