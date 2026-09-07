import { useEffect, useRef } from "react";
import type { BeatEvent } from "../../types";
import { rod, ROD_AT, STATIC_PARTS, type Mesh } from "./figureGeometry";
import { MIN_BPM, MAX_BPM } from "../../constants/metronome";

/**
 * The metronome, drawn behind the metronome.
 *
 * A wireframe drawing of the object, in perspective, sitting toward the right
 * of the stage with the controls lying over it — so the screen has something
 * in it rather than a field of widgets. It is decoration and says nothing the
 * numbers do not, which is why it is `aria-hidden`, takes no pointer events,
 * and disappears entirely when there is not enough width for it to be
 * anything but noise behind text.
 *
 * The geometry is ported from the marketing site (`figureGeometry.ts`) — case,
 * plate, movement, escapement, bell and the graduated arc — assembled rather
 * than exploded, and held at one three-quarter angle instead of rocking. The
 * site is a hero and can afford to move; this sits under live controls all
 * day, where anything that moves without meaning is something to look at
 * instead of the tempo.
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

    /**
     * The theme's ink, as `r,g,b` for `rgba()` — the depth cue needs to set
     * alpha per edge, so a hex token is no use directly. Read live rather than
     * cached: the theme changes under us.
     */
    function rgb(value: string, fallback: string): string {
      const v = value.trim();
      const hex = /^#?([0-9a-f]{6})$/i.exec(v);
      if (hex) {
        const n = parseInt(hex[1], 16);
        return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
      }
      const nums = v.match(/[\d.]+/g);
      if (nums && nums.length >= 3) return nums.slice(0, 3).map((x) => Math.round(+x)).join(",");
      return fallback;
    }

    function ink() {
      const cs = getComputedStyle(canvas!);
      return {
        line: rgb(cs.getPropertyValue("--text-primary"), "245,236,226"),
        accent: rgb(cs.getPropertyValue("--accent"), "245,163,11"),
      };
    }

    /* Orientation. Fixed — the site's figure rocks, which is right for a
       hero and wrong for a thing that sits behind live controls all day.

       `FRONT` is where the case's front face meets the camera; the yaw turns
       it a little to the left and the pitch looks a little down on it, which
       is the three-quarter view a drawing of an object is usually given. */
    const FRONT = Math.PI - 0.5;
    const YAW = FRONT + 0.3;
    const PITCH = -0.34;
    const cosYaw = Math.cos(YAW);
    const sinYaw = Math.sin(YAW);
    const cosPitch = Math.cos(PITCH);
    const sinPitch = Math.sin(PITCH);

    /** World point to screen, with the perspective divide kept for depth. */
    function project(
      p: [number, number, number],
      scale: number,
      ox: number,
      oy: number,
    ): [number, number, number] {
      const [x, y, z] = p;
      const x2 = x * cosYaw + z * sinYaw;
      const z2 = -x * sinYaw + z * cosYaw;
      const y2 = y * cosPitch - z2 * sinPitch;
      const z3 = y * sinPitch + z2 * cosPitch;
      const d = 26;
      const k = d / (d + z3 + 8);
      return [ox + x2 * scale * k, oy - y2 * scale * k, k];
    }

    function strokeMesh(
      geo: Mesh,
      at: [number, number, number],
      dim: number,
      angle: number,
      scale: number,
      ox: number,
      oy: number,
      ink: string,
    ) {
      const ca = Math.cos(angle);
      const sa = Math.sin(angle);
      const proj = geo.pts.map((p) => {
        let [x, y] = p;
        const z = p[2];
        if (angle) {
          const nx = x * ca - y * sa;
          y = x * sa + y * ca;
          x = nx;
        }
        return project([x + at[0], y + at[1], z + at[2]], scale, ox, oy);
      });
      for (const [a2, b2] of geo.edges) {
        const p = proj[a2];
        const q = proj[b2];
        // Depth cue: what is further away fades. No lighting needed.
        const depth = (p[2] + q[2]) / 2;
        const alpha = Math.max(0.1, Math.min(1, (depth - 0.62) * 3.4)) * dim;
        ctx!.strokeStyle = `rgba(${ink}, ${alpha.toFixed(3)})`;
        ctx!.lineWidth = 0.85 + depth * 0.5;
        ctx!.beginPath();
        ctx!.moveTo(p[0], p[1]);
        ctx!.lineTo(q[0], q[1]);
        ctx!.stroke();
      }
    }

    /**
     * How big to draw it, and where to centre it.
     *
     * Measured rather than guessed with a divisor: project every point of
     * every part at unit scale, including the rod at the widest swing the
     * slowest tempo allows, and fit the resulting box into the canvas. The
     * first version used the site's `min(w, h) / 7.9`, which is right for the
     * canvas the site gives it and clipped the bell off the top of ours.
     */
    function fit(): { scale: number; ox: number; oy: number } {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      const consider = (geo: Mesh, at: [number, number, number], angle: number) => {
        const ca = Math.cos(angle);
        const sa = Math.sin(angle);
        for (const pt of geo.pts) {
          let x = pt[0];
          let y = pt[1];
          if (angle) {
            const nx = x * ca - y * sa;
            y = x * sa + y * ca;
            x = nx;
          }
          const [px, py] = project([x + at[0], y + at[1], pt[2] + at[2]], 1, 0, 0);
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        }
      };
      for (const part of STATIC_PARTS) consider(part.geo, part.at, 0);
      const widest = swingFor(MIN_BPM);
      for (const a of [-widest, 0, widest]) consider(rod(BOB_SLOW), ROD_AT, a);

      const pad = 0.94;
      const scale = Math.min(w / (maxX - minX), h / (maxY - minY)) * pad;
      return {
        scale,
        ox: w / 2 - ((minX + maxX) / 2) * scale,
        oy: h / 2 - ((minY + maxY) / 2) * scale,
      };
    }

    function draw(now: number) {
      if (w === 0 || h === 0) resize();
      ctx!.clearRect(0, 0, w, h);

      const { line, accent } = ink();
      const { scale, ox, oy } = fit();
      ctx!.lineCap = "round";
      ctx!.lineJoin = "round";

      for (const part of STATIC_PARTS) {
        strokeMesh(part.geo, part.at, part.dim, 0, scale, ox, oy, line);
      }

      const angle =
        !playing.current || reduced
          ? 0
          : rodAngle(tempo.current, now - phase.current.start, phase.current.dir);
      // The rod is the one part that carries the accent: it is the part that
      // is doing something.
      strokeMesh(rod(bobFor(tempo.current)), ROD_AT, 1, angle, scale, ox, oy, accent);
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
