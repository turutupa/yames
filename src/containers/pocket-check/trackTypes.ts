import { storeLoad, storeSave } from "../../ipc";

export type Rating = "metronomic" | "tight" | "solid" | "loose" | "miss";

export type GameMode = "free" | "chords" | "rhythm";

export type ChordSequence = {
  name: string;
  chords: string[];
  beatsPerChord: number;
};

export type RhythmPattern = {
  name: string;
  subdivisionInterval: 1 | 2 | 4;
  symbol: string;
};

export type TapResult = {
  offsetMs: number; // negative = early, positive = late
  timestamp: number;
  rating: Rating;
};

export type SessionState =
  | "idle"
  | "calibrating"
  | "playing"
  | "calibration-done"
  | "results"
  | "history";

export type PerBeatDatum = { beat: number; offsetMs: number | null; rating: Rating };

export type GameResult = {
  id: string;
  date: string;
  bpm: number;
  scoredBeats: number;
  overallRating: Rating;
  catchPhrase: string;
  breakdown: Record<Rating, number>;
  avgOffset: number;
  avgAbs: number;
  stdDev: number;
  hitRate: number;
  perBeatData: PerBeatDatum[];
  calibratedTaps: TapResult[];
  mode?: GameMode;
  sequenceName?: string;
  patternName?: string;
  gameSubdivision?: number;
};

export const MAX_HISTORY = 50;

export async function loadHistory(): Promise<GameResult[]> {
  try {
    const h = await storeLoad<GameResult[]>("tapitHistory");
    return h ?? [];
  } catch {
    return [];
  }
}

export function saveHistory(history: GameResult[]) {
  storeSave("tapitHistory", history.slice(0, MAX_HISTORY));
}

export function getOffsetRating(absMs: number): Rating {
  if (absMs <= 15) return "metronomic";
  if (absMs <= 30) return "tight";
  if (absMs <= 50) return "solid";
  if (absMs <= 80) return "loose";
  return "miss";
}

export const RATING_LABELS: Record<Rating, string> = {
  metronomic: "Metronomic",
  tight: "Tight",
  solid: "Solid",
  loose: "Loose",
  miss: "Miss",
};

export const RATING_COLORS: Record<Rating, string> = {
  metronomic: "#10b981",
  tight: "#06b6d4",
  solid: "#f59e0b",
  loose: "#ff6b6b",
  miss: "#6b7280",
};

export const CATCH_PHRASES: Record<Rating, string[]> = {
  metronomic: [
    "You ARE the metronome.",
    "Machine-level precision.",
    "Are you even human?",
    "Flawless rhythm.",
    "Tick-tock perfection.",
  ],
  tight: [
    "Locked in the pocket.",
    "Studio-ready timing.",
    "Drummer approved.",
    "Right on the money.",
    "Groovy and precise.",
  ],
  solid: [
    "Holding it down.",
    "Good foundation.",
    "Keep grinding!",
    "Getting there.",
    "Respectable rhythm.",
  ],
  loose: [
    "Feeling a bit wobbly.",
    "Room to tighten up.",
    "The groove is... creative.",
    "Keep practicing!",
    "Almost there.",
  ],
  miss: [
    "Were you even trying?",
    "The beat was lonely.",
    "Ghost notes only.",
    "Rhythm is optional, apparently.",
    "Let's pretend this didn't happen.",
  ],
};

export function getRandomPhrase(rating: Rating): string {
  const phrases = CATCH_PHRASES[rating];
  return phrases[Math.floor(Math.random() * phrases.length)];
}
