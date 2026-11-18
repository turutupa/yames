/**
 * The Session's tab strip, as data: where each fret number goes, which bar is
 * "now", which note is current, and how one pass of a short pattern repeats
 * for the length of a Take. Pure, so the arithmetic is tested without a
 * browser; `TabStrip.tsx` only draws it and moves it.
 *
 * Ids. A Take is written out (`session/take.ts` `writtenOut`) and its score's
 * notes are numbered in (tick, string) order (`paths/toScore.ts`). One pass of
 * the pattern sorted the same way, numbered 0..k-1, therefore gives every note
 * of the Take the id `pass * k + index`: the same id the score, the schedule
 * and the analyzer's lights use. `tabStripModel.test.ts` holds the two to each
 * other on a real pack.
 */
import { TICKS, barLengthTicks } from "../../../paths/format";
import type { ScoreSchedule } from "../../../songs/types";
import type { TakePlan } from "../../../session/take";
import type { TimingMark } from "../../songs/review/marks";

/** How a played note went, as the strip colours it. */
export type TabResult = "good" | "early" | "late" | "miss";

export type TabStripMode = "preview" | "follow";

/** One note of the pattern: an Exercise's `PathNote` fits as it is. */
export type TabStripNoteInput = {
  /** 1 is the high e, as in tab. */
  string: number;
  fret: number;
  /** Ticks from the start of the pattern (960 to the quarter). */
  tick: number;
  /** Length in ticks. Only the rhythm hint reads it. */
  dur: number;
};

/** A pattern note with its place in the pattern. */
export type PatternNote = TabStripNoteInput & {
  /** Its position in (tick, string) order: the id it has in pass 0. */
  index: number;
  /** Which onset of the pattern it is, from 1: a chord's notes share one. */
  order: number;
};

export type PatternModel = {
  notes: PatternNote[];
  /** The pattern's onsets, in ticks from its start, ascending and distinct. */
  onsets: number[];
  barTicks: number;
  beatTicks: number;
  patternBars: number;
  /** One pass, in ticks. */
  passTicks: number;
  /**
   * The tightest gap between two onsets, in ticks, counting the seam from the
   * last onset round to the first of the next pass. 0 with one onset or none.
   */
  minGap: number;
};

/** A note as drawn: one pass of one pattern note, at its place in the Take. */
export type StripNote = PatternNote & {
  /** The Take's note id: `pass * notes.length + index`. */
  id: number;
  pass: number;
  /** Ticks from the start of the Take. */
  at: number;
  /** The Take's bar it falls in, from 0. */
  bar: number;
};

export function patternModel(
  input: readonly TabStripNoteInput[],
  barTicks: number,
  patternBars: number,
  beatTicks: number = TICKS,
): PatternModel {
  const bars = Math.max(1, Math.round(patternBars));
  const bar = barTicks > 0 ? barTicks : TICKS * 4;
  const passTicks = bar * bars;
  const sorted = input
    .filter((n) => n.string >= 1 && n.string <= 6 && Number.isFinite(n.tick))
    .map((n) => ({ string: n.string, fret: n.fret, tick: n.tick, dur: n.dur }))
    .sort((a, b) => a.tick - b.tick || a.string - b.string);
  const onsets: number[] = [];
  for (const n of sorted) if (onsets[onsets.length - 1] !== n.tick) onsets.push(n.tick);
  const notes: PatternNote[] = sorted.map((n, index) => ({
    ...n,
    index,
    order: onsets.indexOf(n.tick) + 1,
  }));
  let minGap = 0;
  const consider = (gap: number) => {
    if (gap > 0 && (minGap === 0 || gap < minGap)) minGap = gap;
  };
  for (let i = 1; i < onsets.length; i++) consider(onsets[i] - onsets[i - 1]);
  if (onsets.length > 1) consider(onsets[0] + passTicks - onsets[onsets.length - 1]);
  return {
    notes,
    onsets,
    barTicks: bar,
    beatTicks: beatTicks > 0 ? beatTicks : TICKS,
    patternBars: bars,
    passTicks,
    minGap,
  };
}

/** The pass a tick falls in (negative through a count-in). */
export function passAt(model: Pick<PatternModel, "passTicks">, tick: number): number {
  return Math.floor(tick / model.passTicks);
}

/** The Take's last tick (exclusive), or Infinity for a pattern that loops for good. */
export function takeEnd(model: Pick<PatternModel, "barTicks">, takeBars?: number): number {
  return takeBars && takeBars > 0 ? takeBars * model.barTicks : Number.POSITIVE_INFINITY;
}

/**
 * Every note of passes `from..to` (inclusive), cut at the Take's end on a bar
 * line the way `writtenOut` cuts it. Pass 0 is the first; none before it.
 */
export function occurrences(
  model: PatternModel,
  from: number,
  to: number,
  takeBars?: number,
): StripNote[] {
  const end = takeEnd(model, takeBars);
  const k = model.notes.length;
  const out: StripNote[] = [];
  for (let pass = Math.max(0, from); pass <= to; pass++) {
    const offset = pass * model.passTicks;
    if (offset >= end) break;
    for (const n of model.notes) {
      const at = offset + n.tick;
      if (at >= end) continue;
      out.push({ ...n, id: pass * k + n.index, pass, at, bar: Math.floor(at / model.barTicks) });
    }
  }
  return out;
}

/**
 * The onset being played at `tick`, as (pass, index into `onsets`), or null
 * before the first and after the Take.
 *
 * A note stays current a little after it is due rather than handing over on
 * the tick: the player is still on it, and still reading it.
 */
export function currentOnset(
  model: PatternModel,
  tick: number,
  graceTicks: number,
  takeBars?: number,
): { pass: number; index: number; at: number } | null {
  if (model.onsets.length === 0) return null;
  const end = takeEnd(model, takeBars);
  const t = tick - graceTicks;
  let pass = passAt(model, t);
  const rel = t - pass * model.passTicks;
  // The first onset strictly after `rel`.
  let index = model.onsets.findIndex((o) => o > rel);
  if (index < 0) {
    pass += 1;
    index = 0;
  }
  if (pass < 0) {
    pass = 0;
    index = 0;
  }
  const at = pass * model.passTicks + model.onsets[index];
  if (at >= end) return null;
  return { pass, index, at };
}

/** Pixels per tick and the fixed cursor's x, for a view this wide. */
export type StripScale = {
  ppt: number;
  cursorX: number;
  /** Fret-number size, in px. */
  fretPx: number;
  /** The closest two onsets may sit, centre to centre. */
  minGapPx: number;
};

/** The cursor's place across the view in follow mode. */
export const CURSOR_AT = 0.3;
/** How many bars the space right of the cursor is sized for: now and next. */
export const BARS_AHEAD = 2;
/** Fret numbers at full size (a 1024px window and wider), and at their smallest. */
export const FRET_PX = 34;
export const FRET_PX_MIN = 20;
/** Preview may go smaller than follow on a phone: the whole pattern has to fit. */
export const PREVIEW_FRET_PX_MIN = 15;
/** The current note is drawn this much larger: 34 px becomes 40. */
export const CURRENT_SCALE = 40 / 34;

/** The fret-number size for a view this wide: full from 760 px, scaled to a phone below. */
export function fretPxFor(viewWidth: number): number {
  if (!(viewWidth > 0)) return FRET_PX;
  if (viewWidth >= 760) return FRET_PX;
  const k = Math.max(0, (viewWidth - 300) / (760 - 300));
  return Math.round(FRET_PX_MIN + k * (FRET_PX - FRET_PX_MIN));
}

/** Room for a two-digit number and its knock-out, centre to centre. */
export function minGapPxFor(fretPx: number): number {
  return Math.round(fretPx * 1.45);
}

/**
 * Follow mode: the cursor 30 % in, and the 70 % right of it sized for the
 * current bar and the next. Closer than `minGapPx` and the strip zooms in and
 * shows less ahead, as the runway does, rather than let numbers collide.
 */
export function followScale(
  model: Pick<PatternModel, "barTicks" | "minGap">,
  viewWidth: number,
): StripScale {
  const fretPx = fretPxFor(viewWidth);
  const minGapPx = minGapPxFor(fretPx);
  if (!(viewWidth > 0)) return { ppt: 0, cursorX: 0, fretPx, minGapPx };
  const cursorX = Math.round(viewWidth * CURSOR_AT);
  const fit = (viewWidth - cursorX) / (BARS_AHEAD * model.barTicks);
  const legible = model.minGap > 0 ? minGapPx / model.minGap : 0;
  return { ppt: Math.max(fit, legible), cursorX, fretPx, minGapPx };
}

/**
 * Preview mode: one pass, the whole width, with a margin each side for the
 * first and last numbers. The numbers shrink (never below `PREVIEW_FRET_PX_MIN`)
 * before two neighbours on one string are allowed to touch.
 */
export function previewScale(
  model: Pick<PatternModel, "passTicks" | "minGap" | "notes">,
  viewWidth: number,
): StripScale & { margin: number } {
  const base = fretPxFor(viewWidth);
  if (!(viewWidth > 0)) return { ppt: 0, cursorX: 0, fretPx: base, minGapPx: minGapPxFor(base), margin: 0 };
  const margin = Math.round(base * 1.1);
  const ppt = Math.max(0, viewWidth - 2 * margin) / model.passTicks;
  const fretPx = Math.max(PREVIEW_FRET_PX_MIN, Math.min(base, largestFretPx(model.notes, ppt)));
  return { ppt, cursorX: margin, fretPx, minGapPx: minGapPxFor(fretPx), margin };
}

/** A fret number's width, in ems of its own size: one digit or two. */
export function numberEm(fret: number): number {
  return fret >= 10 ? 1.2 : 0.72;
}

/**
 * The largest number size at which no two neighbours on one string touch, at
 * `ppt`. Only the same string matters: numbers on different strings are on
 * different lines.
 */
export function largestFretPx(notes: readonly TabStripNoteInput[], ppt: number): number {
  const byString = new Map<number, TabStripNoteInput[]>();
  for (const n of notes) byString.set(n.string, [...(byString.get(n.string) ?? []), n]);
  let best = Number.POSITIVE_INFINITY;
  for (const list of byString.values()) {
    const sorted = [...list].sort((a, b) => a.tick - b.tick);
    for (let i = 1; i < sorted.length; i++) {
      const gapPx = (sorted[i].tick - sorted[i - 1].tick) * ppt;
      if (!(gapPx > 0)) continue;
      const need = (numberEm(sorted[i].fret) + numberEm(sorted[i - 1].fret)) / 2;
      best = Math.min(best, Math.floor((gapPx - 3) / need));
    }
  }
  return best;
}

/** The strip's x offset that puts `tick` under the cursor. */
export function stripOffset(tick: number, scale: Pick<StripScale, "ppt" | "cursorX">): number {
  return scale.cursorX - tick * scale.ppt;
}

/** Where a tick sits on the strip, before the offset. */
export function tickX(tick: number, scale: Pick<StripScale, "ppt">): number {
  return tick * scale.ppt;
}

/**
 * A bar line sits a little before the bar's first tick, so a note on beat one
 * is not drawn on the line: half the tightest gap, at most 28 px.
 */
export function barLinePad(model: Pick<PatternModel, "minGap" | "beatTicks">, ppt: number): number {
  const gap = (model.minGap > 0 ? model.minGap : model.beatTicks) * ppt;
  return Math.min(28, Math.max(6, gap / 2));
}

/** Which passes must be on the strip for the view to be full at `tick`. */
export function passWindow(
  model: Pick<PatternModel, "passTicks">,
  tick: number,
  scale: Pick<StripScale, "ppt" | "cursorX">,
  viewWidth: number,
): { from: number; to: number } {
  const pass = passAt(model, tick);
  const passPx = Math.max(1, model.passTicks * scale.ppt);
  const behind = Math.ceil(scale.cursorX / passPx);
  const ahead = Math.ceil(Math.max(0, viewWidth - scale.cursorX) / passPx);
  return { from: Math.max(0, pass - behind), to: Math.max(0, pass + ahead) };
}

/** Where a bar stands relative to the one being played. */
export type BarRel = "past" | "now" | "next" | "later";

export function barRel(bar: number, nowBar: number): BarRel {
  if (bar < nowBar) return "past";
  if (bar === nowBar) return "now";
  if (bar === nowBar + 1) return "next";
  return "later";
}

/** The bar a tick falls in (the count-in is bar -1). */
export function barAt(model: Pick<PatternModel, "barTicks">, tick: number): number {
  return Math.floor(tick / model.barTicks);
}

/**
 * Beams for the rhythm hint: 1 for an eighth, 2 for a sixteenth, 3 for a
 * thirty-second, 0 for a quarter or longer. Triplets count as their note value.
 */
export function beamsFor(dur: number, beatTicks: number = TICKS): number {
  if (!(dur > 0) || dur >= beatTicks) return 0;
  if (dur > beatTicks / 4) return 1;
  if (dur > beatTicks / 8) return 2;
  return 3;
}

/** The analyzer's mark as the strip's colour. A soft note never heard has none. */
export function resultOfMark(mark: TimingMark): TabResult | null {
  switch (mark) {
    case "onTime":
    case "slightlyEarly":
    case "slightlyLate":
      return "good";
    case "early":
      return "early";
    case "late":
      return "late";
    case "missed":
      return "miss";
    case "notAssessed":
      return null;
  }
}

/** The Session's lights (by onset id) as the strip's results (by note id). */
export function resultsFromLights(
  lights: ReadonlyMap<number, TimingMark>,
  schedule: ScoreSchedule,
): Map<number, TabResult> {
  const out = new Map<number, TabResult>();
  if (lights.size === 0) return out;
  for (const onset of schedule.onsets) {
    const mark = lights.get(onset.id);
    if (!mark) continue;
    const result = resultOfMark(mark);
    if (!result) continue;
    for (const noteId of onset.noteIds) out.set(noteId, result);
  }
  return out;
}

/** What a Take hands the strip: the pattern, its bar, and how long it runs. */
export function tabStripInputOfTake(take: TakePlan): {
  notes: readonly TabStripNoteInput[];
  barTicks: number;
  patternBars: number;
  takeBars: number;
  bpm: number;
} {
  return {
    notes: take.exercise.notes,
    barTicks: barLengthTicks(take.exercise.meter),
    patternBars: Math.max(1, take.exercise.bars),
    takeBars: take.bars,
    bpm: take.bpm,
  };
}

const NAMES = ["e", "B", "G", "D", "A", "E"] as const;

/**
 * The pattern in words for a screen reader: each onset as string and fret
 * ("e5", a chord "G7+B8"), bars split by " | ". Language-neutral on purpose;
 * the sentence around it is translated.
 */
export function describePattern(model: PatternModel): string {
  const bars: string[][] = Array.from({ length: model.patternBars }, () => []);
  let i = 0;
  while (i < model.notes.length) {
    const tick = model.notes[i].tick;
    const chord: string[] = [];
    while (i < model.notes.length && model.notes[i].tick === tick) {
      const n = model.notes[i];
      chord.push(`${NAMES[n.string - 1]}${n.fret}`);
      i++;
    }
    const bar = Math.min(model.patternBars - 1, Math.max(0, Math.floor(tick / model.barTicks)));
    bars[bar].push(chord.join("+"));
  }
  return bars.map((b) => b.join(" ")).join(" | ");
}

export const STRING_NAMES = NAMES;
