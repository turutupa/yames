/**
 * The few small canvas textures the flat neck still uses: the soft glow, the
 * note discs and the numerals. Nothing is downloaded and nothing is slow:
 * the wood, pearl and winding textures went with the realistic neck
 * (art direction "A, graphic", 2026-11-17), and with them the "warming up"
 * wait they cost at load.
 *
 * Part of the lazy chunk: imported by `engine.ts` and `guitar.ts` only.
 */
import * as THREE from "three";
import type { NoteLook } from "../neckTheme";

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function tex(c: HTMLCanvasElement): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A radial gradient, white with the given alphas: tinted by the material's colour. */
export function radial(stops: Array<[number, string]>, size = 256): THREE.Texture {
  const c = canvas(size, size);
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => r.addColorStop(o, col));
  g.fillStyle = r;
  g.fillRect(0, 0, size, size);
  return tex(c);
}

/** A flat note disc: one fill, an optional outline drawn inside the edge. */
const discCache = new Map<string, THREE.Texture>();
export function noteDisc(look: NoteLook): THREE.Texture {
  const k = `${look.fill}|${look.stroke}|${look.strokeW}|${look.size}`;
  const hit = discCache.get(k);
  if (hit) return hit;
  const S = 192;
  const c = canvas(S, S);
  const g = c.getContext("2d")!;
  const m = S / 2;
  const R = S * 0.47 * look.size;
  const lw = look.stroke ? R * look.strokeW : 0;
  g.fillStyle = look.fill;
  g.beginPath();
  g.arc(m, m, R - lw / 2, 0, 7);
  g.fill();
  if (look.stroke && lw > 0) {
    g.strokeStyle = look.stroke;
    g.lineWidth = lw;
    g.beginPath();
    g.arc(m, m, R - lw / 2, 0, 7);
    g.stroke();
  }
  const t = tex(c);
  discCache.set(k, t);
  return t;
}

/**
 * A numeral or a note's letter, in the theme's condensed face. `dot` puts an
 * accent dot under it (the marker frets' numbers).
 */
const labelCache = new Map<string, THREE.Texture>();
/** The theme's number face (`--font-num`, themes.ts), read when a label is drawn. */
function numFace(): string {
  try {
    const face = getComputedStyle(document.documentElement).getPropertyValue("--font-num").trim();
    if (face) return face;
  } catch {
    /* no document (a worker, a test) */
  }
  return '"Barlow Condensed","Arial Narrow",system-ui,sans-serif';
}

/**
 * A marker's number. `dot`: a small dot under it in that colour (the fret
 * numbers' marked frets). `bar`: a short bar under it in the number's own ink,
 * the shift mark (`NeckNote.shift`): the hand moves on this note.
 */
export function noteLabel(text: string, color: string, weight = 700, dot: string | null = null, bar = false): THREE.Texture {
  const face = numFace();
  const k = `${text}\u0000${color}\u0000${weight}\u0000${dot}\u0000${face}\u0000${bar}`;
  const hit = labelCache.get(k);
  if (hit) return hit;
  const S = 192;
  const c = canvas(S, S);
  const g = c.getContext("2d")!;
  g.fillStyle = color;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `${weight} ${text.length > 1 ? 96 : 118}px ${face}`;
  g.fillText(text, S / 2, S / 2 + (bar ? -4 : 6));
  if (bar) {
    // Under the digit, inside the disc: wide enough to see on a quiet dot, short enough not to read as a fret.
    g.fillRect(S / 2 - 30, S / 2 + 56, 60, 15);
  }
  if (dot) {
    g.fillStyle = dot;
    g.beginPath();
    g.arc(S / 2, S / 2 + 70, 9, 0, 7);
    g.fill();
  }
  const t = tex(c);
  labelCache.set(k, t);
  return t;
}

/** Drop every cached disc and label (on unmount, after a lost context, and on a theme change). */
export function clearCaches(): void {
  labelCache.forEach((t) => t.dispose());
  labelCache.clear();
  discCache.forEach((t) => t.dispose());
  discCache.clear();
}
