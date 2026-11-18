/**
 * The Session's tab: a short pattern drawn big enough to read from the
 * guitar, in place of alphaTab's engraving (which stays for Songs).
 *
 * Two modes:
 *
 * - `preview`, before a Take: one pass of the pattern across the width, the
 *   notes numbered in the order they are played.
 * - `follow`, during one: a single line holding the bar being played and the
 *   next, scrolling under a fixed amber column 30 % in. The next bar is
 *   dimmed, a played note keeps its timing colour, the note under the column
 *   is drawn larger. The pattern repeats for as long as the Take runs.
 *
 * Cheap the way `highway/Runway.tsx` is: the notes are DOM built when the
 * pattern, the width or the pass window changes; each frame writes ONE
 * `transform` through a ref. Which bar is "now" and which note is current are
 * data attributes written when they change, not React state. The only render
 * while playing is when the strip needs the next pass of the pattern drawn.
 */
import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cursorTickAt, leadFromFrame, onReport } from "../../../songs/cursor";
import type { CursorMotion } from "../../../songs/cursor";
import type { SongScore } from "../../../songs/types";
import { TICKS_PER_QUARTER } from "../../../songs/types";
import { likelyCpuCompositing } from "../highway/Runway";
import {
  CURRENT_SCALE,
  STRING_NAMES,
  barAt,
  barLinePad,
  barRel,
  beamsFor,
  currentOnset,
  describePattern,
  followScale,
  occurrences,
  passWindow,
  patternModel,
  previewScale,
  stripOffset,
  takeEnd,
} from "./tabStripModel";
import type { PatternModel, StripNote, TabResult, TabStripMode, TabStripNoteInput } from "./tabStripModel";
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
  /** Ticks in a beat, for the counts and the rhythm hint. Default 960 (a quarter). */
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
  /** A small row of stems and beams under the staff. Off by default. */
  rhythm?: boolean;
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

type Geometry = { ppt: number; pad: number; showOrder: boolean };

/** Bar lines, labels, beat counts, notes: drawn once per pattern, width and pass window. */
const Strip = memo(function Strip({
  model,
  notes,
  bars,
  geo,
  rhythm,
  barWord,
}: {
  model: PatternModel;
  notes: StripNote[];
  bars: number[];
  geo: Geometry;
  rhythm: boolean;
  barWord: (n: number) => string;
}) {
  const x = (tick: number) => Math.round(tick * geo.ppt * 10) / 10;
  const byBar = new Map<number, StripNote[]>();
  for (const n of notes) byBar.set(n.bar, [...(byBar.get(n.bar) ?? []), n]);
  const beatsInBar = Math.max(1, Math.round(model.barTicks / model.beatTicks));
  return (
    <>
      {bars.map((bar) => {
        const start = bar * model.barTicks;
        const inBar = byBar.get(bar) ?? [];
        // Onsets of this bar, for the rhythm hint's stems and beams.
        const onsets: { at: number; dur: number }[] = [];
        for (const n of inBar) if (onsets[onsets.length - 1]?.at !== n.at) onsets.push({ at: n.at, dur: n.dur });
        const patternBar = (((bar % model.patternBars) + model.patternBars) % model.patternBars) + 1;
        return (
          <div key={bar} className="tabstrip-bar" data-bar={bar}>
            <i className="tabstrip-barline" style={{ left: x(start) - geo.pad }} />
            {bar === bars[bars.length - 1] && (
              <i className="tabstrip-barline" style={{ left: x(start + model.barTicks) - geo.pad }} />
            )}
            <span className="tabstrip-barlabel" style={{ left: x(start) - geo.pad + 8 }}>
              {barWord(patternBar)}
            </span>
            {Array.from({ length: beatsInBar }, (_u, b) => (
              <span key={`c${b}`} className="tabstrip-count" style={{ left: x(start + b * model.beatTicks) }}>
                {b + 1}
              </span>
            ))}
            {inBar.map((n) => (
              <span
                key={n.id}
                className="tabstrip-note"
                data-id={n.id}
                data-string={n.string}
                data-wide={n.fret >= 10 ? "" : undefined}
                style={{ left: x(n.at) }}
              >
                <b>{n.fret}</b>
                {geo.showOrder && (
                  <sup className="tabstrip-order" aria-hidden="true">
                    {n.order}
                  </sup>
                )}
              </span>
            ))}
            {rhythm &&
              onsets.map((o, i) => {
                const beams = beamsFor(o.dur, model.beatTicks);
                const next = onsets[i + 1];
                const sameBeat =
                  next && Math.floor(next.at / model.beatTicks) === Math.floor(o.at / model.beatTicks);
                const width = sameBeat && beams > 0 ? x(next.at) - x(o.at) : beams > 0 ? 8 : 0;
                return (
                  <Fragment key={`r${o.at}`}>
                    <i className="tabstrip-stem" style={{ left: x(o.at) }} />
                    {Array.from({ length: beams }, (_u, k) => (
                      <i
                        key={k}
                        className="tabstrip-beam"
                        style={{ left: x(o.at), width, marginTop: -k * 4 }}
                      />
                    ))}
                  </Fragment>
                );
              })}
          </div>
        );
      })}
    </>
  );
});

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
  rhythm = false,
  className,
}: TabStripProps) {
  const { t } = useTranslation();
  const model = useMemo(
    () => patternModel(notes, barTicks, patternBars, beatTicks),
    [notes, barTicks, patternBars, beatTicks],
  );
  const reduced = useReducedMotion();
  const viewRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const measure = () => setWidth(Math.round(view.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(view);
    return () => ro.disconnect();
  }, []);

  const follow = mode === "follow";
  const scale = useMemo(
    () => (follow ? followScale(model, width) : previewScale(model, width)),
    [follow, model, width],
  );
  const pad = barLinePad(model, scale.ppt);
  const geo: Geometry = useMemo(() => ({ ppt: scale.ppt, pad, showOrder: !follow }), [scale.ppt, pad, follow]);

  const readPosition = useCallback(
    () => (typeof position === "function" ? position() : position),
    [position],
  );

  // Which passes are drawn. Changes only when the strip needs more pattern.
  const [win, setWin] = useState(() => ({ from: 0, to: 1 }));
  const endTick = takeEnd(model, takeBars);
  const drawn = useMemo(() => {
    if (!follow) return occurrences(model, 0, 0);
    return occurrences(model, win.from, win.to, takeBars);
  }, [follow, model, win, takeBars]);
  const bars = useMemo(() => {
    if (!follow) return Array.from({ length: model.patternBars }, (_u, i) => i);
    const first = win.from * model.patternBars;
    const last = (win.to + 1) * model.patternBars - 1;
    const lastBar = Number.isFinite(endTick) ? Math.ceil(endTick / model.barTicks) - 1 : last;
    const out: number[] = [];
    for (let b = first; b <= Math.min(last, lastBar); b++) out.push(b);
    return out;
  }, [follow, model, win, endTick]);

  // What the frame loop reads; written on every render, read without rendering.
  const latest = useRef({ model, scale, takeBars, win, follow, reduced, width });
  latest.current = { model, scale, takeBars, win, follow, reduced, width };
  const shown = useRef({ tick: Number.NaN, bar: Number.NaN, onset: "" });
  const notesEls = useRef(new Map<number, HTMLElement>());
  const motion = useRef<CursorMotion | null>(null);

  /** Put the strip at `tick`, and mark the bar and the note that are now. */
  const place = useCallback((tick: number) => {
    const { model: m, scale: s, takeBars: tb, win: w, follow: f, reduced: r, width: vw } = latest.current;
    const strip = stripRef.current;
    if (!strip || !f) return;
    const now = currentOnset(m, tick, graceOf(m), tb);
    // Reduced motion: the strip steps from note to note instead of gliding.
    const at = r ? (now ? now.at : tick) : tick;
    if (at !== shown.current.tick) {
      shown.current.tick = at;
      strip.style.transform = `translate3d(${stripOffset(at, s).toFixed(1)}px,0,0)`;
    }
    const bar = barAt(m, tick);
    if (bar !== shown.current.bar) {
      shown.current.bar = bar;
      strip.querySelectorAll<HTMLElement>(".tabstrip-bar").forEach((el) => {
        el.dataset.rel = barRel(Number(el.dataset.bar), Math.max(0, bar));
      });
    }
    const key = now ? `${now.pass}:${now.index}` : "";
    if (key !== shown.current.onset) {
      shown.current.onset = key;
      strip.querySelectorAll<HTMLElement>(".tabstrip-note[data-current]").forEach((el) => {
        delete el.dataset.current;
      });
      if (now) {
        const k = m.notes.length;
        for (const n of m.notes) {
          if (n.tick !== m.onsets[now.index]) continue;
          notesEls.current.get(now.pass * k + n.index)?.setAttribute("data-current", "");
        }
      }
    }
    // More pattern needed: the one render a running Take asks for.
    const want = passWindow(m, tick, s, vw);
    if (want.from !== w.from || want.to !== w.to) setWin(want);
  }, []);

  // After every drawing: index the notes, and put marks back on them.
  useLayoutEffect(() => {
    const map = new Map<number, HTMLElement>();
    stripRef.current?.querySelectorAll<HTMLElement>(".tabstrip-note").forEach((el) => {
      map.set(Number(el.dataset.id), el);
    });
    notesEls.current = map;
    shown.current = { tick: Number.NaN, bar: Number.NaN, onset: "" };
    if (follow) place(motion.current ? motion.current.floor : readPosition());
    else if (stripRef.current) stripRef.current.style.transform = `translate3d(${scale.cursorX}px,0,0)`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawn, bars, geo, follow, scale, place]);

  // The results: a colour per note, written when they change or the drawing does.
  useLayoutEffect(() => {
    notesEls.current.forEach((el, id) => {
      const r = follow ? results?.get(id) : undefined;
      if (r) {
        if (el.dataset.result !== r) el.dataset.result = r;
      } else if (el.dataset.result) delete el.dataset.result;
    });
  }, [results, drawn, follow]);

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
      place(reported);
      return;
    }
    motion.current = onReport(clock, motion.current, { tick: reported, pass: 0, atMs: performance.now() }, 100);
  }, [reported, playing, clock, place]);

  // Not playing, with a function: read it once whenever anything changes.
  useEffect(() => {
    if (!playing && typeof position === "function") place(position());
  }, [playing, position, place]);

  // The frame loop: only in follow mode, only while the Take runs.
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
      place(tick);
      window.__TABSTRIP_FRAMES__ = (window.__TABSTRIP_FRAMES__ ?? 0) + 1;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing, follow, position, clock, endTick, place]);

  const label = t("session.tabstrip.label", { notes: describePattern(model) });
  const barWord = useCallback((n: number) => t("session.tabstrip.bar", { n }), [t]);
  const style = {
    "--ts-fret": `${scale.fretPx}px`,
    "--ts-current": CURRENT_SCALE,
  } as React.CSSProperties;

  return (
    <div
      className={`tabstrip${className ? ` ${className}` : ""}`}
      data-testid="tabstrip"
      data-mode={mode}
      data-moving={playing && follow ? "" : undefined}
      data-reduced={reduced ? "" : undefined}
      data-rhythm={rhythm ? "" : undefined}
      role="img"
      aria-label={label}
      style={style}
    >
      <div className="tabstrip-names" aria-hidden="true">
        {STRING_NAMES.map((name, i) => (
          <span key={i} data-string={i + 1}>
            {name}
          </span>
        ))}
      </div>
      <div className="tabstrip-view" ref={viewRef} aria-hidden="true">
        {STRING_NAMES.map((_n, i) => (
          <i key={i} className="tabstrip-line" data-string={i + 1} />
        ))}
        <div className="tabstrip-strip" ref={stripRef} data-testid="tabstrip-strip">
          {width > 0 && (
            <Strip model={model} notes={drawn} bars={bars} geo={geo} rhythm={rhythm} barWord={barWord} />
          )}
        </div>
        {follow && <i className="tabstrip-cursor" style={{ left: scale.cursorX }} />}
      </div>
    </div>
  );
}
