/**
 * Turning an answer into something that can be drawn — or into nothing.
 *
 * The second gate. `validate.ts` has already said the block is the right
 * shape; this asks whether its references mean anything. Is "Am7" a chord
 * this app can spell? Does it have a fourth shape? Is bar 300 inside a song
 * of forty bars? Is that attempt one the player actually made?
 *
 * **A reference that does not resolve renders as nothing, never as a guess**
 * (COACH_UX D3 rule 1). Nothing here invents a fret, a note or a bar to fill
 * a gap, and nothing here silently corrects one: a block whose reference is
 * wrong is dropped, and what was dropped and why comes back beside the
 * blocks that survived, so it can be logged, counted and looked at rather
 * than vanishing.
 *
 * The facts come from the code that already owns them — `src/jam/harmony.ts`
 * for chords, `src/jam/scales.ts` for scales, `src/jam/chordShapes.ts` for
 * grips — and from a context the caller passes in for the things that live
 * in the store: the songs, the attempts, the presets and the jams. With no
 * context, every block that points at one of those is dropped, which is the
 * honest answer before the Songs wave lands: there are no songs to point at.
 *
 * Language belongs to the renderer. What comes out of here is facts and, for
 * an action, the locale key and the values its button needs — so the same
 * resolution draws the same button in fifteen languages.
 */

import {
  BASS_TUNING,
  GUITAR_TUNING,
  shapesFor,
  type Instrument,
  type PlacedShape,
} from "../../jam/chordShapes";
import { chordName } from "../../jam/diatonic";
import {
  chordNotes,
  nameToPitchClass,
  parseChordName,
  pitchClass,
  type Chord,
  type PitchClass,
} from "../../jam/harmony";
import { SCALES, scaleNotes, type ScaleId } from "../../jam/scales";
import { CATALOGUE } from "./spec";
import { checkBlockShape, type ShapeProblem } from "./validate";
import type {
  BlockInstrument,
  CoachAction,
  CoachBlock,
  NeckPosition,
  NeckSubject,
} from "./types";

export { checkBlockShape } from "./validate";

// ---------------------------------------------------------------------------
// What the app knows, and can be pointed at
// ---------------------------------------------------------------------------

/**
 * A song the player has imported. `bars` is how many bars it has, as played.
 *
 * `printedBars` is the number PRINTED on the page for each played bar, in
 * played order, counted the way a page counts — so `printedBars[8]` is what
 * the ninth bar of the performance is called on the score. Optional, because
 * a caller that has no score to hand (the gallery, a test) has nothing to
 * look up; without it the printed numbers are the played ones, which is the
 * truth for every song that has no repeats in it.
 */
export type ScoreRef = {
  id: string;
  title: string;
  bars: number;
  printedBars?: readonly number[];
};

/**
 * One run at a song, as the store keeps it.
 *
 * `id` is a STRING. `attempts.id` is a UUID the frontend mints
 * (`newAttemptId`), not a row number, and this type said `number` on the
 * strength of a comment in `spec.ts` that claimed otherwise — so no block
 * naming an attempt could ever have resolved against a real store.
 */
export type AttemptRef = { id: string; scoreId: string; playedAt?: string };

/** A preset or a jam: something with a name a player gave it. */
export type NamedRef = { id: string; name: string };

/** One reading of a passage, on one day. `percent` is 0–100. */
export type ProgressPoint = { at: string; percent: number };

export type CoachBlockContext = {
  scores?: readonly ScoreRef[];
  attempts?: readonly AttemptRef[];
  presets?: readonly NamedRef[];
  jams?: readonly NamedRef[];
  /**
   * How a passage has gone over time. Null or fewer than two readings means
   * there is no story yet, and the block goes — C3: the coach volunteers a
   * before-and-after only when it is real.
   */
  progressFor?: (
    score: ScoreRef,
    fromBar: number,
    toBar: number,
  ) => readonly ProgressPoint[] | null;
};

// ---------------------------------------------------------------------------
// What comes out
// ---------------------------------------------------------------------------

export type DropReason =
  | ShapeProblem["reason"]
  | "tooManyBlocks"
  | "notAnAnswer"
  | "unknownChord"
  | "shapeOutOfRange"
  | "unknownScale"
  | "positionNotOnThisNeck"
  | "unknownScore"
  | "barsOutsideScore"
  | "unknownAttempt"
  | "nothingRecorded"
  | "sameTakeTwice"
  | "unknownPreset"
  | "unknownJam"
  | "nothingToDo";

/** A block that did not make it, and why — for the debug log, not the player. */
export type DroppedBlock = {
  /** Where it was in the answer, counting from 0. */
  at: number;
  /** Its type, when it had one that was a block type. */
  type: string | null;
  reason: DropReason;
  detail: string;
};

/** A label a button wears: a locale key and what to fill it with. */
export type ActionLabel = { key: string; values: Record<string, string | number> };

export type ResolvedFretboard = {
  type: "fretboard";
  subject:
    | { of: "scale"; scale: ScaleId; rootName: string }
    | { of: "chord"; chordLabel: string };
  instrument: BlockInstrument;
  tuning: readonly number[];
  pitchClasses: PitchClass[];
  rootPitchClass: PitchClass;
  startFret: number;
  frets: number;
  position: NeckPosition | null;
};

export type ResolvedChordShape = {
  type: "chordShape";
  chordLabel: string;
  instrument: BlockInstrument;
  shape: PlacedShape;
  /** Which of the chord's shapes this is, and how many there are. */
  index: number;
  count: number;
};

/**
 * The bars a resolved block carries, both ways.
 *
 * `fromBar` / `toBar` are PLAYED and are what the slots act on — the
 * transport, the range, the excerpt. `printedFrom` / `printedTo` are what the
 * page calls them and are the only pair the renderer shows. Both are here so
 * that a heading and a sentence about the same passage cannot disagree, which
 * is what happened when each side decided for itself.
 */
export type ResolvedBars = {
  fromBar: number;
  toBar: number;
  printedFrom: number;
  printedTo: number;
};

export type ResolvedBlock =
  | { type: "text"; text: string }
  | ResolvedFretboard
  | ResolvedChordShape
  | ({ type: "tabExcerpt"; score: ScoreRef; attempt: AttemptRef | null } & ResolvedBars)
  | ({ type: "progress"; score: ScoreRef; points: ProgressPoint[] } & ResolvedBars)
  | {
      type: "take";
      attempt: AttemptRef;
      score: ScoreRef | null;
      fromBar: number | null;
      toBar: number | null;
      printedFrom: number | null;
      printedTo: number | null;
    }
  | { type: "compare"; older: AttemptRef; newer: AttemptRef; score: ScoreRef | null }
  | { type: "action"; action: CoachAction; label: ActionLabel };

export type ResolvedAnswer = { blocks: ResolvedBlock[]; dropped: DroppedBlock[] };

// ---------------------------------------------------------------------------
// The neck
// ---------------------------------------------------------------------------

function tuningFor(instrument: BlockInstrument): readonly number[] {
  return instrument === "bass" ? BASS_TUNING : GUITAR_TUNING;
}

/** The string a named position roots on. "open" roots on nothing. */
const POSITION_STRING: Record<Exclude<NeckPosition, "open">, number> = {
  rootOn6: 6,
  rootOn5: 5,
  rootOn4: 4,
  rootOn3: 3,
};

/**
 * Where the hand goes for a named position, or null when this neck has no
 * such string — a bass has four, so "rooted on the sixth" is a reference to
 * something that is not there.
 *
 * The fret is worked out from the tuning and the root, which is the whole
 * reason the block names a string rather than a fret (D3 rule 1).
 */
function startFretFor(
  position: NeckPosition,
  root: PitchClass,
  tuning: readonly number[],
): number | null {
  if (position === "open") return 0;
  const stringNumber = POSITION_STRING[position];
  const index = tuning.length - stringNumber;
  if (index < 0 || index >= tuning.length) return null;
  return pitchClass(root - pitchClass(tuning[index]));
}

/** A hand's worth of frets for a named position; the whole neck without one. */
const POSITION_SPAN = 5;
const WHOLE_NECK = 12;

function resolveNeck(
  show: NeckSubject,
  instrument: BlockInstrument,
  position: NeckPosition | undefined,
): { block: ResolvedFretboard } | { reason: DropReason; detail: string } {
  const tuning = tuningFor(instrument);

  let root: PitchClass;
  let pitchClasses: PitchClass[];
  let subject: ResolvedFretboard["subject"];

  if (show.of === "scale") {
    const rootPc = nameToPitchClass(show.root);
    if (rootPc === null) return { reason: "unknownChord", detail: `"${show.root}" is not a note` };
    if (!Object.prototype.hasOwnProperty.call(SCALES, show.scale))
      return { reason: "unknownScale", detail: `"${show.scale}" is not a scale this app knows` };
    root = rootPc;
    pitchClasses = scaleNotes(rootPc, show.scale);
    subject = { of: "scale", scale: show.scale, rootName: show.root };
  } else {
    const chord = parseChordName(show.chord);
    if (!chord) return { reason: "unknownChord", detail: `"${show.chord}" is not a chord` };
    root = chord.root;
    pitchClasses = chordNotes(chord);
    subject = { of: "chord", chordLabel: chordName(chord.root, chord.quality) };
  }

  const startFret = position ? startFretFor(position, root, tuning) : 0;
  if (startFret === null)
    return {
      reason: "positionNotOnThisNeck",
      detail: `a ${instrument} has no string for "${String(position)}"`,
    };

  return {
    block: {
      type: "fretboard",
      subject,
      instrument,
      tuning,
      pitchClasses,
      rootPitchClass: root,
      startFret,
      frets: position ? POSITION_SPAN : WHOLE_NECK,
      position: position ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// The store's references
// ---------------------------------------------------------------------------

function findScore(ctx: CoachBlockContext, id: string): ScoreRef | null {
  return ctx.scores?.find((score) => score.id === id) ?? null;
}

function findAttempt(ctx: CoachBlockContext, id: string): AttemptRef | null {
  return ctx.attempts?.find((attempt) => attempt.id === id) ?? null;
}

/**
 * What a played bar is called on the page.
 *
 * The one place the two numberings meet. A block names played bars because
 * that is what the app acts on; a player reads printed numbers off the tab,
 * and a piece whose first eight bars repeat has played bar 9 printed as bar
 * 1. Without the score's own mapping the answer is the played number, which
 * is right for every song without repeats and is the only honest guess for
 * one whose score is not loaded.
 */
function printedBar(score: ScoreRef, playedBar: number): number {
  return score.printedBars?.[playedBar - 1] ?? playedBar;
}

/** A passage, in both numberings, so the renderer never has to choose. */
function barsOf(score: ScoreRef, fromBar: number, toBar: number): ResolvedBars {
  return {
    fromBar,
    toBar,
    printedFrom: printedBar(score, fromBar),
    printedTo: printedBar(score, toBar),
  };
}

/** The bars run the right way round and both land inside the song. */
function barsFit(score: ScoreRef, fromBar: number, toBar: number): string | null {
  if (toBar < fromBar) return `bars ${fromBar}–${toBar} run backwards`;
  if (fromBar < 1 || toBar > score.bars)
    return `bars ${fromBar}–${toBar} are outside "${score.title}", which has ${score.bars}`;
  return null;
}

// ---------------------------------------------------------------------------
// The button
// ---------------------------------------------------------------------------

function resolveAction(
  action: CoachAction,
  ctx: CoachBlockContext,
): { label: ActionLabel } | { reason: DropReason; detail: string } {
  switch (action.kind) {
    case "loopBars": {
      const score = findScore(ctx, action.score);
      if (!score) return { reason: "unknownScore", detail: `no song with the id "${action.score}"` };
      const wrong = barsFit(score, action.fromBar, action.toBar);
      if (wrong) return { reason: "barsOutsideScore", detail: wrong };
      // The BUTTON says the printed numbers, because that is what the player
      // is looking at; the action it carries keeps the played ones, because
      // that is what the transport takes.
      const from = printedBar(score, action.fromBar);
      const to = printedBar(score, action.toBar);
      return {
        label:
          action.bpm === undefined
            ? { key: "coachBlocks.action.loopBars", values: { from, to } }
            : { key: "coachBlocks.action.loopBarsAt", values: { from, to, bpm: action.bpm } },
      };
    }

    case "ramp":
      // A climb that starts where it ends is not a climb. Nothing to press.
      if (action.fromBpm === action.toBpm)
        return { reason: "nothingToDo", detail: `a ramp from ${action.fromBpm} to itself` };
      return {
        label: {
          key: "coachBlocks.action.ramp",
          values: { from: action.fromBpm, to: action.toBpm },
        },
      };

    case "clickSubdivision":
      return {
        label: { key: `coachBlocks.action.click.${action.subdivision}`, values: {} },
      };

    case "loadPreset": {
      const preset = ctx.presets?.find((item) => item.id === action.preset);
      if (!preset)
        return { reason: "unknownPreset", detail: `no preset with the id "${action.preset}"` };
      return { label: { key: "coachBlocks.action.loadPreset", values: { name: preset.name } } };
    }

    case "loadJam": {
      const jam = ctx.jams?.find((item) => item.id === action.jam);
      if (!jam) return { reason: "unknownJam", detail: `no jam with the id "${action.jam}"` };
      return { label: { key: "coachBlocks.action.loadJam", values: { name: jam.name } } };
    }

    case "comeBack":
      // One day has its own word in every language this app speaks, and
      // "come back to this in 1 days" is not a sentence a teacher says.
      return action.days === 1
        ? { label: { key: "coachBlocks.action.comeBack.tomorrow", values: {} } }
        : { label: { key: "coachBlocks.action.comeBack.inDays", values: { days: action.days } } };
  }
}

// ---------------------------------------------------------------------------
// One block
// ---------------------------------------------------------------------------

function resolveBlock(
  block: CoachBlock,
  ctx: CoachBlockContext,
): { block: ResolvedBlock } | { reason: DropReason; detail: string } {
  switch (block.type) {
    case "text":
      return { block: { type: "text", text: block.text } };

    case "fretboard":
      return resolveNeck(block.show, block.instrument ?? "guitar", block.position);

    case "chordShape": {
      const chord: Chord | null = parseChordName(block.chord);
      if (!chord) return { reason: "unknownChord", detail: `"${block.chord}" is not a chord` };
      const instrument: BlockInstrument = block.instrument ?? "guitar";
      const shapes = shapesFor(chord.root, chord.quality, {
        instrument: instrument as Instrument,
      });
      if (shapes.length === 0)
        return {
          reason: "shapeOutOfRange",
          detail: `the ${instrument} has no grip for ${block.chord}`,
        };
      if (block.shape >= shapes.length)
        return {
          reason: "shapeOutOfRange",
          detail: `${block.chord} has ${shapes.length} shapes, not ${block.shape + 1}`,
        };
      return {
        block: {
          type: "chordShape",
          chordLabel: chordName(chord.root, chord.quality),
          instrument,
          shape: shapes[block.shape],
          index: block.shape,
          count: shapes.length,
        },
      };
    }

    case "tabExcerpt": {
      const score = findScore(ctx, block.score);
      if (!score) return { reason: "unknownScore", detail: `no song with the id "${block.score}"` };
      const wrong = barsFit(score, block.fromBar, block.toBar);
      if (wrong) return { reason: "barsOutsideScore", detail: wrong };
      let attempt: AttemptRef | null = null;
      if (block.attempt !== undefined) {
        attempt = findAttempt(ctx, block.attempt);
        if (!attempt)
          return { reason: "unknownAttempt", detail: `no attempt numbered ${block.attempt}` };
        if (attempt.scoreId !== score.id)
          return {
            reason: "unknownAttempt",
            detail: `attempt ${block.attempt} is not a run at "${score.title}"`,
          };
      }
      return {
        block: {
          type: "tabExcerpt",
          score,
          ...barsOf(score, block.fromBar, block.toBar),
          attempt,
        },
      };
    }

    case "progress": {
      const score = findScore(ctx, block.score);
      if (!score) return { reason: "unknownScore", detail: `no song with the id "${block.score}"` };
      const wrong = barsFit(score, block.fromBar, block.toBar);
      if (wrong) return { reason: "barsOutsideScore", detail: wrong };
      const points = ctx.progressFor?.(score, block.fromBar, block.toBar) ?? null;
      // One reading is not a story, and a chart of one point is a dot.
      if (!points || points.length < 2)
        return {
          reason: "nothingRecorded",
          detail: `bars ${block.fromBar}–${block.toBar} of "${score.title}" have been played ${points?.length ?? 0} time(s)`,
        };
      return {
        block: {
          type: "progress",
          score,
          ...barsOf(score, block.fromBar, block.toBar),
          points: [...points],
        },
      };
    }

    case "take": {
      const attempt = findAttempt(ctx, block.attempt);
      if (!attempt)
        return { reason: "unknownAttempt", detail: `no attempt numbered ${block.attempt}` };
      const score = findScore(ctx, attempt.scoreId);
      const wantsBars = block.fromBar !== undefined || block.toBar !== undefined;
      if (!wantsBars)
        return {
          block: {
            type: "take",
            attempt,
            score,
            fromBar: null,
            toBar: null,
            printedFrom: null,
            printedTo: null,
          },
        };
      // Asking for part of a take means the part has to be checkable, and it
      // is the song that says how many bars there are.
      if (!score)
        return {
          reason: "unknownScore",
          detail: `attempt ${attempt.id} is a run at "${attempt.scoreId}", which is not loaded`,
        };
      const fromBar = block.fromBar ?? 1;
      const toBar = block.toBar ?? score.bars;
      const wrong = barsFit(score, fromBar, toBar);
      if (wrong) return { reason: "barsOutsideScore", detail: wrong };
      return { block: { type: "take", attempt, score, ...barsOf(score, fromBar, toBar) } };
    }

    case "compare": {
      const [first, second] = block.attempts;
      if (first === second)
        return { reason: "sameTakeTwice", detail: `attempt ${first} against itself` };
      const older = findAttempt(ctx, first);
      const newer = findAttempt(ctx, second);
      if (!older) return { reason: "unknownAttempt", detail: `no attempt numbered ${first}` };
      if (!newer) return { reason: "unknownAttempt", detail: `no attempt numbered ${second}` };
      if (older.scoreId !== newer.scoreId)
        return {
          reason: "unknownAttempt",
          detail: `attempts ${first} and ${second} are runs at different songs`,
        };
      return { block: { type: "compare", older, newer, score: findScore(ctx, older.scoreId) } };
    }

    case "action": {
      const resolved = resolveAction(block.action, ctx);
      if ("reason" in resolved) return resolved;
      return { block: { type: "action", action: block.action, label: resolved.label } };
    }
  }
}

// ---------------------------------------------------------------------------
// The answer
// ---------------------------------------------------------------------------

/**
 * An unknown thing — parsed JSON, or the text a model handed back — as the
 * blocks that can be drawn and a list of the ones that cannot.
 *
 * Never throws. A model that answers with prose, an empty string or a
 * half-written object gets the same treatment as one that answers with a bad
 * bar number: an empty list of blocks and a line saying what happened.
 */
export function resolveCoachAnswer(input: unknown, ctx: CoachBlockContext = {}): ResolvedAnswer {
  const blocks: ResolvedBlock[] = [];
  const dropped: DroppedBlock[] = [];

  let value = input;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return {
        blocks,
        dropped: [{ at: 0, type: null, reason: "notAnAnswer", detail: "the answer is not JSON" }],
      };
    }
  }

  const list =
    typeof value === "object" && value !== null && Array.isArray((value as { blocks?: unknown }).blocks)
      ? ((value as { blocks: unknown[] }).blocks)
      : null;

  if (!list)
    return {
      blocks,
      dropped: [{ at: 0, type: null, reason: "notAnAnswer", detail: "the answer has no blocks" }],
    };

  list.forEach((raw, at) => {
    if (blocks.length >= CATALOGUE.maxBlocks) {
      dropped.push({
        at,
        type: typeof raw === "object" && raw !== null ? String((raw as { type?: unknown }).type ?? "") || null : null,
        reason: "tooManyBlocks",
        detail: `an answer is at most ${CATALOGUE.maxBlocks} blocks`,
      });
      return;
    }

    const shape = checkBlockShape(raw, `block ${at + 1}`);
    if (!shape.ok) {
      dropped.push({ at, type: shape.type, reason: shape.problem.reason, detail: shape.problem.detail });
      return;
    }

    const resolved = resolveBlock(shape.block, ctx);
    if ("reason" in resolved) {
      dropped.push({ at, type: shape.block.type, reason: resolved.reason, detail: resolved.detail });
      return;
    }
    blocks.push(resolved.block);
  });

  return { blocks, dropped };
}
