/**
 * The runway, as data: what goes where on the lanes, and what the neck shows
 * next. Pure, so the arithmetic is tested without a browser; `Runway.tsx` only
 * draws it and moves it.
 *
 * Time runs right to left into a fixed hit line. The lane shows one bar behind
 * the line (so a judged note's early/late dot stays in view for the rest of its
 * bar) and two bars ahead of it (what is coming).
 */
import type { NeckNote } from "../../../stage3d/api";
import { IS_MOBILE } from "../../../platform";
import type { TakePlan } from "../../../session/take";
import { TICKS_PER_QUARTER } from "../../../songs/types";
import type { SongScore } from "../../../songs/types";

/** Bars shown ahead of the hit line, and behind it. */
export const BARS_AHEAD = 2;
export const BARS_BEHIND = 1;

/** The six lanes, string 1 (high e) on top, as in tab and on the straight-on neck. */
export const STRING_NAMES = ["e", "B", "G", "D", "A", "E"] as const;

/**
 * What a practice screen shows: the neck, the runway or the tab, one picture at
 * a time. "tab" arrived 2026-11-17; a stored value from before it (or one this
 * build does not know) reads as the default, so an old store never breaks.
 */
export type PracticeView = "neck" | "runway" | "tab";
export const PRACTICE_VIEWS: readonly PracticeView[] = ["neck", "runway", "tab"];
/**
 * The neck on a desktop; the tab on a phone (PHONE-2), where the neck is a
 * strip a few pixels a fret and its markers sit on one another. Only the
 * default: a view the player picked is stored and wins on either.
 */
export const DEFAULT_PRACTICE_VIEW: PracticeView = IS_MOBILE ? "tab" : "neck";

export function isPracticeView(v: unknown): v is PracticeView {
  return v === "neck" || v === "runway" || v === "tab";
}

/** The view after `view`, round the three: what V does. */
export function nextPracticeView(view: PracticeView): PracticeView {
  const i = PRACTICE_VIEWS.indexOf(view);
  return PRACTICE_VIEWS[(i + 1) % PRACTICE_VIEWS.length];
}

/** One fret-number circle on a lane. Several share an onset in a chord. */
export type LaneNote = {
  /** The onset this note is judged with (`ScoreSchedule.onsets[].id`). */
  onsetId: number;
  /** The score note it draws. */
  noteId: number;
  tick: number;
  string: number;
  fret: number;
};

export type RunwayModel = {
  notes: LaneNote[];
  /** Onsets in time order: when each is due, and the places it asks for. */
  onsets: { id: number; tick: number; places: { string: number; fret: number }[] }[];
  /** Every bar line, in ticks. */
  barTicks: number[];
  /** The first bar's length: the unit the lane's window is measured in. */
  barLength: number;
  /** Where the count-in starts, so the lane can pre-roll through it. */
  countInTicks: number;
  /** The Take's last tick. */
  endTick: number;
  /** The tightest gap between two onsets, in ticks (0 with fewer than two). */
  minGap: number;
};

/**
 * The strings an Exercise plays on, high e first: the runway draws a lane for
 * these alone (the designer, 2026-11-17: six 100 px lanes with 22 px circles
 * on one of them read as empty). Every string when the model has no notes.
 */
export function usedStrings(model: Pick<RunwayModel, "notes">): number[] {
  const used = [...new Set(model.notes.map((n) => n.string))].filter((s) => s >= 1 && s <= 6).sort((a, b) => a - b);
  return used.length > 0 ? used : [1, 2, 3, 4, 5, 6];
}

/** The closest two circles may sit, centre to centre, before the lane zooms in. */
export const MIN_NOTE_PX = 32;

function perQuarter(score: SongScore): number {
  return score.ticksPerQuarter > 0 ? score.ticksPerQuarter : TICKS_PER_QUARTER;
}

/** The lane's notes and bar lines for a Take, built once per Take. */
export function runwayModel(take: TakePlan, countInBars = 1): RunwayModel {
  const { score, schedule } = take;
  const tpq = perQuarter(score);
  const first = score.bars[take.range.startBar] ?? score.bars[0];
  const start = first?.startTick ?? 0;
  const byId = new Map(score.notes.map((n) => [n.id, n]));
  const notes: LaneNote[] = [];
  const onsets: RunwayModel["onsets"] = [];
  for (const onset of schedule.onsets) {
    const tick = start + Math.round(onset.beat * tpq);
    const places: { string: number; fret: number }[] = [];
    for (const noteId of onset.noteIds) {
      const n = byId.get(noteId);
      if (!n || n.string < 1 || n.string > 6) continue;
      notes.push({ onsetId: onset.id, noteId, tick, string: n.string, fret: n.fret });
      places.push({ string: n.string, fret: n.fret });
    }
    onsets.push({ id: onset.id, tick, places });
  }
  onsets.sort((a, b) => a.tick - b.tick);
  let minGap = 0;
  for (let i = 1; i < onsets.length; i++) {
    const gap = onsets[i].tick - onsets[i - 1].tick;
    if (gap > 0 && (minGap === 0 || gap < minGap)) minGap = gap;
  }
  const bars = score.bars.slice(take.range.startBar, take.range.endBar + 1);
  const barTicks = bars.map((b) => b.startTick);
  const last = bars[bars.length - 1];
  const barLength = first?.lengthTicks || tpq * 4;
  return {
    notes,
    onsets,
    barTicks: last ? [...barTicks, last.startTick + last.lengthTicks] : barTicks,
    barLength,
    countInTicks: start - countInBars * barLength,
    endTick: last ? last.startTick + last.lengthTicks : start,
    minGap,
  };
}

/**
 * Pixels per tick and the hit line's x for a lane this wide.
 *
 * Three bars across (one behind the line, two ahead), unless that would put
 * the closest two notes nearer than `MIN_NOTE_PX`: then the lane zooms in and
 * shows less (a phone, or sixteenths), keeping the line a third of the way in.
 */
export function laneScale(model: Pick<RunwayModel, "barLength" | "minGap">, laneWidth: number, minPx = MIN_NOTE_PX) {
  const bars = BARS_AHEAD + BARS_BEHIND;
  if (!(laneWidth > 0)) return { ppt: 0, hitX: 0 };
  const fit = laneWidth / (bars * model.barLength);
  const legible = model.minGap > 0 ? Math.max(MIN_NOTE_PX, minPx) / model.minGap : 0;
  return { ppt: Math.max(fit, legible), hitX: laneWidth * (BARS_BEHIND / bars) };
}

/**
 * How big a note is drawn (acceptance P1-8): half its lane's height, so the
 * runway fills its room the way the neck and the tab do, but never wider than
 * the closest two notes leave room for, and never under `MIN_NOTE_PX`.
 */
export function noteSize(model: Pick<RunwayModel, "minGap">, ppt: number, laneHeight: number): number {
  const gap = model.minGap > 0 && ppt > 0 ? model.minGap * ppt * 0.88 : Number.POSITIVE_INFINITY;
  const want = Math.min(laneHeight * 0.5, gap, MAX_NOTE_PX);
  return Math.round(Math.max(MIN_NOTE_PX, want));
}

/** The largest a note is drawn. */
export const MAX_NOTE_PX = 64;

/**
 * How close the closest two notes may sit: wider than `MIN_NOTE_PX` when the
 * lanes are tall, so the notes can grow with them (fewer bars ahead on a
 * dense pattern, but each note large enough to read from the guitar).
 */
export function minGapPx(laneWidth: number, laneHeight: number): number {
  return Math.max(MIN_NOTE_PX, Math.min(laneWidth >= 600 ? 54 : 50, laneHeight * 0.3));
}

/** The strip's x offset that puts `tick` on the hit line. */
export function stripOffset(tick: number, scale: { ppt: number; hitX: number }): number {
  return scale.hitX - tick * scale.ppt;
}

/**
 * The index of the first onset still to come at `tick`.
 *
 * A note stops being "next" a little after it is due rather than exactly on
 * it: it is being played, and the player is still looking at it.
 */
export function nextOnsetIndex(onsets: RunwayModel["onsets"], tick: number, graceTicks = 0): number {
  let lo = 0;
  let hi = onsets.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (onsets[mid].tick + graceTicks <= tick) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The note the analyzer ruled on last, and the colour of its verdict. */
export type Judged = { places: readonly { string: number; fret: number }[]; kind: NeckNote["kind"] };

/**
 * The straight-on neck during a runway Take: the Exercise's shape quiet, the
 * next note amber, the note just judged in its verdict's colour, and the one
 * after next a cream ghost. Each place once; what is next wins, then the
 * verdict, then the ghost.
 *
 * The verdict is a colour rather than a pluck: a pluck sets the string
 * vibrating and keeps the stage drawing for as long as it rings, which for a
 * run of eighths is every frame of the Take. A colour change is one frame.
 */
export function ghostNeck(
  shape: readonly NeckNote[],
  onsets: RunwayModel["onsets"],
  index: number,
  judged: Judged | null = null,
): NeckNote[] {
  const kinds = new Map<string, NeckNote["kind"]>();
  const put = (places: readonly { string: number; fret: number }[], kind: NeckNote["kind"]) => {
    for (const p of places) {
      const key = `${p.string}:${p.fret}`;
      if (!kinds.has(key)) kinds.set(key, kind);
    }
  };
  if (onsets[index]) put(onsets[index].places, "aim");
  if (judged) put(judged.places, judged.kind);
  if (onsets[index + 1]) put(onsets[index + 1].places, "box");
  return shape.map((n) => ({ ...n, kind: kinds.get(`${n.string}:${n.fret}`) ?? "dim" }));
}

/** How far an early/late dot sits from its note, in px: ±`reach` at ±50 ms, clamped. */
export function dotOffset(deviationMs: number | null, reach = 16): number {
  if (deviationMs === null || !Number.isFinite(deviationMs)) return 0;
  const k = Math.max(-1, Math.min(1, deviationMs / 50));
  return Math.round(k * reach * 10) / 10;
}
