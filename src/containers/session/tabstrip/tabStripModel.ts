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
import type { PathTechnique } from "../../../paths/format";
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
  /**
   * How it is played, as the pack writes it (`PathNote.tech`): `hammer`,
   * `pull` and `tap` on the note they arrive at, `slide` on the note it leaves.
   */
  tech?: readonly PathTechnique[];
  /** Semitones, with `bend`. */
  bend?: number;
  /** The pick's stroke, where the content writes one (`PathNote.pick`). */
  pick?: "d" | "u";
};

/** Which way a strum goes: down toward the floor, or up. */
export type Strum = "d" | "u";

/**
 * The direction of every strum of a pattern, by its tick (card #74).
 *
 * A strum is an onset of three strings or more. Its direction is the pick
 * mark the content wrote on it, else the one every strumming teacher starts
 * with: the hand swings down on the beat and up between beats, so on the
 * pattern's own grid (quarters, eighths or sixteenths, the finest any strum
 * sits on) the even places are down and the odd ones up. A pattern of
 * quarter-note strums is all down. A strum off that grid (a triplet) gets no
 * mark rather than a guess. A pattern with no strum has none.
 */
export function strumDirections(
  notes: readonly Pick<TabStripNoteInput, "string" | "tick" | "pick">[],
  beatTicks: number = TICKS,
): Map<number, Strum> {
  const out = new Map<number, Strum>();
  const strings = new Map<number, Set<number>>();
  const written = new Map<number, Strum>();
  for (const n of notes) {
    if (!Number.isFinite(n.tick)) continue;
    if (!strings.has(n.tick)) strings.set(n.tick, new Set());
    strings.get(n.tick)!.add(n.string);
    if (n.pick && !written.has(n.tick)) written.set(n.tick, n.pick);
  }
  const strums = [...strings].filter(([, set]) => set.size >= 3).map(([tick]) => tick);
  if (strums.length === 0 || !(beatTicks > 0)) return out;
  const on = (grid: number) => strums.every((tick) => tick % grid === 0);
  const grid = on(beatTicks) ? beatTicks : on(beatTicks / 2) ? beatTicks / 2 : on(beatTicks / 4) ? beatTicks / 4 : 0;
  for (const tick of strums) {
    const pick = written.get(tick);
    if (pick) out.set(tick, pick);
    else if (grid === beatTicks) out.set(tick, "d");
    else if (grid > 0) out.set(tick, Math.round(tick / grid) % 2 === 0 ? "d" : "u");
    else if (tick % beatTicks === 0) out.set(tick, "d");
  }
  return out;
}

/**
 * A technique mark between two notes on one string, drawn the standard tab
 * way: "5h7", "7p5", "12t", "5/7", "7\\5". It belongs to the note it arrives
 * at; `fromTicks` is how far back the note it comes from is (round the
 * pattern's seam when it is the last of the pass before).
 */
export type TechLink = { mark: "h" | "p" | "t" | "/" | "\\"; fromTicks: number };

/** Marks after a note's number: a bend's target fret, vibrato, or a slide out to nowhere. */
export type TechAfter = { bendTo?: number; vibrato?: boolean; slideOut?: "/" | "\\" };

/** A pattern note with its place in the pattern. */
export type PatternNote = TabStripNoteInput & {
  /** Its position in (tick, string) order: the id it has in pass 0. */
  index: number;
  /** Which onset of the pattern it is, from 1: a chord's notes share one. */
  order: number;
  /** The technique mark that leads into it, when it has one. */
  link?: TechLink;
  /** The marks after its number. */
  after?: TechAfter;
};

export type PatternModel = {
  notes: PatternNote[];
  /** The pattern's onsets, in ticks from its start, ascending and distinct. */
  onsets: number[];
  /** Each strum's direction, by its tick in the pattern (`strumDirections`). Empty without strums. */
  strums: ReadonlyMap<number, Strum>;
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
    .map((n) => ({
      string: n.string,
      fret: n.fret,
      tick: n.tick,
      dur: n.dur,
      ...(n.tech && n.tech.length > 0 ? { tech: n.tech } : {}),
      ...(n.bend !== undefined ? { bend: n.bend } : {}),
      ...(n.pick ? { pick: n.pick } : {}),
    }))
    .sort((a, b) => a.tick - b.tick || a.string - b.string);
  const onsets: number[] = [];
  for (const n of sorted) if (onsets[onsets.length - 1] !== n.tick) onsets.push(n.tick);
  const notes: PatternNote[] = sorted.map((n, index) => ({
    ...n,
    index,
    order: onsets.indexOf(n.tick) + 1,
  }));
  techMarks(notes, passTicks);
  let minGap = 0;
  const consider = (gap: number) => {
    if (gap > 0 && (minGap === 0 || gap < minGap)) minGap = gap;
  };
  for (let i = 1; i < onsets.length; i++) consider(onsets[i] - onsets[i - 1]);
  if (onsets.length > 1) consider(onsets[0] + passTicks - onsets[onsets.length - 1]);
  return {
    notes,
    onsets,
    strums: strumDirections(sorted, beatTicks > 0 ? beatTicks : TICKS),
    barTicks: bar,
    beatTicks: beatTicks > 0 ? beatTicks : TICKS,
    patternBars: bars,
    passTicks,
    minGap,
  };
}

/**
 * The technique marks, from the pack's `tech` (card #40). A hammer, a pull
 * or a tap is marked on the note it arrives at; a slide is written on the
 * note it leaves, so its mark moves onto the next note on that string. The
 * note before or after on a string is found round the pattern's seam, since
 * a short pattern repeats.
 */
function techMarks(notes: PatternNote[], passTicks: number): void {
  const onString = (s: number) => notes.filter((n) => n.string === s);
  for (const n of notes) {
    const tech = n.tech ?? [];
    if (tech.length === 0) continue;
    const mine = onString(n.string);
    const at = mine.indexOf(n);
    const prev = mine.length > 1 ? mine[(at - 1 + mine.length) % mine.length] : null;
    const next = mine.length > 1 ? mine[(at + 1) % mine.length] : null;
    const back = (from: PatternNote) => (n.tick - from.tick + passTicks) % passTicks || passTicks;
    const arrive: TechLink["mark"] | null = tech.includes("tap")
      ? "t"
      : tech.includes("hammer")
        ? "h"
        : tech.includes("pull")
          ? "p"
          : null;
    // A hammer from nowhere: the note before it in time is on another string. Its
    // "h" stands before the number with no slur, as from nowhere (fingering audit 2).
    const before = notes[(notes.indexOf(n) - 1 + notes.length) % notes.length];
    const nowhere = arrive === "h" && (!before || before === n || (before.string !== n.string && before.tick !== n.tick));
    if (arrive && !n.link) n.link = { mark: arrive, fromTicks: prev && !nowhere ? back(prev) : passTicks };
    const after: TechAfter = {};
    if (tech.includes("bend") && n.bend !== undefined && n.bend > 0) after.bendTo = n.fret + Math.round(n.bend);
    if (tech.includes("vibrato")) after.vibrato = true;
    if (tech.includes("slide")) {
      if (next && next.fret !== n.fret && !next.link) {
        next.link = {
          mark: next.fret > n.fret ? "/" : "\\",
          fromTicks: (next.tick - n.tick + passTicks) % passTicks || passTicks,
        };
      } else if (!next || next.fret === n.fret) {
        after.slideOut = "\\";
      }
    }
    if (after.bendTo !== undefined || after.vibrato || after.slideOut) n.after = after;
  }
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

/**
 * The layout (owner, beta 5: "it does not look like the picture").
 *
 * The approved mock (`.preview/practice-review/designer/mock.html?view=tab`)
 * is a staff with the high e as its top line, the fret numbers ON their lines,
 * "now · bar 2" over the bar being played and "next · bar 3", dimmed, beside
 * it, beat counts under each bar and TAB at the left. Nothing scrolls under a
 * fixed column: the amber column goes from note to note across the bar, and
 * at the bar line the next bar slides into "now".
 *
 * So the unit is a SEGMENT: a bar, or half or a quarter of one when the notes
 * are dense. Two are shown, now and next, and the segment is the largest that
 * keeps every two neighbouring numbers `minGapPx` apart, about twice a
 * number's width (the mock spaces 65 px a note at 34 px). The overview the
 * ready and paused screens show is the same segments, one pass of them,
 * wrapped onto rows.
 */

/** Fret numbers at full size (the mock's footnote: 34 px), and the smallest any layout takes. */
export const FRET_PX = 34;
export const FRET_PX_MIN = 14;
/** The current note is drawn this much larger: 34 px becomes 40. */
export const CURRENT_SCALE = 40 / 34;
/** Segments per bar the layouts try, sparsest first: a bar, half, a quarter, an eighth. */
export const SEGMENT_SPLITS = [1, 2, 4, 8] as const;
/** Segments the follow view shows side by side: now and next. */
export const FOLLOW_SEGMENTS = 2;

/** The fret-number size for a staff this wide: full from 760 px, scaled to a phone below. */
export function fretPxFor(viewWidth: number): number {
  if (!(viewWidth > 0)) return FRET_PX;
  if (viewWidth >= 760) return FRET_PX;
  const k = Math.max(0, (viewWidth - 280) / (760 - 280));
  return Math.round(18 + k * (FRET_PX - 18));
}

/** Room a follow panel keeps over its staff (the fill's top padding). */
export const FOLLOW_TOP_PX = 26;

/** The largest numbers, no larger than `fretPx`, whose staff fits `height` (never under 18). */
export function followFretPx(fretPx: number, height: number): number {
  if (!(height > 0)) return fretPx;
  let f = fretPx;
  while (f > 18 && staffGeometry(f).height + FOLLOW_TOP_PX > height) f -= 1;
  return f;
}

/** The closest two neighbouring numbers may sit, centre to centre: about twice a number (65 px at 34). */
export function minGapPxFor(fretPx: number): number {
  return Math.round(fretPx * 1.9);
}

/** The vertical geometry of one staff, for numbers this size. */
export type StaffGeometry = {
  fretPx: number;
  /** Between two string lines. */
  gap: number;
  /** The "now · bar 2" label's baseline. */
  labelY: number;
  /** The high e's line, and the low E's. */
  top: number;
  bottom: number;
  /** The beat counts' baseline. */
  beatY: number;
  height: number;
  /** The TAB letters' column, left of the first bar. */
  letters: number;
  /** Space inside a segment before its first note's slot, and after its last. */
  inset: number;
};

export function staffGeometry(fretPx: number, lineGap?: number): StaffGeometry {
  const f = fretPx;
  const gap = lineGap && lineGap > 0 ? Math.round(lineGap) : Math.round(f * 1.35);
  const labelY = Math.round(Math.max(12, f * 0.47) + 4);
  const top = Math.round(labelY + f * 0.9 + 10);
  const bottom = top + 5 * gap;
  const beatY = Math.round(bottom + f + Math.max(10, f * 0.5));
  return {
    fretPx: f,
    gap,
    labelY,
    top,
    bottom,
    beatY,
    height: beatY + 8,
    letters: Math.round(f * 1.25 + 8),
    inset: Math.round(Math.max(6, f * 0.45)),
  };
}

/** The tightest gap between two onsets, in ticks; a beat when there is one onset or none. */
export function gapTicksOf(model: Pick<PatternModel, "minGap" | "beatTicks">): number {
  return model.minGap > 0 ? model.minGap : model.beatTicks;
}

/** A segment's x scale: pixels per tick inside a segment this wide. */
export function segmentPpt(segWidth: number, segTicks: number, geo: Pick<StaffGeometry, "inset">): number {
  return Math.max(0, segWidth - 2 * geo.inset) / Math.max(1, segTicks);
}

/**
 * A note's x inside its segment: the segment's inset, then its tick, then
 * half the tightest gap, so the numbers sit centred in their slots and none
 * stands on a bar line (the mock's `step * (i + .5)`).
 */
export function noteXIn(
  intoTicks: number,
  ppt: number,
  model: Pick<PatternModel, "minGap" | "beatTicks">,
  geo: Pick<StaffGeometry, "inset">,
): number {
  return geo.inset + (intoTicks + gapTicksOf(model) / 2) * ppt;
}

/** Whether neighbours `gapTicks` apart are far enough apart at this scale. */
function holds(model: Pick<PatternModel, "minGap" | "beatTicks">, ppt: number, fretPx: number): boolean {
  return gapTicksOf(model) * ppt >= minGapPxFor(fretPx) - 0.5;
}

export type FollowLayout = {
  fretPx: number;
  geo: StaffGeometry;
  /** Segments per bar (1: a bar each). */
  split: number;
  segTicks: number;
  /** One segment's width, in px. */
  segWidth: number;
  ppt: number;
  /** The gap holds; false only when nothing tried would (a phone and thirty-seconds). */
  fits: boolean;
};

/**
 * The follow view for a panel this wide: two segments, the largest that keeps
 * the gap, at full size where the width allows. A phone takes smaller numbers
 * before it takes a shorter segment, down to 18 px.
 */
export function followLayout(
  model: Pick<PatternModel, "barTicks" | "minGap" | "beatTicks">,
  viewWidth: number,
  /**
   * The panel's height, when known: the numbers are held to a size whose
   * staff fits it, so a short window (1024x700) does not cut the low strings'
   * numbers off at the panel's foot. Unknown (0): by the width alone.
   */
  viewHeight = 0,
): FollowLayout {
  const base = followFretPx(fretPxFor(viewWidth), viewHeight);
  // Never much smaller than the width allows: a dense bar splits instead.
  const sizes = base - 4 >= 18 ? [base, base - 4] : [base];
  let last: FollowLayout | null = null;
  for (const split of SEGMENT_SPLITS) {
    for (const fretPx of sizes) {
      const geo = staffGeometry(fretPx);
      const segTicks = model.barTicks / split;
      const segWidth = Math.max(1, (viewWidth - geo.letters) / FOLLOW_SEGMENTS);
      const ppt = segmentPpt(segWidth, segTicks, geo);
      last = { fretPx, geo, split, segTicks, segWidth, ppt, fits: holds(model, ppt, fretPx) };
      if (last.fits) return last;
    }
  }
  return last!;
}

export type OverviewLayout = {
  fretPx: number;
  geo: StaffGeometry;
  split: number;
  segTicks: number;
  /** Segments in one pass, and on one row. */
  segments: number;
  perRow: number;
  rows: number;
  segWidth: number;
  ppt: number;
  /** Every row fits the height given. False: the panel scrolls. */
  fits: boolean;
};

/**
 * The whole pattern for the ready and paused screens: one pass, wrapped onto
 * rows, the largest numbers whose rows fit the height, never closer than the
 * gap. Bars stay whole when they can; a dense bar on a narrow window splits.
 */
export function overviewLayout(
  model: Pick<PatternModel, "barTicks" | "minGap" | "beatTicks" | "patternBars">,
  viewWidth: number,
  viewHeight: number,
  maxFretPx: number = FRET_PX,
): OverviewLayout {
  const top = Math.min(maxFretPx, fretPxFor(viewWidth));
  let fallback: OverviewLayout | null = null;
  for (let fretPx = top; fretPx >= FRET_PX_MIN; fretPx -= 2) {
    const geo = staffGeometry(fretPx);
    const usable = Math.max(1, viewWidth - geo.letters);
    for (const split of SEGMENT_SPLITS) {
      const segTicks = model.barTicks / split;
      const segments = model.patternBars * split;
      // The narrowest a segment may be and keep the gap.
      const need = (segTicks / gapTicksOf(model)) * minGapPxFor(fretPx) + 2 * geo.inset;
      const perRow = Math.min(segments, Math.floor(usable / need));
      if (perRow < 1) continue;
      // Whole bars on a row where they fit: a row of one and a half bars reads badly.
      let rowSegs = split > 1 && perRow >= split ? perRow - (perRow % split) : perRow;
      const rows = Math.ceil(segments / rowSegs);
      // Even rows: four bars that fit three to a row are two rows of two.
      const even = Math.ceil(segments / rows);
      if (even <= rowSegs && (split === 1 || even % split === 0)) rowSegs = even;
      const segWidth = usable / rowSegs;
      const ppt = segmentPpt(segWidth, segTicks, geo);
      const layout: OverviewLayout = {
        fretPx,
        geo,
        split,
        segTicks,
        segments,
        perRow: rowSegs,
        rows,
        segWidth,
        ppt,
        fits: rows * geo.height <= viewHeight,
      };
      if (layout.fits) return layout;
      if (fretPx === FRET_PX_MIN) fallback ??= layout;
      break;
    }
  }
  // Nothing fits the height (or the width is not known yet): the smallest
  // numbers, the sparsest split that has a segment on a row, and the panel scrolls.
  const geo = staffGeometry(FRET_PX_MIN);
  const usable = Math.max(1, viewWidth - geo.letters);
  let pick = fallback;
  if (!pick || pick.fretPx !== FRET_PX_MIN) {
    let split: number = SEGMENT_SPLITS[SEGMENT_SPLITS.length - 1];
    for (const s of SEGMENT_SPLITS) {
      const need = (model.barTicks / s / gapTicksOf(model)) * minGapPxFor(FRET_PX_MIN) + 2 * geo.inset;
      if (usable >= need) {
        split = s;
        break;
      }
    }
    const segTicks = model.barTicks / split;
    const segments = model.patternBars * split;
    const need = (segTicks / gapTicksOf(model)) * minGapPxFor(FRET_PX_MIN) + 2 * geo.inset;
    const perRow = Math.max(1, Math.min(segments, Math.floor(usable / need)));
    const segWidth = usable / perRow;
    pick = {
      fretPx: FRET_PX_MIN,
      geo,
      split,
      segTicks,
      segments,
      perRow,
      rows: Math.ceil(segments / perRow),
      segWidth,
      ppt: segmentPpt(segWidth, segTicks, geo),
      fits: false,
    };
  }
  return pick;
}

/**
 * The phone's follow view (acceptance 2, N-P1-2): a narrow panel cannot hold
 * "now" and "next" as two pages, because a bar of eighths split into beats
 * left four notes on screen, and at the end of a page the column stood at the
 * right edge with nothing ahead of it. Below this width the staff SCROLLS
 * instead: the column stands still about a quarter of the way in, the bars
 * move under it, and everything to its right is what is coming.
 */
export const SCROLL_BELOW = 600;
/** Where the column stands in a scrolling view, as a share of the window. */
export const SCROLL_AT = 0.25;

export type ScrollLayout = {
  fretPx: number;
  geo: StaffGeometry;
  /** A bar is one segment; each is `segWidth` wide, with no inset, so x is linear in ticks. */
  segTicks: number;
  segWidth: number;
  ppt: number;
  /** The window the bars move in, and the column's x in it. */
  windowWidth: number;
  cursorX: number;
};

/**
 * The scrolling layout: numbers as large as the width allows, neighbours at
 * least 1.45 numbers apart, as wide as reads comfortably (2.6 numbers) unless
 * that would push the rest of the bar out of sight; and the lines spread to
 * the panel's height, up to 1.9 numbers, so a tall phone panel is a
 * staff rather than a staff and an empty box.
 */
export function scrollLayout(
  model: Pick<PatternModel, "barTicks" | "minGap" | "beatTicks">,
  viewWidth: number,
  viewHeight: number,
): ScrollLayout {
  // Not the two-page view's size: nothing here has to fit two bars across,
  // so the numbers stay a size a phone on a stand reads (22 px at 390).
  const fretPx = Math.round(Math.min(28, Math.max(20, viewWidth * 0.075)));
  const base = staffGeometry(fretPx);
  // The height without the five gaps, and what the gaps may then take.
  const rest = base.height - 5 * base.gap;
  const room = viewHeight > 0 ? (viewHeight - 24 - rest) / 5 : base.gap;
  const lineGap = Math.max(base.gap, Math.min(Math.round(fretPx * 1.9), Math.floor(room)));
  const geo = { ...staffGeometry(fretPx, lineGap), inset: 0 };
  const windowWidth = Math.max(1, viewWidth - geo.letters);
  const cursorX = Math.round(windowWidth * SCROLL_AT);
  const gapTicks = gapTicksOf(model);
  const least = (fretPx * 1.45) / gapTicks;
  const comfortable = (fretPx * 2.6) / gapTicks;
  // A whole bar ahead of the column, when the notes allow it.
  const wholeBar = (windowWidth - cursorX) / model.barTicks;
  const ppt = Math.max(least, Math.min(comfortable, wholeBar));
  return { fretPx, geo, segTicks: model.barTicks, segWidth: model.barTicks * ppt, ppt, windowWidth, cursorX };
}

/** Which segment a tick falls in (the count-in is -1). */
export function segmentAt(segTicks: number, tick: number): number {
  return Math.floor(tick / segTicks);
}

/** What a segment is called: its bar from 1 (in the pattern), and its beats when it is part of one. */
export function segmentPlace(
  model: Pick<PatternModel, "barTicks" | "beatTicks" | "patternBars">,
  segment: number,
  segTicks: number,
): { bar: number; fromBeat: number; toBeat: number; whole: boolean } {
  const start = segment * segTicks;
  const bar = Math.floor(start / model.barTicks);
  const inBar = start - bar * model.barTicks;
  const fromBeat = Math.floor(inBar / model.beatTicks) + 1;
  const toBeat = Math.max(fromBeat, Math.ceil((inBar + segTicks) / model.beatTicks));
  return {
    bar: (((bar % model.patternBars) + model.patternBars) % model.patternBars) + 1,
    fromBeat,
    toBeat,
    whole: segTicks >= model.barTicks,
  };
}

/** The notes of segment `segment`, every pass that reaches into it, cut at the Take's end. */
export function segmentNotes(
  model: PatternModel,
  segment: number,
  segTicks: number,
  takeBars?: number,
): StripNote[] {
  if (segment < 0) return [];
  const from = segment * segTicks;
  const to = from + segTicks;
  const p0 = Math.max(0, passAt(model, from));
  const p1 = Math.max(p0, passAt(model, to - 1));
  return occurrences(model, p0, p1, takeBars).filter((n) => n.at >= from && n.at < to);
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
