import { useEffect, useRef } from "react";
import type { BeatEvent } from "../types";

export type ZenStyle = "focus" | "pulse" | "gravity" | "sweep" | "cosmos";

interface ZenEffectsProps {
  style: ZenStyle;
  currentBeat: BeatEvent | null;
  isPlaying: boolean;
  activeTab: "beat" | "train";
  beatsPerMeasure: number;
}

export function ZenEffects({ style, currentBeat, isPlaying, activeTab, beatsPerMeasure }: ZenEffectsProps) {
  if (style === "focus") return null;
  if (style === "pulse") return <PulseEffect />;
  if (style === "gravity") return <GravityEffect currentBeat={currentBeat} isPlaying={isPlaying} activeTab={activeTab} />;
  if (style === "sweep") return <SweepEffect currentBeat={currentBeat} isPlaying={isPlaying} activeTab={activeTab} beatsPerMeasure={beatsPerMeasure} />;
  if (style === "cosmos") return <CosmosEffect currentBeat={currentBeat} isPlaying={isPlaying} />;
  return null;
}

// ─── PULSE ──────────────────────────────────────────────────────────────────
function PulseEffect() {
  return <div className="zen-pulse" />;
}

// ─── HELPERS ────────────────────────────────────────────────────────────────
function getAccentColor() {
  return getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#e94560";
}
function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
function getCy(canvas: HTMLCanvasElement, activeTab: "beat" | "train") {
  return activeTab === "train" ? canvas.height * 0.35 : canvas.height * 0.45;
}

// ─── GRAVITY DROP ───────────────────────────────────────────────────────────
// Drops fall from top of screen, timed to HIT each beat dot exactly on accent
function GravityEffect({ currentBeat, isPlaying }: { currentBeat: BeatEvent | null; isPlaying: boolean; activeTab: "beat" | "train" }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const prevBeatRef = useRef({ beat: -1, sub: -1 });
  const dropsRef = useRef<Array<{ x: number; y: number; vy: number; targetY: number; landed: boolean; isAccent: boolean }>>([]);
  const splashRef = useRef<Array<{ x: number; y: number; vx: number; vy: number; alpha: number; size: number }>>([]);
  const lastBeatTimeRef = useRef(0);
  const beatIntervalRef = useRef(0); // ms between beats
  const firstBeatRef = useRef(true);

  useEffect(() => {
    if (!isPlaying || !currentBeat) return;
    if (currentBeat.beat === prevBeatRef.current.beat && currentBeat.subdivision === prevBeatRef.current.sub) return;
    prevBeatRef.current = { beat: currentBeat.beat, sub: currentBeat.subdivision };

    if (!currentBeat.isDownbeat) return;

    const now = performance.now();
    const dots = document.querySelectorAll(".fs-beat");
    if (!dots.length) return;
    const beatsPerMeasure = dots.length;
    const beatIdx = currentBeat.beat % beatsPerMeasure;

    // Measure beat interval
    if (lastBeatTimeRef.current > 0) {
      beatIntervalRef.current = now - lastBeatTimeRef.current;
    }
    lastBeatTimeRef.current = now;

    // On this beat: spawn immediate splash on current dot (the drop "arrived")
    // Skip splash on very first beat since no drop was pre-spawned
    if (!firstBeatRef.current) {
      const dot = dots[beatIdx] as HTMLElement;
      if (dot) {
        const rect = dot.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const isAccent = beatIdx === 0;
        const strength = isAccent ? 1.0 : 0.6;
        const count = isAccent ? 10 : 7;
        for (let i = 0; i < count; i++) {
          const angle = -Math.PI * (0.1 + Math.random() * 0.8);
          const speed = 2 + Math.random() * 4.5 * strength;
          splashRef.current.push({
            x: cx + (Math.random() - 0.5) * 6,
            y: cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            alpha: 0.75 + Math.random() * 0.25,
            size: 2.5 + Math.random() * 3 * strength,
          });
        }
      }
    }
    firstBeatRef.current = false;

    // Pre-spawn drop for the NEXT beat — calculate velocity to arrive in one beat interval
    if (beatIntervalRef.current > 0) {
      const nextBeatIdx = (beatIdx + 1) % beatsPerMeasure;
      const nextDot = dots[nextBeatIdx] as HTMLElement;
      if (nextDot) {
        const rect = nextDot.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const targetY = rect.top + rect.height / 2;
        const startY = -20;
        const distance = targetY - startY;

        // Physics: distance = vy * frames + 0.5 * gravity * frames^2
        // Solve for vy: vy = (distance - 0.5 * g * f^2) / f
        const gravity = 0.4; // reduced gravity for longer graceful fall
        const frames = (beatIntervalRef.current / 1000) * 60; // convert ms to frames at 60fps
        const vy = (distance - 0.5 * gravity * frames * frames) / frames;

        dropsRef.current.push({
          x: cx,
          y: startY,
          vy: Math.max(vy, 1), // ensure positive initial velocity
          targetY,
          landed: false,
          isAccent: nextBeatIdx === 0,
        });
      }
    }
  }, [currentBeat, isPlaying]);

  // Reset on stop
  useEffect(() => {
    if (!isPlaying) {
      firstBeatRef.current = true;
      lastBeatTimeRef.current = 0;
      beatIntervalRef.current = 0;
      dropsRef.current = [];
      splashRef.current = [];
    }
  }, [isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);

    const gravity = 0.4; // must match the gravity used in velocity calc

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const accent = getAccentColor();
      const { r, g, b } = hexToRgb(accent);

      // Update and draw drops
      const aliveDrops: typeof dropsRef.current = [];
      for (const drop of dropsRef.current) {
        if (!drop.landed) {
          drop.vy += gravity;
          drop.y += drop.vy;

          if (drop.y >= drop.targetY) {
            drop.y = drop.targetY;
            drop.landed = true;
            // Splash is triggered by the beat event, not here
          } else {
            aliveDrops.push(drop);
          }

          // Draw falling drop
          if (!drop.landed) {
            const radius = drop.isAccent ? 8 : 6;
            ctx.beginPath();
            ctx.arc(drop.x, drop.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.85)`;
            ctx.fill();

            // Trail streak
            const trailLen = Math.min(drop.vy * 1.2, 30);
            const grad = ctx.createLinearGradient(drop.x, drop.y - trailLen, drop.x, drop.y);
            grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
            grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.4)`);
            ctx.beginPath();
            ctx.moveTo(drop.x - radius * 0.4, drop.y);
            ctx.lineTo(drop.x - radius * 0.2, drop.y - trailLen);
            ctx.lineTo(drop.x + radius * 0.2, drop.y - trailLen);
            ctx.lineTo(drop.x + radius * 0.4, drop.y);
            ctx.fillStyle = grad;
            ctx.fill();
          }
        }
      }
      dropsRef.current = aliveDrops;

      // Draw and update splash particles
      const aliveSplash: typeof splashRef.current = [];
      for (const sp of splashRef.current) {
        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.vy += 0.2;
        sp.alpha *= 0.92;
        sp.size *= 0.96;

        if (sp.alpha > 0.02 && sp.size > 0.3) {
          aliveSplash.push(sp);
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, sp.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${sp.alpha})`;
          ctx.fill();
        }
      }
      splashRef.current = aliveSplash;

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener("resize", resize); };
  }, []);

  return <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }} />;
}

// ─── CLOCK SWEEP ────────────────────────────────────────────────────────────
// A radius line sweeps around center, one revolution per measure
function SweepEffect({ currentBeat, isPlaying, activeTab, beatsPerMeasure }: { currentBeat: BeatEvent | null; isPlaying: boolean; activeTab: "beat" | "train"; beatsPerMeasure: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const prevBeatRef = useRef(-1);
  const angleRef = useRef(-Math.PI / 2);
  const targetAngleRef = useRef(-Math.PI / 2);
  const glowRef = useRef(0);

  useEffect(() => {
    if (!isPlaying || !currentBeat) return;
    if (currentBeat.beat === prevBeatRef.current) return;
    prevBeatRef.current = currentBeat.beat;

    // Always advance forward — compute the next target as the smallest forward step
    const beatInMeasure = currentBeat.beat % beatsPerMeasure;
    const beatAngle = -Math.PI / 2 + (beatInMeasure / beatsPerMeasure) * Math.PI * 2;

    // Normalize current target to find forward distance
    const currentNorm = targetAngleRef.current % (Math.PI * 2);
    let forwardDiff = beatAngle - currentNorm;
    // Ensure always moves forward (clockwise)
    if (forwardDiff <= 0.01) forwardDiff += Math.PI * 2;
    targetAngleRef.current += forwardDiff;

    glowRef.current = currentBeat.isDownbeat ? 1.0 : 0.5;
  }, [currentBeat, isPlaying, beatsPerMeasure]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const accent = getAccentColor();
      const { r, g, b } = hexToRgb(accent);
      const radius = Math.min(canvas.width, canvas.height) * 0.32;

      // Smooth interpolation — always forward
      angleRef.current += (targetAngleRef.current - angleRef.current) * 0.15;

      const angle = angleRef.current;
      const endX = cx + Math.cos(angle) * radius;
      const endY = cy + Math.sin(angle) * radius;

      // Trail arc
      const trailLength = Math.PI * 0.3;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, angle - trailLength, angle);
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.1)`;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Main line
      const lineAlpha = 0.2 + glowRef.current * 0.4;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(endX, endY);
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${lineAlpha})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Dot at end
      ctx.beginPath();
      ctx.arc(endX, endY, 3.5 + glowRef.current * 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.4 + glowRef.current * 0.5})`;
      ctx.fill();

      // Glow on accent
      if (glowRef.current > 0.05) {
        ctx.beginPath();
        ctx.arc(endX, endY, 12 + glowRef.current * 10, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${glowRef.current * 0.15})`;
        ctx.fill();
      }

      // Subtle circle outline
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.04)`;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Beat markers
      for (let i = 0; i < beatsPerMeasure; i++) {
        const a = -Math.PI / 2 + (i / beatsPerMeasure) * Math.PI * 2;
        const mx = cx + Math.cos(a) * radius;
        const my = cy + Math.sin(a) * radius;
        ctx.beginPath();
        ctx.arc(mx, my, i === 0 ? 3 : 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${i === 0 ? 0.3 : 0.1})`;
        ctx.fill();
      }

      glowRef.current *= 0.92;
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener("resize", resize); };
  }, [beatsPerMeasure]);

  return <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }} />;
}

// ─── COSMOS ─────────────────────────────────────────────────────────────────
function CosmosEffect({ currentBeat, isPlaying }: { currentBeat: BeatEvent | null; isPlaying: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -300, y: -300 });
  const particlesRef = useRef<Array<{
    x: number; y: number; vx: number; vy: number;
    size: number; opacity: number; hue: number;
    ripple: number; // 0-1, decays after accent
  }>>([]);
  const rafRef = useRef(0);
  const prevBeatRef = useRef(-1);

  useEffect(() => {
    if (!isPlaying || !currentBeat) return;
    if (!currentBeat.isDownbeat) return;
    if (currentBeat.beat === prevBeatRef.current) return;
    prevBeatRef.current = currentBeat.beat;
    for (const p of particlesRef.current) {
      p.ripple = 0.3 + Math.random() * 0.25;
    }
  }, [currentBeat, isPlaying]);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
    const handleLeave = () => { mouseRef.current = { x: -300, y: -300 }; };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseleave", handleLeave);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseleave", handleLeave);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);

    const getAccentHue = () => {
      const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
      const hex = accent.replace("#", "");
      if (hex.length < 6) return 200;
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      let h = 0;
      if (max !== min) {
        const d = max - min;
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        else if (max === g) h = ((b - r) / d + 2) * 60;
        else h = ((r - g) / d + 4) * 60;
      }
      return Math.round(h);
    };

    const baseHue = getAccentHue();
    const hues = [baseHue, (baseHue + 30) % 360, (baseHue + 330) % 360];

    particlesRef.current = Array.from({ length: 35 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      size: Math.random() * 2.5 + 1,
      opacity: Math.random() * 0.4 + 0.1,
      hue: hues[Math.floor(Math.random() * hues.length)],
      ripple: 0,
    }));

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const { x: mx, y: my } = mouseRef.current;

      // Cursor glow
      if (mx > 0 && my > 0) {
        const gradient = ctx.createRadialGradient(mx, my, 0, mx, my, 180);
        const accentColor = getComputedStyle(document.documentElement).getPropertyValue("--accent-glow").trim() || "rgba(233, 69, 96, 0.3)";
        gradient.addColorStop(0, accentColor);
        gradient.addColorStop(1, "transparent");
        ctx.fillStyle = gradient;
        ctx.fillRect(mx - 180, my - 180, 360, 360);
      }

      // Particles with accent ripples
      for (const p of particlesRef.current) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -10) p.x = canvas.width + 10;
        if (p.x > canvas.width + 10) p.x = -10;
        if (p.y < -10) p.y = canvas.height + 10;
        if (p.y > canvas.height + 10) p.y = -10;
        p.vx += (Math.random() - 0.5) * 0.008;
        p.vy += (Math.random() - 0.5) * 0.008;
        p.vx = Math.max(-0.35, Math.min(0.35, p.vx));
        p.vy = Math.max(-0.35, Math.min(0.35, p.vy));

        const dx = p.x - mx;
        const dy = p.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const boost = dist < 160 ? (1 - dist / 160) * 0.5 : 0;
        const alpha = Math.min(1, p.opacity + boost);

        // Core particle
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size + boost * 2, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 80%, 65%, ${alpha})`;
        ctx.fill();

        // Soft glow
        if (alpha > 0.25) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 3 + boost * 3, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${p.hue}, 80%, 65%, ${alpha * 0.12})`;
          ctx.fill();
        }

        // Accent ripple ring around particle
        if (p.ripple > 0.02) {
          const rippleRadius = p.size + (12 * (1 - p.ripple));
          ctx.beginPath();
          ctx.arc(p.x, p.y, rippleRadius, 0, Math.PI * 2);
          ctx.strokeStyle = `hsla(${p.hue}, 80%, 65%, ${p.ripple * 0.3})`;
          ctx.lineWidth = 0.7;
          ctx.stroke();
          p.ripple *= 0.91;
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
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        mixBlendMode: "screen",
      }}
    />
  );
}
