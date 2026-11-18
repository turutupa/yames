/**
 * The neck as the instruction (the panel's redesign, 2026-11-17): WHERE, WHEN
 * and WHAT NEXT on the neck alone, for a warm-up and for a Take.
 *
 * - A number on a dot is a FINGER, never the order (the owner, 2026-11-18):
 *   1 to 4 index to little finger, 0 an open string, nothing where it is not
 *   certain (`fingering`).
 * - Before the start, a static diagram: the pattern with its fingers and a
 *   "start here" pill on the first note, nothing else drawn (the owner,
 *   2026-11-18: an order line was confusing). The order is shown in time:
 *   the Watch preview lights the notes in order at the tempo, looping.
 * - While it runs, the note to play NOW is solid amber; an approach ring
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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { useNeck } from "../../../stage3d/api";
import { stripHeight } from "../../../stage3d/controller";
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
  fingering,
  nowNextNeck,
  readyNeck,
  thenFrets,
  windowOver,
  watchIndex,
  windowView,
} from "./practiceModel";
import { usePracticeCursor } from "./usePracticeCursor";
import { onToggleWatch, subscribeWatchKeyLabel, watchKeyLabel } from "./watchBus";

/** The row under the neck for the beat counter and the key, kept out of the neck's frame. */
const FOOT_PX = 34;

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
  const foot = useRef<HTMLDivElement>(null);

  const notes = take.exercise.notes;
  const shape = useMemo(() => neckNotesOf(notes, "aim"), [notes]);
  const model = useMemo(() => runwayModel(take, TAKE_COUNT_IN_BARS), [take]);
  const plan = useMemo(() => cameraPlan(model), [model]);
  const perQuarter = take.score.ticksPerQuarter > 0 ? take.score.ticksPerQuarter : TICKS_PER_QUARTER;
  const beats = Math.max(1, Math.round(model.barLength / perQuarter));
  const position = take.exercise.position;
  const fingers = useMemo(() => fingering(notes, position), [notes, position]);
  const hasFingers = useMemo(() => [...fingers.values()].some((f) => f !== "0"), [fingers]);

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
  const [watching, setWatching] = useState(false);
  const latest = useRef({ verdicts, model, shape, theory, running, fingers, watching });
  latest.current = { verdicts, model, shape, theory, running, fingers, watching };

  /**
   * "start here", before the start: a pill in the gap between two strings,
   * beside the first note on the side the next one is not, and never on a dot
   * of the pattern. The first spot that is clear wins; with none, the one
   * beside the note away from the next.
   */
  const placeStart = useCallback(
    (tag: HTMLElement, box: DOMRect, now: { x: number; y: number; r: number }) => {
      const { model: m, shape: sh } = latest.current;
      const first = m.onsets[0]?.places[0];
      const k0 = first ? `${first.string}:${first.fret}` : "";
      const second = m.onsets.map((o) => o.places[0]).find((p) => p && `${p.string}:${p.fret}` !== k0);
      const w = tag.offsetWidth || 90;
      const h = tag.offsetHeight || 24;
      const local = (s0: number, f: number) => {
        const pt = neck.project(s0, f);
        return pt ? { x: pt.x - box.left, y: pt.y - box.top, r: pt.r } : null;
      };
      const to = second ? local(second.string, second.fret) : null;
      const away = to && to.x > now.x ? -1 : 1;
      // The string lines either side of the note, at its fret.
      const gaps: number[] = [];
      if (first) {
        for (const d of [1, -1]) {
          const o = local(first.string + d, first.fret);
          if (o) gaps.push((now.y + o.y) / 2);
        }
      }
      const dotsAt = sh.map((n) => local(n.string, n.fret)).filter((p): p is { x: number; y: number; r: number } => !!p);
      const clear = (cx: number, cy: number) => {
        const x1 = cx - w / 2 - 3;
        const x2 = cx + w / 2 + 3;
        const y1 = cy - h / 2 - 2;
        const y2 = cy + h / 2 + 2;
        if (x1 < 2 || x2 > box.width - 2 || y1 < 2 || y2 > box.height - 2) return false;
        for (const d of dotsAt) {
          const nx = Math.max(x1, Math.min(d.x, x2));
          const ny = Math.max(y1, Math.min(d.y, y2));
          if (Math.hypot(d.x - nx, d.y - ny) < d.r * 1.35 + 4) return false;
        }
        return true;
      };
      const side = now.r * 1.5 + 6 + w / 2;
      const tries: { x: number; y: number }[] = [];
      for (const dir of [away, -away]) for (const g of gaps) tries.push({ x: now.x + dir * side, y: g });
      for (const g of gaps) tries.push({ x: now.x, y: g + (g > now.y ? h / 2 + 2 : -h / 2 - 2) });
      const pick = tries.find((p) => clear(p.x, p.y)) ?? tries[0] ?? { x: now.x, y: now.y + Math.max(20, now.r * 2.1) + h / 2 };
      tag.style.left = `${pick.x}px`;
      tag.style.top = `${pick.y}px`;
      tag.style.transform = "translate(-50%, -50%)";
    },
    [neck],
  );

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
          tag.style.transform = "";
          tag.toggleAttribute("data-start", !latest.current.running);
          if (!latest.current.running) placeStart(tag, box, now);
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
          // Where each string runs at NEXT's fret, from two above it to two
          // below (a string past the edge is the board's edge).
          const yAt = new Map<number, number>([[0, next.y]]);
          if (place) {
            for (const d of [-2, -1, 1, 2]) {
              const sIdx = place.string + d;
              if (sIdx < 0 || sIdx > 7) continue;
              const pt = neck.project(sIdx, place.fret);
              if (pt) yAt.set(d, pt.y - box.top);
            }
          }
          // The tag in both shapes: "next" over "then 8, 7", and on one line.
          nt.removeAttribute("data-row");
          const colH = nt.offsetHeight || 36;
          const colW = nt.offsetWidth || 70;
          nt.setAttribute("data-row", "");
          const rowH = nt.offsetHeight || 20;
          const rowW = nt.offsetWidth || 110;
          nt.removeAttribute("data-row");
          const H = box.height;
          const W = box.width;
          // The inlays (acceptance 2: "next then 8, 7" lay on the 7th fret's
          // dot): a fret's dot is in the middle of its cell, between the 3rd
          // and 4th strings, or for 12 and 24 between the 2nd and 3rd and the
          // 4th and 5th. A cell's wires are found from the markers' places,
          // which stand just behind them.
          const marks = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
          const noteXAt = new Map<number, number>();
          const nx = (k: number) => {
            if (!place) return null;
            if (!noteXAt.has(k)) {
              const pt = neck.project(place.string, k);
              noteXAt.set(k, pt ? pt.x - box.left : Number.NaN);
            }
            const v = noteXAt.get(k)!;
            return Number.isNaN(v) ? null : v;
          };
          const inlaysIn = (a: number, x1: number, x2: number) => {
            for (const k of marks) {
              if (!(a === 3 && k !== 12 && k !== 24) && !((a === 2 || a === 4) && (k === 12 || k === 24))) continue;
              const p0 = nx(k - 1);
              const p1 = nx(k);
              if (p0 === null || p1 === null || k - 1 < 1) continue;
              const ix = (p0 + p1) / 2 + next.r * 1.4;
              if (ix > x1 - next.r * 0.7 && ix < x2 + next.r * 0.7) return true;
            }
            return false;
          };
          // The markers round it (NOW larger), and NOW's finger tag: the
          // words go where none of them is.
          const blocks: { x: number; y: number; r: number }[] = [];
          for (let i = Math.max(0, index - 3); i <= index + 3; i++) {
            const p = at(i);
            // NOW and NEXT whole; the quiet ones around them only at their
            // middle, so on a narrow neck the words may touch a played
            // note's edge rather than leave the gaps altogether.
            if (p) blocks.push({ x: p.x, y: p.y, r: p.r * (i === index ? 1.5 : i === index + 1 ? 1.1 : 0.4) });
          }
          const nowBox = tag && tag.textContent ? tag.getBoundingClientRect() : null;
          const clear = (x1: number, x2: number, y1: number, y2: number) => {
            for (const b of blocks) {
              const cx = Math.max(x1, Math.min(b.x, x2));
              const cy = Math.max(y1, Math.min(b.y, y2));
              if (Math.hypot(b.x - cx, b.y - cy) < b.r - 1) return false;
            }
            if (nowBox && nowBox.width > 0) {
              const l = nowBox.left - box.left;
              const t2 = nowBox.top - box.top;
              if (x1 < l + nowBox.width && x2 > l && y1 < t2 + nowBox.height && y2 > t2) return false;
            }
            return true;
          };
          type Spot = { centre: number; row: boolean; up: boolean; x: number };
          let pick: Spot | null = null;
          if (place) {
            // Beside NEXT's own string first (above, then below), centred on
            // it, then to its right, then to its left; then a string further out.
            const tries: Array<[number, "c" | "r" | "l"]> = [
              [-1, "c"], [0, "c"], [-1, "r"], [0, "r"], [-1, "l"], [0, "l"],
              [-2, "c"], [1, "c"], [-2, "r"], [1, "r"], [-2, "l"], [1, "l"],
            ];
            for (const [lo, side] of tries) {
              const y1 = yAt.get(lo);
              const y2 = yAt.get(lo + 1);
              if (y1 === undefined || y2 === undefined) continue;
              const gap = Math.abs(y2 - y1);
              const centre = (y1 + y2) / 2;
              const row = !(colH <= gap - 6);
              const h = row ? rowH : colH;
              const w = row ? rowW : colW;
              if (row && rowH > gap - 2) continue;
              if (centre - h / 2 < 2 || centre + h / 2 > H - 2) continue;
              const x = side === "c" ? next.x : side === "r" ? next.x + next.r + 4 + w / 2 : next.x - next.r - 4 - w / 2;
              if (x - w / 2 < 2 || x + w / 2 > W - 2) {
                if (side !== "c") continue;
              }
              if (!clear(x - w / 2, x + w / 2, centre - h / 2, centre + h / 2)) continue;
              if (inlaysIn(place.string + lo, x - w / 2, x + w / 2)) continue;
              pick = { centre, row, up: centre < next.y, x };
              break;
            }
          }
          nt.toggleAttribute("data-row", !!pick?.row);
          if (pick) {
            nt.setAttribute("data-gap", "");
            nt.toggleAttribute("data-below", !pick.up);
            nt.style.top = `${pick.centre}px`;
          } else {
            const fallback = next.y - Math.max(18, next.r * 1.9);
            const below = fallback < 34;
            nt.removeAttribute("data-gap");
            nt.toggleAttribute("data-below", below);
            nt.style.top = `${below ? next.y + Math.max(18, next.r * 1.9) : fallback}px`;
          }
          const tagX = pick ? pick.x : next.x;
          // Inside the picture: an open string's NEXT is at the nut, at its very edge.
          nt.style.left = `${tagX}px`;
          const r = nt.getBoundingClientRect();
          let shift = r.left < box.left + 4 ? box.left + 4 - r.left : r.right > box.right - 4 ? box.right - 4 - r.right : 0;
          // Pushed in from the left edge (an open string by the nut): clear of
          // its token, beside it, rather than over it.
          if (shift > 0 && r.left + shift < next.x + box.left + next.r + 6) shift = next.x + box.left + next.r + 6 - r.left;
          if (shift) nt.style.left = `${tagX + shift}px`;
        }
      }
    },
    [neck, placeStart],
  );

  /** NOW moved on: the neck, the tags' words, the ring. */
  const showIndex = useCallback(
    (index: number, tick: number | null) => {
      const { model: m, shape: sh, verdicts: v, theory: th, fingers: fg } = latest.current;
      neck.setNotes(nowNextNeck(sh, m.onsets, index, v, th, fg), { fade: 0.12 });
      // The finger is on the dot itself now; the tag under NOW says nothing.
      if (nowTag.current) nowTag.current.textContent = "";
      const then = thenFrets(m.onsets, index);
      const nextLabel = nextTag.current?.querySelector<HTMLElement>("[data-then]");
      if (nextLabel) nextLabel.textContent = then.length ? t("session.practice.then", { frets: then.join(", ") }) : "";
      const due = m.onsets[index]?.tick;
      const ms = tick !== null && due !== undefined ? ((due - tick) / perQuarter) * (60_000 / Math.max(1, take.bpm)) : null;
      placeOverlay(index, ms);
    },
    [neck, t, placeOverlay, perQuarter, take.bpm],
  );

  // The slot: framed on arrival, hidden on the way out.
  useEffect(() => {
    const view = shown.current.view ?? whole;
    neck.setView(view, slot.current);
    return () => neck.setView({ kind: "hidden" }, null);
  }, [neck, whole]);

  // Ready, or stopped: the pattern with its fingers, the whole of it in view. Also where a Watch preview comes back to.
  const showReady = useCallback(() => {
    shown.current = { index: -1, bar: -1, beat: -1, view: whole };
    neck.setView(whole, slot.current);
    neck.setNotes(readyNeck(shape, model.onsets, fingers, theory));
    if (nowTag.current) nowTag.current.textContent = t("session.practice.start");
    dots.current?.querySelectorAll("i").forEach((d) => d.removeAttribute("data-on"));
    // Once the camera is there (an instant cut or the end of a flight).
    placeOverlay(0, null);
  }, [whole, shape, model, theory, fingers, neck, placeOverlay, t]);

  useLayoutEffect(() => {
    if (running || watching) return;
    showReady();
    const id = window.setTimeout(() => placeOverlay(0, null), 1500);
    return () => window.clearTimeout(id);
  }, [running, watching, showReady, placeOverlay]);

  // The Watch preview: the whole order, note by note at the set tempo, in the
  // run's own NOW and NEXT, looping until Watch again, Start or another view
  // (which unmounts this). Nothing but the picture: no input, no Take.
  const canWatch = !running && model.onsets.length > 1;
  useEffect(() => {
    if (running) setWatching(false);
  }, [running]);
  useEffect(() => onToggleWatch(() => latest.current.running || setWatching((w) => !w)), []);
  useEffect(() => {
    if (!watching) return;
    if (nowTag.current) nowTag.current.textContent = "";
    let frame = 0;
    let shownIndex = -2;
    let shownBeat = -1;
    const t0 = performance.now();
    const step = () => {
      const { model: m, shape: sh, theory: th, fingers: fg } = latest.current;
      const { index, tick } = watchIndex(m, performance.now() - t0, take.bpm, perQuarter);
      if (index !== shownIndex) {
        shownIndex = index;
        const at = Math.max(0, index);
        neck.setNotes(nowNextNeck(sh, m.onsets, at, null, th, fg), { fade: 0.08 });
        placeOverlay(at, null);
      }
      const b = beatInBar(m, tick, perQuarter);
      if (b !== shownBeat) {
        shownBeat = b;
        dots.current?.querySelectorAll("i").forEach((d, i) => d.toggleAttribute("data-on", i === b));
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [watching, neck, placeOverlay, take.bpm, perQuarter]);
  const watchKey = useSyncExternalStore(subscribeWatchKeyLabel, watchKeyLabel, watchKeyLabel);

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
    const { model: m, shape: sh, theory: th, fingers: fg } = latest.current;
    neck.setNotes(nowNextNeck(sh, m.onsets, shown.current.index, verdicts, th, fg), { fade: 0.12 });
  }, [verdicts, running, neck]);

  // The beat counter's row sits just over the overview strip, in the room the
  // slot keeps out of the neck's frame (FOOT_PX), never on the fret numbers.
  const placeFoot = useCallback(() => {
    const h = slot.current?.getBoundingClientRect().height ?? 0;
    const s = stripHeight(h);
    if (foot.current) foot.current.style.bottom = `${s ? s + 6 : 0}px`;
  }, []);
  useLayoutEffect(placeFoot, [placeFoot]);

  // The window moved or resized: put the overlay back on its notes.
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      placeFoot();
      placeOverlay(Math.max(0, shown.current.index), null);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [placeOverlay, placeFoot]);

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
      <div className="session-slot practice-neck-slot" ref={slot} aria-hidden="true" data-neck-foot={FOOT_PX} />
      <div className="practice-neck-over" aria-hidden="true">
        <i className="practice-ring" ref={ring} data-ready={running ? undefined : ""} />
        <span className="practice-now-tag" ref={nowTag} data-testid="practice-now-tag" />
        <span className="practice-next-tag" ref={nextTag} data-testid="practice-next-tag">
          <b>{t("session.practice.next")}</b>
          <span data-then="" />
        </span>
      </div>
      <div className="practice-neck-foot" ref={foot}>
        <span className="practice-beats-label" aria-hidden="true">
          {t("session.practice.beatLabel")}
        </span>
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
        <div className="practice-foot-end">
        {canWatch && (
          <button
            type="button"
            className="practice-watch"
            data-testid="practice-watch"
            aria-pressed={watching}
            onClick={() => setWatching((w) => !w)}
            title={t("session.practice.watchTitle")}
          >
            <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
              {watching ? <rect x="1.5" y="1.5" width="7" height="7" rx="1" /> : <path d="M2 1 L9 5 L2 9 Z" />}
            </svg>
            {t(watching ? "session.practice.watchStop" : "session.practice.watch")}
            {watchKey && <kbd>{watchKey}</kbd>}
          </button>
        )}
        <span className="practice-legend" aria-hidden="true">
          {running ? (
            <>
              <span data-k="now">{t("session.practice.legendNow")}</span>
              <span data-k="next">{t("session.practice.legendNext")}</span>
              {pluck && <span data-k="played">{t("session.practice.legendPlayed")}</span>}
            </>
          ) : (
            watching && (
              <>
                <span data-k="now">{t("session.practice.legendNow")}</span>
                <span data-k="next">{t("session.practice.legendNext")}</span>
              </>
            )
          )}
          {hasFingers && <span data-k="fingers">{t("session.practice.legendFingers")}</span>}
        </span>
        </div>
      </div>
    </div>
  );
}
