import { useEffect, useRef } from "react";
import type { BeatEvent } from "../../types";
import { MIN_BPM, MAX_BPM } from "../../constants/metronome";

/**
 * The metronome, drawn behind the metronome.
 *
 * A line figure that sits toward the right of the stage with the controls
 * lying over it, so the screen has an object in it rather than a field of
 * widgets. It is decoration and says nothing the numbers do not — which is
 * why it is `aria-hidden`, takes no pointer events, and disappears entirely
 * when there is not enough width for it to be anything but noise behind text.
 *
 * Two things make it worth drawing rather than dropping in a static SVG:
 *
 * **It keeps time with the click, not with its own clock.** The phase is
 * reset by every beat event the engine emits, so the pendulum reaches its
 * extreme when you hear the tick. A pendulum running on `60000 / bpm` in a
 * `requestAnimationFrame` loop looks right for about a minute and then is
 * visibly ahead of the sound — which in a timing app reads as a bug in the
 * timing, the one thing this app must never appear to have.
 *
 * **The swing shortens as the tempo rises.** A fixed arc at 240 BPM is a
 * blur, and a real metronome behaves this way for real reasons: the bob
 * slides down the rod to go faster. Both are drawn — a shorter arc and a
 * lower bob — because the two together read as "set fast" rather than
 * "animated fast".
 *
 * One swing per beat, not per subdivision: an escapement ticks at each end
 * of its travel, so a beat is a half-cycle and the rod alternates sides.
 */

interface MetronomeFigureProps {
  bpm: number;
  isPlaying: boolean;
  /** The engine's beat, used only for its arrival time — this is the phase lock. */
  currentBeat: BeatEvent | null;
}

/** Swing at the slowest and fastest tempo, in radians. */
const SWING_SLOW = 0.42; // ~24°
const SWING_FAST = 0.13; // ~7.5°

/** Where the bob sits on the rod, as a fraction of rod length from the pivot. */
const BOB_SLOW = 0.86;
const BOB_FAST = 0.42;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/** Where `bpm` sits between the slowest and the fastest tempo, 0..1. */
function tempoFraction(bpm: number) {
  return Math.max(0, Math.min(1, (bpm - MIN_BPM) / (MAX_BPM - MIN_BPM)));
}

/** Half the arc the rod travels, in radians. Wide when slow, narrow when fast. */
export function swingFor(bpm: number) {
  return lerp(SWING_SLOW, SWING_FAST, tempoFraction(bpm));
}

/**
 * Where the bob sits on the rod, as a fraction of its length from the pivot.
 * It slides down as the tempo rises, which is how you set a real metronome —
 * and it means a fast tempo looks fast even in a still frame.
 */
export function bobFor(bpm: number) {
  return lerp(BOB_SLOW, BOB_FAST, tempoFraction(bpm));
}

/**
 * The rod's angle, `elapsedMs` into a beat that began at an extreme.
 *
 * One beat is one half-cycle: the rod starts at one end of its travel, crosses
 * centre halfway through, and arrives at the other end exactly as the next
 * beat sounds. `dir` is which end it started at, and flips every beat.
 */
export function rodAngle(bpm: number, elapsedMs: number, dir: number) {
  const beatMs = 60000 / Math.max(1, bpm);
  const u = Math.min(1, Math.max(0, elapsedMs / beatMs));
  return swingFor(bpm) * dir * Math.cos(Math.PI * u);
}

export function MetronomeFigure({ bpm, isPlaying, currentBeat }: MetronomeFigureProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** When the current half-swing began, and which way it is travelling. */
  const phase = useRef({ start: 0, dir: 1 });
  const playing = useRef(isPlaying);
  const tempo = useRef(bpm);

  playing.current = isPlaying;
  tempo.current = bpm;

  // Every beat is an extreme of the swing. Sub-ticks are ignored: the rod
  // swings on the beat, and the subdivisions are what happens during it.
  useEffect(() => {
    if (!currentBeat || currentBeat.subdivision !== 0) return;
    phase.current = {
      start: performance.now(),
      dir: -phase.current.dir,
    };
  }, [currentBeat]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    let raf = 0;
    let w = 0;
    let h = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas!.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas!.width = Math.round(w * dpr);
      canvas!.height = Math.round(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /** Read the live theme rather than caching — themes change under us. */
    function ink() {
      const cs = getComputedStyle(canvas!);
      return {
        line: cs.getPropertyValue("--text-primary").trim() || "#fff",
        accent: cs.getPropertyValue("--accent").trim() || "#f5a30b",
      };
    }

    function draw(now: number) {
      if (w === 0 || h === 0) resize();
      ctx!.clearRect(0, 0, w, h);

      const { line, accent } = ink();
      const bobAt = bobFor(tempo.current);

      // The case: a tall trapezoid standing on the baseline, drawn as an
      // outline so the rod reads through it.
      const pad = Math.min(w, h) * 0.08;
      const baseY = h - pad;
      const topY = pad;
      // Right of centre: the canvas reaches back under the stage, and the
      // part that should be readable is the part past the stage's edge.
      const cx = w * 0.63;
      const halfBase = Math.min(w * 0.34, (h - pad * 2) * 0.36);
      const halfTop = halfBase * 0.34;
      const rodLen = (baseY - topY) * 0.82;
      const pivotY = baseY - (baseY - topY) * 0.06;

      ctx!.lineJoin = "round";
      ctx!.lineCap = "round";

      // Case outline.
      ctx!.strokeStyle = line;
      ctx!.globalAlpha = 0.5;
      ctx!.lineWidth = 1.4;
      ctx!.beginPath();
      ctx!.moveTo(cx - halfBase, baseY);
      ctx!.lineTo(cx - halfTop, topY);
      ctx!.lineTo(cx + halfTop, topY);
      ctx!.lineTo(cx + halfBase, baseY);
      ctx!.closePath();
      ctx!.stroke();

      // The scale the bob is set against — the reason a metronome is a
      // wedge rather than a box.
      ctx!.globalAlpha = 0.22;
      ctx!.lineWidth = 1;
      const marks = 9;
      for (let i = 1; i < marks; i++) {
        const f = i / marks;
        const y = baseY - (baseY - topY) * f * 0.9;
        const half = lerp(halfBase, halfTop, f) * 0.34;
        ctx!.beginPath();
        ctx!.moveTo(cx - half, y);
        ctx!.lineTo(cx - half * 0.35, y);
        ctx!.stroke();
      }

      // Where the rod is, right now.
      const angle =
        !playing.current || reduced
          ? 0
          : rodAngle(tempo.current, now - phase.current.start, phase.current.dir);

      const tipX = cx + Math.sin(angle) * rodLen;
      const tipY = pivotY - Math.cos(angle) * rodLen;

      // Rod.
      ctx!.globalAlpha = 0.75;
      ctx!.lineWidth = 1.8;
      ctx!.strokeStyle = accent;
      ctx!.beginPath();
      ctx!.moveTo(cx, pivotY);
      ctx!.lineTo(tipX, tipY);
      ctx!.stroke();

      // Bob — a filled block on the rod, which is the part you slide.
      const bx = cx + Math.sin(angle) * rodLen * bobAt;
      const by = pivotY - Math.cos(angle) * rodLen * bobAt;
      const bobW = Math.max(10, halfBase * 0.3);
      const bobH = bobW * 0.62;
      ctx!.save();
      ctx!.translate(bx, by);
      ctx!.rotate(angle);
      ctx!.globalAlpha = 0.9;
      ctx!.fillStyle = accent;
      // A plain rect rather than roundRect: the corners are two pixels at
      // this size, and roundRect is missing from the canvas stub the tests
      // run against — which took the whole app down with it.
      ctx!.fillRect(-bobW / 2, -bobH / 2, bobW, bobH);
      ctx!.restore();

      // Pivot.
      ctx!.globalAlpha = 0.85;
      ctx!.fillStyle = line;
      ctx!.beginPath();
      ctx!.arc(cx, pivotY, 2.6, 0, Math.PI * 2);
      ctx!.fill();

      ctx!.globalAlpha = 1;
    }

    function frame(now: number) {
      draw(now);
      raf = requestAnimationFrame(frame);
    }

    resize();
    // Stopped or reduced-motion: one still frame and no loop at all, so an
    // idle metronome costs nothing.
    if (isPlaying && !reduced) {
      raf = requestAnimationFrame(frame);
    } else {
      draw(performance.now());
    }

    const ro = new ResizeObserver(() => {
      resize();
      if (!isPlaying || reduced) draw(performance.now());
    });
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // `bpm` is read through a ref inside the loop, but a stopped figure has
    // to redraw when the tempo changes — the arc and the bob move with it.
  }, [isPlaying, bpm]);

  return <canvas ref={canvasRef} className="metronome-figure" aria-hidden="true" />;
}
