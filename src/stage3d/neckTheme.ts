/**
 * The neck's colours, from the theme (art direction "A, graphic", 2026-11-17).
 *
 * The neck is a flat UI surface in the theme's own colours: nothing on it is a
 * fixed colour. Every value here is derived from the theme's CSS tokens, read
 * at runtime from the document root, and a theme change is noticed (the root's
 * `style` and `data-theme` change) and handed on, so the 3D neck, the SVG
 * fallback and the overview strip repaint without a rebuild.
 *
 * The derivation is the designer's (`.preview/neck-style/README.md`):
 *
 * | part            | dark theme                         | light theme                      |
 * |-----------------|------------------------------------|----------------------------------|
 * | board           | mix(bg-card, accent, 7%)           | mix(bg-card, bg-primary, 25%)    |
 * | edge hairline   | text-primary at 10%                | text-primary at 22%              |
 * | frets           | mix(board, text-primary, 46%)      | the same at 45%                  |
 * | nut             | text-primary                       | text-primary                     |
 * | plain strings   | mix(board, text-secondary, 92%)    | the same at 95%                  |
 * | wound strings   | plain mixed 35% toward the accent  |                                  |
 * | inlays          | mix(board, text-primary, 22%)      | the same at 17%                  |
 * | fret numbers    | marker frets text-primary, bold, an accent dot under; others text-faint |
 * | now / next      | accent fill / accent ring on the board colour                         |
 * | played on time  | --neck-hit (defaults to --feedback-perfect)                            |
 * | played off      | --neck-miss (a real red: --feedback-miss is a grey in every theme)     |
 * | shadow          | one soft black shadow under the board, dark themes only               |
 *
 * A theme may override the board, the frets, the strings and the hit colour
 * (`NECK_OVERRIDES`); everything else follows from those.
 *
 * No three.js here: the fallback and the strip use it too.
 */
import { useSyncExternalStore } from "react";
import { OPTIONAL_TOKENS } from "../themes";
import type { NeckKind } from "./api";

export type NeckPalette = {
  dark: boolean;
  /** The page behind the neck, flattened (a gradient's stops averaged). */
  bg: string;
  board: string;
  edge: string;
  fret: string;
  nut: string;
  string: string;
  wound: string;
  inlay: string;
  /** Marker fret numbers. */
  num: string;
  /** The other fret numbers. */
  numFaint: string;
  accent: string;
  accentInk: string;
  /** NOW's edge: the ink on a dark theme, the paper on a light one. */
  nowEdge: string;
  hit: string;
  hitInk: string;
  miss: string;
  missInk: string;
  /** The quiet shape's outline (the rest of the pattern), and its ink. */
  ghost: string;
  ghostInk: string;
  /** Even quieter: places that are only context. */
  dim: string;
  /** NOW's glow, as an alpha of the accent. */
  glowA: number;
  /** The backdrop's pool of accent light behind the neck, as an alpha. */
  poolA: number;
  /** The board's shadow, as an alpha of black (0 on light themes). */
  shadowA: number;
  /** The theme's number face (`--font-num`): fret numbers and the notes' numerals. */
  numFont: string;
};

/** Optional per-theme overrides, read when a theme sets them. */
export const NECK_OVERRIDES = OPTIONAL_TOKENS;

// ─── colour arithmetic ───

type RGB = [number, number, number];
const HEX6 = /#([0-9a-f]{6})\b/gi;
const HEX3 = /^#([0-9a-f]{3})$/i;
const RGBA = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)/i;

function hexRGB(h: string): RGB {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
}
export function toHex(c: RGB): string {
  return "#" + c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("");
}
export function mix(a: string, b: string, t: number): string {
  const A = hexRGB(a);
  const B = hexRGB(b);
  return toHex(A.map((x, i) => x + (B[i] - x) * t) as RGB);
}

/**
 * A token's value as one opaque `#rrggbb`. A gradient is the average of its
 * stops; a translucent colour is painted over `base` at its own alpha.
 */
export function solid(value: string, base = "#000000"): string {
  const v = value.trim();
  const m3 = v.match(HEX3);
  if (m3) return "#" + [...m3[1]].map((c) => c + c).join("").toLowerCase();
  const rgba = v.match(RGBA);
  if (rgba && !/gradient/i.test(v)) {
    const rgb = [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])] as RGB;
    let a = rgba[4] === undefined ? 1 : rgba[4].endsWith("%") ? parseFloat(rgba[4]) / 100 : Number(rgba[4]);
    if (!Number.isFinite(a)) a = 1;
    return mix(base, toHex(rgb), a);
  }
  const hexes = [...v.matchAll(HEX6)].map((m) => "#" + m[1].toLowerCase());
  if (hexes.length) {
    const sum = hexes.map(hexRGB).reduce((s, c) => s.map((x, i) => x + c[i]) as RGB, [0, 0, 0] as RGB);
    return toHex(sum.map((x) => x / hexes.length) as RGB);
  }
  return base;
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const c = hexRGB(hex).map((x) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** Hue in degrees, or null for a grey. */
export function hue(hex: string): number | null {
  const [r, g, b] = hexRGB(hex).map((x) => x / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 0.08) return null;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/** The ink for a numeral on a filled disc: near-black on a light fill, white on a dark one. */
function inkOn(fill: string): string {
  return luminance(fill) > 0.2 ? mix(fill, "#000000", 0.86) : "#ffffff";
}

// ─── the palette ───

/** Defaults for the two tokens a theme may not have yet (an older build's store). */
const MISS_DARK = "#ff5d6c";
const MISS_LIGHT = "#b3261e";
export const DEFAULT_NUM_FONT = '"Barlow Condensed","Arial Narrow",system-ui,sans-serif';

/**
 * The palette for a theme, given a reader of its tokens (`--name` to its raw
 * value, "" when unset) and whether it is a light theme.
 */
export function paletteFrom(read: (name: string) => string, light: boolean): NeckPalette {
  const get = (n: string) => read(n).trim();
  const dark = !light;
  const bgRaw = get("--bg-primary") || (dark ? "#110d0a" : "#faf8f2");
  const bg = solid(bgRaw);
  const flat = (n: string, fallback: string) => solid(get(n) || fallback, bg);
  const card = flat("--bg-card", bg);
  const ink = flat("--text-primary", dark ? "#f5ece2" : "#1e1b16");
  const ink2 = flat("--text-secondary", ink);
  const faint = flat("--text-faint", ink2);
  const accent = flat("--accent", dark ? "#ff7a3c" : "#725207");
  const accentInk = flat("--accent-text", inkOn(accent));
  const over = (n: string) => (get(n) ? solid(get(n), bg) : null);

  const board = over("--neck-board") ?? (dark ? mix(card, accent, 0.07) : mix(card, bg, 0.25));
  const fret = over("--neck-fret") ?? mix(board, ink, dark ? 0.46 : 0.45);
  const string = over("--neck-string") ?? mix(board, ink2, dark ? 0.92 : 0.95);
  const wound = mix(mix(board, string, 0.92), accent, 0.35);
  const hit = over("--neck-hit") ?? flat("--feedback-perfect", "#5fd08a");
  const miss = flat("--neck-miss", dark ? MISS_DARK : MISS_LIGHT);
  return {
    dark,
    bg,
    board,
    edge: mix(board, ink, dark ? 0.1 : 0.22),
    fret,
    nut: ink,
    string,
    wound,
    inlay: mix(board, ink, dark ? 0.22 : 0.17),
    num: ink,
    numFaint: faint,
    accent,
    accentInk,
    nowEdge: dark ? ink : bg,
    hit,
    hitInk: inkOn(hit),
    miss,
    missInk: inkOn(miss),
    ghost: mix(board, ink, 0.35),
    ghostInk: mix(board, ink, 0.7),
    dim: mix(board, ink, 0.2),
    glowA: dark ? 0.45 : 0.28,
    poolA: dark ? 0.08 : 0.05,
    shadowA: dark ? 0.45 : 0,
    numFont: get("--font-num") || DEFAULT_NUM_FONT,
  };
}

/** The palette of the theme on the document root now. */
export function readNeckPalette(root: HTMLElement | null = typeof document !== "undefined" ? document.documentElement : null): NeckPalette {
  if (!root) return paletteFrom(() => "", false);
  const cs = getComputedStyle(root);
  const read = (n: string) => root.style.getPropertyValue(n) || cs.getPropertyValue(n);
  const group = root.dataset.themeGroup;
  const light = group ? group === "light" : luminance(solid(read("--bg-primary") || "#000000")) > 0.4;
  return paletteFrom(read, light);
}

// ─── the markers ───

export type NoteLook = {
  fill: string;
  /** Outline colour, or null for none. */
  stroke: string | null;
  /** Outline width, as a fraction of the drawn radius. */
  strokeW: number;
  /** The numeral or letter on it. */
  ink: string;
  /** The drawn circle's radius, as a fraction of the marker's radius (the quiet shape is smaller). */
  size: number;
  /** NOW carries a soft accent glow. */
  glow: boolean;
};

/**
 * How each kind of marker looks, the same on the 3D neck, the fallback and the
 * strip (the mock's tokens): NOW solid accent with an edge and a glow, NEXT an
 * accent ring on the board, played on time and off as solid hit and miss, the
 * rest of the shape a quiet outline. Late and missed are both "off" (red), as
 * in the mock's legend.
 */
export function noteLook(kind: NeckKind, p: NeckPalette): NoteLook {
  switch (kind) {
    case "now":
      return { fill: p.accent, stroke: p.nowEdge, strokeW: 0.085, ink: p.accentInk, size: 1, glow: true };
    case "next":
      return { fill: p.board, stroke: p.accent, strokeW: 0.13, ink: p.accent, size: 1, glow: false };
    case "aim":
      return { fill: p.accent, stroke: null, strokeW: 0, ink: p.accentInk, size: 1, glow: false };
    case "tone":
      return { fill: p.hit, stroke: null, strokeW: 0, ink: p.hitInk, size: 1, glow: false };
    case "tens":
    case "clash":
      return { fill: p.miss, stroke: null, strokeW: 0, ink: p.missInk, size: 1, glow: false };
    case "dim":
      return { fill: p.board, stroke: p.dim, strokeW: 0.1, ink: p.ghost, size: 0.72, glow: false };
    case "box":
    default:
      return { fill: p.board, stroke: p.ghost, strokeW: 0.11, ink: p.ghostInk, size: 0.72, glow: false };
  }
}

// ─── live: the palette as an external store ───

let current: NeckPalette | null = null;
let currentKey = "";
const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;

function refresh(): void {
  const next = readNeckPalette();
  const key = JSON.stringify(next);
  if (key === currentKey) return;
  current = next;
  currentKey = key;
  listeners.forEach((l) => l());
}

/** The palette now (cached; refreshed when the theme changes). */
export function neckPalette(): NeckPalette {
  if (!current) {
    current = readNeckPalette();
    currentKey = JSON.stringify(current);
  }
  return current;
}

/** Called whenever the palette changes (a theme change). Returns the unsubscribe. */
export function subscribeNeckPalette(cb: () => void): () => void {
  listeners.add(cb);
  if (!observer && typeof MutationObserver !== "undefined" && typeof document !== "undefined") {
    observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "data-theme", "data-theme-group"] });
  }
  return () => {
    listeners.delete(cb);
    if (!listeners.size && observer) {
      observer.disconnect();
      observer = null;
      current = null;
      currentKey = "";
    }
  };
}

/** The palette, in React: re-renders on a theme change. */
export function useNeckPalette(): NeckPalette {
  return useSyncExternalStore(subscribeNeckPalette, neckPalette, neckPalette);
}
