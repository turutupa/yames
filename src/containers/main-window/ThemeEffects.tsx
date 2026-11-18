import { useEffect, useRef } from "react";
import type { BeatEvent } from "../../types";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  hue: number;
  ripple: number;
  depth: number; // 0 = far background, 1 = foreground
}

const PARTICLE_THEMES: Record<string, { hues: number[]; count: number; blend: string; particleLightness: number; particleBaseOpacity: number }> = {
  aurora: { hues: [190, 210, 280], count: 85, blend: "screen", particleLightness: 70, particleBaseOpacity: 0.3 },
  prism:  { hues: [330, 280, 200, 30], count: 90, blend: "multiply", particleLightness: 45, particleBaseOpacity: 0.6 },
};

export function ThemeEffects({ themeId, currentBeat, isPlaying }: { themeId: string; currentBeat: BeatEvent | null; isPlaying: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -200, y: -200 });
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef(0);
  const prevBeatRef = useRef(-1);
  const config = PARTICLE_THEMES[themeId];

  // Beat pulse — trigger ripple on downbeats
  useEffect(() => {
    if (!config || !isPlaying || !currentBeat) return;
    if (!currentBeat.isDownbeat) return;
    if (currentBeat.beat === prevBeatRef.current) return;
    prevBeatRef.current = currentBeat.beat;
    for (const p of particlesRef.current) {
      p.ripple = 0.3 + Math.random() * 0.25;
    }
  }, [currentBeat, isPlaying, config]);

  // Track mouse
  useEffect(() => {
    if (!config) return;
    const handleMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    const handleLeave = () => {
      mouseRef.current = { x: -200, y: -200 };
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseleave", handleLeave);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseleave", handleLeave);
    };
  }, [config]);

  // Canvas animation
  useEffect(() => {
    if (!config) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const makeParticle = (xRange: [number, number], yRange: [number, number]): Particle => ({
      x: xRange[0] + Math.random() * (xRange[1] - xRange[0]),
      y: yRange[0] + Math.random() * (yRange[1] - yRange[0]),
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      size: Math.random() * 4 + 1.5,
      opacity: Math.random() * config.particleBaseOpacity + config.particleBaseOpacity * 0.3,
      hue: config.hues[Math.floor(Math.random() * config.hues.length)],
      ripple: 0,
      depth: Math.random(),
    });

    const TARGET_DENSITY = config.count / (window.innerWidth * window.innerHeight);

    const resize = () => {
      const prevW = canvas.width;
      const prevH = canvas.height;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      const targetCount = Math.round(canvas.width * canvas.height * TARGET_DENSITY);

      if (particlesRef.current.length < targetCount) {
        const count = targetCount - particlesRef.current.length;
        for (let i = 0; i < count; i++) {
          if (canvas.width > prevW && Math.random() < 0.5) {
            particlesRef.current.push(makeParticle([prevW, canvas.width], [0, canvas.height]));
          } else {
            particlesRef.current.push(makeParticle([0, canvas.width], [prevH, canvas.height]));
          }
        }
      } else if (particlesRef.current.length > targetCount) {
        particlesRef.current.length = targetCount;
      }
    };
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    window.addEventListener("resize", resize);

    // Init particles
    particlesRef.current = Array.from({ length: config.count }, () =>
      makeParticle([0, canvas.width], [0, canvas.height])
    );

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const { x: mx, y: my } = mouseRef.current;

      // Particles with depth layering — no cursor glow, just proximity lighting
      for (const p of particlesRef.current) {
        const depthScale = 0.25 + p.depth * 0.75; // 0.25–1.0

        p.x += p.vx * depthScale;
        p.y += p.vy * depthScale;

        // Wrap around
        if (p.x < -10) p.x = canvas.width + 10;
        if (p.x > canvas.width + 10) p.x = -10;
        if (p.y < -10) p.y = canvas.height + 10;
        if (p.y > canvas.height + 10) p.y = -10;

        // Gentle sway
        p.vx += (Math.random() - 0.5) * 0.008;
        p.vy += (Math.random() - 0.5) * 0.008;
        p.vx = Math.max(-0.35, Math.min(0.35, p.vx));
        p.vy = Math.max(-0.35, Math.min(0.35, p.vy));

        // Proximity boost: particles near cursor get brighter (no glow halo)
        const dx = p.x - mx;
        const dy = p.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const boost = dist < 160 ? (1 - dist / 160) * 0.5 * depthScale : 0;
        const beatPulse = p.ripple > 0.02 ? p.ripple : 0;
        const beatLight = config.particleLightness + beatPulse * 15;
        const alpha = Math.min(1, (p.opacity * depthScale) + boost + beatPulse * 0.2);
        const drawSize = (p.size * depthScale) + boost * 2;

        // Core particle
        ctx.beginPath();
        ctx.arc(p.x, p.y, drawSize, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 85%, ${beatLight}%, ${alpha})`;
        ctx.fill();

        // Subtle glow ring
        if (alpha > 0.25) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, drawSize * 3 + boost * 3, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${p.hue}, 85%, ${beatLight}%, ${alpha * 0.12})`;
          ctx.fill();
        }

        // Beat ripple ring
        if (p.ripple > 0.02) {
          const rippleRadius = drawSize + (12 * depthScale * (1 - p.ripple));
          ctx.beginPath();
          ctx.arc(p.x, p.y, rippleRadius, 0, Math.PI * 2);
          ctx.strokeStyle = `hsla(${p.hue}, 85%, ${config.particleLightness}%, ${p.ripple * 0.3 * depthScale})`;
          ctx.lineWidth = 0.7 * depthScale;
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
  }, [config]);

  if (!config) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: -1,
        pointerEvents: "none",
        mixBlendMode: config.blend as any,
      }}
    />
  );
}
