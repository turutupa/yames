/**
 * A coach answer, as the app holds it.
 *
 * The catalogue itself is `spec.ts` — plain data, because a JSON Schema and a
 * GBNF grammar have to be generated from it and TypeScript types are gone by
 * then. This file is the same catalogue said in types, so that everything
 * downstream of the model gets a discriminated union rather than `unknown`.
 *
 * The two are kept honest by `spec.test.ts`, which walks the spec and fails
 * when a block type or a field name here and there disagree. Adding a block
 * means editing both files; the test is what stops you from editing one.
 *
 * Every field here is a REFERENCE (D3 rule 1). A chord is a name and an index
 * into its own shape list; a scale is a root and a name; bars are a score id
 * and a range. Nothing is a fret, a note list or a colour — `resolve.ts` asks
 * the theory code, the score and the store for those, and drops any block
 * whose reference does not answer.
 */

import type { ScaleId } from "../../jam/scales";

/** Whose neck, or whose grip. */
export type BlockInstrument = "guitar" | "bass";

/**
 * Where on the neck, named the way a player names it.
 *
 * `rootOn5` is "rooted on the A string" — which fret that is depends on the
 * root and the tuning, and working that out is the app's job. A bass has no
 * sixth or fifth string, so `rootOn6` on a bass is a reference that does not
 * resolve and the block goes.
 */
export type NeckPosition = "open" | "rootOn6" | "rootOn5" | "rootOn4" | "rootOn3";

/** What a fretboard block lights up. */
export type NeckSubject =
  | { of: "scale"; root: string; scale: ScaleId }
  | { of: "chord"; chord: string };

/** When to bring something up again. The date is the app's to work out. */
export type ComeBackWhen = "tomorrow" | "nextSession" | "inThreeDays";

/**
 * The button (A5: "the fix is always an action").
 *
 * `loopBars` and `ramp` belong to the Songs wave and the drill, and are
 * carried here now so the catalogue does not change shape when they land —
 * they go through the same `onAction` callback as the three that work today.
 */
export type CoachAction =
  | { kind: "loopBars"; score: string; fromBar: number; toBar: number; bpm?: number }
  | { kind: "ramp"; fromBpm: number; toBpm: number }
  | { kind: "clickSubdivision"; subdivision: number }
  | { kind: "loadPreset"; preset: string }
  | { kind: "loadJam"; jam: string }
  | { kind: "comeBack"; when: ComeBackWhen };

export type TextBlock = { type: "text"; text: string };

export type FretboardBlock = {
  type: "fretboard";
  show: NeckSubject;
  position?: NeckPosition;
  instrument?: BlockInstrument;
};

export type ChordShapeBlock = {
  type: "chordShape";
  chord: string;
  shape: number;
  instrument?: BlockInstrument;
};

export type TabExcerptBlock = {
  type: "tabExcerpt";
  score: string;
  fromBar: number;
  toBar: number;
  attempt?: number;
};

export type ProgressBlock = { type: "progress"; score: string; fromBar: number; toBar: number };

export type TakeBlock = { type: "take"; attempt: number; fromBar?: number; toBar?: number };

export type CompareBlock = { type: "compare"; attempts: number[] };

export type ActionBlock = { type: "action"; action: CoachAction };

export type CoachBlock =
  | TextBlock
  | FretboardBlock
  | ChordShapeBlock
  | TabExcerptBlock
  | ProgressBlock
  | TakeBlock
  | CompareBlock
  | ActionBlock;

export type CoachBlockType = CoachBlock["type"];

/** What the model answers with, and what the rules emit (D3 rule 3). */
export type CoachAnswer = { blocks: CoachBlock[] };
