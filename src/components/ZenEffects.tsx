import { useEffect, useRef } from "react";
import type { BeatEvent } from "../types";

export type ZenStyle = "focus" | "pulse" | "gravity" | "sweep" | "cosmos" | "warp" | "rain";

interface ZenEffectsProps {
  style: ZenStyle;
  currentBeat: BeatEvent | null;
  isPlaying: boolean;
  activeTab: "beat" | "drill";
  beatsPerMeasure: number;
}

export function ZenEffects({ style, currentBeat, isPlaying, activeTab, beatsPerMeasure }: ZenEffectsProps) {
  if (style === "focus") return null;
  if (style === "pulse") return <PulseEffect />;
  if (style === "gravity") return <GravityEffect currentBeat={currentBeat} isPlaying={isPlaying} activeTab={activeTab} />;
  if (style === "sweep") return <SweepEffect currentBeat={currentBeat} isPlaying={isPlaying} activeTab={activeTab} beatsPerMeasure={beatsPerMeasure} />;
  if (style === "cosmos") return <CosmosEffect currentBeat={currentBeat} isPlaying={isPlaying} />;
  if (style === "warp") return <WarpEffect currentBeat={currentBeat} isPlaying={isPlaying} />;
  if (style === "rain") return <RainEffect currentBeat={currentBeat} isPlaying={isPlaying} />;
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

// ─── GRAVITY DROP ───────────────────────────────────────────────────────────
// Drops fall from top of screen, timed to HIT each beat dot exactly on accent
function GravityEffect({ currentBeat, isPlaying }: { currentBeat: BeatEvent | null; isPlaying: boolean; activeTab: "beat" | "drill" }) {
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
function SweepEffect({ currentBeat, isPlaying, activeTab: _activeTab, beatsPerMeasure }: { currentBeat: BeatEvent | null; isPlaying: boolean; activeTab: "beat" | "drill"; beatsPerMeasure: number }) {
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

// ─── WARP (Portal Tunnel) ───────────────────────────────────────────────────
interface Portal {
  z: number;
  sides: number; // 3=triangle, 4=square, 5=pentagon, 6=hexagon, 0=circle
  rotation: number;
  offsetX: number;
  offsetY: number;
  hueShift: number;
  size: number;
  isDownbeat: boolean;
}

function WarpEffect({ currentBeat, isPlaying }: { currentBeat: BeatEvent | null; isPlaying: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const portalsRef = useRef<Portal[]>([]);
  const prevBeatRef = useRef(-1);
  const timeRef = useRef(0);
  const speedRef = useRef(1);
  const wanderRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!isPlaying || !currentBeat) return;
    if (currentBeat.beat === prevBeatRef.current && currentBeat.subdivision === (currentBeat as any).prevSub) return;
    prevBeatRef.current = currentBeat.beat;

    if (!currentBeat.isDownbeat) return;

    // Spawn portal on beat
    const shapes = [0, 3, 4, 5, 6, 8]; // circle, triangle, square, pentagon, hexagon, octagon
    const sides = shapes[Math.floor(Math.random() * shapes.length)];
    const wander = wanderRef.current;

    // Portal spawns at current camera look direction + small random offset for variety
    portalsRef.current.push({
      z: 800,
      sides,
      rotation: Math.random() * Math.PI * 2,
      offsetX: wander.x + (Math.random() - 0.5) * 0.15,
      offsetY: wander.y + (Math.random() - 0.5) * 0.1,
      hueShift: Math.random() * 40 - 20,
      size: currentBeat.isDownbeat ? 1.3 : 1.0,
      isDownbeat: true,
    });

    // Speed pulse on beat
    speedRef.current = 2.5;
  }, [currentBeat, isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);

    const focalLength = 300;

    const drawPolygon = (cx: number, cy: number, radius: number, sides: number, rotation: number) => {
      if (sides === 0) {
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        return;
      }
      for (let i = 0; i < sides; i++) {
        const angle = rotation + (Math.PI * 2 * i) / sides - Math.PI / 2;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      timeRef.current++;

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const accent = getAccentColor();
      const { r, g, b } = hexToRgb(accent);

      // Ease speed back to base
      speedRef.current += (1 - speedRef.current) * 0.03;
      const speed = speedRef.current;

      // Continuous winding path — layered sine waves for organic movement
      const t = timeRef.current;
      const wanderX = Math.sin(t * 0.003) * 0.6 + Math.sin(t * 0.0071) * 0.3 + Math.cos(t * 0.0023) * 0.2;
      const wanderY = Math.cos(t * 0.004) * 0.4 + Math.sin(t * 0.0059) * 0.25 + Math.cos(t * 0.0017) * 0.15;
      wanderRef.current = { x: wanderX, y: wanderY };

      // Only animate when playing
      if (!isPlaying) {
        // Clear remaining portals and show empty canvas
        if (portalsRef.current.length > 0) portalsRef.current = [];
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      // Update and draw portals (back to front for depth order)
      const portals = portalsRef.current;
      portals.sort((a, b) => b.z - a.z);

      for (let i = portals.length - 1; i >= 0; i--) {
        const p = portals[i];
        p.z -= 4 * speed;
        p.rotation += 0.003;

        if (p.z <= 1) {
          portals.splice(i, 1);
          continue;
        }

        const scale = focalLength / p.z;
        // Camera wanders — portal screen position = (portal world offset - current camera offset) * perspective
        const cameraX = wanderX;
        const cameraY = wanderY;
        const screenX = cx + (p.offsetX - cameraX) * focalLength * scale * 1.5;
        const screenY = cy + (p.offsetY - cameraY) * focalLength * scale * 1.5;
        const baseRadius = 180 * p.size;
        const radius = baseRadius * scale;

        // Opacity: faint in distance, bright close, fade out at very close
        let alpha: number;
        if (p.z > 600) {
          alpha = ((800 - p.z) / 200) * 0.4;
        } else if (p.z < 50) {
          alpha = (p.z / 50) * 0.8;
        } else {
          alpha = 0.15 + (1 - p.z / 600) * 0.65;
        }

        // Hue shift based on depth
        const depthHue = p.hueShift + (1 - p.z / 800) * 15;
        const rr = Math.min(255, Math.max(0, r + depthHue));
        const gg = Math.min(255, Math.max(0, g + depthHue * 0.5));
        const bb = Math.min(255, Math.max(0, b - depthHue * 0.3));

        // Outer glow layer
        if (p.z < 400) {
          ctx.beginPath();
          drawPolygon(screenX, screenY, radius * 1.15, p.sides, p.rotation);
          ctx.strokeStyle = `rgba(${rr}, ${gg}, ${bb}, ${alpha * 0.15})`;
          ctx.lineWidth = radius * 0.08;
          ctx.stroke();
        }

        // Main portal ring
        ctx.beginPath();
        drawPolygon(screenX, screenY, radius, p.sides, p.rotation);
        ctx.strokeStyle = `rgba(${rr}, ${gg}, ${bb}, ${alpha})`;
        ctx.lineWidth = Math.max(1, 2.5 * scale * (p.isDownbeat ? 1.5 : 1));
        ctx.stroke();

        // Inner edge highlight
        if (p.z < 300) {
          ctx.beginPath();
          drawPolygon(screenX, screenY, radius * 0.92, p.sides, p.rotation + 0.02);
          ctx.strokeStyle = `rgba(${rr}, ${gg}, ${bb}, ${alpha * 0.3})`;
          ctx.lineWidth = Math.max(0.5, 1 * scale);
          ctx.stroke();
        }
      }

      // Subtle center vanishing point glow
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, 60);
      gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.06)`);
      gradient.addColorStop(1, "transparent");
      ctx.fillStyle = gradient;
      ctx.fillRect(cx - 60, cy - 60, 120, 120);

      // Speed lines near edges when moving fast
      if (speed > 1.3) {
        const lineAlpha = (speed - 1.3) * 0.3;
        const lineCount = 8;
        for (let i = 0; i < lineCount; i++) {
          const angle = (Math.PI * 2 * i) / lineCount + timeRef.current * 0.01;
          const innerR = 150 + Math.random() * 50;
          const outerR = innerR + 80 + (speed - 1) * 100;
          const x1 = cx + Math.cos(angle) * innerR;
          const y1 = cy + Math.sin(angle) * innerR;
          const x2 = cx + Math.cos(angle) * outerR;
          const y2 = cy + Math.sin(angle) * outerR;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${lineAlpha * 0.3})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener("resize", resize); };
  }, [isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}

// ─── RAIN ───────────────────────────────────────────────────────────────────
interface RainDrop {
  x: number;       // screen x
  y: number;       // current y position
  speed: number;   // fall speed (faster = closer)
  length: number;  // streak length
  opacity: number;
  depth: number;   // 0 = far, 1 = close (controls size, speed, landing y)
}

interface Splash {
  x: number;
  y: number;
  age: number;
  maxAge: number;
  depth: number;   // affects splash size
  rings: number;
}

function RainEffect({ currentBeat, isPlaying }: { currentBeat: BeatEvent | null; isPlaying: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const dropsRef = useRef<RainDrop[]>([]);
  const splashesRef = useRef<Splash[]>([]);
  const prevBeatRef = useRef(-1);
  const intensityRef = useRef(1);
  const beatSplashRef = useRef(false);

  // Beat pulse — briefly increase rain intensity + trigger ground splashes
  useEffect(() => {
    if (!isPlaying || !currentBeat) return;
    if (currentBeat.beat === prevBeatRef.current) return;
    prevBeatRef.current = currentBeat.beat;
    intensityRef.current = currentBeat.isDownbeat ? 3.5 : 2.0;
    beatSplashRef.current = true; // signal to spawn beat splashes on next frame
  }, [currentBeat, isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);

    // Ground plane: the "floor" is a perspective plane from ~60% to 95% of screen height
    // Far horizon at 60%, close ground at 95%
    const getGroundY = (depth: number, h: number) => {
      // depth 0 = far (horizon), depth 1 = close (bottom)
      return h * (0.55 + depth * 0.4);
    };

    const spawnDrop = (w: number, h: number): RainDrop => {
      const depth = Math.random(); // 0=far, 1=close
      const depthScale = 0.3 + depth * 0.7; // far drops are smaller/slower
      return {
        x: Math.random() * w,
        y: -Math.random() * h * 0.4, // start above screen
        speed: (3 + depth * 8) * depthScale,
        length: (10 + depth * 28) * depthScale,
        opacity: (0.15 + depth * 0.4),
        depth,
      };
    };

    const spawnSplash = (x: number, y: number, depth: number): Splash => ({
      x, y,
      age: 0,
      maxAge: 20 + depth * 15,
      depth,
      rings: depth > 0.6 ? 3 : 2,
    });

    // Pre-populate drops
    for (let i = 0; i < 60; i++) {
      const d = spawnDrop(canvas.width, canvas.height);
      d.y = Math.random() * canvas.height; // scatter initial positions
      dropsRef.current.push(d);
    }

    const animate = () => {
      const w = canvas.width;
      const h = canvas.height;

      // Semi-transparent clear for subtle trail effect
      ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
      ctx.fillRect(0, 0, w, h);

      const accent = getAccentColor();
      const { r, g, b } = hexToRgb(accent);

      // Ease intensity back to baseline
      intensityRef.current += (1 - intensityRef.current) * 0.04;
      const intensity = intensityRef.current;

      // Beat splash — spawn several ground splashes on beat hit
      if (beatSplashRef.current) {
        beatSplashRef.current = false;
        const numSplashes = intensity > 2.5 ? 8 : 5; // more on downbeat
        for (let i = 0; i < numSplashes; i++) {
          const depth = 0.3 + Math.random() * 0.7;
          const x = Math.random() * w;
          const y = getGroundY(depth, h);
          splashesRef.current.push({
            x, y,
            age: 0,
            maxAge: 25 + depth * 20,
            depth,
            rings: 3,
          });
        }
      }

      // Spawn new drops based on intensity
      const spawnRate = Math.floor(1.5 * intensity);
      if (isPlaying) {
        for (let i = 0; i < spawnRate; i++) {
          if (dropsRef.current.length < 120) {
            dropsRef.current.push(spawnDrop(w, h));
          }
        }
      }

      // Update and draw drops
      const drops = dropsRef.current;
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.y += d.speed;

        // Ground level for this drop's depth
        const groundY = getGroundY(d.depth, h);

        // Has it hit the ground?
        if (d.y >= groundY) {
          // Spawn splash at ground level
          splashesRef.current.push(spawnSplash(d.x, groundY, d.depth));

          if (isPlaying) {
            // Reset drop
            d.y = -Math.random() * 50;
            d.x = Math.random() * w;
            const newDepth = Math.random();
            const depthScale = 0.3 + newDepth * 0.7;
            d.depth = newDepth;
            d.speed = (3 + newDepth * 8) * depthScale;
            d.length = (10 + newDepth * 28) * depthScale;
            d.opacity = (0.15 + newDepth * 0.4);
          } else {
            drops.splice(i, 1);
          }
          continue;
        }

        // Draw rain streak — slight angle for realism
        const angle = 0.03 + d.depth * 0.02; // very slight wind
        const x2 = d.x + Math.sin(angle) * d.length;
        const y2 = d.y - d.length;

        // Color: use accent color directly, lighten for visibility
        const whiten = (1 - d.depth) * 0.3; // far drops slightly whiter
        const rr = Math.min(255, r + (255 - r) * (0.3 + whiten));
        const gg = Math.min(255, g + (255 - g) * (0.3 + whiten));
        const bb = Math.min(255, b + (255 - b) * (0.3 + whiten));

        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = `rgba(${rr}, ${gg}, ${bb}, ${d.opacity})`;
        ctx.lineWidth = 0.5 + d.depth * 1.2;
        ctx.stroke();
      }

      // Update and draw splashes
      const splashes = splashesRef.current;
      for (let i = splashes.length - 1; i >= 0; i--) {
        const s = splashes[i];
        s.age++;

        if (s.age > s.maxAge) {
          splashes.splice(i, 1);
          continue;
        }

        const progress = s.age / s.maxAge;
        const fadeAlpha = 1 - progress;
        const scale = 0.4 + s.depth * 0.6; // far splashes are smaller

        // Draw expanding ripple rings
        for (let ring = 0; ring < s.rings; ring++) {
          const ringDelay = ring * 0.2;
          const ringProgress = Math.max(0, progress - ringDelay) / (1 - ringDelay);
          if (ringProgress <= 0 || ringProgress >= 1) continue;

          const maxRadius = (8 + s.depth * 18) * scale;
          const radius = ringProgress * maxRadius;
          const ringAlpha = (1 - ringProgress) * fadeAlpha * 0.6;

          // Elliptical splash — squished vertically for perspective
          const ySquish = 0.3 + (1 - s.depth) * 0.2; // far splashes more squished

          ctx.beginPath();
          ctx.ellipse(s.x, s.y, radius, radius * ySquish, 0, 0, Math.PI * 2);
          const sr = Math.min(255, r + (255 - r) * 0.4);
          const sg = Math.min(255, g + (255 - g) * 0.4);
          const sb = Math.min(255, b + (255 - b) * 0.4);
          ctx.strokeStyle = `rgba(${sr}, ${sg}, ${sb}, ${ringAlpha})`;
          ctx.lineWidth = (1.5 - ringProgress) * scale;
          ctx.stroke();
        }

        // Small upward droplet particles on impact (close drops only)
        if (s.depth > 0.5 && s.age < 6) {
          const numDroplets = 2 + Math.floor(s.depth * 3);
          for (let d = 0; d < numDroplets; d++) {
            const dropAngle = (Math.PI * 2 * d) / numDroplets + s.x * 0.1;
            const dropDist = s.age * (1.5 + s.depth);
            const dropX = s.x + Math.cos(dropAngle) * dropDist * scale;
            const dropY = s.y - Math.abs(Math.sin(dropAngle)) * dropDist * 1.5 * scale + s.age * 0.3; // gravity
            const dropAlpha = (1 - s.age / 6) * 0.5;

            ctx.beginPath();
            ctx.arc(dropX, dropY, 0.8 * scale, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(180, 200, 230, ${dropAlpha})`;
            ctx.fill();
          }
        }
      }

      // Subtle ground mist/reflection near bottom
      const mistGradient = ctx.createLinearGradient(0, h * 0.85, 0, h);
      mistGradient.addColorStop(0, "transparent");
      mistGradient.addColorStop(1, `rgba(${r * 0.3 + 50}, ${g * 0.3 + 60}, ${b * 0.2 + 80}, 0.03)`);
      ctx.fillStyle = mistGradient;
      ctx.fillRect(0, h * 0.85, w, h * 0.15);

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener("resize", resize); };
  }, [isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}
