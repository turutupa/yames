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

export const METER_VARIANTS: Record<string, number[][]> = {
  "5/4":  [[3, 2], [2, 3]],
  "7/8":  [[3, 2, 2], [2, 2, 3], [2, 3, 2]],
  "8/8":  [[3, 2, 3], [3, 3, 2], [2, 3, 3]],
};

/**
 * Display order for the meter row, and the order the next/previous meter
 * affordance walks.
 *
 * Ascending by beats, one rule the whole way. It used to run 4/4, 3/4,
 * 2/4 and then 5/4, 6/8, 7/8 … — "most common first" for the simple
 * meters grafted onto an ascending list, which reads as a mistake
 * because the sequence reverses direction halfway. Frequency ordering
 * was not really available anyway: FREE holds the leftmost slot, and a
 * true frequency order would not put 5/4 ahead of 6/8 either.
 *
 * Nothing may depend on the index of an entry: `cycleMeterPreset` looks
 * 4/4 up by label precisely so this list can be reordered again.
 */
export const METER_PRESETS: Array<{ label: string; groups: number[] }> = [
  { label: "2/4",  groups: [2] },
  { label: "3/4",  groups: [3] },
  { label: "4/4",  groups: [4] },
  { label: "5/4",  groups: [3, 2] },
  { label: "6/8",  groups: [3, 3] },
  { label: "7/8",  groups: [3, 2, 2] },
  { label: "8/8",  groups: [3, 2, 3] },
  { label: "9/8",  groups: [3, 3, 3] },
  { label: "12/8", groups: [3, 3, 3, 3] },
];

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

/**
 * FREE-mode beat-count bounds.
 *
 * FREE mode replaces the grouped meter with a flat run of N equal beats.
 * The steppers (GroupEditor chevrons, floating-widget / zen meter buttons,
 * `sig-next` / `sig-prev`) wrap around these bounds rather than clamping, so
 * `MAX_FREE_BEATS + 1` lands on `MIN_FREE_BEATS` and vice versa.
 *
 * `MAX_FREE_BEATS` must stay in sync with the per-group and total caps
 * enforced by `set_beat_groups` in `src-tauri/src/commands.rs`.
 */
export const MIN_FREE_BEATS = 1;
export const MAX_FREE_BEATS = 16;

/** Next beat count for a "+1" stepper, wrapping MAX → MIN. */
export function nextFreeBeatCount(total: number): number {
  return total >= MAX_FREE_BEATS ? MIN_FREE_BEATS : total + 1;
}

/** Previous beat count for a "−1" stepper, wrapping MIN → MAX. */
export function prevFreeBeatCount(total: number): number {
  return total <= MIN_FREE_BEATS ? MAX_FREE_BEATS : total - 1;
}
