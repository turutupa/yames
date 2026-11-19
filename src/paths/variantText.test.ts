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
import { describeVariant, sentencesOf, variantText } from "./variantText";
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
    expect(said("tapping", "first-taps.tap-pull-hammer", "stringSet=B:-12-5-8")).toEqual({
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

  it("Legato (key): three notes a string in E minor, five frets up", () => {
    expect(said("legato", "three-per-string.three-up", "key=E")).toEqual({
      purpose:
        "E minor from the low E string to the D string, then round again through the A string. One bar picked, one bar with a pick on each string and two hammer-ons.",
      howTo: [
        "Triplets. Low E string 12, 14, 15; A string 12, 14, 15; D string 12, 14, 16; A string again. Bar 2 picks only the first note of each string.",
        "The D string's 16 is the little finger at full stretch. Hammer it from the second finger on 14, not from the first.",
      ],
    });
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
  // finger. "fret 3 ... and fret 2" would become "fret 2 ... and fret 2": the sentence is not written.
  it.each(["stringSet=A-and-D", "stringSet=D-and-G"])("Rhythm Foundations: %s never says 'fret 2 ... and fret 2'", (variantId) => {
    const own = said("rhythm-foundations", "on-the-beat.halves", variantId);
    expect(own).toEqual({
      howTo: ["Count '1, 2' through each half note and play the quarters on 3 and 4. The last bar is one note held for all four clicks."],
    });
    expect(JSON.stringify(own)).not.toMatch(/fret 2/);
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
        "Bar 1: D at fret 10 on the low E twice (muted), F at 13, D, G at fret 10 on the A string, D, F, E at 12. Bar 2: D, D, A and G on the A string, then F and E as quarter notes.",
        "First finger on fret 10, third on 12, fourth on 13. The hand doesn't move.",
      ],
    });
  });

  // Blues, the walking line in E: the root is the open low E string. "Frets 0 and 4" is
  // not something a teacher says, and a stretch from an open string is no stretch.
  it("Blues (key): a fretted note that becomes an open string is not given a fret number", () => {
    expect(said("blues-pentatonics", "twelve-bar.walking", "key=E")).toEqual({
      purpose: "A walking shuffle line through the whole form, so you're playing the changes rather than following them.",
      howTo: ["Shuffle eighths, all twelve bars, 70 BPM up to a pass at 90."],
    });
  });

  it("Blues (key): a sentence that lists every key ('in G, C or D') is not rewritten, so the variant has no text", () => {
    expect(said("blues-pentatonics", "box-keys.chorus-in-keys", "key=C")).toBeNull();
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

  it("text that would only repeat the Exercise's is not written", () => {
    const ex = base("Three notes on one string, round and round.", ["Play it evenly and let every note ring."], A);
    expect(variantText(ex, side([[2, 5], [2, 6], [2, 8], [2, 6]]))).toBeNull();
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

describe.each(flagged.map((s) => [s.id, s] as const))("%s: what its variants are told is true of their notes", (id) => {
  const pack = JSON.parse(readFileSync(packPath(id), "utf8")) as PathDoc;
  const withText: Array<{ ex: Exercise; v: ExerciseVariant; text: string; where: string }> = [];
  for (const ex of exercisesOf(pack)) {
    for (const v of ex.variation?.variants ?? []) {
      if (v.purpose === undefined && v.howTo === undefined) continue;
      withText.push({ ex, v, text: [v.purpose ?? "", ...(v.howTo ?? [])].join(" "), where: `${ex.id}#${v.id}` });
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
          expect(pcs.has(pcOfLetter(m[1])), `${where}: the letter ${m[1]} in "${sentence}"`).toBe(true);
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
