// The shelf Yames ships with, checked note by note.
//
// These seven pieces are the first thing a new player presses play on, and
// nobody proof-reads them after this — they are text in a file, they go
// through the real importer, and a fret that does not exist on the tuning
// above it would be a wrong note on somebody's first minute with the mode.
//
// So: every piece parses, every bar adds up to its own meter, every note is
// on a string and a fret the instrument has, the sections are named, and the
// band has something to play.
import { describe, expect, it } from "vitest";
import { buildBacking, importSong, parseSongFile, songId } from "../import";
import { TICKS_PER_QUARTER } from "../types";
import { STARTER_SHELF } from "./pieces";

const bytesOf = (tex: string) => new TextEncoder().encode(tex);

/** Every piece, imported the way a file a player brings in is imported. */
const imported = STARTER_SHELF.map((piece) => ({
  piece,
  ...importSong(bytesOf(piece.tex), piece.fileName, piece.trackIndex),
}));

describe("the starter shelf", () => {
  it("is six to eight pieces, which is what the brief asked for", () => {
    expect(STARTER_SHELF.length).toBeGreaterThanOrEqual(6);
    expect(STARTER_SHELF.length).toBeLessThanOrEqual(8);
  });

  it("has a file name each, and no two the same", () => {
    const names = STARTER_SHELF.map((p) => p.fileName);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name.endsWith(".alphatex")).toBe(true);
  });

  /**
   * The id is a hash of the bytes and the track, so two pieces that are
   * byte-identical would be ONE song in the library and the shelf would
   * silently be six. It is also what makes seeding idempotent.
   */
  it("gives seven distinct songs", () => {
    const ids = STARTER_SHELF.map((p) => songId(bytesOf(p.tex), p.trackIndex));
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const { piece, score, warnings } of imported) {
    describe(piece.fileName, () => {
      it("parses, with a title and a line about what it is for", () => {
        expect(score.title.length).toBeGreaterThan(0);
        // `\artist` carries the one-line purpose — it is the only field that
        // reaches the screen, and a study has no artist.
        expect(score.artist.length).toBeGreaterThan(10);
        expect(score.notes.length).toBeGreaterThan(0);
      });

      it("has nothing the importer had to change on the way in", () => {
        // A bar that overflows its meter or a tempo that had to be flattened
        // is a mistake in the text above, not a file somebody else wrote.
        expect(warnings).toEqual([]);
      });

      it("adds up: every bar is exactly its own meter", () => {
        expect(score.bars.length).toBe(8);
        for (const bar of score.bars) {
          const meter = [...score.meterMap]
            .filter((m) => m.bar <= bar.index)
            .pop() ?? { numerator: 4, denominator: 4 };
          const want = (TICKS_PER_QUARTER * 4 * meter.numerator) / meter.denominator;
          expect(
            bar.lengthTicks,
            `bar ${bar.index + 1} is ${bar.lengthTicks} ticks, not ${want}`,
          ).toBe(want);
        }
        // And they are laid end to end with no gap and no overlap.
        let at = score.bars[0].startTick;
        for (const bar of score.bars) {
          expect(bar.startTick, `bar ${bar.index + 1} does not follow the one before`).toBe(at);
          at += bar.lengthTicks;
        }
      });

      it("has no note the instrument cannot play", () => {
        const strings = score.tuning.length;
        expect(strings).toBeGreaterThanOrEqual(4);
        for (const note of score.notes) {
          expect(
            note.string >= 1 && note.string <= strings,
            `a note on string ${note.string} of a ${strings}-string instrument`,
          ).toBe(true);
          // Nothing above the 22nd fret, and nothing behind the nut. The
          // shelf is for people who have just opened the app.
          expect(note.fret >= 0 && note.fret <= 22, `fret ${note.fret}`).toBe(true);
          // And the sounding pitch is the open string plus the fret plus the
          // capo, which is the one arithmetic the importer could get wrong
          // silently (`W4-FINDINGS.md` §2 — the string-numbering trap).
          expect(note.midi, `string ${note.string} fret ${note.fret}`).toBe(
            score.tuning[note.string - 1] + note.fret + score.capo,
          );
        }
      });

      it("keeps every note inside the bar it was written in", () => {
        for (const note of score.notes) {
          const bar = score.bars.find(
            (b) => note.tick >= b.startTick && note.tick < b.startTick + b.lengthTicks,
          );
          expect(bar, `a note at tick ${note.tick} is in no bar`).toBeDefined();
        }
      });

      it("names its sections, and they cover the whole piece", () => {
        expect(score.sections.length).toBe(2);
        expect(score.sections[0].startBar).toBe(0);
        expect(score.sections[1].endBar).toBe(score.bars.length - 1);
        for (const section of score.sections) {
          expect(section.name.trim().length).toBeGreaterThan(0);
          expect(section.endBar).toBeGreaterThanOrEqual(section.startBar);
        }
      });

      it("runs at a tempo somebody would practise at", () => {
        expect(score.tempoMap.length).toBeGreaterThan(0);
        expect(score.tempoMap[0].tick).toBe(0);
        for (const step of score.tempoMap) {
          expect(step.bpm, `${step.bpm} BPM`).toBeGreaterThanOrEqual(60);
          expect(step.bpm, `${step.bpm} BPM`).toBeLessThanOrEqual(140);
        }
      });

      it("gives the band something to play", () => {
        const parsed = parseSongFile(bytesOf(piece.tex), piece.fileName);
        const { backing, leftOut } = buildBacking(parsed, piece.trackIndex);
        // Drums, and one melodic part — a bass behind a guitar, or keys
        // behind the bass study, where doubling the bass would hide the
        // thing the study is about.
        const roles = backing.tracks.map((t) => t.role).sort();
        expect(roles).toContain("drums");
        expect(roles.length, `only ${roles.join(", ")}`).toBe(2);
        for (const track of backing.tracks) {
          expect(track.notes.length, `${track.role} has nothing to play`).toBeGreaterThan(0);
          // A General MIDI number the engine's voices can address.
          for (const note of track.notes) {
            expect(note.midi >= 0 && note.midi <= 127).toBe(true);
            expect(note.velocity > 0 && note.velocity <= 1).toBe(true);
          }
        }
        // Nothing in the file the band has nobody to play: every track is
        // either the player's or one of the three rows.
        expect(leftOut).toEqual([]);
      });
    });
  }

  /**
   * The Ode to Joy theme, note for note.
   *
   * The one piece on the shelf nobody here wrote, and the only one where
   * being wrong would be embarrassing rather than merely unhelpful. Written
   * in C, so the melody is C D E F G = MIDI 72 74 76 77 79 in the octave
   * alphaTab numbers this tuning in.
   *
   * E E F G | G F E D | C C D E | E. D D |
   * E E F G | G F E D | C C D E | D. C C |
   */
  it("plays the Ode to Joy theme as Beethoven wrote it", () => {
    const ode = imported.find((i) => i.piece.fileName.startsWith("Ode to Joy"))!;
    const C = 72, D = 74, E = 76, F = 77, G = 79;
    const Q = TICKS_PER_QUARTER;

    const wanted: [number, number][] = [
      // bar 1              bar 2
      [E, Q], [E, Q], [F, Q], [G, Q], [G, Q], [F, Q], [E, Q], [D, Q],
      // bar 3              bar 4: E dotted quarter, D eighth, D half
      [C, Q], [C, Q], [D, Q], [E, Q], [E, Q * 1.5], [D, Q / 2], [D, Q * 2],
      // bars 5-7 repeat
      [E, Q], [E, Q], [F, Q], [G, Q], [G, Q], [F, Q], [E, Q], [D, Q],
      [C, Q], [C, Q], [D, Q], [E, Q],
      // bar 8: D dotted quarter, C eighth, C half
      [D, Q * 1.5], [C, Q / 2], [C, Q * 2],
    ];

    expect(ode.score.notes.length, "the theme is thirty-one notes").toBe(wanted.length);
    expect(ode.score.notes.map((n) => [n.midi, n.durTicks])).toEqual(wanted);

    // And they run end to end with no gap: the theme has no rest in it.
    let at = 0;
    for (const note of ode.score.notes) {
      expect(note.tick, `a gap before MIDI ${note.midi}`).toBe(at);
      at += note.durTicks;
    }
    expect(at, "the theme is eight bars of four").toBe(Q * 4 * 8);
  });
});
