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
import { likelyCpuCompositing } from "../highway/Runway";
import {
  FOLLOW_SEGMENTS,
  currentOnset,
  describePattern,
  followLayout,
  noteXIn,
  occurrences,
  overviewLayout,
  patternModel,
  segmentAt,
  segmentNotes,
  segmentPlace,
  takeEnd,
} from "./tabStripModel";
import type { PatternModel, StaffGeometry, StripNote, TabResult, TabStripMode, TabStripNoteInput } from "./tabStripModel";
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
  className?: string;
};

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
  return (
    <svg className="tabstrip-letters" width={geo.letters} height={geo.height} aria-hidden="true">
      {Array.from({ length: 6 }, (_u, i) => (
        <line key={i} className="tabstrip-line" x1={geo.letters * 0.36} x2={geo.letters} y1={geo.top + i * geo.gap} y2={geo.top + i * geo.gap} />
      ))}
      {TAB.map((letter, i) => (
        <text
          key={letter}
          className="tabstrip-tab"
          x={geo.letters * 0.36}
          y={geo.top + geo.gap * (1.3 + i * 1.2)}
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fontSize: geo.fretPx * 0.82 }}
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
  const size = Math.max(10, Math.round(f * 0.66));
  const near = f * 0.8;
  const { link, after } = note;
  if (!link && !after) return null;
  // Between the two numbers, or just before this one when they are far apart
  // or the note it comes from is in another segment.
  const slur = !!link && inSegment && (link.mark === "h" || link.mark === "p") && nx - fromX <= f * 4.2;
  // Under its slur's middle; otherwise close to the note it leads into, so it
  // stays inside that note's column when the note is current.
  const letterX = !link ? 0 : slur ? (fromX + nx) / 2 : inSegment ? Math.max((fromX + nx) / 2, nx - near) : nx - near;
  // A number is about half as wide as it is tall per digit.
  const numHalf = (String(note.fret).length * f * 0.5) / 2;
  let ax = nx + numHalf + f * 0.12;
  const afterParts: React.ReactNode[] = [];
  if (after?.bendTo !== undefined) {
    // A bend: an arrow curving up off the number, and the fret it bends to.
    const w = Math.max(6, f * 0.34);
    const rise = Math.max(5, f * 0.36);
    const x0 = ax + f * 0.02;
    const tipX = x0 + w;
    const tipY = ly - rise;
    const head = Math.max(2.5, f * 0.11);
    afterParts.push(
      <g key="b" className="tabstrip-bend" data-mark="bend">
        <path
          className="tabstrip-vib"
          d={`M${x0.toFixed(1)},${(ly + rise * 0.35).toFixed(1)} Q${tipX.toFixed(1)},${(ly + rise * 0.35).toFixed(1)} ${tipX.toFixed(1)},${tipY.toFixed(1)} M${(tipX - head).toFixed(1)},${(tipY + head).toFixed(1)} L${tipX.toFixed(1)},${tipY.toFixed(1)} L${(tipX + head).toFixed(1)},${(tipY + head).toFixed(1)}`}
          style={{ strokeWidth: Math.max(1.4, f * 0.06) }}
        />
        <text className="tabstrip-tech" data-free="" x={tipX + f * 0.1} y={tipY + size * 0.02} dominantBaseline="central" style={{ fontSize: size }}>
          {after.bendTo}
        </text>
      </g>,
    );
    ax = tipX + f * 0.14 + size * String(after.bendTo).length * 0.48;
  }
  if (after?.slideOut) {
    afterParts.push(
      <text key="s" className="tabstrip-tech" data-mark="slide-out" x={ax + size * 0.1} y={ly} dominantBaseline="central" style={{ fontSize: size }}>
        {after.slideOut}
      </text>,
    );
    ax += size * 0.6;
  }
  if (after?.vibrato) {
    const w = Math.max(10, f * 0.62);
    const amp = Math.max(1.6, f * 0.07);
    const x0 = ax + size * 0.12;
    const steps = 4;
    let d = `M${x0.toFixed(1)},${ly.toFixed(1)}`;
    for (let i = 0; i < steps; i++) {
      const xa = x0 + ((i + 0.5) * w) / steps;
      const xb = x0 + ((i + 1) * w) / steps;
      d += ` Q${xa.toFixed(1)},${(ly + (i % 2 === 0 ? -amp * 2 : amp * 2)).toFixed(1)} ${xb.toFixed(1)},${ly.toFixed(1)}`;
    }
    afterParts.push(<path key="v" className="tabstrip-vib" data-mark="vibrato" d={d} style={{ strokeWidth: Math.max(1.4, f * 0.06) }} />);
  }
  return (
    <g className="tabstrip-techs" aria-hidden="true">
      {slur && (
        <path
          className="tabstrip-slur"
          d={`M${(fromX + f * 0.22).toFixed(1)},${(ly - f * 0.52).toFixed(1)} Q${((fromX + nx) / 2).toFixed(1)},${(ly - f * 0.92).toFixed(1)} ${(nx - f * 0.22).toFixed(1)},${(ly - f * 0.52).toFixed(1)}`}
          style={{ strokeWidth: Math.max(1.2, f * 0.05) }}
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
  const fl = useMemo(() => followLayout(model, size.width), [model, size.width]);
  const ov = useMemo(
    () => overviewLayout(model, size.width, size.height, maxFretPx),
    [model, size.width, size.height, maxFretPx],
  );
  const endTick = takeEnd(model, takeBars);

  const readPosition = useCallback(
    () => (typeof position === "function" ? position() : position),
    [position],
  );

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
  const shown = useRef({ onset: "", page: Number.NaN, countIn: false });
  const motion = useRef<CursorMotion | null>(null);

  /** Mark the note at `tick` current, put the column on it, and turn the page at a segment's end. */
  const placeAt = useCallback((tick: number) => {
    const { model: m, fl: l, takeBars: tb, page: shownPage, follow: f } = latest.current;
    if (!f || !(l.segWidth > 0)) return;
    const now = currentOnset(m, tick, graceOf(m), tb);
    const at = now ? now.at : Math.max(0, tick);
    const want = Math.max(0, segmentAt(l.segTicks, at));
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
      const x = noteXIn(now.at - want * l.segTicks, l.ppt, m, l.geo);
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
    placeAt(motion.current ? motion.current.floor : readPosition());
    if (!track || before === null || before === page || reduced || Math.abs(page - before) > 1) return;
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
    const slow = likelyCpuCompositing(navigator.userAgent);
    let frame = 0;
    let previous = 0;
    let frameMs = 0;
    let odd = false;
    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      if (previous > 0) {
        const delta = now - previous;
        frameMs = frameMs > 0 ? frameMs * 0.9 + delta * 0.1 : delta;
      }
      previous = now;
      odd = !odd;
      if (slow && odd) return;
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
    for (let s = Math.max(0, page - 1); s <= page + FOLLOW_SEGMENTS; s++) if (s <= lastSegment) out.push(s);
    return out;
  }, [follow, size.width, page, lastSegment]);

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
  if (size.width > 0 && follow) {
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
              const where = place(segmentPlace(model, s, fl.segTicks));
              return (
                <Segment
                  key={`${s}:${fl.segTicks}:${fl.fretPx}`}
                  model={model}
                  segment={s}
                  segTicks={fl.segTicks}
                  width={fl.segWidth}
                  ppt={fl.ppt}
                  geo={geo}
                  notes={segmentNotes(model, s, fl.segTicks, takeBars)}
                  rel={rel}
                  label={
                    rel === "now"
                      ? t("session.tabstrip.now", { where })
                      : rel === "next"
                        ? t("session.tabstrip.next", { where })
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
    const all = occurrences(model, 0, 0);
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
                const segNotes = all.filter((n) => n.at >= s * ov.segTicks && n.at < (s + 1) * ov.segTicks);
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
      role="img"
      aria-label={label}
      style={{ ...style, minHeight: follow && size.width > 0 ? fl.geo.height : undefined }}
    >
      <div className="tabstrip-view" ref={viewRef} aria-hidden="true">
        <div className="tabstrip-fill">{body}</div>
      </div>
    </div>
  );
}
