import { useEffect, useRef } from "react";
import type { BeatEvent } from "../../../types";
import { getAccentColor, hexToRgb } from "./helpers";

interface Dot {
  x: number;
  y: number;
  a: number; // current alpha (0 when unlit, decays after radar scan)
}

/**
 * Radar zen effect — a radar scan line rotates from center out to screen edges.
 * 50 scatter dots are placed randomly; each lights up (alpha 0.85) when the
 * radar passes through it and then fades out over ~250 frames.
 *
 * Rotation speed scales with live BPM via a sqrt curve clamped to [0.5×, 1.75×]
 * so tempo changes feel responsive without becoming dizzying at high BPM.
 * Live BPM is derived from beat intervals with EMA smoothing.
 */
export function RadarEffect({ currentBeat, isPlaying, activeTab: _activeTab, beatsPerMeasure: _beatsPerMeasure }: { currentBeat: BeatEvent | null; isPlaying: boolean; activeTab: "beat" | "drill" | "jam"; beatsPerMeasure: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const radarAngleRef = useRef(0);
  const dotsRef = useRef<Dot[]>([]);
  const prevBeatRef = useRef(-1);
  const lastBeatTimeRef = useRef(0);
  const liveBpmRef = useRef(120);

  // BPM measurement via beat interval
  useEffect(() => {
    if (!isPlaying || !currentBeat) return;
    if (currentBeat.beat === prevBeatRef.current) return;
    prevBeatRef.current = currentBeat.beat;

    const now = performance.now();
    if (lastBeatTimeRef.current > 0) {
      const interval = now - lastBeatTimeRef.current;
      const bpm = 60000 / interval;
      liveBpmRef.current = liveBpmRef.current * 0.75 + bpm * 0.25;
    }
    lastBeatTimeRef.current = now;
  }, [currentBeat, isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const initDots = () => {
      dotsRef.current = Array.from({ length: 50 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        a: 0,
      }));
    };

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initDots();
    };
    resize();
    window.addEventListener("resize", resize);

    const BASE_INCREMENT = 0.018;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const maxR = Math.sqrt(cx * cx + cy * cy);
      const accent = getAccentColor();
      const { r, g, b } = hexToRgb(accent);

      // sqrt-clamped speed multiplier
      const speedMult = Math.max(0.5, Math.min(1.75, Math.pow(liveBpmRef.current / 120, 0.5)));
      const inc = BASE_INCREMENT * speedMult;
      radarAngleRef.current += inc;
      const radarAngle = radarAngleRef.current;

      // Radar grid — concentric rings + radial spokes forming mesh
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.08)`;
      ctx.lineWidth = 0.6;
      for (let ring = 1; ring <= 4; ring++) {
        ctx.beginPath();
        ctx.arc(cx, cy, maxR * (ring / 4), 0, Math.PI * 2);
        ctx.stroke();
      }
      for (let s = 0; s < 12; s++) {
        const ang = (s / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(ang) * maxR, cy + Math.sin(ang) * maxR);
        ctx.stroke();
      }

      // Radar wake — smooth conic gradient (slice fallback for older WebKit)
      // Use typeof check cast through unknown to prevent TS narrowing else to never
      // (TS DOM lib declares createConicGradient so 'in' narrows else to never)
      const wakeArc = Math.PI * 0.6;
      const wFrac = wakeArc / (Math.PI * 2);
      if (typeof (ctx as unknown as Record<string, unknown>).createConicGradient === 'function') {
        const grad = ctx.createConicGradient(radarAngle - wakeArc, cx, cy);
        grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
        grad.addColorStop(wFrac, `rgba(${r}, ${g}, ${b}, 0.13)`);
        grad.addColorStop(Math.min(wFrac + 0.01, 1), `rgba(${r}, ${g}, ${b}, 0)`);
        grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, maxR, radarAngle - wakeArc, radarAngle);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
      } else {
        // Fallback: 120 slices (sub-pixel steps, effectively smooth)
        for (let t = 0; t < 120; t++) {
          const frac = t / 120;
          const a0 = radarAngle - wakeArc + frac * wakeArc;
          const a1 = radarAngle - wakeArc + (frac + 1 / 120) * wakeArc;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, maxR, a0, a1);
          ctx.closePath();
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.12 * Math.pow(frac, 1.3)})`;
          ctx.fill();
        }
      }

      // Active scan line
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(radarAngle) * maxR, cy + Math.sin(radarAngle) * maxR);
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.55)`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Scatter dots — light up when swept, then fade slowly (~4 s)
      for (const d of dotsRef.current) {
        const diff = ((radarAngle - Math.atan2(d.y - cy, d.x - cx)) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        if (diff < 0.12) d.a = 0.85;
        d.a *= 0.985;
        if (d.a > 0.02) {
          ctx.beginPath();
          ctx.arc(d.x, d.y, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${d.a})`;
          ctx.fill();
        }
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }}
    />
  );
}
