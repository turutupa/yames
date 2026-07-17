import type { ChordSequence, RhythmPattern } from "./trackTypes";

export const CHORD_SEQUENCES: ChordSequence[] = [
  {
    name: "Pop I-V-vi-IV (G)",
    chords: ["G", "D", "Em", "C"],
    beatsPerChord: 2,
  },
  {
    name: "Pop I-V-vi-IV (C)",
    chords: ["C", "G", "Am", "F"],
    beatsPerChord: 2,
  },
  {
    name: "ii-V-I (G)",
    chords: ["Am7", "D7", "Gmaj7"],
    beatsPerChord: 2,
  },
  {
    name: "12-bar Blues (A)",
    chords: ["A7", "A7", "A7", "A7", "D7", "D7", "A7", "A7", "E7", "D7", "A7", "E7"],
    beatsPerChord: 1,
  },
  {
    name: "Minor i-VII-VI-VII (Am)",
    chords: ["Am", "G", "F", "G"],
    beatsPerChord: 2,
  },
];

export const RHYTHM_PATTERNS: RhythmPattern[] = [
  {
    name: "Quarter Notes",
    subdivisionInterval: 1,
    symbol: "♩",
  },
  {
    name: "8th Notes",
    subdivisionInterval: 2,
    symbol: "♪",
  },
  {
    name: "16th Notes",
    subdivisionInterval: 4,
    symbol: "♬",
  },
];
