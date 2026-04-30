/**
 * Mustik Theme System
 *
 * Each theme defines a complete visual identity: backgrounds, text, accents,
 * glows, borders, and optional font overrides. Themes apply to both the main
 * window and the floating widget.
 */

export interface Theme {
  id: string;
  name: string;
  group: "dark" | "light";
  /** 3 representative colors: bg-primary, bg-card, accent */
  preview: string[];
  vars: Record<string, string>;
}

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
    "--bg-widget": "linear-gradient(135deg, #121212, #1a1a1a)",
    "--accent": "#d4d4d4",
    "--accent-glow": "rgba(212, 212, 212, 0.2)",
    "--accent-glow-strong": "rgba(212, 212, 212, 0.35)",
    "--accent-subtle": "rgba(212, 212, 212, 0.08)",
    "--accent-subtle-hover": "rgba(212, 212, 212, 0.14)",
    "--accent-text": "#121212",
    "--beat-accent": "#ffffff",
    "--text-primary": "#e0e0e0",
    "--text-secondary": "#888888",
    "--text-muted": "#555555",
    "--border": "rgba(255, 255, 255, 0.06)",
    "--surface-hover": "rgba(255, 255, 255, 0.04)",
    "--surface-active": "rgba(255, 255, 255, 0.08)",
    "--shadow": "0 8px 32px rgba(0, 0, 0, 0.5)",
    "--font-family": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    "--font-weight": "400",
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
    "--bg-widget": "linear-gradient(135deg, #0a0a0a, #151515)",
    "--accent": "#f59e0b",
    "--accent-glow": "rgba(245, 158, 11, 0.3)",
    "--accent-glow-strong": "rgba(245, 158, 11, 0.5)",
    "--accent-subtle": "rgba(245, 158, 11, 0.1)",
    "--accent-subtle-hover": "rgba(245, 158, 11, 0.2)",
    "--accent-text": "#0a0a0a",
    "--beat-accent": "#fde68a",
    "--text-primary": "#e5e5e5",
    "--text-secondary": "#a3a3a3",
    "--text-muted": "#737373",
    "--border": "rgba(255, 255, 255, 0.06)",
    "--surface-hover": "rgba(245, 158, 11, 0.06)",
    "--surface-active": "rgba(245, 158, 11, 0.12)",
    "--shadow": "0 8px 32px rgba(0, 0, 0, 0.6)",
    "--font-family": "'SF Mono', 'Fira Code', 'JetBrains Mono', monospace",
    "--font-weight": "400",
  },
};

const velvet: Theme = {
  id: "velvet",
  name: "Velvet",
  group: "dark",
  preview: ["#110b1e", "#271c42", "#8b5cf6"],
  vars: {
    "--bg-primary": "#110b1e",
    "--bg-secondary": "#1c1232",
    "--bg-card": "#271c42",
    "--bg-widget": "linear-gradient(135deg, #110b1e, #1c1232)",
    "--accent": "#8b5cf6",
    "--accent-glow": "rgba(139, 92, 246, 0.3)",
    "--accent-glow-strong": "rgba(139, 92, 246, 0.5)",
    "--accent-subtle": "rgba(139, 92, 246, 0.1)",
    "--accent-subtle-hover": "rgba(139, 92, 246, 0.2)",
    "--accent-text": "#ffffff",
    "--beat-accent": "#ddd6fe",
    "--text-primary": "#e8e0f0",
    "--text-secondary": "#a89cc0",
    "--text-muted": "#6b5f80",
    "--border": "rgba(139, 92, 246, 0.08)",
    "--surface-hover": "rgba(139, 92, 246, 0.06)",
    "--surface-active": "rgba(139, 92, 246, 0.12)",
    "--shadow": "0 8px 32px rgba(0, 0, 0, 0.5)",
    "--font-family": "'Comfortaa', 'Nunito', system-ui, sans-serif",
    "--font-weight": "600",
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
    "--bg-widget": "linear-gradient(135deg, #0c0c18, #141428)",
    "--accent": "#06b6d4",
    "--accent-glow": "rgba(6, 182, 212, 0.3)",
    "--accent-glow-strong": "rgba(6, 182, 212, 0.5)",
    "--accent-subtle": "rgba(6, 182, 212, 0.1)",
    "--accent-subtle-hover": "rgba(6, 182, 212, 0.2)",
    "--accent-text": "#0c0c18",
    "--beat-accent": "#d946ef",
    "--text-primary": "#e4e4f0",
    "--text-secondary": "#9898c0",
    "--text-muted": "#5c5c80",
    "--border": "rgba(6, 182, 212, 0.1)",
    "--surface-hover": "rgba(6, 182, 212, 0.06)",
    "--surface-active": "rgba(6, 182, 212, 0.12)",
    "--shadow": "0 8px 32px rgba(0, 0, 0, 0.5)",
    "--font-family": "'Orbitron', 'Rajdhani', 'Exo 2', monospace",
    "--font-weight": "500",
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
    "--bg-widget": "linear-gradient(135deg, #0a0020, #1a0a3a, #002a3a)",
    "--accent": "#00d4ff",
    "--accent-glow": "rgba(0, 212, 255, 0.4)",
    "--accent-glow-strong": "rgba(0, 212, 255, 0.6)",
    "--accent-subtle": "rgba(0, 212, 255, 0.12)",
    "--accent-subtle-hover": "rgba(0, 212, 255, 0.22)",
    "--accent-text": "#0a0020",
    "--beat-accent": "#bf5af2",
    "--text-primary": "#eef2ff",
    "--text-secondary": "#a0a8d0",
    "--text-muted": "#5c6088",
    "--border": "rgba(0, 212, 255, 0.12)",
    "--surface-hover": "rgba(0, 212, 255, 0.08)",
    "--surface-active": "rgba(0, 212, 255, 0.15)",
    "--shadow": "0 8px 32px rgba(0, 212, 255, 0.1), 0 2px 8px rgba(191, 90, 242, 0.08)",
    "--font-family": "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    "--font-weight": "500",
  },
};

// ---------------------------------------------------------------------------
// LIGHT THEMES
// ---------------------------------------------------------------------------

const ivory: Theme = {
  id: "ivory",
  name: "Ivory",
  group: "light",
  preview: ["#faf8f2", "#e8e0c8", "#b8860b"],
  vars: {
    "--bg-primary": "#faf8f2",
    "--bg-secondary": "#f0ead6",
    "--bg-card": "#e8e0c8",
    "--bg-widget": "linear-gradient(135deg, #faf8f2, #f0ead6)",
    "--accent": "#b8860b",
    "--accent-glow": "rgba(184, 134, 11, 0.25)",
    "--accent-glow-strong": "rgba(184, 134, 11, 0.4)",
    "--accent-subtle": "rgba(184, 134, 11, 0.1)",
    "--accent-subtle-hover": "rgba(184, 134, 11, 0.18)",
    "--accent-text": "#ffffff",
    "--beat-accent": "#d4a017",
    "--text-primary": "#2c2416",
    "--text-secondary": "#6b5c42",
    "--text-muted": "#9a8b6e",
    "--border": "rgba(44, 36, 22, 0.1)",
    "--surface-hover": "rgba(184, 134, 11, 0.06)",
    "--surface-active": "rgba(184, 134, 11, 0.12)",
    "--shadow": "0 8px 32px rgba(44, 36, 22, 0.1)",
    "--font-family": "'Georgia', 'Palatino', 'Times New Roman', serif",
    "--font-weight": "500",
  },
};

const arctic: Theme = {
  id: "arctic",
  name: "Arctic",
  group: "light",
  preview: ["#f0f4f8", "#cbd5e1", "#0369a1"],
  vars: {
    "--bg-primary": "#f0f4f8",
    "--bg-secondary": "#e2e8f0",
    "--bg-card": "#cbd5e1",
    "--bg-widget": "linear-gradient(135deg, #f0f4f8, #e2e8f0)",
    "--accent": "#0369a1",
    "--accent-glow": "rgba(3, 105, 161, 0.2)",
    "--accent-glow-strong": "rgba(3, 105, 161, 0.35)",
    "--accent-subtle": "rgba(3, 105, 161, 0.08)",
    "--accent-subtle-hover": "rgba(3, 105, 161, 0.15)",
    "--accent-text": "#ffffff",
    "--beat-accent": "#7dd3fc",
    "--text-primary": "#0f172a",
    "--text-secondary": "#475569",
    "--text-muted": "#94a3b8",
    "--border": "rgba(15, 23, 42, 0.08)",
    "--surface-hover": "rgba(3, 105, 161, 0.05)",
    "--surface-active": "rgba(3, 105, 161, 0.1)",
    "--shadow": "0 8px 32px rgba(15, 23, 42, 0.08)",
    "--font-family": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    "--font-weight": "500",
  },
};

const sand: Theme = {
  id: "sand",
  name: "Sand",
  group: "light",
  preview: ["#f5f0e8", "#d9cdba", "#92400e"],
  vars: {
    "--bg-primary": "#f5f0e8",
    "--bg-secondary": "#e8dfd0",
    "--bg-card": "#d9cdba",
    "--bg-widget": "linear-gradient(135deg, #f5f0e8, #e8dfd0)",
    "--accent": "#92400e",
    "--accent-glow": "rgba(146, 64, 14, 0.2)",
    "--accent-glow-strong": "rgba(146, 64, 14, 0.35)",
    "--accent-subtle": "rgba(146, 64, 14, 0.08)",
    "--accent-subtle-hover": "rgba(146, 64, 14, 0.15)",
    "--accent-text": "#ffffff",
    "--beat-accent": "#fbbf24",
    "--text-primary": "#292524",
    "--text-secondary": "#78716c",
    "--text-muted": "#a8a29e",
    "--border": "rgba(41, 37, 36, 0.08)",
    "--surface-hover": "rgba(146, 64, 14, 0.05)",
    "--surface-active": "rgba(146, 64, 14, 0.1)",
    "--shadow": "0 8px 32px rgba(41, 37, 36, 0.08)",
    "--font-family": "'Avenir Next', 'Avenir', -apple-system, sans-serif",
    "--font-weight": "500",
  },
};

const lavender: Theme = {
  id: "lavender",
  name: "Lavender",
  group: "light",
  preview: ["#f5f0ff", "#ddd3f5", "#7c3aed"],
  vars: {
    "--bg-primary": "#f5f0ff",
    "--bg-secondary": "#ede5ff",
    "--bg-card": "#ddd3f5",
    "--bg-widget": "linear-gradient(135deg, #f5f0ff, #ede5ff)",
    "--accent": "#7c3aed",
    "--accent-glow": "rgba(124, 58, 237, 0.2)",
    "--accent-glow-strong": "rgba(124, 58, 237, 0.35)",
    "--accent-subtle": "rgba(124, 58, 237, 0.08)",
    "--accent-subtle-hover": "rgba(124, 58, 237, 0.15)",
    "--accent-text": "#ffffff",
    "--beat-accent": "#c4b5fd",
    "--text-primary": "#1e1338",
    "--text-secondary": "#5b4d7a",
    "--text-muted": "#9585b5",
    "--border": "rgba(30, 19, 56, 0.08)",
    "--surface-hover": "rgba(124, 58, 237, 0.05)",
    "--surface-active": "rgba(124, 58, 237, 0.1)",
    "--shadow": "0 8px 32px rgba(30, 19, 56, 0.08)",
    "--font-family": "'Quicksand', 'Nunito', system-ui, sans-serif",
    "--font-weight": "600",
  },
};

const prism: Theme = {
  id: "prism",
  name: "Prism",
  group: "light",
  preview: ["#ffe0f0", "#e0d4ff", "#ff3d8a"],
  vars: {
    "--bg-primary": "linear-gradient(145deg, #ffe8f0 0%, #e8d8ff 40%, #d8f0ff 70%, #fff0e8 100%)",
    "--bg-secondary": "#f5e8ff",
    "--bg-card": "rgba(255, 255, 255, 0.6)",
    "--bg-widget": "linear-gradient(135deg, #ffe0f0, #e0d0ff, #d0f0ff)",
    "--accent": "#ff3d8a",
    "--accent-glow": "rgba(255, 61, 138, 0.3)",
    "--accent-glow-strong": "rgba(255, 61, 138, 0.45)",
    "--accent-subtle": "rgba(255, 61, 138, 0.1)",
    "--accent-subtle-hover": "rgba(255, 61, 138, 0.18)",
    "--accent-text": "#ffffff",
    "--beat-accent": "#a855f7",
    "--text-primary": "#1a1030",
    "--text-secondary": "#5a3d7a",
    "--text-muted": "#9878b0",
    "--border": "rgba(160, 80, 200, 0.12)",
    "--surface-hover": "rgba(255, 61, 138, 0.06)",
    "--surface-active": "rgba(255, 61, 138, 0.12)",
    "--shadow": "0 8px 32px rgba(160, 80, 200, 0.12), 0 2px 8px rgba(255, 61, 138, 0.08)",
    "--font-family": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    "--font-weight": "500",
  },
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const THEMES: Theme[] = [
  mono, obsidian, velvet, neon, aurora,
  ivory, arctic, sand, lavender, prism,
];

export const DEFAULT_THEME_ID = "mono";

export function getThemeById(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? mono;
}

/** Apply a theme's CSS variables to the document root */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.vars)) {
    root.style.setProperty(key, value);
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
}
