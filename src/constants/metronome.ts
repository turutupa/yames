/**
 * Static data constants for the metronome UI.
 *
 * These are pure data with no React or runtime dependencies — extracted
 * from MainWindow.tsx so that they can be reused (and so MainWindow.tsx
 * stays focused on component logic rather than reference data).
 *
 * Display names are intentionally not stored here: user-visible strings
 * live in the i18n locale files and are looked up via `t(\`key.${id}\`)`
 * so the UI can be fully translated.
 */
export const SHARE_URL = "https://yames.app";
export const SHARE_TEXT =
  "Check out Yames — a free open-source metronome for serious practice 🎵";

export const SHARE_OPTIONS = [
  {
    id: "whatsapp",
    label: "WhatsApp",
    url: `https://wa.me/?text=${encodeURIComponent(SHARE_TEXT + "\n" + SHARE_URL)}`,
  },
  {
    id: "x",
    label: "X / Twitter",
    url: `https://x.com/intent/tweet?text=${encodeURIComponent(SHARE_TEXT)}&url=${encodeURIComponent(SHARE_URL)}`,
  },
  {
    id: "facebook",
    label: "Facebook",
    url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(SHARE_URL)}`,
  },
  {
    id: "reddit",
    label: "Reddit",
    url: `https://www.reddit.com/submit?url=${encodeURIComponent(SHARE_URL)}&title=${encodeURIComponent(SHARE_TEXT)}`,
  },
  { id: "copy", label: "Copy link", url: "" },
] as const;

export const SOUND_TYPES = [
  { id: "click", icon: "○" },
  { id: "wood", icon: "◆" },
  { id: "beep", icon: "◉" },
  { id: "drum", icon: "◎" },
];

export const INSTRUMENTS: Array<{ id: string; soon?: boolean }> = [
  // Fully calibrated: monophonic instruments where aubio onset + YINFFT pitch
  // detection work reliably. Practice coach pitch features target these first.
  { id: "electric-guitar" },
  { id: "acoustic-guitar" },
  { id: "bass" },
  // Coming soon: drums are non-pitched (pitch pipeline adds no value today);
  // piano is polyphonic by nature and requires ONNX-based chord detection
  // rather than YINFFT. "Other" is too generic to calibrate pitch feedback for.
  { id: "drums", soon: true },
  { id: "piano", soon: true },
  { id: "other", soon: true },
];

export const TIME_SIGNATURES = [0, 1, 2, 3, 4, 5, 6, 7];

export const TEMPO_MARKINGS: [number, string][] = [
  [20, "Grave"],
  [40, "Largo"],
  [45, "Lento"],
  [55, "Adagio"],
  [66, "Adagietto"],
  [72, "Andante"],
  [80, "Andantino"],
  [84, "Moderato"],
  [100, "Allegretto"],
  [112, "Allegro"],
  [132, "Vivace"],
  [140, "Presto"],
  [178, "Prestissimo"],
];

export function getTempoMarking(bpm: number): string {
  for (let i = TEMPO_MARKINGS.length - 1; i >= 0; i--) {
    if (bpm >= TEMPO_MARKINGS[i][0]) return TEMPO_MARKINGS[i][1];
  }
  return TEMPO_MARKINGS[0][1];
}
