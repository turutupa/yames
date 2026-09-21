/**
 * The tablature of a take, laid out in time — the model the video is painted
 * from.
 *
 * `W31-THE-TAB-IN-THE-VIDEO.md`. The owner, 2026-09-21: *"if the recording is
 * from playing a SONG, it would be really really cool to have the option of
 * adding the tab the user is playing … so its kinda in sync."* W25's clip drew
 * a row of coloured dots under the picture, and a dot is not a tab. What this
 * is the model for is what every play-along video on the internet looks like:
 * the strings as lines, the fret numbers on them, scrolling under a fixed
 * playhead in time with the sound.
 *
 * ## It is drawn from the SCORE, never from the screen
 *
 * There is a tab on the stage already and it is alphaTab's, which is SVG laid
 * out in systems inside a scrolling page — six lines that wrap every few bars,
 * with page furniture around them. A video needs one endless horizontal line,
 * so nothing here reads that DOM or photographs it. Every position below comes
 * from `SongScore` (each note's string, fret, tick and length) and the take's
 * own transport, which is also the only way the drawing can be tested without
 * a browser in the room.
 *
 * ## One clock, and it is the tape's
 *
 * Every time in this file is **transport milliseconds**, exactly as `tape.ts`
 * and `clip.ts` are: time since beat 0 of the first pass of the played range,
 * at the click's own tempo, integrated over the score's tempo steps. The
 * review, the tape, the clip and now the tab are four drawings of one number,
 * which is what makes "in sync" a fact rather than a hope — the spacing
 * between two notes IS how long the player had between them, so the scroll
 * speed is constant at a constant tempo and visibly changes where the tempo
 * map does.
 *
 * `tabPainter.ts` is the half that touches a canvas and holds no idea of its
 * own about where anything is; `tabTape.test.ts` is the whole verification of
 * this half.
 */
import { noteNameOf } from "../containers/songs/review/marks";
import type { TimingMark } from "../containers/songs/review/marks";
import { msAtBeat } from "../songs/camera/offset";
import type { Tape } from "../songs/camera/tape";
import { clampRange, rangeTempoSteps } from "../songs/schedule";
import type { BarRange } from "../songs/schedule";
import type { ScoreSchedule, SongNote, SongScore, SongTechnique } from "../songs/types";

/**
 * One fret number on one string, where it falls and how it went.
 *
 * `mark` is `null` for a tied continuation, and that is not an oversight: a
 * tie makes no onset (`schedule.ts`), so nothing was picked, nothing was
 * scored, and painting a verdict on it would be inventing one. The painter
 * draws those quietly.
 */
export type TabNote = {
  /** The expected onset this note belongs to, or null for a tie. */
  onsetId: number | null;
  /** Transport milliseconds from beat 0 of the first pass. */
  atMs: number;
  /** Where it stops sounding — what a let-ring or a palm mute spans. */
  endMs: number;
  pass: number;
  /** String 1 is the highest, the way Guitar Pro numbers them. */
  string: number;
  fret: number;
  mark: TimingMark | null;
  dead: boolean;
  ghost: boolean;
  techniques: readonly SongTechnique[];
};

/** A note that was played and was not written. Drawn under the strings. */
export type TabExtra = { atMs: number; pass: number };

export type TabTape = {
  /** How many lines the tab has. Six, or whatever the tuning says. */
  strings: number;
  /** The letter at the left of each line, string 1 (the highest) first. */
  stringNames: string[];
  /** Ascending by `atMs`, then by string from the top down. */
  notes: TabNote[];
  extras: TabExtra[];
  /**
   * How close together the notes get, in milliseconds — the near-tightest
   * gap between one attack and the next.
   *
   * The painter needs it because the one thing that decides whether a tab is
   * readable is not the type size, it is the type size against the spacing:
   * twenty-two-pixel numbers are beautiful under eighth notes and a smear
   * under sixteenths. So the drawing sizes the numbers to the music rather
   * than to the frame, and a run of sixteenths comes out smaller and legible
   * instead of large and overlapping.
   *
   * A low PERCENTILE rather than the minimum: one grace note, one flam, one
   * chord whose notes the importer put a tick apart would otherwise shrink
   * the whole piece to nothing.
   */
  tightestMs: number;
};

/**
 * The letter at the left of a string line.
 *
 * The review's own spelling (sharps; a review has no key to spell a flat
 * against), without the octave on it — a tuning line says "E A D G B E", not
 * "E4 A3". The score's `tuning` is the OPEN string without the capo, which is
 * what a tab is labelled with whatever is clamped to the neck.
 */
function stringLetter(midi: number): string {
  return noteNameOf(midi).replace(/-?\d+$/, "");
}

/**
 * The whole tab of one attempt, every pass of it.
 *
 * Built once beside `buildTape` and from the same three things it was built
 * from, so a note's colour here is the colour the review has on screen for it
 * — the brief is explicit that the marks on a shared clip must be the marks on
 * the screen it was made from, and the way to guarantee that is to take them
 * from the one tape rather than to judge a second time.
 */
export function buildTabTape(args: {
  score: SongScore;
  schedule: ScoreSchedule;
  tape: Tape;
  range: BarRange;
  tempoPercent: number;
}): TabTape {
  const { score, schedule, tape, range, tempoPercent } = args;
  const clamped = clampRange(score, range);
  const steps = rangeTempoSteps(score, clamped, tempoPercent);
  const ticksPerQuarter = score.ticksPerQuarter || 960;
  const first = score.bars[clamped.startBar]?.startTick ?? 0;
  const last = score.bars[clamped.endBar];
  const end = last ? last.startTick + last.lengthTicks : first;

  /** Which onset a note belongs to. A tie belongs to none. */
  const onsetOfNote = new Map<number, number>();
  for (const onset of schedule.onsets) {
    for (const id of onset.noteIds) onsetOfNote.set(id, onset.id);
  }

  /** The verdict per (pass, onset), straight off the tape the review drew. */
  const markOf = new Map<string, TimingMark>();
  for (const tick of tape.ticks) markOf.set(`${String(tick.pass)}:${String(tick.onsetId)}`, tick.mark);

  const inRange: SongNote[] = [];
  for (const note of score.notes) {
    if (note.tick < first || note.tick >= end) continue;
    inRange.push(note);
  }

  const notes: TabNote[] = [];
  for (const pass of tape.passes) {
    const base = pass * tape.passMs;
    for (const note of inRange) {
      const beat = (note.tick - first) / ticksPerQuarter;
      const onsetId = note.tieFromPrevious ? null : (onsetOfNote.get(note.id) ?? null);
      notes.push({
        onsetId,
        atMs: base + msAtBeat(steps, beat),
        endMs: base + msAtBeat(steps, beat + note.durTicks / ticksPerQuarter),
        pass,
        string: note.string,
        fret: note.fret,
        mark: onsetId === null ? null : (markOf.get(`${String(pass)}:${String(onsetId)}`) ?? null),
        dead: note.dead,
        ghost: note.ghost,
        techniques: note.techniques,
      });
    }
  }
  // Ascending in time, and within a chord from the top string down, which is
  // the order a reader's eye takes a stack in and the order the painter needs
  // to decide what to leave out when a chord will not fit.
  notes.sort((a, b) => a.atMs - b.atMs || a.string - b.string);

  // As many lines as the tuning has (`W31` item 1): a seven- or eight-string
  // guitar and a four- or five-string bass are all ordinary files. A score
  // whose tuning never made it through the importer still gets six, because a
  // tab with no lines is not a tab.
  const tuning = score.tuning.length > 0 ? score.tuning : [64, 59, 55, 50, 45, 40];

  return {
    strings: tuning.length,
    stringNames: tuning.map(stringLetter),
    notes,
    extras: tape.extras.map((extra) => ({ atMs: extra.atMs, pass: extra.pass })),
    tightestMs: tightestGapMs(notes),
  };
}

/**
 * The tenth-percentile gap between one attack and the next.
 *
 * Attacks, not notes: three notes of a chord are one moment and a gap of
 * zero, and counting those would say every piece with a chord in it is
 * infinitely dense. A piece with one note in it, or none, has no gap to
 * measure and gets a whole second — which asks the painter for the largest
 * numbers it will draw, and is right.
 */
const NO_GAP_MS = 1000;

function tightestGapMs(notes: readonly TabNote[]): number {
  const gaps: number[] = [];
  let previous = Number.NaN;
  for (const note of notes) {
    if (!Number.isNaN(previous) && note.atMs - previous > 1) gaps.push(note.atMs - previous);
    if (Number.isNaN(previous) || note.atMs > previous) previous = note.atMs;
  }
  if (gaps.length === 0) return NO_GAP_MS;
  gaps.sort((a, b) => a - b);
  return Math.max(30, gaps[Math.floor(gaps.length * 0.1)]);
}

/**
 * Where the playhead sits across the strip.
 *
 * A THIRD of the way in rather than the middle (`W31` item 1). The dots were
 * centred because a dot carries nothing you need to read before you reach it;
 * a fret number is something you play, and a player reads ahead. Two thirds of
 * the window in front of the playhead is what a tab video gives you and what a
 * musician's eye expects.
 */
export const TAB_HEAD_AT = 1 / 3;

/**
 * How far past either edge a note is still worth drawing.
 *
 * A number centred a hair outside the window still has half of itself inside
 * it, and the compositor clips to the box — so a note that popped in and out
 * at the exact edge would flicker for a frame. A twentieth of the window is
 * wider than any fret number.
 */
const EDGE_MARGIN = 0.05;

/** A note on the strip: where along it, 0 at the left edge and 1 at the right. */
export type TabPlacement = { note: TabNote; at: number };

/**
 * The notes on the strip right now.
 *
 * `notes` is ascending, so the slice is found by bisection and walked to the
 * far edge — the loop is bounded by the WINDOW and never by the take, which is
 * what lets a six-minute attempt be painted thirty times a second on a machine
 * that is also encoding video.
 */
export function visibleTabNotes(
  tab: TabTape,
  nowMs: number,
  windowMs: number,
  headAt: number = TAB_HEAD_AT,
): TabPlacement[] {
  const out: TabPlacement[] = [];
  if (!(windowMs > 0)) return out;
  const from = nowMs - headAt * windowMs;
  const lowMs = from - EDGE_MARGIN * windowMs;
  const highMs = from + (1 + EDGE_MARGIN) * windowMs;
  for (let i = firstAtOrAfter(tab.notes, lowMs); i < tab.notes.length; i++) {
    const note = tab.notes[i];
    if (note.atMs > highMs) break;
    out.push({ note, at: (note.atMs - from) / windowMs });
  }
  return out;
}

/** The played-but-not-written notes on the strip right now, same axis. */
export function visibleTabExtras(
  tab: TabTape,
  nowMs: number,
  windowMs: number,
  headAt: number = TAB_HEAD_AT,
): { extra: TabExtra; at: number }[] {
  const out: { extra: TabExtra; at: number }[] = [];
  if (!(windowMs > 0)) return out;
  const from = nowMs - headAt * windowMs;
  for (const extra of tab.extras) {
    if (extra.atMs < from) continue;
    if (extra.atMs > from + windowMs) break;
    out.push({ extra, at: (extra.atMs - from) / windowMs });
  }
  return out;
}

/** The first entry at or after `ms`, by bisection over an ascending list. */
function firstAtOrAfter(notes: readonly TabNote[], ms: number): number {
  let low = 0;
  let high = notes.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (notes[mid].atMs < ms) low = mid + 1;
    else high = mid;
  }
  return low;
}

/**
 * Whether the playhead is on this note at this moment.
 *
 * What "a number lights as the playhead crosses it" means (`W31` item 2). A
 * short lead-in so the light arrives with the sound rather than a frame after
 * it, and the note stays lit for as long as it rings — or for a beat's worth
 * of a minimum, because a staccato sixteenth that lit for 60 ms would read as
 * a flicker rather than as "this one".
 */
export const LIT_LEAD_MS = 30;
const LIT_MIN_MS = 110;

export function isLit(note: TabNote, nowMs: number): boolean {
  if (nowMs < note.atMs - LIT_LEAD_MS) return false;
  return nowMs <= Math.max(note.endMs, note.atMs + LIT_MIN_MS);
}
