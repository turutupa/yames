/**
 * The catalogue — what the coach is allowed to answer in, described once.
 *
 * `plans/COACH_UX.md` D3 is the owner's idea and this file is its middle: a
 * teacher points at the neck rather than describing it, so an answer is a
 * short list of **blocks** from a fixed catalogue and one renderer draws them
 * wherever the coach speaks.
 *
 * ## Why the catalogue is data rather than only a type
 *
 * Three readers need the same answer to "what may a block contain":
 *
 * - `types.ts`, so the app can hold an answer;
 * - a **JSON Schema**, for a hosted model held to a schema;
 * - a **GBNF grammar**, for llama.cpp held to a grammar locally.
 *
 * TypeScript types vanish at runtime, so they cannot generate either of the
 * other two. Writing the schema and the grammar by hand means three lists
 * that drift the first time a block gains a field. So the list lives here as
 * plain data, `schema.ts` turns it into the other two, `scripts/coach-blocks.mjs`
 * writes them out, and `spec.test.ts` fails the build when what is checked in
 * no longer matches what this file says.
 *
 * ## The rule this file exists to enforce
 *
 * **Blocks carry references, never content** (D3 rule 1). A chord arrives as
 * a name and a shape index; a scale as a root and a name; bars as a score id
 * and a range; an action as a kind and its parameters. Nothing here is a
 * field a fret number, a note list or a colour could be typed into — the
 * theory code, the score and the store fill those in, and an unknown
 * reference renders as nothing rather than as a guess (ROADMAP §1 principle
 * 3: a model never writes a fret number).
 *
 * The one free-text field in the whole catalogue is `text.text`, the
 * sentence. That is the narration, which is the model's actual job (B3:
 * "rules decide, the model narrates").
 *
 * ## A note on the numbers
 *
 * `integer` fields carry exact bounds. The JSON Schema states them exactly;
 * the grammar can only state a digit pattern once a range is wider than a
 * short alternation, so the grammar is the looser of the two on purpose.
 * Neither is the guarantee: `resolve.ts` checks every bound and every
 * reference against the real library, the real score and the real store, and
 * drops what does not resolve. The schema and the grammar are there so a
 * model produces the right SHAPE; resolution is what makes it true.
 *
 * Kept free of anything but the theory tables so that `node` can read it
 * directly — the generator script loads it through Vite, and the fewer
 * imports it drags in the faster that is.
 */

import { CHORD_QUALITIES } from "../../jam/diatonic";
import { chordSuffix, FLAT_NAMES, SHARP_NAMES } from "../../jam/harmony";
import { SCALE_IDS } from "../../jam/scales";

// ---------------------------------------------------------------------------
// The shapes a field can take
// ---------------------------------------------------------------------------

export type FieldType =
  /** One of a fixed set of words. */
  | { kind: "enum"; values: readonly string[] }
  /** A sentence the coach says. The only free text in the catalogue. */
  | { kind: "sentence"; maxLength: number }
  /** An opaque identifier the app minted — a score, a preset, a jam. */
  | { kind: "id"; maxLength: number }
  /** A chord as a musician writes it: a root and a quality, both from a set. */
  | { kind: "chordName" }
  /** A whole number, inclusive both ends. */
  | { kind: "integer"; min: number; max: number }
  /** A tagged choice: exactly one variant, named by its tag field. */
  | { kind: "union"; tag: string; variants: readonly Variant[] }
  /** A fixed-length list of one type. */
  | { kind: "tuple"; of: FieldType; length: number };

export type Field = {
  name: string;
  type: FieldType;
  /** Left out, the field must be there. */
  optional?: true;
  /** What it means, in one line. Becomes the `description` in the schema. */
  note: string;
};

export type Variant = { name: string; fields: readonly Field[]; note: string };

export type BlockSpec = { type: string; note: string; fields: readonly Field[] };

export type CatalogueSpec = {
  /** Bumped when a change to the catalogue is not backwards compatible. */
  version: number;
  /** An answer is a short list. A teacher says one thing (A4). */
  maxBlocks: number;
  blocks: readonly BlockSpec[];
};

// ---------------------------------------------------------------------------
// The enums, taken from the code that already owns them
// ---------------------------------------------------------------------------

/**
 * Every root a chord or a scale may be named on, sharps and flats both.
 *
 * Two-character names first: a grammar walks alternatives in order, and "C#"
 * has to be reachable before "C" swallows the C and leaves a stray "#".
 */
export const ROOT_NAMES: readonly string[] = [
  ...new Set([...SHARP_NAMES, ...FLAT_NAMES]),
].sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0));

/**
 * What each quality is written as after the root, in the catalogue's order.
 *
 * `chordSuffix` is the app's own table and this is it, unchanged. It carried
 * one substitution until the six-nine chord was fixed: `chordSuffix("69")`
 * writes "6/9", and `parseChordName` used to read the slash as a bass note
 * and hand back a plain sixth, so the catalogue offered "69" instead. The
 * parser now reads "6/9" whole (`src/jam/harmony.ts`), and the app writes one
 * spelling everywhere again. `spec.test.ts` round-trips every one of these
 * through the parser so a future entry cannot quietly break the same way.
 *
 * The major triad's suffix is the empty string — "C" is a chord name — so the
 * grammar has to allow a chord that is a root and nothing else.
 */
export const CHORD_SUFFIXES: readonly string[] = CHORD_QUALITIES.map(chordSuffix)
  .slice()
  .sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0));

/** The scales the app knows, from `src/jam/scales.ts`. */
export const SCALE_NAMES: readonly string[] = [...SCALE_IDS];

/**
 * Where on the neck, named the way a player names it rather than by fret.
 *
 * "Rooted on the A string" is a position; fret 5 is a drawing, and the model
 * does not draw (D3 rule 1). The app works out which fret that is from the
 * tuning and the root, and `resolve.ts` drops a position the instrument does
 * not have — a bass has no sixth string.
 */
export const NECK_POSITIONS: readonly string[] = [
  "open",
  "rootOn6",
  "rootOn5",
  "rootOn4",
  "rootOn3",
];

export const INSTRUMENTS: readonly string[] = ["guitar", "bass"];

/** When to be reminded. A date is the app's to work out, not the model's. */
export const COME_BACK_WHEN: readonly string[] = ["tomorrow", "nextSession", "inThreeDays"];

// ---------------------------------------------------------------------------
// The bounds
// ---------------------------------------------------------------------------

/** A sentence, not a paragraph: the coach says one thing (A4). */
export const MAX_SENTENCE = 240;
/** Long enough for any id the app mints, short enough to bound the grammar. */
export const MAX_ID = 64;
/** The shape list for a chord is long but finite; nothing reaches thirty. */
export const MAX_SHAPE_INDEX = 29;
/** A score of ten thousand bars is not a song anybody imports. */
export const MAX_BAR = 9999;
/** The store's attempt ids are row numbers. */
export const MAX_ATTEMPT = 999_999_999;
/** The tempo range the app itself clamps to (`useActionDispatcher`). */
export const MIN_BPM = 20;
export const MAX_BPM = 300;

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

const scoreField: Field = {
  name: "score",
  type: { kind: "id", maxLength: MAX_ID },
  note: "The id of a score the player has imported.",
};

const fromBarField: Field = {
  name: "fromBar",
  type: { kind: "integer", min: 1, max: MAX_BAR },
  note: "The first bar of the passage, counting the bars as played.",
};

const toBarField: Field = {
  name: "toBar",
  type: { kind: "integer", min: 1, max: MAX_BAR },
  note: "The last bar of the passage, and not before the first.",
};

export const CATALOGUE: CatalogueSpec = {
  version: 1,
  maxBlocks: 6,
  blocks: [
    {
      type: "text",
      note: "One thing said in a sentence a teacher would say.",
      fields: [
        {
          name: "text",
          type: { kind: "sentence", maxLength: MAX_SENTENCE },
          note: "The sentence itself, already in the player's language.",
        },
      ],
    },
    {
      type: "fretboard",
      note: "A scale or a chord's notes lit up on the neck.",
      fields: [
        {
          name: "show",
          note: "What to light up. Named, never listed note by note.",
          type: {
            kind: "union",
            tag: "of",
            variants: [
              {
                name: "scale",
                note: "A scale, by its root and its name.",
                fields: [
                  {
                    name: "root",
                    type: { kind: "enum", values: ROOT_NAMES },
                    note: "The note the scale starts on.",
                  },
                  {
                    name: "scale",
                    type: { kind: "enum", values: SCALE_NAMES },
                    note: "Which scale.",
                  },
                ],
              },
              {
                name: "chord",
                note: "A chord's notes, wherever they fall on the neck.",
                fields: [
                  {
                    name: "chord",
                    type: { kind: "chordName" },
                    note: 'The chord as it is written: "Am7", "F#dim", "Bb".',
                  },
                ],
              },
            ],
          },
        },
        {
          name: "position",
          optional: true,
          type: { kind: "enum", values: NECK_POSITIONS },
          note: "Which position of the neck to show. Left out, the whole neck.",
        },
        {
          name: "instrument",
          optional: true,
          type: { kind: "enum", values: INSTRUMENTS },
          note: "Whose neck. Left out, the guitar.",
        },
      ],
    },
    {
      type: "chordShape",
      note: "One grip, drawn as a chord box.",
      fields: [
        {
          name: "chord",
          type: { kind: "chordName" },
          note: 'The chord as it is written: "Am7", "F#dim", "Bb".',
        },
        {
          name: "shape",
          type: { kind: "integer", min: 0, max: MAX_SHAPE_INDEX },
          note: "Which of the chord's shapes, counting from the nut, starting at 0.",
        },
        {
          name: "instrument",
          optional: true,
          type: { kind: "enum", values: INSTRUMENTS },
          note: "Whose grip. Left out, the guitar.",
        },
      ],
    },
    {
      type: "tabExcerpt",
      note: "Bars of a score, coloured by how they were played.",
      fields: [
        scoreField,
        fromBarField,
        toBarField,
        {
          name: "attempt",
          optional: true,
          type: { kind: "integer", min: 1, max: MAX_ATTEMPT },
          note: "Which attempt to colour it by. Left out, the plain notes.",
        },
      ],
    },
    {
      type: "progress",
      note: "One passage, over the days it has been played.",
      fields: [scoreField, fromBarField, toBarField],
    },
    {
      type: "take",
      note: "Play back a recorded take.",
      fields: [
        {
          name: "attempt",
          type: { kind: "integer", min: 1, max: MAX_ATTEMPT },
          note: "Which attempt the take belongs to.",
        },
        { ...fromBarField, optional: true, note: "The first bar to play. Left out, all of it." },
        { ...toBarField, optional: true, note: "The last bar to play. Left out, all of it." },
      ],
    },
    {
      type: "compare",
      note: "Two takes side by side.",
      fields: [
        {
          name: "attempts",
          type: {
            kind: "tuple",
            of: { kind: "integer", min: 1, max: MAX_ATTEMPT },
            length: 2,
          },
          note: "The two attempts, the older one first.",
        },
      ],
    },
    {
      type: "action",
      note: "The button. Every correction resolves to something the app can set up (A5).",
      fields: [
        {
          name: "action",
          note: "What the button does.",
          type: {
            kind: "union",
            tag: "kind",
            variants: [
              {
                name: "loopBars",
                note: "Loop a passage, optionally at a tempo.",
                fields: [
                  scoreField,
                  fromBarField,
                  toBarField,
                  {
                    name: "bpm",
                    optional: true,
                    type: { kind: "integer", min: MIN_BPM, max: MAX_BPM },
                    note: "The tempo to loop it at. Left out, the score's own.",
                  },
                ],
              },
              {
                name: "ramp",
                note: "Work a tempo up, or down, a step at a time.",
                fields: [
                  {
                    name: "fromBpm",
                    type: { kind: "integer", min: MIN_BPM, max: MAX_BPM },
                    note: "Where the climb starts.",
                  },
                  {
                    name: "toBpm",
                    type: { kind: "integer", min: MIN_BPM, max: MAX_BPM },
                    note: "Where it is headed. Below the start is a descending drill (U3.7).",
                  },
                ],
              },
              {
                name: "clickSubdivision",
                note: "Put the click on a smaller note for this passage.",
                fields: [
                  {
                    name: "subdivision",
                    type: { kind: "integer", min: 1, max: 6 },
                    note: "1 quarters, 2 eighths, 3 triplets, 4 sixteenths, 5 quintuplets, 6 sextuplets.",
                  },
                ],
              },
              {
                name: "loadPreset",
                note: "Set the metronome up the way a saved preset says.",
                fields: [
                  {
                    name: "preset",
                    type: { kind: "id", maxLength: MAX_ID },
                    note: "The id of one of the player's presets.",
                  },
                ],
              },
              {
                name: "loadJam",
                note: "Put a jam on the stage.",
                fields: [
                  {
                    name: "jam",
                    type: { kind: "id", maxLength: MAX_ID },
                    note: "The id of one of the player's jams.",
                  },
                ],
              },
              {
                name: "comeBack",
                note: "Leave it for another day.",
                fields: [
                  {
                    name: "when",
                    type: { kind: "enum", values: COME_BACK_WHEN },
                    note: "When to bring it up again.",
                  },
                ],
              },
            ],
          },
        },
      ],
    },
  ],
};

/** The block types, in the catalogue's own order. */
export const BLOCK_TYPES: readonly string[] = CATALOGUE.blocks.map((block) => block.type);

/** The action kinds, in the catalogue's own order. */
export const ACTION_KINDS: readonly string[] = (() => {
  const action = CATALOGUE.blocks.find((block) => block.type === "action");
  const field = action?.fields.find((f) => f.name === "action");
  return field && field.type.kind === "union" ? field.type.variants.map((v) => v.name) : [];
})();
