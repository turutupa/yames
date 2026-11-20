// A variant's own words, rewritten from the Exercise's. Three kinds of proof:
// variants read by hand (the expected text was written from the variant's notes
// before the describer was run on it), a truth test over every pack that has
// the flag on, and the flag off changing nothing.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { VARIANT_TEXT_SPEC, MINIMAL_SPEC } from "./fixtures/minimal";
import type { Exercise, ExerciseVariant, PathDoc } from "./format";
import { buildPath, serializePath } from "./generate";
import type { PathSpec } from "./spec";
import { SPECS } from "./specs/index";
import { validatePath } from "./validate";
import { describeVariant, mergeSameFacts, sentencesOf, variantText } from "./variantText";
import type { ExerciseText, TextSide, VariantText } from "./variantText";

const built = new Map<string, PathDoc>();
function doc(pathId: string): PathDoc {
  if (!built.has(pathId)) built.set(pathId, buildPath(SPECS.find((s) => s.id === pathId)!));
  return built.get(pathId)!;
}

const exercisesOf = (d: PathDoc): Exercise[] => [...d.steps.flatMap((s) => s.exercises), ...(d.levels ?? []).flatMap((l) => l.warmups)];

function sides(ex: Exercise, v: ExerciseVariant): { exercise: ExerciseText; variant: TextSide } {
  return {
    exercise: {
      purpose: ex.purpose,
      howTo: ex.howTo,
      notes: ex.notes,
      position: ex.position,
      harmony: ex.harmony,
      chords: ex.chords,
      params: ex.variation!.variants[0].params,
    },
    variant: { notes: v.notes, position: v.position, harmony: v.harmony, chords: v.chords, params: v.params },
  };
}

/** What the describer says for one variant of a real Exercise. */
function said(pathId: string, exerciseId: string, variantId: string): VariantText | null {
  const ex = exercisesOf(doc(pathId)).find((e) => e.id === exerciseId);
  if (!ex) throw new Error(`no Exercise ${pathId}/${exerciseId}`);
  const v = ex.variation?.variants.find((x) => x.id === variantId);
  if (!v) throw new Error(`no variant ${exerciseId}#${variantId}: ${ex.variation?.variants.map((x) => x.id).join(" | ")}`);
  const { exercise, variant } = sides(ex, v);
  return variantText(exercise, variant);
}

describe("variants read by hand", () => {
  // Tapping, top E 12-5-8 moved to the G string, where the scale gives 12-5-7:
  // 8 becomes 7, and the note the little finger played is now the third finger's.
  it("Tapping: the cell on the G string says 7, and says nothing about the little finger", () => {
    expect(said("tapping", "first-taps.tap-pull-hammer", "stringSet=G:-12-5-7")).toEqual({
      purpose: "The cell: tap fret 12, pull off to 5, hammer on at 7.",
      howTo: ["Triplets, three to the click, with the tap on the click."],
    });
  });

  it("Tapping: the cell on the B string keeps its frets and fingers, and is an E minor chord", () => {
    // Read from the pack: the generator rewrites the spec's how-to, which still ends with the "first
    // version" line; the pack's Exercise has lost it, so `said` would find these two lines unchanged.
    const cell = exercisesOf(doc("tapping")).find((e) => e.id === "first-taps.tap-pull-hammer")!;
    const onB = cell.variation!.variants.find((v) => v.id === "stringSet=B:-12-5-8")!;
    expect(onB.howTo).toEqual(cell.howTo);
    expect({ purpose: onB.purpose, howTo: onB.howTo }).toEqual({
      purpose: "The cell: tap fret 12, pull off to 5, hammer on at 8. B, E, G: an E minor chord, one note at a time, in triplets.",
      howTo: [
        "Triplets, three to the click, with the tap on the click.",
        "First finger at fret 5, little finger hammers fret 8. As the little finger lands, the tapping finger is already on its way back down.",
      ],
    });
  });

  it("Tapping: the roll down on the G string", () => {
    expect(said("tapping", "two-taps-and-skips.roll-down", "stringSet=G:-12-5-7")).toEqual({
      purpose: "Tap 12, pull off to 7, pull off to 5, hammer 7, in sixteenths.",
      howTo: ["Sixteenths, a tap on every beat: 12, 7, 5, 7.", "Both fretting fingers are down when you tap."],
    });
  });

  it("Tapping: the scale under the tap on the B string, frets and note names", () => {
    expect(said("tapping", "scale-under-the-tap.scale-tap", "stringSet=B:-12-over-5-6-8")).toEqual({
      purpose: "Tap 12, pull off to 8, 6 and 5, hammer 6 and 8. B, G, F, E, F, G: six to the beat.",
      howTo: [
        "Sextuplets. One tap a beat; the fretting hand plays the other five notes.",
        "Lean a little on the fourth note, the E at fret 5. It is the middle of the beat and keeps the six even.",
      ],
    });
  });

  // Legato, B string 5-6-8 moved to the G string 4-5-7: the same three fingers a fret lower.
  it("Legato (stringSet): the triplet on the G string keeps its fingers", () => {
    expect(said("legato", "hammer-and-pull.triplet-up", "stringSet=G-4-5-7")).toEqual({
      purpose: "B, C, D on the G string as a triplet: pick, hammer, hammer. Three fingers in a row, the second hammer-on with the little finger.",
      howTo: [
        "Triplets, three to the click. Bar 1 picked. Bar 2: pick fret 4 on each beat, hammer 5 with the second finger and 7 with the little finger.",
        "Leave the second finger down when the little finger hammers. Lift both together just before the next pick.",
      ],
    });
  });

  // The same triplet on the top string is 5-7-8: fingers 1, 3, 4, so nothing about the second finger is said.
  it("Legato (stringSet): the triplet on the top string loses the finger sentences", () => {
    expect(said("legato", "hammer-and-pull.triplet-up", "stringSet=top-E-5-7-8")).toEqual({
      purpose: "A, B, C on the top string as a triplet: pick, hammer, hammer.",
      howTo: ["Triplets, three to the click. Bar 1 picked."],
    });
  });

  // Five frets up, 12 to 16 is a much shorter reach than 7 to 11: "at full stretch" is not said there (round 2, rule 6).
  it("Legato (key): three notes a string in E minor, five frets up", () => {
    expect(said("legato", "three-per-string.three-up", "key=E")).toEqual({
      purpose:
        "E minor from the low E string to the D string, then round again through the A string. One bar picked, one bar with a pick on each string and two hammer-ons.",
      howTo: ["Triplets. Low E string 12, 14, 15; A string 12, 14, 15; D string 12, 14, 16; A string again. Bar 2 picks only the first note of each string."],
    });
    // One fret up it is still a full stretch.
    expect(said("legato", "three-per-string.three-up", "key=C")!.howTo![1]).toBe(
      "The D string's 12 is the little finger at full stretch. Hammer it from the second finger on 10, not from the first.",
    );
  });

  it("Legato (key): the hammered box in E", () => {
    expect(said("legato", "first-hammers.hammer-tune", "key=E")).toEqual({
      purpose: "The E minor pentatonic box, two notes a string, each pair one pick and one hammer-on. It already sounds like a blues-rock phrase.",
      howTo: [
        "Eighths. Pick the lower note on each string and hammer the upper: D string 12 to 14, G string 12 to 14, B string 12 to 15, and back.",
        "Third finger hammers the frets at 14, little finger the 15 on the B string. The phrase ends on a picked B on the A string.",
      ],
    });
  });

  // Rhythm Foundations: on the A and D strings both fretted notes are at fret 2, played by the second
  // finger. "fret 3 ... and fret 2" would become "fret 2 ... and fret 2": the same fact is said once, of
  // both strings, and the finger sentence ("Third finger for fret 3") is not written.
  it.each([
    ["stringSet=A-and-D", "On the A and D strings the fretted note is at fret 2."],
    ["stringSet=D-and-G", "On the D and G strings the fretted note is at fret 2."],
  ])("Rhythm Foundations: %s never says 'fret 2 ... and fret 2'", (variantId, frets) => {
    const own = said("rhythm-foundations", "on-the-beat.halves", variantId);
    expect(own).toEqual({
      howTo: ["Count '1, 2' through each half note and play the quarters on 3 and 4. The last bar is one note held for all four clicks.", frets],
    });
    expect(JSON.stringify(own).match(/fret 2/g)).toHaveLength(1);
    expect(JSON.stringify(own)).not.toMatch(/fret 3|finger/);
  });

  it("Rhythm Foundations: a line with no frets in it is left to the Exercise", () => {
    expect(said("rhythm-foundations", "rests.stops", "stringSet=A-and-D")).toBeNull();
    expect(said("rhythm-foundations", "off-beats.dotted-quarter", "stringSet=D-and-G")).toBeNull();
  });

  it("Know the Neck (key): broken thirds in A", () => {
    expect(said("know-the-neck", "thirds.thirds-g-b", "key=A")).toEqual({
      howTo: [
        "Straight eighths, two to a click, 50 BPM up to a pass at 80.",
        "In A: frets 2 and 2, 4 and 3, 6 and 5, 7 and 7, 9 and 9. Same fret is major; one fret back on the B string is minor.",
      ],
    });
  });

  it("Know the Neck (position): another box is other notes, and gets no text", () => {
    for (const box of ["box-2", "box-3", "box-4", "box-5"]) {
      expect(said("know-the-neck", "five-boxes.each-box", `position=${box}`), box).toBeNull();
    }
  });

  // A warm-up over key and string: the fingers the content prints differ where a
  // whole step becomes a half step, so the sentence that names fingers goes.
  it("a warm-up with key x stringSet: what cannot be said is left out, or nothing is written", () => {
    expect(said("legato", "warmup-beginner.hammer-climb", "key=A,stringSet=4")).toEqual({ howTo: ["Start well under your clean tempo."] });
    expect(said("rhythm-foundations", "warmup-beginner.walk-up", "key=C,stringSet=3")).toBeNull();
  });

  it("Shred (key): the Gilbert loop in D", () => {
    expect(said("shred", "gilbert.six-loop", "key=D")).toEqual({
      purpose: "A, C on the B string, D, F, D on the top string, C again: six notes, all inside crossings, looped.",
      howTo: [
        "Sextuplets. B string fret 10 then 13, top string 10, 13, 10, then B string 13, and round again from the B string's 10.",
        "Down, up, down, up, down, up: six is even, so every loop starts on a downstroke.",
      ],
    });
  });

  it("Scales and Modes (key): C Dorian, spelled with its flats", () => {
    expect(said("scales-and-modes", "dorian.dorian-shape", "key=C")).toEqual({
      purpose: "C Dorian, one octave up and back: C, D, Eb, F, G, A, Bb, C, with A at the D string's fret 7.",
      howTo: [
        "Straight eighths, 50 BPM up to a pass at 80.",
        "Low E string 8, 10, 11; A string 8 and 10; D string 7, 8 and 10. The first finger reaches back one fret for the A.",
      ],
    });
  });

  it("Classic Rock (key): the root riff in D", () => {
    expect(said("classic-rock", "riffs.root-riff", "key=D")).toEqual({
      purpose:
        "A single-note riff on the two low strings that walks the roots a power chord would play: D, F, G and the E below F. The riff a band locks to.",
      howTo: [
        "Straight eighths, 80 BPM up to a pass at 110, over a rock beat.",
        // Bar 2 would say "D, D, A and G on the A string": an A on the A string, at fret 12. Not written (round 2, rule 4).
        "Bar 1: D at fret 10 on the low E twice (muted), F at 13, D, G at fret 10 on the A string, D, F, E at 12.",
        "First finger on fret 10, third on 12, fourth on 13. The hand doesn't move.",
      ],
    });
  });

  // Blues, the walking line in E: the root is the open low E string. "Frets 0 and 4" is
  // not something a teacher says, and a stretch from an open string is no stretch.
  it("Blues (key): a fretted note that becomes an open string is not given a fret number", () => {
    expect(said("blues-pentatonics", "twelve-bar.walking", "key=E")).toEqual({
      purpose: "A walking shuffle line through the whole form, so you're playing the changes rather than following them.",
      howTo: [
        "Shuffle eighths, all twelve bars, 55 BPM up to a pass at 90.",
        "On the faster rungs, pick lighter and smaller. The pick should only just clear the string. Wide strokes that worked at 80 BPM arrive late at 110 BPM.",
      ],
    });
  });

  it("Blues (key): a sentence that lists every key ('in G, C or D') is not rewritten, so the variant has no text", () => {
    expect(said("blues-pentatonics", "box-keys.chorus-in-keys", "key=C")).toBeNull();
  });
});

// What three proof-readers found in the first 329 variants: two false sentences and four patterns.
describe("round 2: rules closed after the proof-read", () => {
  const text = (own: VariantText | null) => [own?.purpose ?? "", ...(own?.howTo ?? [])].join(" ");

  it("1. a/an is never repaired on a capital 'A' that is a string or a note", () => {
    const own = said("legato", "six-string-runs.six-up", "key=C");
    expect(own!.howTo![0]).toBe("Sextuplets. Low E 8, 10, 11; A 8, 10, 11; D 8, 10, 12; G 8, 10, 12; B 9, 11, 13; top E 10, 11, 13, and hold the last note.");
    for (const spec of SPECS.filter((s) => s.variantText)) {
      for (const ex of exercisesOf(doc(spec.id))) {
        for (const v of ex.variation?.variants ?? []) expect(text(v), `${ex.id}#${v.id}`).not.toMatch(/\bAn \d/);
      }
    }
  });

  it("2. 'the strings below' is where the figure lies: kept only on the same strings", () => {
    // Octaves on the A and G strings moved to the low E and D: there is no string below the low E.
    expect(text(said("shred", "string-skipping.octaves", "stringSet=low-E-and-D"))).not.toMatch(/below|between/);
  });

  it("3. 'the fret-12 figure' is a name: it is not renumbered, and stays only where the fret does", () => {
    for (const exerciseId of ["speed-bursts.one-beat", "speed-bursts.two-beats", "speed-bursts.expanding"]) {
      for (const stringSet of ["3", "4"]) expect(text(said("shred", exerciseId, `stringSet=${stringSet}`)), exerciseId).not.toMatch(/fret-\d/);
    }
    // On the B string the frets are the same ones, and the name stays.
    expect(text(said("shred", "speed-bursts.one-beat", "stringSet=2"))).toContain("the fret-12 figure from its top, 15, 13, 12, 13 on the B string");
  });

  it("4. a note with the name of the string it is on, at a fret, reads as the open string: not written", () => {
    // In D the phrase ends on the A string's fret 12, an A.
    expect(text(said("legato", "first-hammers.hammer-tune", "key=D"))).not.toMatch(/\bA on the A string/);
    expect(text(said("legato", "first-pulls.pull-tune", "key=D"))).not.toMatch(/\bA on the A string/);
    expect(text(said("legato", "hammer-and-pull.triplet-tune", "key=D"))).not.toMatch(/\bG on the G string/);
    expect(text(said("classic-rock", "riffs.root-riff", "key=D"))).not.toMatch(/A and G on the A string/);
    // In E it is a B on the A string: said.
    expect(text(said("legato", "first-hammers.hammer-tune", "key=E"))).toContain("The phrase ends on a picked B on the A string.");
  });

  it("5. a key put where 'A' may have been the article takes 'The' before a thing, nothing when it stands alone", () => {
    expect(said("know-the-neck", "warmup-advanced.two-boxes-up", "key=G,position=boxes-1-and-2")!.purpose).toBe(
      "The G minor pentatonic box going up and the box above it coming down. A different key and pair of boxes each time.",
    );
    expect(said("scales-and-modes", "relative-minor.minor-shape", "key=B")!.purpose).toBe(
      "B natural minor on the low three strings, up and back. A different key comes round on each Take.",
    );
    expect(said("scales-and-modes", "dorian.dorian-shape", "key=C")!.purpose).toMatch(/^C Dorian, one octave/);
  });

  it("6. a stretch or a reach is not said five frets or more away", () => {
    expect(text(said("legato", "three-per-string.three-up", "key=E"))).not.toMatch(/stretch/);
    expect(text(said("legato", "three-per-string.three-up", "key=D"))).toContain("at full stretch");
    // Blues, the walking line: three frets up it is still first finger to fourth over five frets.
    expect(text(said("blues-pentatonics", "twelve-bar.walking", "key=C"))).toContain("It's a stretch from fret 8 to 12");
  });
});

describe("round 3: three holes closed, on made-up lines", () => {
  const note = (string: number, fret: number, tick: number) => ({ string, fret, midi: [64, 59, 55, 50, 45, 40][string - 1] + fret, tick, dur: 480, tech: [] });
  const side = (places: Array<[number, number]>, fret = 5): TextSide => ({ notes: places.map(([s, f], i) => note(s, f, i * 480)), position: { fret, shifts: "none" } });
  const minor = (root: string, spelled: string[]) => ({ kind: "scale" as const, root, scale: "naturalMinor", spelled, cover: false });
  const aMinor = minor("A", ["A", "B", "C", "D", "E", "F", "G"]);
  const dMinor = minor("D", ["D", "E", "F", "G", "A", "Bb", "C"]);
  const eMinor = minor("E", ["E", "F#", "G", "A", "B", "C", "D"]);
  const even = "Play it evenly and let every note ring.";

  it("1. a capital 'A' after a colon is a note or a key, never the article", () => {
    // A, C, D, C with the roots on the low E and A strings; a string higher it is D, F, G, F.
    const ex: ExerciseText = {
      ...side([[6, 5], [6, 8], [5, 5], [6, 8]]),
      purpose: "Three roots, one after another.",
      howTo: ["The roots: A while the first bar lasts, then C and D.", "One scale: A minor played from its root.", even],
      harmony: aMinor,
    };
    const variant: TextSide = { ...side([[5, 5], [5, 8], [4, 5], [5, 8]]), harmony: dMinor };
    expect(variantText(ex, variant)).toEqual({
      howTo: ["The roots: D while the first bar lasts, then F and G.", "One scale: D minor played from its root.", even],
    });
    // Where a sentence starts it may still be the article.
    const article: ExerciseText = { ...ex, purpose: "A while on three roots, one after another.", howTo: ["Frets 5 and 8 on the low E string.", even] };
    expect(variantText(article, variant)).toEqual({ howTo: ["Frets 5 and 8 on the A string.", even] });
  });

  it("2. 'the low E' with no 'string' is the string and the note: written only where both readings agree", () => {
    const ex: ExerciseText = {
      ...side([[6, 0], [6, 3], [6, 0], [6, 5]], 1),
      purpose: "A riff that keeps coming back to its lowest note.",
      howTo: ["The riff rests on the low E and comes back to it after every fretted note.", "Fret 3 on the low E, then fret 5.", even],
    };
    // The same riff on the A string: the string is the A, and the note it rests on is the open A.
    expect(variantText(ex, side([[5, 0], [5, 3], [5, 0], [5, 5]], 1))).toEqual({
      howTo: ["The riff rests on the A and comes back to it after every fretted note.", "Fret 3 on the A, then fret 5.", even],
    });
    // Three frets up on the same string: the string is still the low E, the note is a G. The sentence that
    // could be read as the note is not written; the one that puts a fret on the string is.
    const up = describeVariant(ex, side([[6, 3], [6, 6], [6, 3], [6, 8]], 3));
    expect(up.text).toEqual({ howTo: ["Fret 6 on the low E, then fret 8.", even] });
    expect(up.refusals.map((r) => r.reason)).toEqual(["'low E' that could be the string or the note, and they moved differently"]);
    // An Exercise that plays no E on that string has only one reading.
    const box: ExerciseText = { ...side([[6, 5], [6, 8], [5, 5], [5, 7]]), purpose: "Four notes of a box, low to high.", howTo: ["Pick every note on the low E and on the A string.", even] };
    const moved = describeVariant(box, side([[5, 5], [5, 8], [4, 5], [4, 7]]));
    expect(moved.refusals).toEqual([]);
    expect(moved.text).toEqual({ howTo: ["Pick every note on the A and on the D string.", even] });
  });

  it("3. what another Exercise did is not this variant's notes: the sentence is not written", () => {
    // A, B, C, B on the top string; on the B string the same frets are E, F sharp, G, F sharp.
    const ex: ExerciseText = {
      ...side([[1, 5], [1, 7], [1, 8], [1, 7]]),
      purpose: "Three notes on one string, round and round.",
      howTo: [
        "Frets 5, 7 and 8 on the top string. The last Exercise ended on A, and this one starts there.",
        "In Step 2 the three notes were A, B and C.",
        "The turn from the last Exercise: A, B and C, then B again.",
        "Step 1's figure on the top string, frets 5, 7 and 8.",
        even,
      ],
      harmony: aMinor,
    };
    const d = describeVariant(ex, { ...side([[2, 5], [2, 7], [2, 8], [2, 7]]), harmony: eMinor });
    expect(d.text).toEqual({
      howTo: ["Frets 5, 7 and 8 on the B string.", "The turn from the last Exercise: E, F# and G, then F# again.", "Step 1's figure on the B string, frets 5, 7 and 8.", even],
    });
    expect(d.howToFrom).toEqual([0, 2, 3, 4]);
    expect(d.refusals.map((r) => r.reason)).toEqual(["a sentence about another Exercise", "a sentence about another Exercise"]);
  });

  it("a ninth chord is a chord symbol: 'E9' moves with the chart (Funk Lines, the second vamp)", () => {
    // Read from the notes: in G minor the chart is Gm7, C9 and the first finger reaches back to fret 2.
    const own = said("funk-lines", "second-pair.bm-vamp", "key=G-minor")!;
    expect(own.purpose).toBe("Two bars over a funk band: the line and stabs on Gm7, then the line and stabs on C9.");
    expect(own.howTo![0]).toBe("Bar 1 is the Gm7 bar and bar 2 is the C9 bar: the two line and stab bars of this Step, one after the other.");
    expect(own.howTo![1]).toContain("reaches back to fret 2 on the D string");
  });

  it("the Paths' own sentences that name another Exercise's material as this one's are still written", () => {
    expect(said("shred", "speed-bursts.one-beat", "stringSet=2")!.howTo![0]).toContain("the fret-12 figure from its top, 15, 13, 12, 13 on the B string");
    // "ring finger ... 17 on the top E": a fret is put on it, so it is the string, though the shape has an E there.
    for (const spec of SPECS.filter((s) => s.variantText)) {
      for (const ex of exercisesOf(doc(spec.id))) {
        for (const v of (ex.variation?.variants ?? []).slice(1)) {
          const { exercise, variant } = sides(ex, v);
          for (const r of describeVariant(exercise, variant).refusals) {
            expect(r.reason, `${ex.id}#${v.id}: ${r.sentence}`).not.toMatch(/another Exercise|could be the string or the note/);
          }
        }
      }
    }
  });
});

describe("the rules, on small made-up lines", () => {
  const note = (string: number, fret: number, tick: number, extra: Partial<ExerciseText["notes"][number]> = {}) => {
    const open = [64, 59, 55, 50, 45, 40][string - 1];
    return { string, fret, midi: open + fret, tick, dur: 480, tech: [], ...extra };
  };
  const line = (places: Array<[number, number]>) => places.map(([s, f], i) => note(s, f, i * 480));
  const side = (places: Array<[number, number]>, fret = 5): TextSide => ({ notes: line(places), position: { fret, shifts: "none" } });
  const base = (purpose: string, howTo: string[], places: Array<[number, number]>): ExerciseText => ({ ...side(places), purpose, howTo });
  const disclaimer = "The frets and note names here are for the first version. Other Takes move the same figure to another string or key.";
  const A = [[1, 5], [1, 7], [1, 8], [1, 7]] as Array<[number, number]>;

  it("a variant whose notes do not line up gets nothing", () => {
    const ex = base("Three notes on the top string, up and back.", ["Frets 5, 7 and 8."], A);
    expect(variantText(ex, side([[1, 5], [1, 7], [1, 8]]))).toBeNull();
    const late = line(A).map((n, i) => (i === 2 ? { ...n, tick: n.tick + 240 } : n));
    expect(variantText(ex, { notes: late, position: { fret: 5, shifts: "none" } })).toBeNull();
    const hammered = line(A).map((n, i) => (i === 1 ? { ...n, tech: ["hammer" as const] } : n));
    expect(variantText(ex, { notes: hammered, position: { fret: 5, shifts: "none" } })).toBeNull();
  });

  it("frets and strings are mapped, and the disclaimer line is never part of a variant's how-to", () => {
    const ex = base("Three notes on one string, round and round.", ["Frets 5, 7 and 8 on the top string.", disclaimer], A);
    expect(variantText(ex, side([[2, 5], [2, 6], [2, 8], [2, 6]]))).toEqual({ howTo: ["Frets 5, 6 and 8 on the B string."] });
  });

  it("two frets that become one fret lose the sentence", () => {
    const ex = base("Two fretted notes and two open ones, round and round.", ["Fret 3 on the low E string and fret 2 on the A string.", "Play it evenly and let every note ring."], [[6, 3], [6, 0], [5, 2], [5, 0]]);
    expect(variantText(ex, side([[5, 2], [5, 0], [4, 2], [4, 0]], 1))).toEqual({ howTo: ["Play it evenly and let every note ring."] });
  });

  it("a number in no known context is unknown, and an unknown refuses the sentence", () => {
    const ex = base("Three notes on one string, round and round.", ["Think of 5, then go. Frets 5, 7 and 8.", "Play it evenly and let every note ring."], A);
    const d = describeVariant(ex, side([[2, 5], [2, 6], [2, 8], [2, 6]]));
    // The line is kept up to its first sentence that cannot be written: here, none of it.
    expect(d.text).toEqual({ howTo: ["Play it evenly and let every note ring."] });
    expect(d.howToFrom).toEqual([1]);
    expect(d.refusals.map((r) => r.reason)).toEqual(["a number it cannot place", "after a sentence that was not written"]);
  });

  it("a fret the Exercise does not play is not a fret it can move", () => {
    const ex = base("Three notes on one string, round and round.", ["Frets 5, 7 and 8 (or 14).", "Play it evenly and let every note ring."], A);
    expect(variantText(ex, side([[2, 5], [2, 6], [2, 8], [2, 6]]))).toEqual({ howTo: ["Play it evenly and let every note ring."] });
  });

  it("BPM, bars, beats, counting out loud and 'four times' are not frets", () => {
    const ex = base(
      "Three notes on one string, round and round.",
      ["Eighths, 60 BPM up to a pass at 80. Bar 1 has the tap on beats 1 and 3. Count '1 and 2 and' four times, six to the beat.", "Frets 5, 7 and 8.", disclaimer],
      A,
    );
    expect(variantText(ex, side([[2, 5], [2, 6], [2, 8], [2, 6]]))).toEqual({
      howTo: ["Eighths, 60 BPM up to a pass at 80. Bar 1 has the tap on beats 1 and 3. Count '1 and 2 and' four times, six to the beat.", "Frets 5, 6 and 8."],
    });
  });

  it("'A string' is a string, 'A' in a list is a note, and 'A different key' is the article", () => {
    const ex: ExerciseText = {
      ...base("A different string each time. D, E, F on the A string.", ["Play it evenly and let every note ring."], [[5, 5], [5, 7], [5, 8], [5, 7]]),
      harmony: { kind: "scale", root: "A", scale: "naturalMinor", spelled: ["A", "B", "C", "D", "E", "F", "G"], cover: false },
    };
    const variant: TextSide = { ...side([[6, 5], [6, 7], [6, 8], [6, 7]]), harmony: ex.harmony };
    expect(variantText(ex, variant)).toEqual({ purpose: "A different string each time. A, B, C on the low E string." });
  });

  it("a finger is named only when the aligned notes carry the same fingers", () => {
    const ex = base("Three notes on one string, round and round.", ["Little finger on fret 8.", "Play it evenly and let every note ring."], A);
    // The same frets on the B string: the same fingers, so nothing is refused (and nothing changes).
    const same = describeVariant(ex, side([[2, 5], [2, 7], [2, 8], [2, 7]]));
    expect(same.refusals).toEqual([]);
    expect(same.text).toBeNull();
    // 5-7-7 on the G string: the note that was the little finger's is the third finger's now. Not said.
    const moved = describeVariant(ex, side([[3, 5], [3, 7], [3, 7], [3, 7]]));
    expect(moved.refusals.map((r) => r.reason)).toEqual(["a finger, and the fingers differ"]);
    expect(moved.text).toEqual({ howTo: ["Play it evenly and let every note ring."] });
  });

  it("a key name moves with a uniform transposition, and is spelled by the variant's harmony", () => {
    const harmony = (root: string, spelled: string[]) => ({ kind: "scale" as const, root, scale: "naturalMinor", spelled, cover: false });
    const ex: ExerciseText = {
      ...base("In A minor: A, B, C on the top string.", ["A minor from fret 5. Five frets up is the tap."], A),
      harmony: harmony("A", ["A", "B", "C", "D", "E", "F", "G"]),
      params: { key: "A" },
    };
    const inC: TextSide = { ...side([[1, 8], [1, 10], [1, 11], [1, 10]], 8), harmony: harmony("C", ["C", "D", "Eb", "F", "G", "Ab", "Bb"]), params: { key: "C" } };
    expect(variantText(ex, inC)).toEqual({ purpose: "In C minor: C, D, Eb on the top string.", howTo: ["C minor from fret 8. Five frets up is the tap."] });
    // Not a transposition (the middle note moved differently): no key name, no distance. The purpose's first sentence falls, so no text.
    const bent: TextSide = { ...side([[1, 8], [1, 9], [1, 11], [1, 9]], 8), harmony: harmony("C", ["C", "D", "Eb", "F", "G", "Ab", "Bb"]), params: { key: "C" } };
    expect(variantText(ex, bent)).toBeNull();
  });

  it("a purpose whose first sentence cannot be written leaves the variant with no text at all", () => {
    const ex = base("The first finger stays on fret 5. Round and round.", ["Frets 5, 7 and 8.", disclaimer], A);
    expect(variantText(ex, side([[3, 5], [3, 7], [3, 7], [3, 7]]))).toBeNull();
  });

  it("a how-to with next to nothing left is not written: the Exercise's says more", () => {
    const ex = base("Three notes on one string, round and round.", ["Sixteenths. Little finger on fret 8, first finger on fret 5."], A);
    const d = describeVariant(ex, side([[3, 5], [3, 7], [3, 7], [3, 7]]));
    expect(d.refusals.map((r) => r.reason)).toEqual(["a finger, and the fingers differ"]);
    expect(d.text).toBeNull();
  });

  it("round 2, on made-up lines: labels, names, neighbours, open-sounding notes, articles, stretches", () => {
    const scale = (root: string, spelled: string[]) => ({ kind: "scale" as const, root, scale: "naturalMinor", spelled, cover: false });
    const two = [[6, 5], [6, 7], [5, 5], [5, 7]] as Array<[number, number]>;
    const up3 = [[6, 8], [6, 10], [5, 8], [5, 10]] as Array<[number, number]>;
    const up7 = [[6, 12], [6, 14], [5, 12], [5, 14]] as Array<[number, number]>;
    const inA = { harmony: scale("A", ["A", "B", "C", "D", "E", "F", "G"]), params: { key: "A" } };
    const inC = { harmony: scale("C", ["C", "D", "Eb", "F", "G", "Ab", "Bb"]), params: { key: "C" } };
    const inE = { harmony: scale("E", ["E", "F#", "G", "A", "B", "C", "D"]), params: { key: "E" } };
    const ex = (purpose: string, howTo: string[]): ExerciseText => ({ ...base(purpose, howTo, two), ...inA });
    const v3: TextSide = { ...side(up3, 8), ...inC };
    const v7: TextSide = { ...side(up7, 12), ...inE };
    const how = "Play it evenly and let every note ring.";

    // 1. "A 5 and 7" is the A string; "a D" is an article and a note.
    expect(variantText(ex("Four notes on two strings, round and round.", ["Low E 5 and 7; A 5 and 7.", "It ends on a D."]), v3)).toEqual({
      howTo: ["Low E 8 and 10; A 8 and 10.", "It ends on an F."],
    });
    // 3. A figure's name keeps its fret or is not said.
    expect(variantText(ex("Four notes on two strings, round and round.", ["The fret-5 figure, twice.", how]), v3)).toEqual({ howTo: [how] });
    // 2. Neighbours among the strings: the same strings, or not said.
    const lower: TextSide = { ...side([[5, 5], [5, 7], [4, 5], [4, 7]]), harmony: inA.harmony, params: inA.params };
    expect(describeVariant(ex("Four notes on two strings, round and round.", ["The palm damps the strings below.", how]), lower).refusals[0].reason).toBe(
      "strings named by where they lie, on other strings",
    );
    expect(describeVariant(ex("Four notes on two strings, round and round.", ["The palm damps the strings below.", how]), v3).refusals).toEqual([]);
    // 4. Seven frets up the D on the A string is an A on the A string, at fret 12.
    expect(describeVariant(ex("Four notes on two strings, round and round.", ["It ends on a picked D on the A string.", how]), v7).refusals[0].reason).toBe(
      "a note with the name of the string it is on, not open",
    );
    expect(variantText(ex("Four notes on two strings, round and round.", ["It ends on a picked D on the A string.", how]), v3)!.howTo![0]).toBe(
      "It ends on a picked F on the A string.",
    );
    // 5. "A minor box ..." in C: "The C minor box"; "A minor on two strings": "C minor on two strings"; otherwise nothing.
    expect(variantText(ex("A minor box on two strings, round and round.", [how]), v3)).toEqual({ purpose: "The C minor box on two strings, round and round." });
    expect(variantText(ex("A minor on two strings, round and round.", [how]), v3)).toEqual({ purpose: "C minor on two strings, round and round." });
    expect(variantText(ex("A minor boxes for two strings, round and round.", [how]), v3)).toBeNull();
    // 6. Three frets up it is still a stretch; seven frets up it is not said.
    const reach = ex("Four notes on two strings, round and round.", ["Fret 7 is a stretch for the third finger.", how]);
    expect(variantText(reach, v3)!.howTo![0]).toBe("Fret 10 is a stretch for the third finger.");
    expect(variantText(reach, v7)).toEqual({ howTo: [how] });
  });

  it("text that would only repeat the Exercise's is not written", () => {
    const ex = base("Three notes on one string, round and round.", ["Play it evenly and let every note ring."], A);
    expect(variantText(ex, side([[2, 5], [2, 6], [2, 8], [2, 6]]))).toBeNull();
  });

  it("the same fact of two strings is said once, of both", () => {
    expect(mergeSameFacts(["On the A string the fretted note is at fret 2.", "On the D string it is at fret 2."])).toEqual(["On the A and D strings the fretted note is at fret 2."]);
    expect(mergeSameFacts(["On the A string the note is at fret 2.", "On the D string the note is at fret 2.", "On the G string it is at fret 2.", "Let it ring."])).toEqual([
      "On the A, D and G strings the note is at fret 2.",
      "Let it ring.",
    ]);
    // Different facts, or a string named twice, stay as they are.
    const apart = ["On the low E string the fretted note is at fret 3.", "On the A string it is at fret 2."];
    expect(mergeSameFacts(apart)).toEqual(apart);
    const twice = ["On the A string the note is at fret 2.", "On the A string it is at fret 2."];
    expect(mergeSameFacts(twice)).toEqual(twice);
  });

  it("splits sentences without breaking a count", () => {
    expect(sentencesOf("Count '1 and 2 and'. Then stop. Bar 2: go on.")).toEqual(["Count '1 and 2 and'.", "Then stop.", "Bar 2: go on."]);
  });
});

// ---------------------------------------------------------------------------
// Every pack with the flag on
// ---------------------------------------------------------------------------

const packPath = (id: string) => path.join(process.cwd(), `src/paths/packs/${id}.json`);
const pcOf = (midi: number) => ((midi % 12) + 12) % 12;
const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const pcOfLetter = (name: string) => (PC[name[0]] + (name[1] === "#" ? 1 : name[1] === "b" ? 11 : 0)) % 12;
const STRING_OF: Record<string, number> = { top: 1, "top E": 1, "high E": 1, B: 2, G: 3, D: 4, A: 5, "low E": 6 };

const flagged = SPECS.filter((s) => s.variantText);

// What a variant's text says about its own notes. Hand-written text may also name the other Takes
// ("On other Takes the three chords are G, C and D.") or what an earlier walk had ("with F sharp at
// fret 7 where F was at fret 6"), or a string it leaves out ("The low E string is not played."); those
// are read by the proof-reader, not here.
const aboutItself = (text: string) =>
  sentencesOf(text)
    .filter((s) => !/\bother Takes\b|\bis not played\b|\bkeeps? the [^.]*string quiet\b/i.test(s))
    .map((s) => s.replace(/,? where [A-G](?: sharp| flat)? was at fret \d+/g, "").replace(/:? the (?:low E|[ADGB]) string's notes (?:an octave|two octaves) higher/g, ""))
    .join(" ");

describe.each(flagged.map((s) => [s.id, s] as const))("%s: what its variants are told is true of their notes", (id) => {
  const pack = JSON.parse(readFileSync(packPath(id), "utf8")) as PathDoc;
  const withText: Array<{ ex: Exercise; v: ExerciseVariant; text: string; where: string }> = [];
  for (const ex of exercisesOf(pack)) {
    for (const v of ex.variation?.variants ?? []) {
      if (v.purpose === undefined && v.howTo === undefined) continue;
      withText.push({ ex, v, text: aboutItself([v.purpose ?? "", ...(v.howTo ?? [])].join(" ")), where: `${ex.id}#${v.id}` });
    }
  }

  it("some variants have text of their own", () => {
    expect(withText.length).toBeGreaterThan(0);
  });

  it("never the disclaimer line, never an exclamation mark, never an empty line", () => {
    for (const { v, text, where } of withText) {
      expect(text, where).not.toMatch(/first version/i);
      expect(text, where).not.toContain("!");
      for (const line of v.howTo ?? []) expect(line.trim().length, where).toBeGreaterThan(0);
    }
  });

  it("never says the same fact of two strings in two sentences", () => {
    for (const { v, where } of withText) {
      for (const line of [v.purpose ?? "", ...(v.howTo ?? [])]) {
        const sentences = sentencesOf(line);
        for (let i = 1; i < sentences.length; i += 1) {
          const a = /^On the (?:low |top |high )?[A-G] string,? (?:the [a-z ]+ )?(is .+)$/.exec(sentences[i - 1]);
          const b = /^On the (?:low |top |high )?[A-G] string,? (?:it |the [a-z ]+ )?(is .+)$/.exec(sentences[i]);
          expect(a && b && a[1] === b[1], `${where}: "${sentences[i - 1]} ${sentences[i]}"`).toBeFalsy();
        }
      }
    }
  });

  it("every string in 'the A and D strings' is a string that variant plays", () => {
    for (const { v, text, where } of withText) {
      const strings = new Set(v.notes.map((n) => n.string));
      for (const m of text.matchAll(/\bthe ((?:(?:low |top |high )?[A-G], )*(?:low |top |high )?[A-G] and (?:low |top |high )?[A-G]) strings\b/g)) {
        for (const name of m[1].split(/, | and /)) expect(strings.has(STRING_OF[name]), `${where}: "${m[0]}"`).toBe(true);
      }
    }
  });

  it("every fret named in a fret context is a fret of that variant's notes", () => {
    const contexts = [
      /\bfrets? (\d+(?:(?:, | and |, and | to | then )\d+)*)/g,
      /\bfrets at (\d+)/g,
      /\b(?:tap|taps|hammer|hammers|pick) (\d+(?:(?:, | and )\d+)*)/g,
      /\b(?:pull off|pulls off|pull|hammer back|hammer on|hammer) (?:to|at|from) (\d+(?:(?:, | and | to )\d+)*)/g,
      /\b(?:string|low E|top E|high E)(?:'s)? (\d+(?:(?:, | and | to )\d+)*)/g,
      /\b[A-G][#b]? at (\d+)/g,
      // "7 on the G", but not "beat 4 on the B string's 10".
      /(?<!beat |beats |bar )\b(\d+) on the (?:[ADGB]|low E|high E|top E)\b/g,
    ];
    for (const { v, text, where } of withText) {
      const frets = new Set(v.notes.map((n) => n.fret));
      for (const context of contexts) {
        for (const m of text.matchAll(context)) {
          for (const n of m[1].match(/\d+/g) ?? []) expect(frets.has(Number(n)), `${where}: fret ${n} in "${m[0]}"`).toBe(true);
        }
      }
    }
  });

  it("every string named is a string that variant plays", () => {
    for (const { v, text, where } of withText) {
      const strings = new Set(v.notes.map((n) => n.string));
      for (const m of text.matchAll(/\b(low E|high E|top E|top|[ADGB]) string\b/g)) {
        expect(strings.has(STRING_OF[m[1]]), `${where}: "${m[0]}"`).toBe(true);
      }
      for (const m of text.matchAll(/\b(low E|high E|top E)\b(?! string)/g)) {
        expect(strings.has(STRING_OF[m[1]]), `${where}: "${m[0]}"`).toBe(true);
      }
    }
  });

  it("every bare note letter is a pitch class of that variant's notes", () => {
    // A letter that is a string ("B string", "low E", "A 5, 7, 8", "7 on the G"), a key or chord
    // with its kind ("A minor", "C Dorian", "Am"), or the article is not a note letter.
    const notNote = /^(?: string| strings| minor| major| natural minor| harmonic| Dorian| Mixolydian| \d|m\b|7|5|dim|maj)/;
    for (const { v, text, where } of withText) {
      const pcs = new Set(v.notes.map((n) => pcOf(n.midi)));
      for (const sentence of sentencesOf(text)) {
        for (const m of sentence.matchAll(/(?<![A-Za-z0-9'])([A-G][#b]?)(?![A-Za-z0-9#])/g)) {
          const at = m.index!;
          const after = sentence.slice(at + m[1].length);
          const before = sentence.slice(0, at);
          if (notNote.test(after)) continue;
          if (/(?:low|high|top) $/.test(before) && m[1] === "E") continue;
          if (/\bon the $/.test(before) || /\bthe (?:low E|[ADGB])(?:,| and| or) (?:the )?$/.test(before)) continue;
          // A list that ends in "strings": "the low E, A, D and G strings".
          if (/^(?:(?:,| and|, and) (?:[ADGB]|top|low E|top E))* strings\b/.test(after)) continue;
          // The article: "A different key", "A major scale walked up one string".
          if (m[1] === "A" && (at === 0 || /: $/.test(before)) && /^ [a-z]/.test(after) && !/^ (?:at|to|on|and|then|twice|again)\b/.test(after)) continue;
          const spelled = /^ sharp\b/.test(after) ? m[1] + "#" : /^ flat\b/.test(after) ? m[1] + "b" : m[1];
          expect(pcs.has(pcOfLetter(spelled)), `${where}: the letter ${spelled} in "${sentence}"`).toBe(true);
        }
      }
    }
  });

  it("the first variant has no text, and the validator accepts the rest", () => {
    for (const ex of exercisesOf(pack)) {
      const first = ex.variation?.variants[0];
      if (first) expect(first.purpose === undefined && first.howTo === undefined, ex.id).toBe(true);
    }
    expect(validatePath(pack).filter((i) => i.rule.startsWith("variation.text") || i.rule === "variation.firstText")).toEqual([]);
  });
});

describe("the 'first version' line", () => {
  const line = /for the first version/i;
  const all = SPECS.flatMap((spec) => exercisesOf(doc(spec.id)).map((ex) => ({ spec, ex })));

  it("is gone from every Exercise whose other variants all have a how-to of their own", () => {
    let dropped = 0;
    for (const { spec, ex } of all) {
      const others = (ex.variation?.variants ?? []).slice(1);
      if (others.length === 0 || !others.every((v) => v.howTo !== undefined)) continue;
      expect(ex.howTo.some((h) => line.test(h)), `${spec.id}/${ex.id}`).toBe(false);
      for (const v of others) expect(v.howTo!.some((h) => line.test(h)), `${spec.id}/${ex.id}#${v.id}`).toBe(false);
      dropped += 1;
    }
    expect(dropped).toBeGreaterThan(90);
  });

  it("stays where a variant still reads the Exercise's how-to", () => {
    // Legato's six-note roll: two of its three other variants have no how-to of their own.
    const roll = exercisesOf(doc("legato")).find((e) => e.id === "odd-groups.six-roll")!;
    expect(roll.variation!.variants.slice(1).some((v) => v.howTo === undefined)).toBe(true);
    expect(line.test(roll.howTo[roll.howTo.length - 1])).toBe(true);
  });
});

describe("the flag", () => {
  it("is on for at least one Path, and off for the Paths whose key moves keyText describes", () => {
    for (const s of SPECS) {
      if (["triads", "chords-in-a-key", "arpeggios-over-changes"].includes(s.id)) expect(s.variantText, s.id).toBeFalsy();
    }
  });

  it("off: the same bytes as before the flag existed (a spec without it never calls the describer)", () => {
    const off: PathSpec = { ...MINIMAL_SPEC };
    delete off.variantText;
    expect(serializePath(buildPath(off))).toBe(serializePath(buildPath({ ...MINIMAL_SPEC, variantText: false })));
    // And every real spec with the flag taken off writes no variant text that its builds did not give.
    for (const spec of SPECS.filter((s) => s.variantText).slice(0, 2)) {
      const plain = buildPath({ ...spec, variantText: false });
      for (const ex of exercisesOf(plain)) {
        for (const v of ex.variation?.variants ?? []) expect(v.purpose === undefined && v.howTo === undefined, `${ex.id}#${v.id}`).toBe(true);
      }
    }
  });

  it("on: text a build gives wins, and the describer is not asked", () => {
    const on = buildPath({ ...VARIANT_TEXT_SPEC, variantText: true });
    const plain = buildPath(VARIANT_TEXT_SPEC);
    expect(serializePath(on)).toBe(serializePath(plain));
  });

  it("on: a variant with no words from its build gets the Exercise's, rewritten", () => {
    const spec: PathSpec = {
      ...MINIMAL_SPEC,
      variantText: true,
      levels: MINIMAL_SPEC.levels!.map((level) => ({
        ...level,
        warmups: level.warmups.map((w) => ({ ...w, purpose: "A purpose long enough to teach something real.", howTo: ["Start at fret 3 on the A string."] })),
      })),
    };
    const warm = buildPath(spec).levels![0].warmups[0];
    const [first, second] = warm.variation!.variants;
    expect(first.howTo).toBeUndefined();
    expect(second.howTo).toEqual([`Start at fret ${second.notes[0].fret} on the A string.`]);
    expect(second.purpose).toBeUndefined();
  });
});
