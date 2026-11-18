/**
 * The neck as the instruction (the panel's redesign, 2026-11-17): WHERE, WHEN
 * and WHAT NEXT on the neck alone, for a warm-up and for a Take.
 *
 * - Before the start, the pattern in order: each place numbered by the note
 *   that first plays it, the first one NOW, and a "start here" on it.
 * - While it runs, the note to play NOW is solid amber with its fret number
 *   and, where the Exercise fixes the hand, its finger; an approach ring
 *   closes on it as its beat arrives. NEXT is an amber outline marked "next",
 *   with "then 7, 5" beside it. The notes just played keep their verdict's
 *   colour (a Take); four beat dots count the bar under the neck.
 * - The camera holds about seven frets around the action and moves only on a
 *   bar line, and only when the bar would not fit (`cameraPlan`).
 *
 * Cheap on purpose: the position runs on `requestAnimationFrame` as
 * arithmetic, and the neck is told something only when it changes, once per
 * note (`setNotes`) and at most once per bar (`setView`). The stage stays
 * on-demand and capped at 30 fps for the run (`useNeckTake`). The overlay is
 * DOM hung on `project()`, so the SVG fallback gets exactly the same states.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNeck } from "../../../stage3d/api";
import type { NeckKind, NeckView } from "../../../stage3d/api";
import type { BeatPosition } from "../../../songs/position";
import { TICKS_PER_QUARTER } from "../../../songs/types";
import type { TakePlan } from "../../../session/take";
import { TAKE_COUNT_IN_BARS } from "../../../session/take";
import type { TimingMark } from "../../songs/review/marks";
import { kindOfMark, neckNotesOf, useNeckTake } from "../hooks/useNeck";
import { nextOnsetIndex, runwayModel } from "../highway/runwayModel";
import {
  barAt,
  beatInBar,
  cameraPlan,
  fingerFor,
  nowNextNeck,
  orderedNeck,
  thenFrets,
  windowOver,
  windowView,
} from "./practiceModel";
import { usePracticeCursor } from "./usePracticeCursor";

const NO_LIGHTS: ReadonlyMap<number, TimingMark> = new Map();

function sameView(a: NeckView | null, b: NeckView): boolean {
  return !!a && a.kind === "zoom" && b.kind === "zoom" && a.from === b.from && a.to === b.to;
}

function reducedMotion(): boolean {
  try {
    return !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export type NeckInstructionProps = {
  take: TakePlan;
  /** The pattern is running (a warm-up after Start, a Take after Start). */
  running: boolean;
  /** Where it is: the engine's report for a Take, the click's for a warm-up (`useWarmupBeat`). */
  beat: BeatPosition | null;
  /** The engine is playing it. */
  playing: boolean;
  /** Verdicts so far, by onset id: a Take's lights. A warm-up has none. */
  lights?: ReadonlyMap<number, TimingMark>;
  /** Pluck each heard note (a Take, the neck view): the stage's own feedback. */
  pluck?: boolean;
  /** A theory Exercise: the quiet shape keeps its letters. */
  theory?: boolean;
  /** Extra class on the wrapper (flex sizing per screen). */
  className?: string;
};

export function NeckInstruction({
  take,
  running,
  beat,
  playing,
  lights = NO_LIGHTS,
  pluck = false,
  theory = false,
  className,
}: NeckInstructionProps) {
  const { t } = useTranslation();
  const neck = useNeck();
  const wrap = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLElement>(null);
  const nowTag = useRef<HTMLSpanElement>(null);
  const nextTag = useRef<HTMLSpanElement>(null);
  const dots = useRef<HTMLDivElement>(null);

  const notes = take.exercise.notes;
  const shape = useMemo(() => neckNotesOf(notes, "aim"), [notes]);
  const model = useMemo(() => runwayModel(take, TAKE_COUNT_IN_BARS), [take]);
  const plan = useMemo(() => cameraPlan(model), [model]);
  const perQuarter = take.score.ticksPerQuarter > 0 ? take.score.ticksPerQuarter : TICKS_PER_QUARTER;
  const beats = Math.max(1, Math.round(model.barLength / perQuarter));
  const position = take.exercise.position;

  // Ready: the whole pattern in view. Running: the bar's window.
  const whole = useMemo<NeckView>(() => {
    // Open strings included, so a "start here" at the nut is on the neck (SES-7).
    const frets = notes.map((n) => n.fret).filter((f) => f >= 0);
    return frets.length ? windowView(windowOver(Math.min(...frets), Math.max(...frets), 5)) : { kind: "zoom", from: 0, to: 5 };
  }, [notes]);

  // What is on screen now, read and written by the frame loop alone.
  const shown = useRef<{ index: number; bar: number; beat: number; view: NeckView | null }>({
    index: -1,
    bar: -1,
    beat: -1,
    view: null,
  });

  const verdicts = useMemo(() => {
    const map = new Map<number, NeckKind>();
    for (const [id, mark] of lights) {
      const kind = kindOfMark(mark);
      if (kind) map.set(id, kind);
    }
    return map;
  }, [lights]);
  const latest = useRef({ verdicts, model, shape, theory, running });
  latest.current = { verdicts, model, shape, theory, running };

  /** Hang the DOM overlay on the places NOW and NEXT stand on. */
  const placeOverlay = useCallback(
    (index: number, msToDue: number | null) => {
      const box = wrap.current?.getBoundingClientRect();
      const m = latest.current.model;
      const hide = (el: HTMLElement | null) => el && (el.style.visibility = "hidden");
      if (!box) return;
      const at = (i: number) => {
        const p = m.onsets[i]?.places[0];
        if (!p) return null;
        const pt = neck.project(p.string, p.fret);
        return pt ? { x: pt.x - box.left, y: pt.y - box.top, r: pt.r, fret: p.fret } : null;
      };
      const now = at(index);
      const next = latest.current.running ? at(index + 1) : null;
      const r = ring.current;
      if (r) {
        if (!now) hide(r);
        else {
          const size = Math.max(34, Math.min(110, now.r * 3.4));
          r.style.visibility = "visible";
          r.style.left = `${now.x}px`;
          r.style.top = `${now.y}px`;
          r.style.width = r.style.height = `${size}px`;
          r.getAnimations?.().forEach((a) => a.cancel());
          if (msToDue !== null && msToDue > 40 && typeof r.animate === "function" && !reducedMotion()) {
            r.animate(
              [
                { transform: "translate(-50%, -50%) scale(1.9)", opacity: 0.15 },
                { transform: "translate(-50%, -50%) scale(1)", opacity: 0.95 },
              ],
              { duration: msToDue, easing: "linear", fill: "forwards" },
            );
          }
        }
      }
      const tag = nowTag.current;
      if (tag) {
        if (!now) hide(tag);
        else {
          tag.style.visibility = "visible";
          tag.style.left = `${now.x}px`;
          tag.style.top = `${now.y + Math.max(20, now.r * 2.1)}px`;
        }
      }
      const nt = nextTag.current;
      if (nt) {
        if (!next) hide(nt);
        else {
          nt.style.visibility = "visible";
          nt.style.left = `${next.x}px`;
          // Centred in the space between two strings, never on one: the gap
          // past the string beside its note, above it, or under it where the
          // top of the picture would cut it (SES-7). It used to hang a fixed
          // distance above the note, which in every theme put "next" on the
          // neighbouring string.
          const place = m.onsets[index + 1]?.places[0];
          const gapAt = (up: boolean): number | null => {
            if (!place) return null;
            const ys = [-2, -1, 1, 2]
              .map((d) => ({ d, pt: neck.project(place.string + d, place.fret) }))
              .filter((o): o is { d: number; pt: { x: number; y: number; r: number } } => !!o.pt)
              .map((o) => ({ d: o.d, y: o.pt.y - box.top }));
            const side = ys.filter((o) => (up ? o.y < next.y : o.y > next.y)).sort((a, b) => Math.abs(a.d) - Math.abs(b.d));
            const near = side[0];
            if (!near) return null;
            const far = side[1];
            const spacing = Math.abs(near.y - next.y);
            gap = far ? Math.abs(far.y - near.y) : spacing;
            return far ? (near.y + far.y) / 2 : near.y + (up ? -spacing / 2 : spacing / 2);
          };
          let gap = 0;
          // Two lines ("then 7, 6" over "next") fit a wide gap; a narrow one
          // takes them side by side on one line.
          nt.removeAttribute("data-row");
          gapAt(true);
          if (gap > 0 && nt.offsetHeight > gap - 6) nt.setAttribute("data-row", "");
          const tagH = nt.offsetHeight || 36;
          const above = gapAt(true);
          const useAbove = above !== null && above - tagH / 2 >= 4;
          const centre = useAbove ? above : gapAt(false);
          if (centre !== null) {
            nt.setAttribute("data-gap", "");
            nt.toggleAttribute("data-below", !useAbove);
            nt.style.top = `${centre}px`;
          } else {
            const fallback = next.y - Math.max(18, next.r * 1.9);
            const below = fallback < 34;
            nt.removeAttribute("data-gap");
            nt.toggleAttribute("data-below", below);
            nt.style.top = `${below ? next.y + Math.max(18, next.r * 1.9) : fallback}px`;
          }
        }
      }
    },
    [neck],
  );

  /** NOW moved on: the neck, the tags' words, the ring. */
  const showIndex = useCallback(
    (index: number, tick: number | null) => {
      const { model: m, shape: sh, verdicts: v, theory: th } = latest.current;
      neck.setNotes(nowNextNeck(sh, m.onsets, index, v, th), { fade: 0.12 });
      const p = m.onsets[index]?.places[0];
      const finger = p ? fingerFor(position, p.fret) : null;
      if (nowTag.current) nowTag.current.textContent = finger ? t("session.practice.finger", { n: finger }) : "";
      const then = thenFrets(m.onsets, index);
      const nextLabel = nextTag.current?.querySelector<HTMLElement>("[data-then]");
      if (nextLabel) nextLabel.textContent = then.length ? t("session.practice.then", { frets: then.join(", ") }) : "";
      const due = m.onsets[index]?.tick;
      const ms = tick !== null && due !== undefined ? ((due - tick) / perQuarter) * (60_000 / Math.max(1, take.bpm)) : null;
      placeOverlay(index, ms);
    },
    [neck, position, t, placeOverlay, perQuarter, take.bpm],
  );

  // The slot: framed on arrival, hidden on the way out.
  useEffect(() => {
    const view = shown.current.view ?? whole;
    neck.setView(view, slot.current);
    return () => neck.setView({ kind: "hidden" }, null);
  }, [neck, whole]);

  // Ready, or stopped: the pattern in order, the whole of it in view.
  useLayoutEffect(() => {
    if (running) return;
    shown.current = { index: -1, bar: -1, beat: -1, view: whole };
    neck.setView(whole, slot.current);
    neck.setNotes(orderedNeck(shape, model.onsets, theory));
    if (nowTag.current) nowTag.current.textContent = t("session.practice.start");
    dots.current?.querySelectorAll("i").forEach((d) => d.removeAttribute("data-on"));
    // Once the camera is there (an instant cut or the end of a flight).
    placeOverlay(0, null);
    const id = window.setTimeout(() => placeOverlay(0, null), 1500);
    return () => window.clearTimeout(id);
  }, [running, whole, shape, model, theory, neck, placeOverlay, t]);

  // Running, before the first report: the first note is NOW, the first bar framed.
  useLayoutEffect(() => {
    if (!running) return;
    shown.current = { index: 0, bar: 0, beat: -1, view: windowView(plan[0]) };
    neck.setView(windowView(plan[0]), slot.current);
    showIndex(0, null);
    const id = window.setTimeout(() => placeOverlay(shown.current.index, null), 1500);
    return () => window.clearTimeout(id);
  }, [running, plan, neck, showIndex, placeOverlay]);

  // A new verdict: the played notes take its colour, NOW and NEXT unchanged.
  useEffect(() => {
    if (!running || shown.current.index < 0) return;
    const { model: m, shape: sh, theory: th } = latest.current;
    neck.setNotes(nowNextNeck(sh, m.onsets, shown.current.index, verdicts, th), { fade: 0.12 });
  }, [verdicts, running, neck]);

  // The window moved or resized: put the overlay back on its notes.
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => placeOverlay(Math.max(0, shown.current.index), null));
    ro.observe(el);
    return () => ro.disconnect();
  }, [placeOverlay]);

  const onTick = useCallback(
    (tick: number) => {
      const m = latest.current.model;
      const s = shown.current;
      const index = Math.min(nextOnsetIndex(m.onsets, tick, m.barLength / 32), Math.max(0, m.onsets.length - 1));
      const bar = tick < (m.barTicks[0] ?? 0) ? 0 : barAt(m.barTicks, tick);
      const b = beatInBar(m, tick, perQuarter);
      if (bar !== s.bar) {
        s.bar = bar;
        const view = windowView(plan[Math.min(bar, plan.length - 1)] ?? plan[0]);
        if (!sameView(s.view, view)) {
          s.view = view;
          neck.setView(view, slot.current);
          window.setTimeout(() => placeOverlay(shown.current.index, null), 1400);
        }
      }
      if (index !== s.index) {
        s.index = index;
        showIndex(index, tick);
      }
      if (b !== s.beat) {
        s.beat = b;
        dots.current?.querySelectorAll("i").forEach((d, i) => {
          if (i === b) d.setAttribute("data-on", "");
          else d.removeAttribute("data-on");
        });
        // Says which beat, not just "the bar's beats" (UX audit SES-16).
        const label = t("session.practice.beatOf", { n: b + 1, of: beats });
        dots.current?.setAttribute("aria-label", label);
        dots.current?.setAttribute("title", label);
      }
    },
    [neck, plan, perQuarter, showIndex, placeOverlay, t, beats],
  );

  usePracticeCursor({
    score: take.score,
    countInTicks: model.countInTicks,
    endTick: model.endTick,
    beat,
    playing: running && playing,
    onTick,
  });

  // The frame cap for the run; a Take's heard notes plucked in their colour.
  useNeckTake(take, pluck ? lights : NO_LIGHTS, running && playing);

  return (
    <div className={`practice-neck${className ? ` ${className}` : ""}`} ref={wrap} data-testid="practice-neck" data-running={running ? "" : undefined}>
      <div className="session-slot practice-neck-slot" ref={slot} aria-hidden="true" />
      <div className="practice-neck-over" aria-hidden="true">
        <i className="practice-ring" ref={ring} data-ready={running ? undefined : ""} />
        <span className="practice-now-tag" ref={nowTag} data-testid="practice-now-tag" />
        <span className="practice-next-tag" ref={nextTag} data-testid="practice-next-tag">
          <b>{t("session.practice.next")}</b>
          <span data-then="" />
        </span>
      </div>
      <div className="practice-neck-foot">
        <div
          className="practice-beats"
          ref={dots}
          role="img"
          aria-label={t("session.practice.beats")}
          title={t("session.practice.beats")}
          data-testid="practice-beats"
        >
          {Array.from({ length: beats }, (_, i) => (
            <i key={i} />
          ))}
        </div>
        <span className="practice-legend" aria-hidden="true">
          <span data-k="now">{t("session.practice.legendNow")}</span>
          <span data-k="next">{t("session.practice.legendNext")}</span>
          {pluck && <span data-k="played">{t("session.practice.legendPlayed")}</span>}
        </span>
      </div>
    </div>
  );
}
