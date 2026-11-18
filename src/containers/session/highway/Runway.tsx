/**
 * The runway: six string lanes under the straight-on neck, fret numbers
 * arriving right to left at a fixed hit line (plans/tasks/mvp/RUNWAY.md).
 *
 * Cheap on purpose, because the click shares the CPU:
 *
 * - The strip of notes is DOM, built once per Take (and again only when the
 *   lane changes width). Each frame writes ONE `transform` on it through a
 *   ref: no React render, no canvas repaint, no WebGL.
 * - The position is the engine's, smoothed between reports by
 *   `songs/cursor.ts` the same way the tab cursor is: re-anchored on every
 *   report, never backwards, snapped on a seek.
 * - Through the count-in it pre-rolls from the Take's own tempo, so bar one
 *   is already arriving when the click says "one".
 * - A verdict colours its note with a data attribute and moves its early/late
 *   dot with a CSS variable. The dot rides with its note, so it stays in view
 *   for the rest of the bar (the lane keeps one bar behind the line).
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { onScoreOnset } from "../../../ipc";
import { cursorTickAt, leadFromFrame, onReport, snapTo } from "../../../songs/cursor";
import type { CursorMotion } from "../../../songs/cursor";
import type { BeatPosition } from "../../../songs/position";
import type { TakePlan } from "../../../session/take";
import { TAKE_COUNT_IN_BARS } from "../../../session/take";
import type { TimingMark } from "../../songs/review/marks";
import { kindOfMark } from "../hooks/useNeck";
import {
  STRING_NAMES,
  dotOffset,
  laneScale,
  minGapPx,
  nextOnsetIndex,
  noteSize,
  runwayModel,
  stripOffset,
  usedStrings,
} from "./runwayModel";
import type { RunwayModel } from "./runwayModel";

declare global {
  interface Window {
    /** Frames the runway has moved its strip on, for the layout suite. */
    __RUNWAY_FRAMES__?: number;
  }
}

/**
 * A webview that is likely to paint transforms on the CPU: WebKitGTK (Linux,
 * no Chrome in the agent). There the lane moves at 30 frames a second.
 */
export function likelyCpuCompositing(ua: string): boolean {
  return /Linux/.test(ua) && /AppleWebKit/.test(ua) && !/Chrome|Chromium|Android/.test(ua);
}

export type RunwayProps = {
  take: TakePlan;
  beat: BeatPosition | null;
  /** The Take is running and the engine is playing it. */
  playing: boolean;
  /** How each note has gone so far, by onset id (the same lights the neck uses). */
  lights: ReadonlyMap<number, TimingMark>;
  /** One thin lane instead of six: a theory Exercise, where the neck takes the room. */
  collapsed?: boolean;
  /** The next onset changed: its index in `model.onsets`. Called outside React's render. */
  onNext?: (index: number, model: RunwayModel) => void;
};

/** The notes, drawn once. Memoised so a verdict or a beat does not re-render them. */
const Strip = memo(function Strip({
  model,
  ppt,
  collapsed,
  lanes,
}: {
  model: RunwayModel;
  ppt: number;
  collapsed: boolean;
  /** The strings with a lane, high e first. */
  lanes: readonly number[];
}) {
  const left = (tick: number) => (tick - model.countInTicks) * ppt;
  const row = (s: number) => Math.max(0, lanes.indexOf(s));
  return (
    <>
      {model.barTicks.map((tick, i) => (
        <i key={`b${i}`} className="runway-barline" style={{ left: left(tick) }} />
      ))}
      {model.notes.map((n) => (
        <span
          key={`${n.onsetId}:${n.noteId}`}
          className="runway-note"
          data-onset={n.onsetId}
          data-string={n.string}
          style={{
            left: left(n.tick),
            top: collapsed ? "50%" : `${((row(n.string) + 0.5) / lanes.length) * 100}%`,
          }}
        >
          {n.fret}
          <i className="runway-dot" />
        </span>
      ))}
    </>
  );
});

export function Runway({ take, beat, playing, lights, collapsed = false, onNext }: RunwayProps) {
  const { t } = useTranslation();
  const model = useMemo(() => runwayModel(take, TAKE_COUNT_IN_BARS), [take]);
  const lanes = useMemo(() => usedStrings(model), [model]);
  const laneRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const laneH = collapsed ? height : height / Math.max(1, lanes.length);
  const scale = useMemo(() => laneScale(model, width, minGapPx(width, laneH)), [model, width, laneH]);
  const note = noteSize(model, scale.ppt, collapsed ? 0 : laneH);

  // The lane's size, once and on every resize.
  useLayoutEffect(() => {
    const lane = laneRef.current;
    if (!lane) return;
    const measure = () => {
      const r = lane.getBoundingClientRect();
      setWidth(Math.round(r.width));
      setHeight(Math.round(r.height));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(lane);
    return () => ro.disconnect();
  }, []);

  // Where the strip is, read by the frame loop and written by it alone.
  const motion = useRef<CursorMotion | null>(null);
  const shown = useRef(model.countInTicks);
  const nextIndex = useRef(-1);
  const latest = useRef({ model, scale, onNext });
  latest.current = { model, scale, onNext };

  /** Put the strip at `tick` and tell the neck what is next. */
  const place = useCallback((tick: number) => {
    const { model: m, scale: s, onNext: next } = latest.current;
    shown.current = tick;
    const strip = stripRef.current;
    if (strip) {
      // The strip's own origin is the count-in's first tick.
      const x = stripOffset(tick - m.countInTicks, s);
      strip.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
    }
    const index = nextOnsetIndex(m.onsets, tick, m.barLength / 32);
    if (index !== nextIndex.current) {
      nextIndex.current = index;
      next?.(index, m);
    }
  }, []);

  // A new Take, or a new width: draw it where it was (or at the count-in).
  useLayoutEffect(() => {
    nextIndex.current = -1;
    place(playing ? shown.current : model.countInTicks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, scale, place]);

  // A report from the engine: re-anchor on it. Through the count-in, the first
  // report starts the pre-roll at the count-in's first tick; the rest are
  // left to the tempo, since a count-in click says nothing about the song.
  const reportTick = beat && playing ? (beat.songCountIn ? null : beat.songTick) : null;
  const counting = !!beat && playing && beat.songCountIn;
  useEffect(() => {
    if (!playing) {
      motion.current = null;
      return;
    }
    const now = performance.now();
    if (reportTick === null) {
      if (counting && !motion.current) motion.current = snapTo(model.countInTicks, now, 0);
      return;
    }
    motion.current = onReport(take.score, motion.current, { tick: reportTick, pass: 0, atMs: now }, 100);
  }, [reportTick, counting, playing, model, take.score]);

  // The frame loop: only while the Take runs.
  useEffect(() => {
    if (!playing) {
      place(shown.current > model.countInTicks ? shown.current : model.countInTicks);
      return;
    }
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
      const m = motion.current;
      if (!m) return;
      const next = cursorTickAt(take.score, m, now, {
        percent: 100,
        endTick: model.endTick,
        // One frame: the transform lands on the next composite.
        leadMs: leadFromFrame(frameMs) / 2,
      });
      motion.current = next.motion;
      place(next.tick);
      window.__RUNWAY_FRAMES__ = (window.__RUNWAY_FRAMES__ ?? 0) + 1;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing, model, take.score, place]);

  // Each onset's circles, found once per drawing.
  const els = useRef(new Map<number, HTMLElement[]>());
  useLayoutEffect(() => {
    const map = new Map<number, HTMLElement[]>();
    stripRef.current?.querySelectorAll<HTMLElement>(".runway-note").forEach((el) => {
      const id = Number(el.dataset.onset);
      map.set(id, [...(map.get(id) ?? []), el]);
    });
    els.current = map;
  }, [model, scale.ppt, collapsed]);

  // A verdict: its colour, from the same lights the neck and the tab use.
  useEffect(() => {
    if (lights.size === 0) {
      els.current.forEach((list) =>
        list.forEach((el) => {
          delete el.dataset.state;
          el.style.removeProperty("--dev");
        }),
      );
      return;
    }
    for (const [id, mark] of lights) {
      const state = kindOfMark(mark) ?? "na";
      for (const el of els.current.get(id) ?? []) {
        if (el.dataset.state !== state) el.dataset.state = state;
      }
    }
  }, [lights]);

  // And its early/late: where its dot sits, beside the note.
  useEffect(() => {
    if (!playing) return;
    const off = onScoreOnset((onset) => {
      if (onset.state !== "hit" || onset.pass !== 0) return;
      for (const el of els.current.get(onset.id) ?? []) {
        el.style.setProperty("--dev", `${dotOffset(onset.deviationMs)}px`);
        el.dataset.timed = "";
      }
    });
    return () => {
      void off.then((fn) => fn()).catch(() => {});
    };
  }, [playing]);

  return (
    <div
      className="runway session-glass"
      data-testid="runway"
      data-collapsed={collapsed ? "" : undefined}
      data-moving={playing ? "" : undefined}
      data-lanes={lanes.length}
      style={{ ["--lanes" as string]: lanes.length, ["--note" as string]: `${note}px` }}
      role="img"
      aria-label={t("session.runway.label")}
    >
      {!collapsed && (
        <div className="runway-names" aria-hidden="true">
          {lanes.map((s, i) => (
            <span
              key={s}
              data-string={s}
              style={{ top: `${(i / lanes.length) * 100}%`, height: `${100 / lanes.length}%` }}
            >
              {STRING_NAMES[s - 1]}
            </span>
          ))}
        </div>
      )}
      <div className="runway-lanes" ref={laneRef}>
        {!collapsed &&
          lanes.map((s, i) => (
            <i key={s} className="runway-lane" data-string={s} style={{ top: `${((i + 0.5) / lanes.length) * 100}%` }} />
          ))}
        <div className="runway-past" style={{ width: scale.hitX }} aria-hidden="true" />
        <div className="runway-strip" ref={stripRef} data-testid="runway-strip">
          {width > 0 && <Strip model={model} ppt={scale.ppt} collapsed={collapsed} lanes={lanes} />}
        </div>
        <i className="runway-hit" style={{ left: scale.hitX }} aria-hidden="true" />
        <span className="runway-legend" aria-hidden="true">
          <span>◂ {t("session.run.early")}</span>
          <span>{t("session.run.late")} ▸</span>
        </span>
      </div>
    </div>
  );
}
