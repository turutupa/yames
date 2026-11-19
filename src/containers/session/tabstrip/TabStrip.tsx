/**
 * The Session's tab: a short pattern drawn big enough to read from the
 * guitar, in place of alphaTab's engraving (which stays for Songs). Drawn as
 * the approved mock draws it (`.preview/practice-review/designer/mock.html`,
 * `?view=tab`; the layout is `tabStripModel.ts`'s):
 *
 * - The high e is the top line and every number sits ON its line, the line
 *   broken around it by a halo in the panel's own colour (no dark boxes).
 * - `follow`, while it runs: two segments, "now · bar 2" and "next · bar 3"
 *   dimmed beside it. A rounded amber column goes from note to note across
 *   "now"; at the bar line the next segment slides into its place. A played
 *   note keeps its timing colour and a dot under it. A segment is a bar, or
 *   half or a quarter of one when the notes are dense, so neighbours are
 *   never closer than about twice a number's width.
 * - `preview`, before the start and while paused: the whole pattern, one
 *   pass, wrapped onto rows, every bar numbered, and where it was paused
 *   marked (`marker`).
 *
 * Cheap the way `highway/Runway.tsx` is: React draws a segment when it comes
 * into view (once a bar, or once a half bar); the column and the "current"
 * mark are written through refs from the frame loop, only when they change.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cursorTickAt, leadFromFrame, onReport } from "../../../songs/cursor";
import type { CursorMotion } from "../../../songs/cursor";
import type { SongScore } from "../../../songs/types";
import { TICKS_PER_QUARTER } from "../../../songs/types";
import { DisplayClock, dueAt, takeRate } from "../../../stage3d/takeRate";
import {
  FOLLOW_SEGMENTS,
  SCROLL_BELOW,
  currentOnset,
  describePattern,
  followLayout,
  noteXIn,
  occurrences,
  overviewLayout,
  patternModel,
  scrollLayout,
  segmentAt,
  segmentNotes,
  segmentPlace,
  takeEnd,
} from "./tabStripModel";
import type { PatternModel, StaffGeometry, StripNote, Strum, TabResult, TabStripMode, TabStripNoteInput } from "./tabStripModel";
import "./tabstrip.css";

export type { TabResult, TabStripMode, TabStripNoteInput } from "./tabStripModel";

declare global {
  interface Window {
    /** Frames the tab strip has moved on, for the layout suite. */
    __TABSTRIP_FRAMES__?: number;
  }
}

export type TabStripProps = {
  /** One pass of the pattern, ticks from its start: `take.exercise.notes` as they are. */
  notes: readonly TabStripNoteInput[];
  /** Ticks in a bar (`barLengthTicks(exercise.meter)`; 3840 in 4/4). */
  barTicks: number;
  /** Bars in one pass of the pattern (`exercise.bars`). */
  patternBars: number;
  /** Bars the Take runs (`take.bars`): the pattern repeats to fill them. Absent: it loops for good. */
  takeBars?: number;
  /** Ticks in a beat, for the counts. Default 960 (a quarter). */
  beatTicks?: number;
  /**
   * Where the music is, in ticks from the start of the Take (negative through
   * a count-in). A number is the engine's last report and is smoothed between
   * reports at `bpm`; a function is read once per animation frame and trusted.
   */
  position: number | (() => number);
  /** Smooths a numeric `position` between reports. Without it a number is drawn as given. */
  bpm?: number;
  /** The Take is running. Only then does the frame loop run. */
  playing: boolean;
  /** How each note went, by the Take's note id (`pass * notes.length + index`). */
  results?: ReadonlyMap<number, TabResult>;
  mode: TabStripMode;
  /** Preview only: where it was paused, in ticks from the start; its bar and note are marked. */
  marker?: number | null;
  /** Preview only: the numbers' largest size (a compact overview under the neck). */
  maxFretPx?: number;
  /**
   * Preview only: where every row does not fit the panel, ask for the height
   * they need rather than scrolling inside it. A phone's page scrolls, and a
   * panel of 200 px showed "bar 2" over no staff (acceptance pass 3 P2-6).
   */
  growToFit?: boolean;
  className?: string;
};

/** Does segment `segment` begin the pattern again (a pass after the first)? */
export function startsPass(model: Pick<PatternModel, "barTicks" | "patternBars">, segment: number, segTicks: number): boolean {
  const start = segment * segTicks;
  return segment > 0 && start % (model.barTicks * model.patternBars) === 0;
}

/** Ticks a note stays current after it is due: a thirty-second of a bar. */
const graceOf = (m: PatternModel) => m.barTicks / 32;

function useReducedMotion(): boolean {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? !!window.matchMedia(query)?.matches
      : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

const TAB = ["T", "A", "B"] as const;

/**
 * The amber column's width. A little narrower when the pattern has technique
 * marks between its numbers, so an "h" or a "/" beside the current note stays
 * outside the column rather than half in it.
 */
function columnWidth(model: PatternModel, ppt: number, fretPx: number): number {
  const slot = ppt * (model.minGap > 0 ? model.minGap : model.beatTicks);
  return model.notes.some((n) => n.link)
    ? Math.min(slot * 0.76, fretPx * 1.7)
    : Math.min(slot * 0.92, fretPx * 2);
}

/** The left column: the six lines' start and TAB, still while the segments move. */
function Letters({ geo }: { geo: StaffGeometry }) {
  const width = geo.letters;
  return (
    <svg className="tabstrip-letters" width={width} height={geo.height} aria-hidden="true">
      {Array.from({ length: 6 }, (_u, i) => (
        <line key={i} className="tabstrip-line" x1={geo.letters * 0.36} x2={width} y1={geo.top + i * geo.gap} y2={geo.top + i * geo.gap} />
      ))}
      {TAB.map((letter, i) => (
        <text
          key={letter}
          className="tabstrip-tab"
          x={geo.letters * 0.36}
          // In the three middle spaces, between lines, never on one: "B" sat
          // on the fifth line and met a note there (acceptance P2-5).
          y={geo.top + geo.gap * (1.5 + i)}
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fontSize: Math.min(geo.fretPx * 0.82, geo.gap * 0.66) }}
        >
          {letter}
        </text>
      ))}
    </svg>
  );
}

type SegmentProps = {
  model: PatternModel;
  segment: number;
  segTicks: number;
  width: number;
  ppt: number;
  geo: StaffGeometry;
  notes: StripNote[];
  rel: "now" | "next" | "past" | "later" | "plain" | "mark";
  label: string;
  /** Preview: the note marked as where it was paused, by tick from the segment's start. */
  markAt?: number | null;
  left: number;
};

/** One segment: its lines (broken around each number), its bar line, label, counts and numbers. */
const Segment = memo(function Segment({ model, segment, segTicks, width, ppt, geo, notes, rel, label, markAt, left }: SegmentProps) {
  const start = segment * segTicks;
  const x = (into: number) => Math.round(noteXIn(into, ppt, model, geo) * 10) / 10;
  const beats: number[] = [];
  for (let b = Math.ceil(start / model.beatTicks) * model.beatTicks; b < start + segTicks; b += model.beatTicks) beats.push(b);
  const barStart = start % model.barTicks === 0;
  const markX = markAt === null || markAt === undefined ? null : x(markAt);
  const colW = columnWidth(model, ppt, geo.fretPx);
  return (
    <svg
      className="tabstrip-seg"
      data-seg={segment}
      data-rel={rel}
      width={width}
      height={geo.height}
      style={{ left }}
      aria-hidden="true"
    >
      {markX !== null && (
        <rect
          className="tabstrip-mark"
          x={markX - colW / 2}
          y={geo.top - geo.fretPx}
          width={colW}
          height={geo.bottom - geo.top + geo.fretPx * 2}
          rx={geo.fretPx * 0.3}
        />
      )}
      {Array.from({ length: 6 }, (_u, i) => (
        <line key={i} className="tabstrip-line" x1={0} x2={width} y1={geo.top + i * geo.gap} y2={geo.top + i * geo.gap} />
      ))}
      {barStart && <line className="tabstrip-barline" x1={1.5} x2={1.5} y1={geo.top} y2={geo.bottom} />}
      {label && (
        <text className="tabstrip-label" x={barStart ? 10 : 4} y={geo.labelY} style={{ fontSize: Math.max(11, geo.fretPx * 0.47) }}>
          {label}
        </text>
      )}
      {beats.map((b) => (
        <text
          key={b}
          className="tabstrip-count"
          x={x(b - start)}
          y={geo.beatY}
          textAnchor="middle"
          style={{ fontSize: Math.max(10, geo.fretPx * 0.53) }}
        >
          {Math.floor((b % model.barTicks) / model.beatTicks) + 1}
        </text>
      ))}
      {strumsIn(model, notes).map(({ at, strum }) => (
        <StrumMark key={`s${at}`} strum={strum} x={x(at - start)} geo={geo} />
      ))}
      {notes.map((n) => {
        const nx = x(n.at - start);
        const ly = geo.top + (n.string - 1) * geo.gap;
        return (
          <g
            key={n.id}
            className="tabstrip-note"
            data-id={n.id}
            data-string={n.string}
            data-current={markAt !== null && markAt !== undefined && n.at - start === markAt ? "" : undefined}
          >
            <TechMarks note={n} nx={nx} ly={ly} fromX={n.link ? x(n.at - start - n.link.fromTicks) : 0} inSegment={!!n.link && n.at - start - n.link.fromTicks >= 0} geo={geo} />
            <circle className="tabstrip-dot" cx={nx} cy={ly + geo.fretPx * 0.8} r={Math.max(2.5, geo.fretPx * 0.12)} />
            <text x={nx} y={ly} textAnchor="middle" dominantBaseline="central">
              {n.fret}
            </text>
          </g>
        );
      })}
    </svg>
  );
});

/** The strums among a segment's notes: once each, where it is in the Take, and which way it goes. */
function strumsIn(model: PatternModel, notes: readonly StripNote[]): { at: number; strum: Strum }[] {
  if (model.strums.size === 0) return [];
  const out = new Map<number, Strum>();
  for (const n of notes) {
    const strum = model.strums.get(n.tick);
    if (strum && !out.has(n.at)) out.set(n.at, strum);
  }
  return [...out].map(([at, strum]) => ({ at, strum }));
}

/**
 * Which way a strum goes (card #74), the way guitar music has always written
 * it: a bracket open at the bottom for a downstroke, a V for an upstroke,
 * over the strum, above the staff. Not an arrow: on a tab the low E is the
 * bottom line, so an arrow for "down" would have to point up the page, and
 * nothing on these screens is an arrow. The Tab view's key says the two
 * words (`PracticeTab`).
 */
function StrumMark({ strum, x, geo }: { strum: Strum; x: number; geo: StaffGeometry }) {
  const f = geo.fretPx;
  const w = Math.max(7, f * 0.34);
  const h = Math.max(7, f * 0.36);
  // In the band between the bar's label and the high e's line.
  const bottom = geo.top - Math.max(9, f * 0.62);
  const top = bottom - h;
  const d =
    strum === "d"
      ? `M${x - w / 2} ${bottom} V${top} H${x + w / 2} V${bottom}`
      : `M${x - w / 2} ${top} L${x} ${bottom} L${x + w / 2} ${top}`;
  return <path className="tabstrip-strum" data-strum={strum} d={d} style={{ strokeWidth: Math.max(1.6, f * 0.075) }} />;
}

/**
 * The same two marks at a fixed size, for a key and for the views without a
 * staff to hang them on (the Runway's chord columns, the neck's foot; card
 * #78). Stroked in `currentColor`, so each place gives it its own ink.
 */
export function StrumGlyph({ strum, className }: { strum: Strum; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" data-strum={strum}>
      <path d={strum === "d" ? "M1.5 9 V1.5 H8.5 V9" : "M1.5 1.5 L5 9 L8.5 1.5"} />
    </svg>
  );
}

/**
 * A note's technique marks, the standard tab way (card #40): "h", "p" and
 * "t" between the two numbers on their string, with a slur over a hammer or a
 * pull; "/" and "\\" for a slide; an arrow up after a bend, to the fret it bends
 * to; "~" after a note held with vibrato. Each letter sits on the line with a
 * halo, like the numbers, at a size that reads beside 34 px numbers.
 */
function TechMarks({
  note,
  nx,
  ly,
  fromX,
  inSegment,
  geo,
}: {
  note: StripNote;
  nx: number;
  ly: number;
  fromX: number;
  inSegment: boolean;
  geo: StaffGeometry;
}) {
  const f = geo.fretPx;
  // Read from a music stand, 1–2 m off (owner, mvp-final): a letter's
  // x-height about half the number's, and every stroke one weight, heavy
  // enough to hold up beside a 700-weight 34 px number.
  const size = Math.max(12, Math.round(f * 0.8));
  const stroke = Math.max(2, f * 0.085);
  const near = f * 0.8;
  const { link, after } = note;
  if (!link && !after) return null;
  // Between the two numbers, or just before this one when they are far apart
  // or the note it comes from is in another segment.
  const slur = !!link && inSegment && (link.mark === "h" || link.mark === "p") && nx - fromX <= f * 4.2;
  // Under its slur's middle; otherwise close to the note it leads into, so it
  // stays inside that note's column when the note is current.
  // A number is about half as wide as it is tall per digit (and the current
  // one is drawn 40/34 larger).
  const numHalf = (String(note.fret).length * f * 0.5 * (40 / 34)) / 2;
  // Never closer to its number than the number's own edge and half a letter:
  // a two-digit "12" after a "t" read as "t12".
  const clear = Math.max(near, numHalf + size * 0.42);
  const letterX = !link ? 0 : slur ? (fromX + nx) / 2 : inSegment ? Math.max((fromX + nx) / 2, nx - clear) : nx - clear;
  let ax = nx + numHalf + f * 0.1;
  const afterParts: React.ReactNode[] = [];
  if (after?.bendTo !== undefined) {
    // A bend: an arrow curving up off the number, and the fret it bends to
    // at its tip, the size of a letter.
    const w = Math.max(8, f * 0.42);
    const rise = Math.max(9, f * 0.78);
    const x0 = ax;
    const tipX = x0 + w;
    const tipY = ly - rise;
    const head = Math.max(4, f * 0.17);
    const targetSize = Math.max(12, Math.round(f * 0.8));
    afterParts.push(
      <g key="b" className="tabstrip-bend" data-mark="bend">
        <path
          className="tabstrip-vib"
          d={`M${x0.toFixed(1)},${(ly + f * 0.12).toFixed(1)} Q${tipX.toFixed(1)},${(ly + f * 0.12).toFixed(1)} ${tipX.toFixed(1)},${tipY.toFixed(1)} M${(tipX - head).toFixed(1)},${(tipY + head * 1.1).toFixed(1)} L${tipX.toFixed(1)},${tipY.toFixed(1)} L${(tipX + head).toFixed(1)},${(tipY + head * 1.1).toFixed(1)}`}
          style={{ strokeWidth: stroke }}
        />
        <text className="tabstrip-tech" data-free="" x={tipX + f * 0.14} y={tipY + targetSize * 0.08} dominantBaseline="central" style={{ fontSize: targetSize }}>
          {after.bendTo}
        </text>
      </g>,
    );
    ax = tipX + f * 0.2 + targetSize * String(after.bendTo).length * 0.5;
  }
  if (after?.slideOut) {
    afterParts.push(
      <text key="s" className="tabstrip-tech" data-mark="slide-out" x={ax + size * 0.08} y={ly} dominantBaseline="central" style={{ fontSize: size }}>
        {after.slideOut}
      </text>,
    );
    ax += size * 0.6;
  }
  if (after?.vibrato) {
    // Three full waves, as wide as a number and a half, deep enough to read
    // as a wave rather than a wobble in the line.
    const w = Math.max(18, f * 1.05);
    const amp = Math.max(3, f * 0.13);
    const x0 = ax + f * 0.12;
    const steps = 6;
    let d = `M${x0.toFixed(1)},${ly.toFixed(1)}`;
    for (let i = 0; i < steps; i++) {
      const xa = x0 + ((i + 0.5) * w) / steps;
      const xb = x0 + ((i + 1) * w) / steps;
      d += ` Q${xa.toFixed(1)},${(ly + (i % 2 === 0 ? -amp * 2 : amp * 2)).toFixed(1)} ${xb.toFixed(1)},${ly.toFixed(1)}`;
    }
    afterParts.push(<path key="v" className="tabstrip-vib" data-mark="vibrato" d={d} style={{ strokeWidth: stroke }} />);
  }
  return (
    <g className="tabstrip-techs" aria-hidden="true">
      {slur && (
        <path
          className="tabstrip-slur"
          d={`M${(fromX + f * 0.2).toFixed(1)},${(ly - f * 0.58).toFixed(1)} Q${((fromX + nx) / 2).toFixed(1)},${(ly - f * 1.12).toFixed(1)} ${(nx - f * 0.2).toFixed(1)},${(ly - f * 0.58).toFixed(1)}`}
          style={{ strokeWidth: stroke }}
        />
      )}
      {link && (
        <text className="tabstrip-tech" data-mark={link.mark === "\\" ? "slide-down" : link.mark === "/" ? "slide-up" : link.mark} x={letterX} y={ly} textAnchor="middle" dominantBaseline="central" style={{ fontSize: size }}>
          {link.mark}
        </text>
      )}
      {afterParts}
    </g>
  );
}

export function TabStrip({
  notes,
  barTicks,
  patternBars,
  takeBars,
  beatTicks,
  position,
  bpm,
  playing,
  results,
  mode,
  marker = null,
  maxFretPx,
  growToFit = false,
  className,
}: TabStripProps) {
  const { t } = useTranslation();
  const model = useMemo(
    () => patternModel(notes, barTicks, patternBars, beatTicks),
    [notes, barTicks, patternBars, beatTicks],
  );
  const reduced = useReducedMotion();
  const viewRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const colRef = useRef<HTMLElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const measure = () => {
      const r = view.getBoundingClientRect();
      setSize((s) => {
        const width = Math.round(r.width);
        const height = Math.round(r.height);
        return s.width === width && s.height === height ? s : { width, height };
      });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(view);
    return () => ro.disconnect();
  }, []);

  const follow = mode === "follow";
  const scroll = follow && size.width > 0 && size.width < SCROLL_BELOW;
  const fl = useMemo(() => {
    if (!scroll) return { ...followLayout(model, size.width, size.height), scroll: false as const, cursorX: 0, windowWidth: 0 };
    const sl = scrollLayout(model, size.width, size.height);
    return { ...sl, split: 1, fits: true, scroll: true as const };
  }, [model, size.width, size.height, scroll]);
  const ov = useMemo(
    () => overviewLayout(model, size.width, size.height, maxFretPx),
    [model, size.width, size.height, maxFretPx],
  );
  const endTick = takeEnd(model, takeBars);

  const readPosition = useCallback(
    () => (typeof position === "function" ? position() : position),
    [position],
  );

  /**
   * Where a segment is, in as many words as its width has room for: "bar 2,
   * beats 3–4", then "bar 2", then "2". A phone's segment clipped "next ·
   * bar 2, be…" (acceptance P2-6). `room` is the segment's width in px and
   * `px` the label's font size; the words are measured at about 0.56 em a
   * character, with the "now · " or "next · " they are put in.
   */
  const fitPlace = (
    where: { bar: number; fromBeat: number; toBeat: number; whole: boolean },
    room: number,
    px: number,
    rel: "now" | "next" | "other",
    again = false,
  ) => {
    const wrap = (w: string) => (rel === "now" ? t("session.tabstrip.now", { where: w }) : rel === "next" ? t("session.tabstrip.next", { where: w }) : w);
    const fits = (text: string) => text.length * px * 0.56 <= room - 14;
    const first = again ? t("session.tabstrip.barAgain", { n: where.bar }) : place(where);
    for (const w of [first, t("session.tabstrip.bar", { n: where.bar }), String(where.bar)]) {
      if (fits(wrap(w))) return wrap(w);
    }
    return wrap(String(where.bar));
  };

  const place = (where: { bar: number; fromBeat: number; toBeat: number; whole: boolean }) =>
    where.whole
      ? t("session.tabstrip.bar", { n: where.bar })
      : where.fromBeat === where.toBeat
        ? t("session.tabstrip.barBeat", { n: where.bar, beat: where.fromBeat })
        : t("session.tabstrip.barBeats", { n: where.bar, from: where.fromBeat, to: where.toBeat });

  // --- follow: which segment is "now" -------------------------------------
  const [page, setPage] = useState(0);
  const latest = useRef({ model, fl, takeBars, page, follow, reduced });
  latest.current = { model, fl, takeBars, page, follow, reduced };
  const shown = useRef({ onset: "", page: Number.NaN, countIn: false, dx: Number.NaN });
  const motion = useRef<CursorMotion | null>(null);

  /** Mark the note at `tick` current, put the column on it, and turn the page at a segment's end. */
  const placeAt = useCallback((tick: number) => {
    const { model: m, fl: l, takeBars: tb, page: shownPage, follow: f } = latest.current;
    if (!f || !(l.segWidth > 0)) return;
    const now = currentOnset(m, tick, graceOf(m), tb);
    const at = now ? now.at : Math.max(0, tick);
    const want = Math.max(0, segmentAt(l.segTicks, at));
    if (l.scroll) {
      // The bars move under a column that stands still: the tick under it is
      // the music's own, held at the first note through the count-in and at
      // the current note when motion is reduced.
      const end = takeEnd(m, tb);
      const under = latest.current.reduced && now ? now.at : Math.min(Math.max(0, tick), Number.isFinite(end) ? end : Number.POSITIVE_INFINITY);
      const dx = l.cursorX - noteXIn(under, l.ppt, m, l.geo);
      const track = trackRef.current;
      if (track && !(Math.abs(dx - shown.current.dx) <= 0.05)) {
        shown.current.dx = dx;
        track.style.transform = `translate3d(${dx.toFixed(1)}px,0,0)`;
      }
    }
    if (want !== shownPage) {
      setPage(want);
      return;
    }
    const countIn = tick < 0;
    if (countIn !== shown.current.countIn) {
      shown.current.countIn = countIn;
      if (colRef.current) colRef.current.toggleAttribute("data-countin", countIn);
    }
    const key = now ? `${now.pass}:${now.index}:${want}` : "";
    if (key === shown.current.onset) return;
    shown.current.onset = key;
    const track = trackRef.current;
    if (!track) return;
    track.querySelectorAll(".tabstrip-note[data-current]").forEach((el) => el.removeAttribute("data-current"));
    const col = colRef.current;
    if (!now) {
      if (col) col.style.visibility = "hidden";
      return;
    }
    const k = m.notes.length;
    const onsetTick = m.onsets[now.index];
    for (const n of m.notes) {
      if (n.tick !== onsetTick) continue;
      track.querySelector(`.tabstrip-note[data-id="${now.pass * k + n.index}"]`)?.setAttribute("data-current", "");
    }
    if (col) {
      const x = l.scroll ? l.cursorX : noteXIn(now.at - want * l.segTicks, l.ppt, m, l.geo);
      col.style.visibility = "visible";
      col.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
    }
  }, []);

  // A new page: slide the track from where the last one stood (one segment over).
  const lastPage = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (!follow) return;
    const track = trackRef.current;
    const before = lastPage.current;
    lastPage.current = page;
    shown.current.onset = "";
    shown.current.dx = Number.NaN;
    placeAt(motion.current ? motion.current.floor : readPosition());
    if (fl.scroll || !track || before === null || before === page || reduced || Math.abs(page - before) > 1) return;
    const dx = (page - before) * fl.segWidth;
    track.style.transition = "none";
    track.style.transform = `translate3d(${dx.toFixed(1)}px,0,0)`;
    void track.getBoundingClientRect();
    track.style.transition = "";
    track.style.transform = "translate3d(0,0,0)";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, follow, fl]);

  // The results: a colour per note, written when they change or a segment is drawn.
  useLayoutEffect(() => {
    trackRef.current?.querySelectorAll<SVGGElement>(".tabstrip-note").forEach((el) => {
      const r = follow ? results?.get(Number(el.dataset.id)) : undefined;
      if (r) {
        if (el.dataset.result !== r) el.dataset.result = r;
      } else if (el.dataset.result) delete el.dataset.result;
    });
  });

  // Smoothing a numeric position between the engine's reports (`songs/cursor.ts`).
  const clock = useMemo<SongScore | null>(
    () =>
      bpm && bpm > 0
        ? ({ ticksPerQuarter: TICKS_PER_QUARTER, tempoMap: [{ tick: 0, bpm }] } as unknown as SongScore)
        : null,
    [bpm],
  );
  const reported = typeof position === "number" ? position : null;
  useEffect(() => {
    if (reported === null) return;
    if (!playing || !clock) {
      motion.current = null;
      placeAt(reported);
      return;
    }
    motion.current = onReport(clock, motion.current, { tick: reported, pass: 0, atMs: performance.now() }, 100);
  }, [reported, playing, clock, placeAt]);

  // Not playing, with a function: read it once whenever anything changes.
  useEffect(() => {
    if (!playing && typeof position === "function") placeAt(position());
  }, [playing, position, placeAt, fl]);

  // The frame loop: only in follow mode, only while it runs.
  useEffect(() => {
    if (!playing || !follow) return;
    // At the Take's rate (`stage3d/takeRate.ts`), as the runway: the display's
    // where the machine holds it, 30 where it does not.
    const display = new DisplayClock();
    let frame = 0;
    let previous = 0;
    let frameMs = 0;
    let drawn = -Infinity;
    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      if (previous > 0) {
        const delta = now - previous;
        frameMs = frameMs > 0 ? frameMs * 0.9 + delta * 0.1 : delta;
        display.sample(delta);
        if (delta < 250) takeRate.sample(delta, display.ms);
      }
      previous = now;
      if (!dueAt(now, drawn, takeRate.laneFps, display.ms)) return;
      drawn = now;
      let tick: number;
      if (typeof position === "function") tick = position();
      else if (clock && motion.current) {
        const next = cursorTickAt(clock, motion.current, now, {
          percent: 100,
          endTick: Number.isFinite(endTick) ? endTick : Number.MAX_SAFE_INTEGER,
          leadMs: leadFromFrame(frameMs) / 2,
        });
        motion.current = next.motion;
        tick = next.tick;
      } else return;
      placeAt(tick);
      window.__TABSTRIP_FRAMES__ = (window.__TABSTRIP_FRAMES__ ?? 0) + 1;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing, follow, position, clock, endTick, placeAt]);

  // --- what is drawn -------------------------------------------------------
  const lastSegment = Number.isFinite(endTick) ? Math.ceil(endTick / fl.segTicks) - 1 : Number.POSITIVE_INFINITY;
  const followSegments = useMemo(() => {
    if (!follow || !(size.width > 0)) return [];
    const out: number[] = [];
    // Scrolling: the bar behind, the one being played, and as many ahead as
    // the window can show.
    const ahead = fl.scroll ? Math.ceil(fl.windowWidth / Math.max(1, fl.segWidth)) + 1 : FOLLOW_SEGMENTS;
    for (let s = Math.max(0, page - 1); s <= page + ahead; s++) if (s <= lastSegment) out.push(s);
    return out;
  }, [follow, size.width, page, lastSegment, fl]);

  // Each segment's notes, made once. `Segment` is memoised on them: a fresh
  // array per render redrew every bar on screen at every beat of a Take
  // (thirty `TechMarks` nine times a second, measured 2026-11-19).
  const followNotes = useMemo(() => {
    const cache = new Map<number, StripNote[]>();
    return (s: number): StripNote[] => {
      let list = cache.get(s);
      if (!list) {
        list = segmentNotes(model, s, fl.segTicks, takeBars);
        cache.set(s, list);
      }
      return list;
    };
  }, [model, fl.segTicks, takeBars]);
  const overviewNotes = useMemo(() => {
    const all = occurrences(model, 0, 0);
    const cache = new Map<number, StripNote[]>();
    return (s: number): StripNote[] => {
      let list = cache.get(s);
      if (!list) {
        list = all.filter((n) => n.at >= s * ov.segTicks && n.at < (s + 1) * ov.segTicks);
        cache.set(s, list);
      }
      return list;
    };
  }, [model, ov.segTicks]);

  const markTick = marker === null || marker === undefined || marker < 0 ? null : marker % model.passTicks;
  const markOnset = useMemo(() => {
    if (markTick === null) return null;
    const now = currentOnset(model, markTick, graceOf(model));
    return now ? now.at % model.passTicks : null;
  }, [model, markTick]);

  const label = t("session.tabstrip.label", { notes: describePattern(model) });
  const style = {
    "--ts-fret": `${follow ? fl.fretPx : ov.fretPx}px`,
  } as React.CSSProperties;

  let body: React.ReactNode = null;
  if (size.width > 0 && follow && fl.scroll) {
    // The phone: the bars move under a column that stands still. "now · bar
    // 2" stays at the window's left edge; every bar ahead is named at its own
    // bar line, so a header and the counts under it always agree.
    const geo = fl.geo;
    const labelPx = Math.max(11, geo.fretPx * 0.5);
    const nowSpot = segmentPlace(model, page, fl.segTicks);
    const fitsLeft = (text: string) => text.length * labelPx * 0.56 <= fl.cursorX + 8;
    const nowWords = [t("session.tabstrip.now", { where: t("session.tabstrip.bar", { n: nowSpot.bar }) }), t("session.tabstrip.bar", { n: nowSpot.bar })];
    const nowLabel = nowWords.find(fitsLeft) ?? String(nowSpot.bar);
    const endX = Number.isFinite(lastSegment) ? (lastSegment + 1) * fl.segWidth : null;
    body = (
      <div className="tabstrip-staff" style={{ height: geo.height }}>
        <Letters geo={geo} />
        {/* The scrolling view's strings run on under the window, outside its
            faded edges, so the fade takes the numbers and never the lines. */}
        <div className="tabstrip-lines" style={{ left: geo.letters, width: fl.windowWidth }} aria-hidden="true">
          {Array.from({ length: 6 }, (_u, i) => (
            <i key={i} style={{ top: geo.top + i * geo.gap }} />
          ))}
        </div>
        <div className="tabstrip-window" data-scroll="" style={{ left: geo.letters, width: fl.windowWidth, height: geo.height }}>
          <i
            className="tabstrip-cursor"
            ref={colRef}
            style={{
              top: geo.top - geo.fretPx,
              height: geo.bottom - geo.top + geo.fretPx * 2,
              width: columnWidth(model, fl.ppt, geo.fretPx),
            }}
          />
          <div className="tabstrip-track" ref={trackRef} data-testid="tabstrip-strip">
            {followSegments.map((s) => {
              const rel = s === page ? "now" : s === page + 1 ? "next" : s < page ? "past" : "later";
              return (
                <Segment
                  key={`${s}:${fl.segTicks}:${fl.fretPx}:${geo.gap}`}
                  model={model}
                  segment={s}
                  segTicks={fl.segTicks}
                  width={fl.segWidth}
                  ppt={fl.ppt}
                  geo={geo}
                  notes={followNotes(s)}
                  rel={rel}
                  // The pattern starting over reads "bar 1 again", not a bar 1
                  // after bar 2 (acceptance 4, P2-11).
                  label={
                    s > page
                      ? t(startsPass(model, s, fl.segTicks) ? "session.tabstrip.barAgain" : "session.tabstrip.bar", {
                          n: segmentPlace(model, s, fl.segTicks).bar,
                        })
                      : ""
                  }
                  left={s * fl.segWidth}
                />
              );
            })}
            {endX !== null && (
              <i className="tabstrip-endline" style={{ left: endX, right: "auto", top: geo.top, height: geo.bottom - geo.top }} />
            )}
          </div>
          <span className="tabstrip-nowlabel" style={{ top: geo.labelY, fontSize: labelPx }}>
            {nowLabel}
          </span>
        </div>
      </div>
    );
  } else if (size.width > 0 && follow) {
    const geo = fl.geo;
    const nextEndsBar = ((page + FOLLOW_SEGMENTS) * fl.segTicks) % model.barTicks === 0;
    body = (
      <div className="tabstrip-staff" style={{ height: geo.height }}>
        <Letters geo={geo} />
        <div className="tabstrip-window" style={{ left: geo.letters, width: fl.segWidth * FOLLOW_SEGMENTS, height: geo.height }}>
          <div className="tabstrip-track" ref={trackRef} data-testid="tabstrip-strip">
            <i
              className="tabstrip-cursor"
              ref={colRef}
              style={{
                top: geo.top - geo.fretPx,
                height: geo.bottom - geo.top + geo.fretPx * 2,
                width: columnWidth(model, fl.ppt, geo.fretPx),
              }}
            />
            {followSegments.map((s) => {
              const rel = s === page ? "now" : s === page + 1 ? "next" : s < page ? "past" : "later";
              const spot = segmentPlace(model, s, fl.segTicks);
              const where = place(spot);
              const labelPx = Math.max(11, geo.fretPx * 0.47);
              return (
                <Segment
                  key={`${s}:${fl.segTicks}:${fl.fretPx}`}
                  model={model}
                  segment={s}
                  segTicks={fl.segTicks}
                  width={fl.segWidth}
                  ppt={fl.ppt}
                  geo={geo}
                  notes={followNotes(s)}
                  rel={rel}
                  label={
                    rel === "now" || rel === "next"
                      ? fitPlace(spot, fl.segWidth, labelPx, rel, rel === "next" && startsPass(model, s, fl.segTicks))
                      : where
                  }
                  left={(s - page) * fl.segWidth}
                />
              );
            })}
          </div>
          {nextEndsBar && (
            <i className="tabstrip-endline" style={{ top: geo.top, height: geo.bottom - geo.top }} />
          )}
        </div>
      </div>
    );
  } else if (size.width > 0) {
    const geo = ov.geo;
    const rows: number[][] = [];
    for (let s = 0; s < ov.segments; s++) {
      const r = Math.floor(s / ov.perRow);
      (rows[r] ??= []).push(s);
    }
    const markSeg = markOnset === null ? null : segmentAt(ov.segTicks, markOnset);
    body = (
      <div className="tabstrip-rows" data-fits={ov.fits ? "" : undefined}>
        {rows.map((row, r) => (
          <div className="tabstrip-staff" key={r} style={{ height: geo.height }}>
            <Letters geo={geo} />
            <div className="tabstrip-window" style={{ left: geo.letters, width: ov.segWidth * ov.perRow, height: geo.height }}>
              {row.map((s, i) => {
                const where = segmentPlace(model, s, ov.segTicks);
                const startsBar = (s * ov.segTicks) % model.barTicks === 0;
                const segNotes = overviewNotes(s);
                const marked = markSeg === s;
                return (
                  <Segment
                    key={s}
                    model={model}
                    segment={s}
                    segTicks={ov.segTicks}
                    width={ov.segWidth}
                    ppt={ov.ppt}
                    geo={geo}
                    notes={segNotes}
                    rel={marked ? "mark" : "plain"}
                    label={
                      marked
                        ? t("session.tabstrip.pausedHere", { where: place(where) })
                        : startsBar
                          ? t("session.tabstrip.bar", { n: where.bar })
                          : ""
                    }
                    markAt={marked && markOnset !== null ? markOnset - s * ov.segTicks : null}
                    left={i * ov.segWidth}
                  />
                );
              })}
              {((row[row.length - 1] + 1) * ov.segTicks) % model.barTicks === 0 && (
                <i className="tabstrip-endline" style={{ top: geo.top, height: geo.bottom - geo.top }} />
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={`tabstrip${className ? ` ${className}` : ""}`}
      data-testid="tabstrip"
      data-mode={mode}
      data-moving={playing && follow ? "" : undefined}
      data-reduced={reduced ? "" : undefined}
      data-split={follow ? fl.split : ov.split}
      data-scroll={scroll ? "" : undefined}
      role="img"
      aria-label={label}
      style={{
        ...style,
        minHeight:
          size.width > 0
            ? follow
              ? fl.geo.height
              : growToFit
                ? // Whether or not it fits as it is: a height that comes and
                  // goes with the fit would grow and shrink the panel in turn.
                  ov.rows * ov.geo.height
                : undefined
            : undefined,
      }}
    >
      <div className="tabstrip-view" ref={viewRef} aria-hidden="true">
        <div className="tabstrip-fill">{body}</div>
      </div>
      {/* What the two marks over the strums mean: said once, in words. */}
      {model.strums.size > 0 && (
        <div className="tabstrip-strumkey" data-testid="tabstrip-strumkey">
          {[...new Set(model.strums.values())].sort().map((strum) => (
            <span key={strum} data-strum={strum}>
              <StrumGlyph strum={strum} />
              {t(strum === "d" ? "session.tabstrip.strumDown" : "session.tabstrip.strumUp")}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
