import { useEffect, useRef } from "react";
import type { BeatEvent } from "../../../types";
import { getAccentColor, hexToRgb } from "./helpers";

interface Dot {
  angle: number;
  r: number;
  speed: number;
  size: number;
  alpha: number;
}

/**
 * Gravity zen effect — 150 dots orbit the screen center at varying radii,
 * directions, and speeds, resembling a gravitational particle field.
 *
 * Orbital speed scales with live BPM (sqrt curve, clamped 0.5×–1.75×).
 * On each beat all dots receive a brief brightness/size pulse that decays
 * over ~30 frames; downbeats produce a stronger pulse than regular beats.
 *
 * Live BPM is measured from beat intervals, smoothed with an EMA.
 */
export function GravityEffect({ currentBeat, isPlaying, activeTab: _activeTab }: { currentBeat: BeatEvent | null; isPlaying: boolean; activeTab: "beat" | "drill" | "jam" }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const dotsRef = useRef<Dot[]>([]);
  const beatPulseRef = useRef(0);
  const prevBeatRef = useRef(-1);
  const lastBeatTimeRef = useRef(0);
  const liveBpmRef = useRef(120);

  // Beat pulse + BPM measurement
  useEffect(() => {
    if (!isPlaying || !currentBeat) return;
    if (currentBeat.beat === prevBeatRef.current) return;
    prevBeatRef.current = currentBeat.beat;

    beatPulseRef.current = currentBeat.isDownbeat ? 1.0 : 0.6;

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
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const maxR = Math.hypot(Math.max(cx, canvas.width - cx), Math.max(cy, canvas.height - cy));
      dotsRef.current = Array.from({ length: 100 }, () => ({
        angle: Math.random() * Math.PI * 2,
        r: 30 + Math.random() * maxR,
        speed: (0.0018 + Math.random() * 0.005) * (Math.random() < 0.5 ? 1 : -1),
        size: 1 + Math.random() * 2.5,
        alpha: 0.2 + Math.random() * 0.5,
      }));
    };

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initDots();
    };
    resize();
    window.addEventListener("resize", resize);

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const accent = getAccentColor();
      const { r, g, b } = hexToRgb(accent);

      beatPulseRef.current *= 0.92;
      const pulse = beatPulseRef.current;

      // sqrt-clamped speed multiplier
      const speedMult = Math.max(0.5, Math.min(1.75, Math.pow(liveBpmRef.current / 120, 0.5)));

      for (const d of dotsRef.current) {
        d.angle += d.speed * speedMult;
        const px = cx + Math.cos(d.angle) * d.r;
        const py = cy + Math.sin(d.angle) * d.r;
        const drawSize = d.size * (1 + pulse * 0.6);
        const drawAlpha = Math.min(1, d.alpha + pulse * 0.3);

        ctx.beginPath();
        ctx.arc(px, py, drawSize, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${drawAlpha})`;
        ctx.fill();
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
