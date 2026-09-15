// The grooves are tables, and a table with the wrong number of columns is a
// bar the engine will refuse — silently, by playing the plain click. These
// checks are the only thing between a mistyped lane string and a jam that
// looks loaded and sounds like a metronome.
//
// The third pass added a second job: the rules in plans/tasks/jam-v3/BRIEF.md
// §2 are what make these tables read as a drummer rather than as a machine,
// and every one of them is the sort of thing that decays quietly under an
// edit. A hat row flattened back to one level, a ghost that crept onto a
// backbeat, a fill that stopped at the snare — none of those break anything,
// they just take the person back out of the drums. So they are tested.
//
// The fourth pass took the file from twenty-five tables to a hundred and
// fifteen, which changes what these checks are FOR. At twenty-five, an
// enumerated list of "the grooves with ghosts" was a description anybody
// could read; at a hundred and fifteen it would be a second copy of the file.
// So the lists that name grooves one by one now cover the original
// twenty-five — the ones a reader can hold in their head — and everything
// after them is held by rules that apply to all of it.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  GROOVES,
  GROOVE_FAMILIES,
  GROOVE_TAGS,
  grooveById,
  grooveTickCount,
  groovesInFamily,
  groovesWithTag,
  ruleGroove,
  DEFAULT_GROOVE_ID,
} from "./grooves";
import type { Groove } from "./grooves";
import { JAM_LANES, JAM_OPTIONAL_LANES, JAM_PERC_LANES } from "./types";
import type { JamLevel } from "./types";

/** The twenty-five the third pass left, which several checks still name. */
const FIRST_TWENTY_FIVE = GROOVES.slice(0, 25);

/** The ticks of one beat, as indices into a bar. */
function beatTicks(g: Groove, beat: number): number[] {
  return Array.from({ length: g.ticksPerBeat }, (_, i) => beat * g.ticksPerBeat + i);
}

/** The hat as it is actually played: the closed row and the open one together. */
function hatLine(g: Groove): JamLevel[] {
  return g.bar.hat.map((level, t) => Math.max(level, g.bar.hatOpen?.[t] ?? 0));
}

describe("the grooves it ships", () => {
  it("ships a hundred and fifteen, with unique ids", () => {
    expect(GROOVES).toHaveLength(115);
    expect(new Set(GROOVES.map((g) => g.id)).size).toBe(115);
  });

  it("keeps the first twenty where the footswitch left them", () => {
    // `stepGroove` in `useJamSession` steps this list in order, so everything
    // a later pass adds is appended and nothing before it moves.
    expect(GROOVES.slice(0, 20).map((g) => g.id)).toEqual([
      "rock8",
      "rock16",
      "halfTime",
      "shuffle",
      "waltz",
      "sixEight",
      "bossa",
      "swingRide",
      "funk",
      "oneDrop",
      "train",
      "boomBap",
      "fourOnFloor",
      "hardRock",
      "stomp",
      "doubleKick",
      "twoStep",
      "samba",
      "chaCha",
      "secondLine",
    ]);
  });

  it("keeps the five the third pass wrote where they were", () => {
    expect(GROOVES.slice(20, 25).map((g) => g.id)).toEqual([
      "ballad",
      "slowBlues",
      "jazzWaltz",
      "motown",
      "mambo",
    ]);
  });

  it("appends the fourth pass's ninety after them, family block by family block", () => {
    // Appended for the same reason everything before them was: the footswitch
    // steps this list in order, so inserting a Latin groove among the rock
    // ones would move every groove after it out from under the stomp that
    // used to reach it.
    const added = GROOVES.slice(25);
    expect(added).toHaveLength(90);
    expect(added.map((g) => g.family)).toEqual([
      ...Array<string>(13).fill("rock"),
      ...Array<string>(8).fill("blues"),
      ...Array<string>(10).fill("funk"),
      ...Array<string>(10).fill("jazz"),
      ...Array<string>(10).fill("latin"),
      ...Array<string>(12).fill("pop"),
      ...Array<string>(9).fill("metal"),
      ...Array<string>(6).fill("country"),
      ...Array<string>(12).fill("world"),
    ]);
  });

  it("files every groove on a shelf, with the counts the brief asked for", () => {
    // The rough targets in plans/tasks/jam-v4/W31-CONTENT.md §1. Written out
    // because "about a hundred and twenty" is not something a test can check
    // and "eighteen rock grooves" is.
    const counts = Object.fromEntries(
      GROOVE_FAMILIES.map((f) => [f, groovesInFamily(f).length]),
    );
    expect(counts).toEqual({
      rock: 18,
      blues: 10,
      funk: 14,
      jazz: 12,
      latin: 14,
      pop: 14,
      metal: 10,
      country: 10,
      world: 13,
    });
    // And nothing is on a shelf that does not exist, which is what makes the
    // chip row's nine chips the whole library rather than most of it.
    const shelved = GROOVE_FAMILIES.reduce((sum, f) => sum + counts[f], 0);
    expect(shelved).toBe(GROOVES.length);
  });

  it("gives every groove two or more tags, all from the closed vocabulary", () => {
    // Free text would make the tags worth nothing: two grooves that both swing
    // have to say so with the same word or nobody can search for either.
    for (const g of GROOVES) {
      expect(g.tags.length, `${g.id} tags`).toBeGreaterThanOrEqual(2);
      expect(new Set(g.tags).size, `${g.id} repeats a tag`).toBe(g.tags.length);
      for (const tag of g.tags) expect(GROOVE_TAGS, `${g.id} tag`).toContain(tag);
    }
    // Every word in the vocabulary is on at least one groove — a tag nothing
    // carries is a word somebody meant to use and did not.
    for (const tag of GROOVE_TAGS) {
      expect(groovesWithTag(tag).length, `nothing is tagged ${tag}`).toBeGreaterThan(0);
    }
  });

  it("says how every groove is counted", () => {
    // Not which grid it is written on — a bossa is written in sixteenths and
    // played in eighths, and the player's word is the second one. What every
    // groove must carry is SOME answer to "how does it go": a subdivision, a
    // feel, or a meter. A groove tagged only "sparse" and "driving" has been
    // described and not identified.
    const counted = [
      "quarters",
      "eighths",
      "sixteenths",
      "triplets",
      "sextuplets",
      "shuffle",
      "swing",
      "halfTime",
      "doubleTime",
      "twoFeel",
      "three",
      "six",
      "odd",
      "fourOnFloor",
      "offbeat",
    ];
    for (const g of GROOVES) {
      expect(g.tags.some((t) => counted.includes(t)), `${g.id} is not counted`).toBe(true);
    }
    // And the one grid nobody would describe any other way: six ticks to the
    // beat is a sextuplet bar, whatever else is true of it.
    for (const g of GROOVES) {
      if (g.ticksPerBeat === 6) expect(g.tags, g.id).toContain("sextuplets");
    }
  });

  it("gives every lane of every bar and fill exactly one column per tick", () => {
    for (const g of GROOVES) {
      const ticks = grooveTickCount(g);
      for (const lane of JAM_LANES) {
        expect(g.bar[lane], `${g.id} bar.${lane}`).toHaveLength(ticks);
        expect(g.fill[lane], `${g.id} fill.${lane}`).toHaveLength(ticks);
      }
      // The optional rows are absent or full width — never ragged, and never
      // an empty row carried around for nothing.
      for (const lane of JAM_OPTIONAL_LANES) {
        if (g.bar[lane]) expect(g.bar[lane], `${g.id} bar.${lane}`).toHaveLength(ticks);
        if (g.fill[lane]) expect(g.fill[lane], `${g.id} fill.${lane}`).toHaveLength(ticks);
      }
    }
  });

  it("writes only the five levels a drummer plays", () => {
    for (const g of GROOVES) {
      for (const lane of [...JAM_LANES, ...JAM_OPTIONAL_LANES]) {
        for (const level of [...(g.bar[lane] ?? []), ...(g.fill[lane] ?? [])]) {
          expect([0, 1, 2, 3, 4], `${g.id} ${lane}`).toContain(level);
        }
      }
    }
  });

  it("names every groove through a key, so the picker can be translated", () => {
    for (const g of GROOVES) expect(g.nameKey).toBe(`jam.groove.${g.id}`);
  });

  it("puts something on the one of every groove but the one-drop", () => {
    // A bar whose first column is empty starts with a hole, and the crash the
    // engine lands there has nothing to land with.
    //
    // The one-drop is the exception, and it is the exception on purpose: the
    // empty one IS the groove. Naming it here rather than loosening the rule
    // keeps the check honest for the other twenty-four.
    for (const g of GROOVES) {
      if (g.id === "oneDrop") continue;
      const onTheOne = JAM_LANES.some((lane) => g.bar[lane][0] !== 0);
      expect(onTheOne, `${g.id} plays nothing on the one`).toBe(true);
    }
    const oneDrop = grooveById("oneDrop");
    expect(JAM_LANES.every((lane) => oneDrop.bar[lane][0] === 0)).toBe(true);
  });
});

/**
 * The rules from the third pass's brief — the ones that are the difference
 * between a table and a drummer.
 */
describe("what makes them sound played", () => {
  it("never writes a row of one level on the hat or the ride", () => {
    // A hat row of identical strokes is the loudest tell that nobody played
    // this (plans/JAM_SOUND.md §2.9). Two strokes or fewer have no pattern to
    // flatten — the swing ride's foot on two and four, the jazz waltz's — so
    // the rule starts at three.
    for (const g of GROOVES) {
      for (const [name, row] of [
        ["hat", hatLine(g)],
        ["ride", g.bar.ride],
      ] as const) {
        const struck = row.filter((l) => l !== 0);
        if (struck.length < 3) continue;
        expect(new Set(struck).size, `${g.id} ${name} is flat`).toBeGreaterThan(1);
      }
    }
  });

  it("accents the beat and hits the off-beat on every eighth-note hat", () => {
    for (const id of ["rock8", "halfTime", "waltz", "boomBap", "ballad", "motown"]) {
      const g = grooveById(id);
      const line = hatLine(g);
      for (let beat = 0; beat < g.beatsPerBar; beat += 1) {
        const [on, off] = beatTicks(g, beat);
        expect(line[on], `${id} beat ${beat + 1}`).toBe(2);
        expect(line[off], `${id} "and" of ${beat + 1}`).toBe(1);
      }
    }
  });

  it("writes accent / ghost / hit / ghost on every sixteenth-note hat", () => {
    // The hand coming down hard, up light, down, up. One figure, and most of
    // the difference between these four tables and the ones a box plays.
    for (const id of ["rock16", "funk", "bossa", "samba"]) {
      const g = grooveById(id);
      expect(g.ticksPerBeat).toBe(4);
      for (let beat = 0; beat < 4; beat += 1) {
        expect(g.bar.hat.slice(beat * 4, beat * 4 + 4), `${id} beat ${beat + 1}`).toEqual([
          2, 3, 1, 3,
        ]);
      }
    }
  });

  it("never puts a ghost on a backbeat", () => {
    // Beats two and four, in the grooves that HAVE a backbeat — a snare
    // accent somewhere. The grooves whose quiet snare is a cross-stick have
    // no backbeat at all and are not being tested for one: their level-3
    // strokes are the figure, not a filler between louder strokes.
    for (const g of GROOVES) {
      if (g.beatsPerBar !== 4) continue;
      if (!g.bar.snare.includes(2)) continue;
      for (const beat of [1, 3]) {
        const tick = beat * g.ticksPerBeat;
        expect(g.bar.snare[tick], `${g.id} ghost on beat ${beat + 1}`).not.toBe(3);
      }
    }
  });

  it("writes ghosts only where the style has them, among the original twenty-five", () => {
    const withGhosts = FIRST_TWENTY_FIVE.filter((g) => g.bar.snare.includes(3)).map((g) => g.id);
    expect(withGhosts.sort()).toEqual(
      [
        // The cross-stick grooves: every one of their snare strokes is a rim
        // click, which is why they set the flag.
        "ballad",
        "bossa",
        "chaCha",
        "oneDrop",
        // And the styles whose groove IS the quiet strokes between the loud
        // ones.
        "boomBap",
        "funk",
        "halfTime",
        "rock16",
        "samba",
        "secondLine",
        "shuffle",
        "slowBlues",
      ].sort(),
    );
  });

  it("says a groove has ghosts in the tags whenever its snare does", () => {
    // The rule that replaces the list above for the other ninety. The two
    // have to agree, or the tag is decoration: a ghosted snare is tagged
    // "ghosts" unless the quiet strokes are cross-sticks, which is a
    // different sound and says so with `snareGhostIsRim`.
    const disagreeing: string[] = [];
    for (const g of GROOVES) {
      if (g.snareGhostIsRim) {
        expect(g.tags, `${g.id} plays the rim`).toContain("crossStick");
        continue;
      }
      if (g.bar.snare.includes(3) !== g.tags.includes("ghosts")) disagreeing.push(g.id);
    }
    expect(disagreeing).toEqual([]);
  });

  it("says which grooves play the rim rather than a ghost", () => {
    const rim = GROOVES.filter((g) => g.snareGhostIsRim).map((g) => g.id);
    // The four the third pass wrote are still the first four, in order.
    expect(rim.slice(0, 4)).toEqual(["bossa", "oneDrop", "chaCha", "ballad"]);
    expect(rim.slice(4)).toEqual([
      "latinSon",
      "latinGuaguanco",
      "latinBolero",
      "latinBaiao",
      "latinBossa23",
      "worldSteppers",
      "worldRocksteady",
      "worldTango",
    ]);
    for (const id of rim) {
      const g = grooveById(id);
      // A cross-stick groove has no backbeat to contradict it: every stroke
      // on its snare lane is the click.
      expect(g.bar.snare.filter((l) => l !== 0 && l !== 3), id).toEqual([]);
    }
  });

  it("accents the backbeat wherever there is one", () => {
    // Two and four in a bar of four, three in a half-time bar — and an accent
    // rather than a hit, because that is what a backbeat is.
    for (const [id, beats] of [
      ["rock8", [1, 3]],
      ["rock16", [1, 3]],
      ["funk", [1, 3]],
      ["motown", [1, 3]],
      ["twoStep", [1, 3]],
      ["doubleKick", [1, 3]],
      ["hardRock", [1, 3]],
      ["halfTime", [2]],
      ["stomp", [2]],
      ["slowBlues", [1, 3]],
    ] as const) {
      const g = grooveById(id);
      for (const beat of beats) {
        expect(g.bar.snare[beat * g.ticksPerBeat], `${id} beat ${beat + 1}`).toBe(2);
      }
    }
  });

  it("accents the kick on the downbeat and hits it on the way through", () => {
    for (const g of GROOVES) {
      if (g.bar.kick[0] === 0) continue;
      // The swing ride and the jazz waltz feather the bass drum: a ghost all
      // the way through, which is the part rather than a quiet version of it.
      if (g.bar.kick[0] === 3) continue;
      // And a surdo leans on two and four rather than on the one. That is the
      // one thing that makes a samba a samba rather than a fast bossa, and it
      // is the same in a partido alto, so the two are named here rather than
      // allowed for by loosening the rule for everybody.
      if (g.id === "samba" || g.id === "latinPartidoAlto") {
        expect(g.bar.kick[0], g.id).toBe(1);
        continue;
      }
      expect(g.bar.kick[0], `${g.id} kick on the one`).toBe(2);
    }
    // And the double kick alternates, so sixteen of them a bar stay countable.
    expect(grooveById("doubleKick").bar.kick).toEqual([
      2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1,
    ]);
  });

  it("writes the open hats in the row the engine can hear", () => {
    // Hard rock and boom bap used to mean "open" by writing an accent on the
    // closed-hat lane, which the engine had no way to know: one lane, one
    // voice, so what it produced was a louder closed hat.
    const hard = grooveById("hardRock");
    expect(hard.bar.hatOpen).toEqual([0, 1, 0, 1, 0, 1, 0, 1]);
    expect([1, 3, 5, 7].every((t) => hard.bar.hat[t] === 0)).toBe(true);
    expect([0, 2, 4, 6].every((t) => hard.bar.hat[t] === 2)).toBe(true);

    // Boom bap opens one stroke: the last eighth, which pulls the bar over.
    const boom = grooveById("boomBap");
    expect(boom.bar.hatOpen).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(boom.bar.hat[7]).toBe(0);
  });

  it("keeps a crash in the bar only where the cymbal is part of the beat", () => {
    // Everywhere else the crash belongs to the section, and it is
    // `crashOnOne`'s to land.
    const withCrash = GROOVES.filter((g) => g.bar.crash.some((l) => l !== 0)).map((g) => g.id);
    expect(withCrash).toEqual(["hardRock"]);
    const hard = grooveById("hardRock");
    expect(hard.bar.crash[0]).toBe(2);
  });
});

describe("the grooves, one by one", () => {
  it("writes the five later grooves the way they are played", () => {
    // Each of these is a one-line answer to "what makes it that groove", and
    // each is the line a retyped lane string would break.
    const funk = grooveById("funk");
    // The kick never lands on beats 2, 3 or 4 — that is the syncopation.
    expect([4, 8, 12].every((t) => funk.bar.kick[t] === 0)).toBe(true);
    expect(funk.bar.snare).toContain(3);

    // The one-drop: kick and cross-stick together on three, hats off-beat only.
    const oneDrop = grooveById("oneDrop");
    expect(oneDrop.bar.kick[4]).not.toBe(0);
    expect(oneDrop.bar.snare[4]).toBe(3);
    expect([0, 2, 4, 6].every((t) => oneDrop.bar.hat[t] === 0)).toBe(true);
    expect([1, 3, 5, 7].every((t) => oneDrop.bar.hat[t] !== 0)).toBe(true);

    // The train: sixteenths all the way, accented on every "and".
    const train = grooveById("train");
    expect(train.bar.snare.every((l) => l !== 0)).toBe(true);
    expect([2, 6, 10, 14].every((t) => train.bar.snare[t] === 2)).toBe(true);
    expect(train.bar.kick.filter((l) => l !== 0)).toHaveLength(2);

    // Boom bap: one and the "and" of two, backbeat on two and four, and the
    // ghosts under each backbeat.
    const boomBap = grooveById("boomBap");
    expect(boomBap.bar.kick[0]).not.toBe(0);
    expect(boomBap.bar.kick[3]).not.toBe(0);
    expect(boomBap.bar.snare[2]).toBe(2);
    expect(boomBap.bar.snare[6]).toBe(2);
    expect(boomBap.bar.snare[1]).toBe(3);

    // Four on the floor: every beat, and the hat on none of them.
    const four = grooveById("fourOnFloor");
    expect([0, 2, 4, 6].every((t) => four.bar.kick[t] !== 0)).toBe(true);
    expect([0, 2, 4, 6].every((t) => four.bar.hat[t] === 0)).toBe(true);
    expect([1, 3, 5, 7].every((t) => four.bar.hat[t] !== 0)).toBe(true);
  });

  it("writes the four drivers with no ghost note anywhere", () => {
    // The whole point of B4: the owner could not get a raw drummer out of any
    // setting, and a ghost note is the quietest thing on the kit. A ghost
    // creeping back into one of these four is the bug this catches.
    for (const id of ["hardRock", "stomp", "doubleKick", "twoStep"]) {
      const g = grooveById(id);
      for (const lane of JAM_LANES) {
        expect(g.bar[lane], `${id} ${lane}`).not.toContain(3);
      }
    }
  });

  it("writes the seven the vibes brought the way they are played", () => {
    // Stomp: half-time, so the snare is on three and nowhere else.
    const stomp = grooveById("stomp");
    expect(stomp.bar.snare.flatMap((l, i) => (l ? [i] : []))).toEqual([4]);
    expect(stomp.bar.kick.filter((l) => l !== 0).length).toBeGreaterThanOrEqual(4);
    expect(stomp.bar.crash.every((l) => l === 0)).toBe(true);

    // Double kick: a kick on every sixteenth, and a backbeat still on 2 and 4.
    const dk = grooveById("doubleKick");
    expect(dk.bar.kick.every((l) => l !== 0)).toBe(true);
    expect(dk.bar.snare.flatMap((l, i) => (l ? [i] : []))).toEqual([4, 12]);

    // Two-step: an accented backbeat and quarters on the hat — what tells it
    // apart from rock eighths, which it would otherwise be.
    const two = grooveById("twoStep");
    expect([2, 6].every((t) => two.bar.snare[t] === 2)).toBe(true);
    expect([1, 3, 5, 7].every((t) => two.bar.hat[t] === 0)).toBe(true);
    expect([0, 2, 4, 6].every((t) => two.bar.hat[t] !== 0)).toBe(true);

    // Samba: the surdo leans on two and four. That is the one thing that
    // makes it a samba rather than a bossa played fast.
    const samba = grooveById("samba");
    expect(samba.bar.kick[4]).toBe(2);
    expect(samba.bar.kick[12]).toBe(2);
    expect(samba.bar.kick[0]).toBe(1);
    expect(samba.bar.hat.every((l) => l !== 0)).toBe(true);

    // Cha-cha: four, the "and" of four, one — written across the bar line,
    // and played on the rim.
    const cha = grooveById("chaCha");
    expect(cha.bar.snare.flatMap((l, i) => (l ? [i] : []))).toEqual([0, 6, 7]);
    expect(cha.snareGhostIsRim).toBe(true);

    // Second line: a syncopated street-beat kick, ghosts on the snare, and
    // its two accents — the backbeat on two and the push on the "a" of three.
    const second = grooveById("secondLine");
    expect(second.bar.snare).toContain(3);
    expect(second.bar.snare.flatMap((l, i) => (l === 2 ? [i] : []))).toEqual([4, 11]);
    expect([4, 12].every((t) => second.bar.kick[t] === 0)).toBe(true);
    // Beat four is left empty: the push has just happened, and a ghost on the
    // backbeat would take it away.
    expect(second.bar.snare[12]).toBe(0);
  });

  it("writes the five the third pass added the way they are played", () => {
    // Ballad: the kick on one and three, and a cross-stick on two and four.
    const ballad = grooveById("ballad");
    expect(ballad.snareGhostIsRim).toBe(true);
    expect(ballad.bar.snare.flatMap((l, i) => (l ? [i] : []))).toEqual([2, 6]);
    expect(ballad.bar.snare[2]).toBe(3);

    // Slow blues: twelve-eight — all three triplets on the hat, every beat.
    const slow = grooveById("slowBlues");
    expect([slow.beatsPerBar, slow.ticksPerBeat]).toEqual([4, 3]);
    expect(slow.bar.hat.every((l) => l !== 0)).toBe(true);
    expect(slow.bar.snare[2]).toBe(3);
    expect(slow.bar.snare[3]).toBe(2);

    // Jazz waltz: three, and the ride carries it because there is no backbeat.
    const jw = grooveById("jazzWaltz");
    expect([jw.beatsPerBar, jw.ticksPerBeat]).toEqual([3, 3]);
    expect(jw.bar.snare.every((l) => l === 0)).toBe(true);
    expect(jw.bar.ride.flatMap((l, i) => (l ? [i] : []))).toEqual([0, 3, 5, 6, 8]);
    expect(jw.bar.kick[0]).toBe(3);

    // Motown: the snare on all four, accented on two and four.
    const motown = grooveById("motown");
    expect(motown.bar.snare).toEqual([1, 0, 2, 0, 1, 0, 2, 0]);

    // Mambo: the bell on the ride, the tumbao on the kick, no snare at all.
    const mambo = grooveById("mambo");
    expect(mambo.bar.snare.every((l) => l === 0)).toBe(true);
    expect(mambo.bar.ride.flatMap((l, i) => (l ? [i] : []))).toEqual([0, 4, 6, 8, 12, 14]);
    expect(mambo.bar.kick.flatMap((l, i) => (l ? [i] : []))).toEqual([0, 6, 12]);
  });

  it("carries the meter each groove is actually written in", () => {
    const meters = Object.fromEntries(
      GROOVES.map((g) => [g.id, [g.beatsPerBar, g.ticksPerBeat]]),
    );
    expect(meters.waltz).toEqual([3, 2]);
    expect(meters.sixEight).toEqual([6, 1]);
    expect(meters.shuffle).toEqual([4, 3]);
    expect(meters.swingRide).toEqual([4, 3]);
    expect(meters.bossa).toEqual([4, 4]);
    expect(meters.rock16).toEqual([4, 4]);
    expect(meters.funk).toEqual([4, 4]);
    expect(meters.train).toEqual([4, 4]);
    expect(meters.oneDrop).toEqual([4, 2]);
    expect(meters.boomBap).toEqual([4, 2]);
    expect(meters.fourOnFloor).toEqual([4, 2]);
    expect(meters.hardRock).toEqual([4, 2]);
    expect(meters.stomp).toEqual([4, 2]);
    expect(meters.doubleKick).toEqual([4, 4]);
    expect(meters.twoStep).toEqual([4, 2]);
    expect(meters.samba).toEqual([4, 4]);
    expect(meters.chaCha).toEqual([4, 2]);
    expect(meters.secondLine).toEqual([4, 4]);
    expect(meters.ballad).toEqual([4, 2]);
    expect(meters.slowBlues).toEqual([4, 3]);
    expect(meters.jazzWaltz).toEqual([3, 3]);
    expect(meters.motown).toEqual([4, 2]);
    expect(meters.mambo).toEqual([4, 4]);
  });

  it("leaves the shuffle's middle triplet empty — that is what a shuffle is", () => {
    const shuffle = grooveById("shuffle");
    for (let beat = 0; beat < shuffle.beatsPerBar; beat++) {
      for (const lane of JAM_LANES) {
        expect(shuffle.bar[lane][beat * 3 + 1], `${lane} beat ${beat}`).toBe(0);
      }
    }
  });

  it("gives the swing ride its ride and the rock grooves their hat", () => {
    // The lane a groove is played on is part of what it is called.
    const swing = grooveById("swingRide");
    expect(swing.bar.ride.some((l) => l !== 0)).toBe(true);
    expect(swing.bar.hat.filter((l) => l !== 0)).toHaveLength(2);
    // And the ride leans on two and four, which is what swing is.
    expect([0, 6].every((t) => swing.bar.ride[t] === 1)).toBe(true);
    expect([3, 9].every((t) => swing.bar.ride[t] === 2)).toBe(true);
    expect(grooveById("rock8").bar.hat.every((l) => l !== 0)).toBe(true);
    expect(grooveById("rock8").bar.ride.every((l) => l === 0)).toBe(true);
  });

  it("writes ghosts into the sixteenth-note grooves", () => {
    // Without them a funk groove is the same pattern a drum machine plays.
    expect(grooveById("rock16").bar.snare).toContain(3);
    expect(grooveById("swingRide").bar.kick).toContain(3);
  });
});

describe("the fill", () => {
  it("gives every fill two tom rows the width of the bar", () => {
    for (const g of GROOVES) {
      const ticks = grooveTickCount(g);
      expect(g.fill.tomHi, `${g.id} fill.tomHi`).toHaveLength(ticks);
      expect(g.fill.tomLo, `${g.id} fill.tomLo`).toHaveLength(ticks);
      // And the BAR does not carry them: most grooves never leave the snare.
      expect(g.bar.tomHi, `${g.id} bar.tomHi`).toBeUndefined();
      expect(g.bar.tomLo, `${g.id} bar.tomLo`).toBeUndefined();
    }
  });

  it("ends every fill on the low tom, at a peak", () => {
    // The last tick of the bar, and the loudest thing in it. The crash the
    // engine puts on the next bar's one is the answer to it.
    for (const g of GROOVES) {
      const last = grooveTickCount(g) - 1;
      expect(g.fill.tomLo?.[last], `${g.id} fill does not peak`).toBe(4);
      for (const lane of JAM_LANES) {
        expect(g.fill[lane][last], `${g.id} ${lane} under the peak`).toBe(0);
      }
    }
  });

  it("walks snare → high tom → low tom across the last beat", () => {
    for (const g of GROOVES) {
      const ticks = grooveTickCount(g);
      const lastBeat = ticks - g.ticksPerBeat;
      const highs = g.fill.tomHi!.flatMap((l, i) => (l ? [i] : []));
      const lows = g.fill.tomLo!.flatMap((l, i) => (l ? [i] : []));
      // Everything is in the last beat, the high tom before the low one, and
      // the high tom at an accent under the low tom's peak.
      expect(lows, g.id).toEqual([ticks - 1]);
      for (const i of highs) {
        expect(i, `${g.id} tomHi @${i}`).toBeGreaterThanOrEqual(lastBeat);
        expect(i, `${g.id} tomHi @${i}`).toBeLessThan(ticks - 1);
        expect(g.fill.tomHi![i], `${g.id} tomHi @${i}`).toBe(2);
      }
      // One tick to a beat has no room for a walk; everything else has one.
      if (g.ticksPerBeat > 1) expect(highs.length, `${g.id} has no high tom`).toBeGreaterThan(0);
    }
  });

  it("keeps the time going up to the fill, and leans on the last backbeat", () => {
    for (const g of GROOVES) {
      const ticks = grooveTickCount(g);
      // The fill starts one tick after the last stroke the fill still plays on
      // a lane other than the snare — which is the honest way to find it from
      // outside, and unlike "the first tick where those lanes go quiet" it
      // does not mistake a hole in the groove for the edge of the fill. The
      // cascara has nothing at all on beat three, and under the old reading
      // its fill appeared to start there.
      const others = JAM_LANES.filter((l) => l !== "snare");
      let last = -1;
      for (let i = 0; i < ticks; i += 1) {
        if (others.some((l) => g.fill[l][i] !== 0)) last = i;
      }
      const from = last + 1;
      if (from <= 0 || from >= ticks) continue;
      for (let i = 0; i < from; i += 1) {
        for (const lane of JAM_LANES) {
          if (lane === "snare") continue;
          expect(g.fill[lane][i], `${g.id} ${lane} @${i}`).toBe(g.bar[lane][i]);
        }
        // The snare is the bar's too, with one edit: the last backbeat before
        // the fill is played as a peak.
        const before = g.bar.snare[i];
        const after = g.fill.snare[i];
        expect(after === before || (before === 2 && after === 4), `${g.id} snare @${i}`).toBe(
          true,
        );
      }
      // At most one peak in the front of the bar, and it is the LAST accent.
      const peaks = g.fill.snare.slice(0, from).flatMap((l, i) => (l === 4 ? [i] : []));
      expect(peaks.length, `${g.id} peaks`).toBeLessThanOrEqual(1);
      if (peaks.length === 1) {
        const accents = g.bar.snare.slice(0, from).flatMap((l, i) => (l === 2 ? [i] : []));
        expect(peaks[0], g.id).toBe(accents[accents.length - 1]);
      }
      expect(ticks).toBeGreaterThan(from);
    }
  });

  it("gives the half-time grooves and the ballad one beat of fill, not two", () => {
    // A bar already counted in halves has no room for a two-beat fill without
    // the fill becoming the bar.
    for (const id of ["halfTime", "stomp", "ballad"]) {
      const g = grooveById(id);
      const ticks = grooveTickCount(g);
      // Beat three is still the groove.
      const beatThree = 2 * g.ticksPerBeat;
      expect(g.fill.hat[beatThree], `${id} hat on three`).toBe(g.bar.hat[beatThree]);
      expect(ticks - g.ticksPerBeat).toBe(3 * g.ticksPerBeat);
    }
    // Against rock eighths, which loses beats three AND four.
    const rock = grooveById("rock8");
    expect(rock.fill.hat.slice(4).every((l) => l === 0)).toBe(true);
  });

  it("writes rock eighths' fill out in full, because it is the shape of all of them", () => {
    const g = grooveById("rock8");
    // Beats one and two: the groove, with the backbeat on two taken to a peak.
    expect(g.fill.kick).toEqual([2, 0, 0, 0, 0, 0, 0, 0]);
    expect(g.fill.hat).toEqual([2, 1, 2, 1, 0, 0, 0, 0]);
    // Beat three: the run-up. Beat four: the high tom, then the low tom's peak.
    expect(g.fill.snare).toEqual([0, 0, 4, 0, 1, 1, 0, 0]);
    expect(g.fill.tomHi).toEqual([0, 0, 0, 0, 0, 0, 2, 0]);
    expect(g.fill.tomLo).toEqual([0, 0, 0, 0, 0, 0, 0, 4]);
  });

  it("silences an open hat across the fill", () => {
    // Otherwise the toms play over a cymbal that is still ringing from the
    // bar this fill replaced.
    const hard = grooveById("hardRock");
    expect(hard.fill.hatOpen?.slice(4).every((l) => l === 0)).toBe(true);
    expect(hard.fill.hatOpen?.slice(0, 4)).toEqual(hard.bar.hatOpen?.slice(0, 4));
  });
});

/**
 * The drummer for a meter nobody wrote a groove for. Twenty-five grooves is
 * twenty-five grooves and none of them is in seven, so the alternative to this
 * rule is a jam in seven with no drummer in it (JAM_MODE §4.1).
 */
describe("the rule groove", () => {
  it("puts the kick on the first beat of every group", () => {
    // 5/4 as 3+2, eighths: groups open on beats 0 and 3, which is ticks 0 and 6.
    const g = ruleGroove([3, 2], 2);
    expect(g.beatsPerBar).toBe(5);
    expect(g.ticksPerBeat).toBe(2);
    expect(g.bar.kick).toEqual([2, 0, 0, 0, 0, 0, 2, 0, 0, 0]);
  });

  it("accents the snare on the last beat of every group of two or more", () => {
    // 3+2: the last beats are 2 and 4, which is ticks 4 and 8. An accent,
    // because a backbeat is an accent wherever it lands.
    expect(ruleGroove([3, 2], 2).bar.snare).toEqual([0, 0, 0, 0, 2, 0, 0, 0, 2, 0]);
    // A group of one has no room for a backbeat: it would land on the kick.
    expect(ruleGroove([1, 3], 1).bar.snare).toEqual([0, 0, 0, 2]);
  });

  it("puts hats on every tick, accented where a group opens", () => {
    // 7/8 as 2+2+3, eighths: fourteen ticks, accents at 0, 4 and 8.
    const g = ruleGroove([2, 2, 3], 2);
    expect(g.bar.hat).toEqual([2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 1, 1]);
  });

  it("builds 7/8 as 2+2+3 in sixteenths at the right width", () => {
    const g = ruleGroove([2, 2, 3], 4);
    expect(g.beatsPerBar).toBe(7);
    expect(grooveTickCount(g)).toBe(28);
    for (const lane of JAM_LANES) {
      expect(g.bar[lane], `bar.${lane}`).toHaveLength(28);
      expect(g.fill[lane], `fill.${lane}`).toHaveLength(28);
    }
    expect(g.fill.tomHi).toHaveLength(28);
    expect(g.fill.tomLo).toHaveLength(28);
    // Kicks on beats 0, 2 and 4 — ticks 0, 8 and 16 at four ticks a beat.
    expect(g.bar.kick.flatMap((level, i) => (level ? [i] : []))).toEqual([0, 8, 16]);
    // Snares on beats 1, 3 and 6 — ticks 4, 12 and 24.
    expect(g.bar.snare.flatMap((level, i) => (level ? [i] : []))).toEqual([4, 12, 24]);
  });

  it("builds 5/4 as 3+2 in sixteenths at the right width", () => {
    const g = ruleGroove([3, 2], 4);
    expect(grooveTickCount(g)).toBe(20);
    expect(g.bar.kick.flatMap((level, i) => (level ? [i] : []))).toEqual([0, 12]);
    expect(g.bar.snare.flatMap((level, i) => (level ? [i] : []))).toEqual([8, 16]);
  });

  it("runs the snare over the last group and finishes on the toms", () => {
    // 2+2+3 in eighths: the last group is beats 4-6, ticks 8-13. The snare
    // runs the first two of those beats, then the high tom and the low tom's
    // peak take the last one.
    const g = ruleGroove([2, 2, 3], 2);
    expect(g.fill.snare.slice(8)).toEqual([1, 1, 1, 1, 0, 0]);
    expect(g.fill.tomHi!.slice(12)).toEqual([2, 0]);
    expect(g.fill.tomLo!.slice(12)).toEqual([0, 4]);
    // Everything else is out of the way so the fill is heard as a fill.
    expect(g.fill.kick.slice(8)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(g.fill.hat.slice(8)).toEqual([0, 0, 0, 0, 0, 0]);
    // The bar up to the fill is the groove — a fill that threw the whole bar
    // away would stop the time dead — bar the last backbeat, which is leaned
    // on: beat 3, tick 6.
    expect(g.fill.hat.slice(0, 8)).toEqual(g.bar.hat.slice(0, 8));
    expect(g.fill.snare[6]).toBe(4);
    expect(g.bar.snare[6]).toBe(2);
  });

  it("fills at the bar's own resolution, however fine it is", () => {
    // 3+2 in sixteenths: the last group is beats 3-4, ticks 12-19. Beat 4 is
    // the run-up, and beat 5 walks off the snare onto the toms.
    const g = ruleGroove([3, 2], 4);
    expect(g.fill.snare.slice(12)).toEqual([1, 1, 1, 1, 1, 1, 0, 0]);
    expect(g.fill.tomHi!.slice(16)).toEqual([0, 0, 2, 0]);
    expect(g.fill.tomLo!.slice(16)).toEqual([0, 0, 0, 4]);
  });

  it("gives every lane one column per tick, for every meter and resolution", () => {
    for (const groups of [[2], [3], [4], [3, 2], [2, 3], [2, 2, 3], [3, 2, 2], [3, 3, 3, 3]]) {
      for (const ticks of [1, 2, 3, 4, 6] as const) {
        const g = ruleGroove(groups, ticks);
        const width = grooveTickCount(g);
        expect(width).toBe(groups.reduce((sum, n) => sum + n, 0) * ticks);
        for (const lane of JAM_LANES) {
          expect(g.bar[lane], `${groups}/${ticks} bar.${lane}`).toHaveLength(width);
          expect(g.fill[lane], `${groups}/${ticks} fill.${lane}`).toHaveLength(width);
        }
        expect(g.fill.tomLo, `${groups}/${ticks} fill.tomLo`).toHaveLength(width);
        // However odd the bar, the fill still ends on the peak.
        expect(g.fill.tomLo![width - 1], `${groups}/${ticks} peak`).toBe(4);
      }
    }
  });

  it("writes only the five levels a drummer plays", () => {
    for (const groups of [[3, 2], [2, 2, 3]]) {
      for (const ticks of [2, 4] as const) {
        const g = ruleGroove(groups, ticks);
        for (const lane of [...JAM_LANES, ...JAM_OPTIONAL_LANES]) {
          for (const level of [...(g.bar[lane] ?? []), ...(g.fill[lane] ?? [])]) {
            expect([0, 1, 2, 3, 4]).toContain(level);
          }
        }
      }
    }
  });

  it("falls back to a bar of four rather than to no bar at all", () => {
    // A meter array out of a saved record can be empty or nonsense; a jam
    // with no drummer would be the worse answer.
    expect(ruleGroove([], 2).beatsPerBar).toBe(4);
    expect(ruleGroove([0, -3], 2).beatsPerBar).toBe(4);
  });

  it("leaves the crash to the engine", () => {
    const g = ruleGroove([2, 2, 3], 2);
    expect(g.bar.crash.every((level) => level === 0)).toBe(true);
    expect(g.fill.crash.every((level) => level === 0)).toBe(true);
  });

  it("never claims a cross-stick for a bar nobody wrote", () => {
    expect(ruleGroove([2, 2, 3], 2).snareGhostIsRim).toBeUndefined();
  });
});

describe("looking a groove up", () => {
  it("falls back rather than returning nothing for a groove that went", () => {
    // A jam saved by a later build can name a groove this one does not have.
    expect(grooveById("no-such-groove").id).toBe(DEFAULT_GROOVE_ID);
  });

  it("finds every groove it ships", () => {
    for (const g of GROOVES) expect(grooveById(g.id)).toBe(g);
  });
});

// ---------------------------------------------------------------------------
// The percussionist (fifth pass, plans/tasks/jam-v5/BRIEF.md)
// ---------------------------------------------------------------------------
//
// The contract names, family by family, where a percussionist belongs, and the
// counts below are that contract written as numbers. Exact rather than "at
// least", deliberately: the failure worth catching is not a groove with too
// few percussion rows, it is a shaker arriving on a thrash bar because
// whatever wrote it found that easy.

/** Which percussion rows a groove's bar carries, in the contract's order. */
function percLanesOf(pattern: Groove["bar"]): string[] {
  return JAM_PERC_LANES.filter((lane) => pattern[lane] !== undefined);
}

function withPercussion(family: string): Groove[] {
  return GROOVES.filter((g) => g.family === family && percLanesOf(g.bar).length > 0);
}

/**
 * The son clave, both ways round, on a bar of sixteenths.
 *
 * The only two patterns a `claves` row may play on a sixteenth groove. Which
 * TICKS speak is what is compared and not the levels: a clave player leans on
 * different strokes in different musics, but move one stroke and it is the
 * other clave, which is a different dance.
 */
const SON_CLAVE_3_2 = [0, 3, 6, 10, 12];
const SON_CLAVE_2_3 = [2, 4, 8, 11, 14];

describe("the percussionist's parts", () => {
  it("gives every percussion row exactly the bar's width", () => {
    // The same reason as the drums: a row of the wrong length is a table the
    // engine refuses, and it refuses it by playing the plain click.
    for (const g of GROOVES) {
      const width = grooveTickCount(g);
      for (const lane of percLanesOf(g.bar)) {
        expect(g.bar[lane as "shaker"], `${g.id} bar.${lane}`).toHaveLength(width);
      }
    }
  });

  it("never writes a percussion row of one level", () => {
    // The W28 rule, applied to the second player. A shaker of identical
    // accents is the same tell as a hat row of them: nobody played it.
    for (const g of GROOVES) {
      for (const lane of percLanesOf(g.bar)) {
        const row = g.bar[lane as "shaker"] as JamLevel[];
        const struck = new Set(row.filter((level) => level !== 0));
        expect(struck.size, `${g.id} ${lane} levels`).toBeGreaterThan(1);
      }
    }
  });

  it("writes only the five levels on the percussion rows too", () => {
    for (const g of GROOVES) {
      for (const lane of percLanesOf(g.bar)) {
        for (const level of g.bar[lane as "shaker"] as JamLevel[]) {
          expect([0, 1, 2, 3, 4], `${g.id} ${lane}`).toContain(level);
        }
      }
    }
  });

  it("plays one of the two son claves wherever claves are written in sixteenths", () => {
    // Scoped to sixteenths because that is the only grid a son clave fits on:
    // its second stroke is the "a" of one, and a bar of eighths has nowhere to
    // put it. The one eighth-note claves row in the file — the tango's
    // three-three-two — is a different figure, and its comment says so.
    for (const g of GROOVES) {
      const row = g.bar.claves;
      if (!row || g.ticksPerBeat !== 4) continue;
      const struck = row.flatMap((level, tick) => (level !== 0 ? [tick] : []));
      const matches = [SON_CLAVE_3_2, SON_CLAVE_2_3].some(
        (clave) => clave.length === struck.length && clave.every((t, i) => t === struck[i]),
      );
      expect(matches, `${g.id} claves at ${struck.join(",")}`).toBe(true);
    }
  });

  it("gives the tumbao its open tones on four and the 'and' of four", () => {
    // The one figure the contract spells out stroke by stroke. Every groove
    // whose comment says "tumbao" puts the two open tones — the loudest
    // strokes on the high conga — in the last beat of the bar, and the bar is
    // not a tumbao without them.
    for (const id of ["chaCha", "mambo", "latinCascara", "latinSongo", "funkBoogaloo"]) {
      const g = grooveById(id);
      const row = g.bar.congaHi!;
      const four = grooveTickCount(g) - g.ticksPerBeat;
      const andOfFour = four + Math.floor(g.ticksPerBeat / 2);
      expect(row[four], `${id} open tone on four`).toBe(2);
      expect(row[andOfFour], `${id} open tone on the "and" of four`).toBe(2);
    }
  });

  it("gives the martillo eight strokes with the accent on the open low bongo", () => {
    for (const id of ["latinSon", "latinBolero"]) {
      const g = grooveById(id);
      const hi = g.bar.bongoHi!;
      expect(hi.filter((level) => level !== 0), `${id} martillo strokes`).toHaveLength(8);
      // The macho never takes the accent; the accent is what the low drum is
      // for, and that is the whole shape of a martillo.
      expect(hi.includes(2), `${id} macho stays under the accent`).toBe(false);
      expect(g.bar.bongoLo![0], `${id} open low on the one`).toBe(2);
    }
  });

  it("puts the tambourine's accent on a backbeat with a lighter stroke in front", () => {
    // The contract's rule for the pop end of the library: two and four are the
    // accents, and the stroke before each is the shake that says a hand is
    // moving rather than landing.
    for (const id of ["popBallad", "popIndie", "bluesRhumba", "rockMotorik", "funkSoul"]) {
      const g = grooveById(id);
      const row = g.bar.tambourine!;
      const accents = row.flatMap((level, tick) => (level === 2 ? [tick] : []));
      expect(accents.length, `${id} tambourine accents`).toBe(2);
      for (const at of accents) {
        expect(at % g.ticksPerBeat, `${id} accent lands on a beat`).toBe(0);
        expect(row[at - 1], `${id} shake before the accent`).not.toBe(0);
        expect(row[at - 1], `${id} shake lighter than the accent`).not.toBe(2);
      }
    }
  });

  it("gives each family exactly the count the contract names", () => {
    const counts: Record<string, number> = {
      latin: 14,
      world: 13,
      funk: 14,
      pop: 14,
      blues: 1,
      rock: 1,
      jazz: 1,
      country: 0,
      metal: 0,
    };
    for (const family of GROOVE_FAMILIES) {
      expect(withPercussion(family).length, family).toBe(counts[family]);
    }
  });

  it("names the three grooves outside latin, world, funk and pop that get one", () => {
    // Small enough to write down, and worth writing down: an exception nobody
    // enumerated is a rule nobody has.
    expect(withPercussion("rock").map((g) => g.id)).toEqual(["rockMotorik"]);
    expect(withPercussion("blues").map((g) => g.id)).toEqual(["bluesRhumba"]);
    expect(withPercussion("jazz").map((g) => g.id)).toEqual(["jazzSoulJazz"]);
  });

  it("leaves the train beat and the bluegrass bar alone, as the contract asks", () => {
    for (const id of ["train", "countryBluegrass"]) {
      expect(percLanesOf(grooveById(id).bar), id).toEqual([]);
    }
  });

  it("uses all ten voices somewhere in the library", () => {
    // A voice nobody plays is a sample in the installer for nothing.
    for (const lane of JAM_PERC_LANES) {
      expect(
        GROOVES.some((g) => g.bar[lane] !== undefined),
        `${lane} is played by nobody`,
      ).toBe(true);
    }
  });

  it("keeps the percussion out of the fills", () => {
    // A fill is the DRUMMER leaving the groove; the percussionist stays in it.
    // `compileJam` carries the bar's rows across the fill, so a fill with rows
    // of its own would be two shakers for one bar every time round the form.
    for (const g of GROOVES) {
      expect(percLanesOf(g.fill), `${g.id} fill`).toEqual([]);
    }
  });

  it("says what the percussionist is doing over every single groove", () => {
    // The parts that have one say what it is; the ones that do not say why
    // not. The SOURCE is read rather than the export, because the comment is
    // the thing being checked, and a comment is the one part of this file a
    // type cannot hold in place.
    // Vitest runs from the project root, as `i18n.locales.test.ts` relies on.
    const file = path.resolve(process.cwd(), "src/jam/grooves.ts");
    const source = readFileSync(file, "utf8");
    const silent = GROOVES.length - GROOVES.filter((g) => percLanesOf(g.bar).length).length;
    // Anchored to the comment blocks' own indentation, so the file header's
    // mention of the convention is not counted as one of the lines.
    expect(source.match(/^ {5}Percussion: /gm) ?? []).toHaveLength(GROOVES.length);
    expect(source.match(/^ {5}Percussion: none/gm) ?? []).toHaveLength(silent);
  });
});
