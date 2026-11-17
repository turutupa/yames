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
import type { TakePlan } from "../../../session/take";
import { TICKS_PER_QUARTER } from "../../../songs/types";
import type { SongScore } from "../../../songs/types";

/** Bars shown ahead of the hit line, and behind it. */
export const BARS_AHEAD = 2;
export const BARS_BEHIND = 1;

/** The six lanes, string 1 (high e) on top, as in tab and on the straight-on neck. */
export const STRING_NAMES = ["e", "B", "G", "D", "A", "E"] as const;

export type PracticeView = "neck" | "runway";
export const PRACTICE_VIEWS: readonly PracticeView[] = ["neck", "runway"];
export const DEFAULT_PRACTICE_VIEW: PracticeView = "neck";

export function isPracticeView(v: unknown): v is PracticeView {
  return v === "neck" || v === "runway";
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
export function laneScale(model: Pick<RunwayModel, "barLength" | "minGap">, laneWidth: number) {
  const bars = BARS_AHEAD + BARS_BEHIND;
  if (!(laneWidth > 0)) return { ppt: 0, hitX: 0 };
  const fit = laneWidth / (bars * model.barLength);
  const legible = model.minGap > 0 ? MIN_NOTE_PX / model.minGap : 0;
  return { ppt: Math.max(fit, legible), hitX: laneWidth * (BARS_BEHIND / bars) };
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
