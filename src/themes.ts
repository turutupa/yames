/**
 * Yames Theme System
 *
 * Each theme defines a complete visual identity: backgrounds, text, accents,
 * glows, borders, and optional font overrides. Themes apply to both the main
 * window and the floating widget.
 */

/**
 * Every variable a theme must define. The revamp's stylesheets read these by
 * name, so a theme that omits one paints with whatever `global.css` last set —
 * which is the previous theme's value, not a sane default. `themes.test.ts`
 * asserts this list against every theme; that test is the contract.
 */
export const TOKEN_CONTRACT = [
  "--bg-primary",
  "--bg-secondary",
  "--bg-card",
  // Opaque stand-ins for panels full of text: equal to the three above on a
  // solid theme; Aurora and Prism paint a gradient behind see-through cards.
  "--bg-solid",
  "--bg-card-solid",
  "--bg-raised-solid",
  "--bg-panel",
  "--bg-raised",
  "--bg-widget",
  "--accent",
  "--accent-glow",
  "--accent-glow-strong",
  "--accent-subtle",
  "--accent-subtle-hover",
  "--accent-text",
  "--accent-2",
  "--accent-2-subtle",
  "--accent-2-text",
  "--beat-accent",
  "--text-primary",
  "--text-secondary",
  "--text-tertiary",
  "--text-muted",
  "--text-faint",
  "--border",
  "--surface-hover",
  "--surface-active",
  "--shadow",
  "--font-family",
  /**
   * The learning side's three faces (owner, 2026-11-17: the stage's fonts did
   * not follow the theme). Display: titles, labels, the big numbers. Body:
   * prose, readable in this theme (a mono theme keeps a sans body and wears
   * its mono on the labels). Num: fret numbers and clocks, a face with
   * tabular figures.
   */
  "--font-display",
  /** Big prose headlines (Today's, a result's): Fraunces in the learning side's own design. */
  "--font-heading",
  "--font-body",
  "--font-num",
  "--font-weight",
  "--radius",
  "--radius-sm",
  "--feedback-perfect",
  "--feedback-good",
  "--feedback-ok",
  "--feedback-miss",
  "--neck-miss",
] as const;

/**
 * Variables a theme MAY define, each with a derived default when it does not:
 * the neck's own colours (`src/stage3d/neckTheme.ts`). Only for a theme where
 * the derivation looks off: `--neck-hit` is set where `--feedback-perfect` is
 * not a green, or is too close to the accent to tell a played note from NOW.
 * `applyTheme` clears the ones a theme leaves out, so a value never leaks
 * from the previous theme.
 */
export const OPTIONAL_TOKENS = [
  "--neck-board",
  "--neck-fret",
  "--neck-string",
  "--neck-hit",
  /**
   * How the big headlines (Today's, a Path's, a result's) are set in this
   * theme's heading face. The defaults suit a text face (Fraunces, Inter):
   * weight 500, tight tracking, sizes as drawn. A condensed face (Ember's
   * Barlow Condensed) wants more weight, almost no negative tracking (its
   * letters already sit close) and a little more size, or its headlines look
   * thin and small next to the clocks set in the same face.
   */
  "--heading-weight",
  /** A multiplier on each headline's negative letter-spacing (1 = as drawn). */
  "--heading-tracking",
  /** A multiplier on each headline's size (1 = as drawn). */
  "--heading-scale",
] as const;

export interface Theme {
  id: string;
  name: string;
  group: "dark" | "light";
  /** 3 representative colors: bg-primary, bg-card, accent */
  preview: string[];
  vars: Record<string, string>;
}

/**
 * A note on the colours below, because most of them were set by measurement
 * rather than by eye.
 *
 * The owner, twice: "the light themes all need every text element and the
 * sketched metronome its contrast increased, its hard to read." The first
 * pass raised the quiet text until it measured 4.5:1 against `--bg-primary`,
 * which is why it did not take — text does not only sit on the page. The same
 * ink lands on `--bg-card`, on `--bg-raised` under the meter popover, and on
 * `--bg-panel`, and on a light theme those are much darker than the page. Ink
 * tuned to exactly 4.5:1 on paper measured 3.3:1 on a card. `--text-muted`
 * had never been in the assertion at all and was the worst of the lot, down
 * at 1.35:1 on Sand.
 *
 * So every ink token here — the five text levels, both accents and the four
 * feedback colours — clears 4.5:1 against every surface its theme can paint,
 * gradient stops and translucent panels included, and the five text levels
 * are spaced roughly 6.6 / 5.6 / 5.0 / 4.7 against the worst of those
 * surfaces so they still read as a hierarchy rather than four greys. Hue and
 * saturation were held and only lightness moved, so the themes keep their
 * character; where a straight lightness walk produced something garish the
 * value was hand-picked instead. `themes.test.ts` holds all of it.
 *
 * Two light accents changed character rather than just depth, because there
 * was no darkness of hot pink or antique gold that was both legible as ink
 * and legible under white: Prism's #ff3d8a is now a deep raspberry and
 * Ivory's #b8860b a dark bronze. Velvet kept a violet close to its old one
 * but wears its own near-black as button ink instead of white.
 */

// ---------------------------------------------------------------------------
// DARK THEMES
// ---------------------------------------------------------------------------

const mono: Theme = {
  id: "mono",
  name: "Mono",
  group: "dark",
  preview: ["#121212", "#242424", "#d4d4d4"],
  vars: {
    "--bg-primary": "#121212",
    "--bg-secondary": "#1a1a1a",
    "--bg-card": "#242424",
    "--bg-solid": "#121212",
    "--bg-card-solid": "#242424",
    "--bg-raised-solid": "#2e2e2e",
    "--bg-panel": "#161616",
    "--bg-raised": "#2e2e2e",
    "--bg-widget": "linear-gradient(135deg, #121212, #1a1a1a)",
    "--accent": "#d4d4d4",
    "--accent-glow": "rgba(212, 212, 212, 0.2)",
    "--accent-glow-strong": "rgba(212, 212, 212, 0.35)",
    "--accent-subtle": "rgba(212, 212, 212, 0.08)",
    "--accent-subtle-hover": "rgba(212, 212, 212, 0.14)",
    "--accent-text": "#121212",
    "--accent-2": "#8f9dc4",
    "--accent-2-subtle": "rgba(143, 157, 196, 0.12)",
    "--accent-2-text": "#121212",
    "--beat-accent": "#ffffff",
    "--text-primary": "#e0e0e0",
    "--text-secondary": "#b5b5b5",
    "--text-muted": "#9d9d9d",
    "--text-tertiary": "#a7a7a7",
    "--text-faint": "#989898",
    "--border": "rgba(255, 255, 255, 0.06)",
    "--surface-hover": "rgba(255, 255, 255, 0.04)",
    "--surface-active": "rgba(255, 255, 255, 0.08)",
    "--shadow": "0 8px 32px rgba(0, 0, 0, 0.5)",
    "--font-family": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    "--font-display": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    "--font-heading": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    "--font-body": "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    "--font-num": "'Inter', system-ui, sans-serif",
    "--font-weight": "400",
    "--radius": "4px",
    "--radius-sm": "3px",
    "--feedback-perfect": "#10b981",
    "--feedback-good": "#06b6d4",
    "--feedback-ok": "#f59e0b",
    "--feedback-miss": "#9399a4",
    "--neck-miss": "#ff5d6c",
    // A grey accent on a grey board: the strings step down to a mid grey so
    // NOW, the one white thing on the neck, is the loudest (no mock for Mono).
    "--neck-string": "#8c8c8c",
  },
};

const obsidian: Theme = {
  id: "obsidian",
  name: "Obsidian",
  group: "dark",
  preview: ["#0a0a0a", "#1f1f1f", "#f59e0b"],
  vars: {
    "--bg-primary": "#0a0a0a",
    "--bg-secondary": "#151515",
    "--bg-card": "#1f1f1f",
    "--bg-solid": "#0a0a0a",
    "--bg-card-solid": "#1f1f1f",
    "--bg-raised-solid": "#292929",
    "--bg-panel": "#101010",
    "--bg-raised": "#292929",
    "--bg-widget": "linear-gradient(135deg, #0a0a0a, #151515)",
    "--accent": "#f59e0b",
    "--accent-glow": "rgba(245, 158, 11, 0.3)",
    "--accent-glow-strong": "rgba(245, 158, 11, 0.5)",
    "--accent-subtle": "rgba(245, 158, 11, 0.1)",
    "--accent-subtle-hover": "rgba(245, 158, 11, 0.2)",
    "--accent-text": "#0a0a0a",
    "--accent-2": "#60a5fa",
    "--accent-2-subtle": "rgba(96, 165, 250, 0.12)",
    "--accent-2-text": "#0a0a0a",
    "--beat-accent": "#fde68a",
    "--text-primary": "#e5e5e5",
    "--text-secondary": "#afafaf",
    "--text-muted": "#989898",
    "--text-tertiary": "#a1a1a1",
    "--text-faint": "#939393",
    "--border": "rgba(255, 255, 255, 0.06)",
    "--surface-hover": "rgba(245, 158, 11, 0.06)",
    "--surface-active": "rgba(245, 158, 11, 0.12)",
    "--shadow": "0 8px 32px rgba(0, 0, 0, 0.6)",
    "--font-family": "'SF Mono', 'Fira Code', 'JetBrains Mono', monospace",
    "--font-display": "'JetBrains Mono', 'SF Mono', 'Fira Code', 'Cascadia Mono', Consolas, ui-monospace, monospace",
    "--font-heading": "'JetBrains Mono', 'SF Mono', 'Fira Code', 'Cascadia Mono', Consolas, ui-monospace, monospace",
    "--font-body": "'Inter', system-ui, sans-serif",
    "--font-num": "'JetBrains Mono', 'SF Mono', 'Fira Code', 'Cascadia Mono', Consolas, ui-monospace, monospace",
    "--font-weight": "400",
    "--radius": "6px",
    "--radius-sm": "4px",
    "--feedback-perfect": "#22c55e",
    "--feedback-good": "#eab308",
    "--feedback-ok": "#f97316",
    "--feedback-miss": "#8c939f",
    "--neck-miss": "#ff5d6c",
    // JetBrains Mono is a wide face: at the sizes drawn for a text face its
    // headlines wrapped where no other theme's did ("Arpeggios over Changes",
    // the wizard's primary button). A little smaller and set closer.
    "--heading-scale": "0.9",
    "--heading-tracking": "2.2",
  },
};

const velvet: Theme = {
  id: "velvet",
  name: "Velvet",
  group: "dark",
  preview: ["#110b1e", "#271c42", "#ab87f8"],
  vars: {
    "--bg-primary": "#110b1e",
    "--bg-secondary": "#1c1232",
    "--bg-card": "#271c42",
    "--bg-solid": "#110b1e",
    "--bg-card-solid": "#271c42",
    "--bg-raised-solid": "#322551",
    "--bg-panel": "#170f28",
    "--bg-raised": "#322551",
    "--bg-widget": "linear-gradient(135deg, #110b1e, #1c1232)",
    "--accent": "#ab87f8",
    "--accent-glow": "rgba(171, 135, 248, 0.3)",
    "--accent-glow-strong": "rgba(171, 135, 248, 0.5)",
    "--accent-subtle": "rgba(171, 135, 248, 0.1)",
    "--accent-subtle-hover": "rgba(171, 135, 248, 0.2)",
    "--accent-text": "#110b1e",
    "--accent-2": "#22d3ee",
    "--accent-2-subtle": "rgba(34, 211, 238, 0.12)",
    "--accent-2-text": "#0a1f24",
    "--beat-accent": "#ddd6fe",
    "--text-primary": "#e8e0f0",
    "--text-secondary": "#b8afcc",
    "--text-muted": "#a198b2",
    "--text-tertiary": "#aaa1ba",
    "--text-faint": "#9b94a8",
    "--border": "rgba(171, 135, 248, 0.08)",
    "--surface-hover": "rgba(171, 135, 248, 0.06)",
    "--surface-active": "rgba(171, 135, 248, 0.12)",
    "--shadow": "0 8px 32px rgba(0, 0, 0, 0.5)",
    "--font-family": "'Comfortaa', 'Nunito', system-ui, sans-serif",
    "--font-display": "'Comfortaa', 'Nunito', system-ui, sans-serif",
    "--font-heading": "'Comfortaa', 'Nunito', system-ui, sans-serif",
    // Comfortaa is the voice on titles and labels; a paragraph of it at 12 px
    // is hard going, so prose is Outfit, the round geometric sans Ember reads in.
    "--font-body": "'Outfit', 'Nunito', 'Segoe UI', system-ui, sans-serif",
    "--font-num": "'Barlow Condensed', 'Arial Narrow', system-ui, sans-serif",
    "--font-weight": "600",
    "--radius": "16px",
    "--radius-sm": "12px",
    // Was the accent's own violet, a shade from "good"'s periwinkle: on time
    // is a green here as it is on the neck, and the four grades tell apart.
    "--feedback-perfect": "#4ade80",
    "--feedback-good": "#838ef8",
    "--feedback-ok": "#f472b6",
    "--feedback-miss": "#9097a3",
    "--neck-miss": "#ff5d6c",
    "--neck-hit": "#4ade80",
    // Comfortaa runs wide: a touch smaller, so a Path's title keeps to the
    // one line it has in the other themes.
    "--heading-scale": "0.93",
  },
};

const neon: Theme = {
  id: "neon",
  name: "Neon",
  group: "dark",
  preview: ["#0c0c18", "#1c1c38", "#06b6d4"],
  vars: {
    "--bg-primary": "#0c0c18",
    "--bg-secondary": "#141428",
    "--bg-card": "#1c1c38",
    "--bg-solid": "#0c0c18",
    "--bg-card-solid": "#1c1c38",
    "--bg-raised-solid": "#26264a",
    "--bg-panel": "#121224",
    "--bg-raised": "#26264a",
    "--bg-widget": "linear-gradient(135deg, #0c0c18, #141428)",
    "--accent": "#06b6d4",
    "--accent-glow": "rgba(6, 182, 212, 0.3)",
    "--accent-glow-strong": "rgba(6, 182, 212, 0.5)",
    "--accent-subtle": "rgba(6, 182, 212, 0.1)",
    "--accent-subtle-hover": "rgba(6, 182, 212, 0.2)",
    "--accent-text": "#0c0c18",
    "--accent-2": "#dd5cf1",
    "--accent-2-subtle": "rgba(221, 92, 241, 0.14)",
    "--accent-2-text": "#14041a",
    "--beat-accent": "#d946ef",
    "--text-primary": "#e4e4f0",
    "--text-secondary": "#adadcd",
    "--text-muted": "#9696b3",
    "--text-tertiary": "#a0a0bb",
    "--text-faint": "#9292a4",
    "--border": "rgba(6, 182, 212, 0.1)",
    "--surface-hover": "rgba(6, 182, 212, 0.06)",
    "--surface-active": "rgba(6, 182, 212, 0.12)",
    "--shadow": "0 8px 32px rgba(0, 0, 0, 0.5)",
    // Inter throughout, not Orbitron (owner, 2026-11-18: "the colors weren't
    // so bad but I'd rather something more readable and simple"). Orbitron's
    // wide, squared digits were hard to tell apart on the neck's fingers, the
    // clocks and the BPM. Neon is its colours now, not a futuristic face.
    "--font-family": "'Inter', system-ui, sans-serif",
    "--font-display": "'Inter', system-ui, sans-serif",
    "--font-heading": "'Inter', system-ui, sans-serif",
    "--font-body": "'Inter', system-ui, sans-serif",
    "--font-num": "'Inter', system-ui, sans-serif",
    "--font-weight": "500",
    "--radius": "10px",
    "--radius-sm": "8px",
    "--feedback-perfect": "#22d3ee",
    "--feedback-good": "#a78bfa",
    "--feedback-ok": "#fb923c",
    "--feedback-miss": "#8d94a0",
    "--neck-miss": "#ff5d6c",
    "--neck-hit": "#4ade80",
  },
};

const aurora: Theme = {
  id: "aurora",
  name: "Aurora",
  group: "dark",
  preview: ["#0a0020", "#1a0a3a", "#00d4ff"],
  vars: {
    "--bg-primary": "linear-gradient(160deg, #0a0020 0%, #1a0a3a 35%, #002a3a 65%, #0a1a28 100%)",
    "--bg-secondary": "rgba(15, 8, 40, 0.85)",
    "--bg-card": "rgba(255, 255, 255, 0.05)",
    // Solid stand-ins for the gradient and the see-through cards: a panel
    // full of text needs an opaque surface (owner, 2026-11-17).
    "--bg-solid": "#0f0628",
    "--bg-card-solid": "#1c1240",
    "--bg-raised-solid": "#271b52",
    "--bg-panel": "rgba(10, 4, 32, 0.55)",
    "--bg-raised": "rgba(255, 255, 255, 0.09)",
    "--bg-widget": "linear-gradient(135deg, #0a0020, #1a0a3a, #002a3a)",
    "--accent": "#00d4ff",
    "--accent-glow": "rgba(0, 212, 255, 0.4)",
    "--accent-glow-strong": "rgba(0, 212, 255, 0.6)",
    "--accent-subtle": "rgba(0, 212, 255, 0.12)",
    "--accent-subtle-hover": "rgba(0, 212, 255, 0.22)",
    "--accent-text": "#0a0020",
    "--accent-2": "#d187f6",
    "--accent-2-subtle": "rgba(209, 135, 246, 0.14)",
    "--accent-2-text": "#10041c",
    "--beat-accent": "#bf5af2",
    "--text-primary": "#eef2ff",
    "--text-secondary": "#bdc2de",
    "--text-muted": "#a6a9c3",
    "--text-tertiary": "#afb3cc",
    "--text-faint": "#a0a3c1",
    "--border": "rgba(0, 212, 255, 0.12)",
    "--surface-hover": "rgba(0, 212, 255, 0.08)",
    "--surface-active": "rgba(0, 212, 255, 0.15)",
    "--shadow": "0 8px 32px rgba(0, 212, 255, 0.1), 0 2px 8px rgba(209, 135, 246, 0.08)",
    "--font-family": "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    "--font-display": "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    "--font-heading": "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    "--font-body": "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    "--font-num": "'Inter', system-ui, sans-serif",
    "--font-weight": "500",
    "--radius": "20px",
    "--radius-sm": "14px",
    "--feedback-perfect": "#34d399",
    "--feedback-good": "#67e8f9",
    "--feedback-ok": "#c48cfc",
    "--feedback-miss": "#a0a5b0",
    "--neck-miss": "#ff5d6c",
    "--neck-hit": "#4ade80",
  },
};

// ---------------------------------------------------------------------------
// LIGHT THEMES
// ---------------------------------------------------------------------------

const ivory: Theme = {
  id: "ivory",
  name: "Ivory",
  group: "light",
  preview: ["#faf8f2", "#e8e0c8", "#725207"],
  vars: {
    "--bg-primary": "#faf8f2",
    "--bg-secondary": "#f0ead6",
    "--bg-card": "#e8e0c8",
    "--bg-solid": "#faf8f2",
    "--bg-card-solid": "#e8e0c8",
    "--bg-raised-solid": "#ded4b8",
    "--bg-panel": "#f5f1e4",
    "--bg-raised": "#ded4b8",
    "--bg-widget": "linear-gradient(135deg, #faf8f2, #f0ead6)",
    "--accent": "#725207",
    "--accent-glow": "rgba(114, 82, 7, 0.25)",
    "--accent-glow-strong": "rgba(114, 82, 7, 0.4)",
    "--accent-subtle": "rgba(114, 82, 7, 0.1)",
    "--accent-subtle-hover": "rgba(114, 82, 7, 0.18)",
    "--accent-text": "#ffffff",
    "--accent-2": "#0d645e",
    "--accent-2-subtle": "rgba(13, 100, 94, 0.10)",
    "--accent-2-text": "#ffffff",
    "--beat-accent": "#8a6a0f",
    "--text-primary": "#2c2416",
    "--text-secondary": "#4d4230",
    "--text-muted": "#5e5442",
    "--text-tertiary": "#574d3b",
    "--text-faint": "#60584a",
    "--border": "rgba(44, 36, 22, 0.36)",
    "--surface-hover": "rgba(114, 82, 7, 0.06)",
    "--surface-active": "rgba(114, 82, 7, 0.12)",
    "--shadow": "0 8px 32px rgba(44, 36, 22, 0.1)",
    "--font-family": "'Georgia', 'Palatino', 'Times New Roman', serif",
    "--font-display": "'Fraunces', 'Georgia', 'Times New Roman', serif",
    "--font-heading": "'Fraunces', Georgia, 'Times New Roman', serif",
    "--font-body": "'Georgia', 'Palatino', 'Times New Roman', serif",
    "--font-num": "'Source Serif 4', Georgia, serif",
    "--font-weight": "500",
    "--radius": "14px",
    "--radius-sm": "10px",
    "--feedback-perfect": "#036648",
    "--feedback-good": "#056178",
    "--feedback-ok": "#874a04",
    "--feedback-miss": "#535a66",
    "--neck-miss": "#af2039",
  },
};

const arctic: Theme = {
  id: "arctic",
  name: "Arctic",
  group: "light",
  preview: ["#f0f4f8", "#cbd5e1", "#025380"],
  vars: {
    "--bg-primary": "#f0f4f8",
    "--bg-secondary": "#e2e8f0",
    "--bg-card": "#cbd5e1",
    "--bg-solid": "#f0f4f8",
    "--bg-card-solid": "#cbd5e1",
    "--bg-raised-solid": "#b9c6d6",
    "--bg-panel": "#e6edf4",
    "--bg-raised": "#b9c6d6",
    "--bg-widget": "linear-gradient(135deg, #f0f4f8, #e2e8f0)",
    "--accent": "#025380",
    "--accent-glow": "rgba(2, 83, 128, 0.2)",
    "--accent-glow-strong": "rgba(2, 83, 128, 0.35)",
    "--accent-subtle": "rgba(2, 83, 128, 0.08)",
    "--accent-subtle-hover": "rgba(2, 83, 128, 0.15)",
    "--accent-text": "#ffffff",
    "--accent-2": "#813b06",
    "--accent-2-subtle": "rgba(129, 59, 6, 0.10)",
    "--accent-2-text": "#ffffff",
    "--beat-accent": "#0369a1",
    "--text-primary": "#0f172a",
    "--text-secondary": "#313a48",
    "--text-muted": "#3f4c5f",
    "--text-tertiary": "#3b4552",
    "--text-faint": "#48505b",
    "--border": "rgba(15, 23, 42, 0.34)",
    "--surface-hover": "rgba(2, 83, 128, 0.05)",
    "--surface-active": "rgba(2, 83, 128, 0.1)",
    "--shadow": "0 8px 32px rgba(15, 23, 42, 0.08)",
    "--font-family": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    "--font-display": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    "--font-heading": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    "--font-body": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    "--font-num": "'Inter', system-ui, sans-serif",
    "--font-weight": "500",
    "--radius": "10px",
    "--radius-sm": "7px",
    "--feedback-perfect": "#085952",
    "--feedback-good": "#01547f",
    "--feedback-ok": "#8a3407",
    "--feedback-miss": "#425064",
    "--neck-miss": "#9a211a",
    "--neck-hit": "#15803d",
  },
};

const sand: Theme = {
  id: "sand",
  name: "Sand",
  group: "light",
  preview: ["#f5f0e8", "#d9cdba", "#7c360c"],
  vars: {
    "--bg-primary": "#f5f0e8",
    "--bg-secondary": "#e8dfd0",
    "--bg-card": "#d9cdba",
    "--bg-solid": "#f5f0e8",
    "--bg-card-solid": "#d9cdba",
    "--bg-raised-solid": "#cabca4",
    "--bg-panel": "#efe9de",
    "--bg-raised": "#cabca4",
    "--bg-widget": "linear-gradient(135deg, #f5f0e8, #e8dfd0)",
    "--accent": "#7c360c",
    "--accent-glow": "rgba(124, 54, 12, 0.2)",
    "--accent-glow-strong": "rgba(124, 54, 12, 0.35)",
    "--accent-subtle": "rgba(124, 54, 12, 0.08)",
    "--accent-subtle-hover": "rgba(124, 54, 12, 0.15)",
    "--accent-text": "#ffffff",
    "--accent-2": "#0b534e",
    "--accent-2-subtle": "rgba(11, 83, 78, 0.10)",
    "--accent-2-text": "#ffffff",
    "--beat-accent": "#845f02",
    "--text-primary": "#292524",
    "--text-secondary": "#373432",
    "--text-muted": "#4a4642",
    "--text-tertiary": "#433e3d",
    "--text-faint": "#4d4a47",
    "--border": "rgba(41, 37, 36, 0.39)",
    "--surface-hover": "rgba(124, 54, 12, 0.05)",
    "--surface-active": "rgba(124, 54, 12, 0.1)",
    "--shadow": "0 8px 32px rgba(41, 37, 36, 0.08)",
    "--font-family": "'Avenir Next', 'Avenir', -apple-system, sans-serif",
    "--font-display": "'Avenir Next Condensed', 'Avenir Next', 'Barlow Condensed', 'Arial Narrow', system-ui, sans-serif",
    "--font-heading": "'Avenir Next Condensed', 'Avenir Next', 'Barlow Condensed', 'Arial Narrow', system-ui, sans-serif",
    "--font-body": "'Avenir Next', 'Avenir', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    "--font-num": "'Barlow Condensed', 'Arial Narrow', system-ui, sans-serif",
    "--font-weight": "500",
    "--radius": "12px",
    "--radius-sm": "8px",
    "--feedback-perfect": "#0c5627",
    "--feedback-good": "#644402",
    "--feedback-ok": "#931818",
    "--feedback-miss": "#4e4946",
    "--neck-miss": "#911b33",
    "--heading-weight": "600",
    "--heading-tracking": "0.3",
    "--heading-scale": "1.04",
  },
};

const lavender: Theme = {
  id: "lavender",
  name: "Lavender",
  group: "light",
  preview: ["#f5f0ff", "#ddd3f5", "#5b21b6"],
  vars: {
    "--bg-primary": "#f5f0ff",
    "--bg-secondary": "#ede5ff",
    "--bg-card": "#ddd3f5",
    "--bg-solid": "#f5f0ff",
    "--bg-card-solid": "#ddd3f5",
    "--bg-raised-solid": "#cfc2ee",
    "--bg-panel": "#efe8fb",
    "--bg-raised": "#cfc2ee",
    "--bg-widget": "linear-gradient(135deg, #f5f0ff, #ede5ff)",
    "--accent": "#5b21b6",
    "--accent-glow": "rgba(91, 33, 182, 0.2)",
    "--accent-glow-strong": "rgba(91, 33, 182, 0.35)",
    "--accent-subtle": "rgba(91, 33, 182, 0.08)",
    "--accent-subtle-hover": "rgba(91, 33, 182, 0.15)",
    "--accent-text": "#ffffff",
    "--accent-2": "#0c5c56",
    "--accent-2-subtle": "rgba(12, 92, 86, 0.10)",
    "--accent-2-text": "#ffffff",
    "--beat-accent": "#7c3aed",
    "--text-primary": "#1e1338",
    "--text-secondary": "#413757",
    "--text-muted": "#554674",
    "--text-tertiary": "#4b4260",
    "--text-faint": "#564d6a",
    "--border": "rgba(30, 19, 56, 0.35)",
    "--surface-hover": "rgba(91, 33, 182, 0.05)",
    "--surface-active": "rgba(91, 33, 182, 0.1)",
    "--shadow": "0 8px 32px rgba(30, 19, 56, 0.08)",
    "--font-family": "'Quicksand', 'Nunito', system-ui, sans-serif",
    "--font-display": "'Quicksand', 'Nunito', system-ui, sans-serif",
    "--font-heading": "'Quicksand', 'Nunito', system-ui, sans-serif",
    "--font-body": "'Quicksand', 'Nunito', system-ui, sans-serif",
    "--font-num": "'Barlow Condensed', 'Arial Narrow', system-ui, sans-serif",
    "--font-weight": "600",
    "--radius": "18px",
    "--radius-sm": "12px",
    // Was the accent itself, so "on time" and "listening" read as any other
    // accented thing, next to an indigo "good": a green, AA on every surface.
    "--feedback-perfect": "#0f5d2d",
    "--feedback-good": "#4338ca",
    "--feedback-ok": "#86198f",
    "--feedback-miss": "#594a79",
    "--neck-miss": "#9f221b",
    "--neck-hit": "#15803d",
  },
};

const prism: Theme = {
  id: "prism",
  name: "Prism",
  group: "light",
  preview: ["#ffe0f0", "#e0d4ff", "#990049"],
  vars: {
    "--bg-primary": "linear-gradient(145deg, #ffe8f0 0%, #e8d8ff 40%, #d8f0ff 70%, #fff0e8 100%)",
    "--bg-secondary": "#f5e8ff",
    "--bg-card": "rgba(255, 255, 255, 0.6)",
    // Solid stand-ins for the gradient and the see-through cards: a panel
    // full of text needs an opaque surface (owner, 2026-11-17).
    "--bg-solid": "#f6ecff",
    "--bg-card-solid": "#fdf8ff",
    "--bg-raised-solid": "#ffffff",
    "--bg-panel": "rgba(255, 255, 255, 0.45)",
    "--bg-raised": "rgba(255, 255, 255, 0.78)",
    "--bg-widget": "linear-gradient(135deg, #ffe0f0, #e0d0ff, #d0f0ff)",
    "--accent": "#990049",
    "--accent-glow": "rgba(153, 0, 73, 0.3)",
    "--accent-glow-strong": "rgba(153, 0, 73, 0.45)",
    "--accent-subtle": "rgba(153, 0, 73, 0.1)",
    "--accent-subtle-hover": "rgba(153, 0, 73, 0.18)",
    "--accent-text": "#ffffff",
    "--accent-2": "#134fc5",
    "--accent-2-subtle": "rgba(19, 79, 197, 0.10)",
    "--accent-2-text": "#ffffff",
    "--beat-accent": "#a046f6",
    "--text-primary": "#1a1030",
    "--text-secondary": "#543973",
    "--text-muted": "#694b80",
    "--text-tertiary": "#5e4674",
    "--text-faint": "#6c4f87",
    "--border": "rgba(74, 32, 99, 0.38)",
    "--surface-hover": "rgba(153, 0, 73, 0.06)",
    "--surface-active": "rgba(153, 0, 73, 0.12)",
    "--shadow": "0 8px 32px rgba(160, 80, 200, 0.12), 0 2px 8px rgba(153, 0, 73, 0.08)",
    "--font-family": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    "--font-display": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    "--font-heading": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    "--font-body": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    "--font-num": "'Inter', system-ui, sans-serif",
    "--font-weight": "500",
    "--radius": "20px",
    "--radius-sm": "14px",
    // Was a magenta a shade from the accent: a green, as on the neck.
    "--feedback-perfect": "#10662f",
    "--feedback-good": "#7e22ce",
    "--feedback-ok": "#994104",
    "--feedback-miss": "#6e4e86",
    "--neck-miss": "#b3261e",
    "--neck-hit": "#15803d",
  },
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// REVAMP THEMES (UI_DECISIONS U5.3)
//
// Designed against the redesign rather than retro-fitted to it: each names a
// second accent for the coach, five text levels and five surfaces, so nothing
// falls back to a neighbour's value. Whether these replace the ten above, join
// them, or the ten get re-cut on the same contract is still open — the site
// currently sells "ten themes", so that decision is not only a code decision.
// ---------------------------------------------------------------------------

/** Studio hardware: cold graphite, one signal LED, hard corners. */
const ash: Theme = {
  id: "ash",
  name: "Ash",
  group: "dark",
  preview: ["#0e0f11", "#1a1d20", "#c3ec4f"],
  vars: {
    "--bg-primary": "#0e0f11",
    "--bg-secondary": "#141618",
    "--bg-card": "#1a1d20",
    "--bg-solid": "#0e0f11",
    "--bg-card-solid": "#1a1d20",
    "--bg-raised-solid": "#212528",
    "--bg-panel": "#111315",
    "--bg-raised": "#212528",
    "--bg-widget": "linear-gradient(135deg, #0e0f11, #141618)",
    "--accent": "#c3ec4f",
    "--accent-glow": "rgba(195, 236, 79, 0.28)",
    "--accent-glow-strong": "rgba(195, 236, 79, 0.45)",
    "--accent-subtle": "rgba(195, 236, 79, 0.10)",
    "--accent-subtle-hover": "rgba(195, 236, 79, 0.18)",
    "--accent-text": "#111404",
    "--accent-2": "#7aa2ff",
    "--accent-2-subtle": "rgba(122, 162, 255, 0.12)",
    "--accent-2-text": "#0b1020",
    "--beat-accent": "#e2f79a",
    "--text-primary": "#eceef0",
    "--text-secondary": "#c2c7cc",
    "--text-tertiary": "#9aa1a8",
    "--text-muted": "#8d949a",
    "--text-faint": "#888f94",
    "--border": "rgba(255, 255, 255, 0.07)",
    "--surface-hover": "rgba(255, 255, 255, 0.045)",
    "--surface-active": "rgba(255, 255, 255, 0.09)",
    "--shadow": "0 8px 32px rgba(0, 0, 0, 0.6)",
    "--font-family": "'Archivo', 'Segoe UI', system-ui, sans-serif",
    "--font-display": "'Archivo', 'Segoe UI', system-ui, sans-serif",
    "--font-heading": "'Archivo', 'Segoe UI', system-ui, sans-serif",
    "--font-body": "'Archivo', 'Segoe UI', system-ui, sans-serif",
    "--font-num": "'Archivo', system-ui, sans-serif",
    "--font-weight": "500",
    "--radius": "4px",
    "--radius-sm": "3px",
    "--feedback-perfect": "#4ade80",
    "--feedback-good": "#67e8f9",
    "--feedback-ok": "#fbbf24",
    "--feedback-miss": "#888e9c",
    "--neck-miss": "#ff5d6c",
  },
};

/** A valve amp in a dim room: warm brown-black, burnt orange, soft corners. */
const ember: Theme = {
  id: "ember",
  name: "Ember",
  group: "dark",
  preview: ["#110d0a", "#1e1712", "#ff7a3c"],
  vars: {
    "--bg-primary": "#110d0a",
    "--bg-secondary": "#17120e",
    "--bg-card": "#1e1712",
    "--bg-solid": "#110d0a",
    "--bg-card-solid": "#1e1712",
    "--bg-raised-solid": "#261e17",
    "--bg-panel": "#1a1410",
    "--bg-raised": "#261e17",
    "--bg-widget": "linear-gradient(135deg, #110d0a, #1e1712)",
    "--accent": "#ff7a3c",
    "--accent-glow": "rgba(255, 122, 60, 0.30)",
    "--accent-glow-strong": "rgba(255, 122, 60, 0.50)",
    "--accent-subtle": "rgba(255, 122, 60, 0.10)",
    "--accent-subtle-hover": "rgba(255, 122, 60, 0.20)",
    "--accent-text": "#1a0d05",
    "--accent-2": "#35c4b0",
    "--accent-2-subtle": "rgba(53, 196, 176, 0.12)",
    "--accent-2-text": "#04201c",
    "--beat-accent": "#ffbc93",
    "--text-primary": "#f5ece2",
    "--text-secondary": "#d8c9b8",
    "--text-tertiary": "#b5a494",
    "--text-muted": "#9d8b7a",
    "--text-faint": "#988775",
    "--border": "rgba(255, 255, 255, 0.07)",
    "--surface-hover": "rgba(255, 122, 60, 0.06)",
    "--surface-active": "rgba(255, 122, 60, 0.12)",
    "--shadow": "0 8px 32px rgba(0, 0, 0, 0.55)",
    "--font-family": "'Outfit', 'Segoe UI', system-ui, sans-serif",
    "--font-display": "'Barlow Condensed', 'Arial Narrow', system-ui, sans-serif",
    // Ember's headlines are its display face: Barlow Condensed, like its
    // titles, clocks and buttons (owner, 2026-11-18: the serif "Today" did not
    // look like the theme). Set heavier and a touch larger (below).
    "--font-heading": "'Barlow Condensed', 'Arial Narrow', system-ui, sans-serif",
    "--font-body": "'Outfit', 'Segoe UI', system-ui, sans-serif",
    "--font-num": "'Barlow Condensed', 'Arial Narrow', system-ui, sans-serif",
    "--font-weight": "500",
    "--radius": "16px",
    "--radius-sm": "12px",
    "--feedback-perfect": "#5fd08a",
    "--feedback-good": "#7fd8e8",
    "--feedback-ok": "#f5b53d",
    "--feedback-miss": "#838a97",
    "--neck-miss": "#ff4f7b",
    "--heading-weight": "600",
    "--heading-tracking": "0.15",
    "--heading-scale": "1.06",
  },
};

/** A method book on a stand: warm paper, ink indigo, a serif interface. */
const manuscript: Theme = {
  id: "manuscript",
  name: "Manuscript",
  group: "light",
  preview: ["#f7f3ea", "#ece5d6", "#26428f"],
  vars: {
    "--bg-primary": "#f7f3ea",
    "--bg-secondary": "#f1ece0",
    "--bg-card": "#ece5d6",
    "--bg-solid": "#f7f3ea",
    "--bg-card-solid": "#ece5d6",
    "--bg-raised-solid": "#e5dcc9",
    "--bg-panel": "#f4efe4",
    "--bg-raised": "#e5dcc9",
    "--bg-widget": "linear-gradient(135deg, #f7f3ea, #f1ece0)",
    "--accent": "#26428f",
    "--accent-glow": "rgba(38, 66, 143, 0.22)",
    "--accent-glow-strong": "rgba(38, 66, 143, 0.38)",
    "--accent-subtle": "rgba(38, 66, 143, 0.09)",
    "--accent-subtle-hover": "rgba(38, 66, 143, 0.16)",
    "--accent-text": "#ffffff",
    "--accent-2": "#2e694e",
    "--accent-2-subtle": "rgba(46, 105, 78, 0.10)",
    "--accent-2-text": "#ffffff",
    "--beat-accent": "#4a67bd",
    "--text-primary": "#1e1b16",
    "--text-secondary": "#4a443a",
    "--text-tertiary": "#595247",
    "--text-muted": "#605a4f",
    "--text-faint": "#645e53",
    "--border": "rgba(30, 27, 22, 0.33)",
    "--surface-hover": "rgba(30, 27, 22, 0.045)",
    "--surface-active": "rgba(30, 27, 22, 0.09)",
    "--shadow": "0 8px 32px rgba(30, 27, 22, 0.12)",
    "--font-family": "'Source Serif 4', Georgia, 'Times New Roman', serif",
    "--font-display": "'Fraunces', 'Source Serif 4', Georgia, serif",
    "--font-heading": "'Fraunces', 'Source Serif 4', Georgia, serif",
    "--font-body": "'Source Serif 4', Georgia, 'Times New Roman', serif",
    "--font-num": "'Source Serif 4', Georgia, serif",
    "--font-weight": "400",
    "--radius": "6px",
    "--radius-sm": "4px",
    "--feedback-perfect": "#166c45",
    "--feedback-good": "#1c6683",
    "--feedback-ok": "#8a510b",
    "--feedback-miss": "#585f6d",
    "--neck-miss": "#b3261e",
  },
};

export const THEMES: Theme[] = [
  mono, obsidian, velvet, neon, aurora, ash, ember,
  ivory, arctic, sand, lavender, prism, manuscript,
];

export function getThemeById(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? mono;
}

/** Apply a theme's CSS variables to the document root */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.vars)) {
    root.style.setProperty(key, value);
  }
  for (const key of OPTIONAL_TOKENS) {
    if (!(key in theme.vars)) root.style.removeProperty(key);
  }
  // Set font on body
  if (theme.vars["--font-family"]) {
    document.body.style.fontFamily = theme.vars["--font-family"];
  }
  if (theme.vars["--font-weight"]) {
    document.body.style.fontWeight = theme.vars["--font-weight"];
  }
  // Set a data attribute for light/dark specific CSS overrides
  root.dataset.themeGroup = theme.group;
  root.dataset.theme = theme.id;
}
