import type { MultiMeasurePattern, PatternAccentLevel, PatternMeasure } from "../../types";
import { METER_PRESETS } from "../../constants/metronome";
import { GROOVES, GROOVE_FAMILIES, type Groove, type GrooveFamily } from "../../jam/grooves";
import { JAM_PERC_LANES, type JamPattern } from "../../jam/types";

/**
 * Cycle a tick's accent level:
 * Rest (0) -> Plain (1) -> Medium (2) -> Strong (3) -> Rest (0)
 */
export function cycleAccent(current: PatternAccentLevel): PatternAccentLevel {
  return ((current + 1) % 4) as PatternAccentLevel;
}

/**
 * Create a blank / default multi-measure pattern for a given meter and subdivision.
 * By default, beat 1 is Strong, other beats are Plain, and subdivisions are Plain.
 */
export function createDefaultPattern(
  loopBars = 2,
  beats = 4,
  subdivision = 1
): MultiMeasurePattern {
  const bars = Math.max(1, Math.min(16, loopBars));
  const b = Math.max(1, Math.min(16, beats));
  const sub = Math.max(1, Math.min(6, subdivision));

  const measures: PatternMeasure[] = Array.from({ length: bars }, (_, barIdx) => {
    const ticks: PatternAccentLevel[] = [];
    for (let beat = 0; beat < b; beat++) {
      for (let s = 0; s < sub; s++) {
        if (s === 0) {
          // Downbeat of bar 1 is Strong; subsequent group or bar openings are Medium/Plain
          ticks.push(beat === 0 ? (barIdx === 0 ? 3 : 2) : 1);
        } else {
          ticks.push(1);
        }
      }
    }
    return { beats: b, subdivision: sub, ticks };
  });

  return {
    id: "custom",
    name: "Custom Pattern",
    loopBars: bars,
    measures,
  };
}

/**
 * Resample all measures in a pattern to a new subdivision, preserving
 * existing accents on downbeats and proportional subdivision ticks.
 */
export function resamplePatternSubdivision(
  pattern: MultiMeasurePattern,
  newSubdivision: number
): MultiMeasurePattern {
  const newSub = Math.max(1, Math.min(6, newSubdivision));
  let changed = false;
  const measures: PatternMeasure[] = pattern.measures.map((m) => {
    if (m.subdivision === newSub) return m;
    changed = true;
    const oldSub = Math.max(1, m.subdivision);
    const beats = Math.max(1, m.beats);
    const newTicks: PatternAccentLevel[] = [];

    for (let b = 0; b < beats; b++) {
      const start = b * oldSub;
      const end = Math.min(m.ticks.length, start + oldSub);
      const beatTicks = start < m.ticks.length ? m.ticks.slice(start, end) : [];
      const downbeat = (beatTicks[0] ?? 1) as PatternAccentLevel;

      for (let s = 0; s < newSub; s++) {
        if (s === 0) {
          // Beat downbeat always keeps the existing beat accent
          newTicks.push(downbeat);
        } else if (oldSub > 1 && newSub % oldSub === 0) {
          // Exact multiple (e.g. 2 -> 4, 2 -> 6, 3 -> 6): map proportionally
          const ratio = newSub / oldSub;
          if (s % ratio === 0 && s / ratio < beatTicks.length) {
            newTicks.push(beatTicks[s / ratio] ?? 1);
          } else {
            // In-between subdivisions: if the beat is silent/rest, keep rest, else plain
            newTicks.push(downbeat === 0 ? 0 : 1);
          }
        } else if (oldSub > 1 && oldSub % newSub === 0) {
          // Exact divisor (e.g. 4 -> 2, 6 -> 3, 6 -> 2): pick proportionally
          const ratio = oldSub / newSub;
          if (s * ratio < beatTicks.length) {
            newTicks.push(beatTicks[s * ratio] ?? 1);
          } else {
            newTicks.push(1);
          }
        } else if (downbeat === 0) {
          // Silent beat stays silent across subdivisions
          newTicks.push(0);
        } else {
          newTicks.push(1);
        }
      }
    }

    return {
      beats: m.beats,
      subdivision: newSub,
      ticks: newTicks,
    };
  });

  return {
    ...pattern,
    id: changed ? "custom" : pattern.id,
    name: changed ? "Custom Pattern" : pattern.name,
    measures,
  };
}

/**
 * Resample all measures in a pattern to a new beat count (meter).
 */
export function resamplePatternMeter(
  pattern: MultiMeasurePattern,
  newBeats: number
): MultiMeasurePattern {
  const b = Math.max(1, Math.min(16, newBeats));
  let changed = false;
  const measures: PatternMeasure[] = pattern.measures.map((m) => {
    if (m.beats === b) return m;
    changed = true;
    const oldBeats = Math.max(1, m.beats);
    const sub = Math.max(1, m.subdivision);
    let newTicks: PatternAccentLevel[] = [];

    if (b > oldBeats) {
      newTicks = [...m.ticks];
      for (let extra = oldBeats; extra < b; extra++) {
        for (let s = 0; s < sub; s++) {
          newTicks.push(1);
        }
      }
    } else {
      newTicks = m.ticks.slice(0, b * sub);
    }

    return {
      beats: b,
      subdivision: sub,
      ticks: newTicks,
    };
  });

  return {
    ...pattern,
    id: changed ? "custom" : pattern.id,
    name: changed ? "Custom Pattern" : pattern.name,
    measures,
  };
}

export type PatternPresetCategory = "practice" | GrooveFamily;

export const PATTERN_PRESET_CATEGORIES: readonly PatternPresetCategory[] = [
  "practice",
  ...GROOVE_FAMILIES,
];

/**
 * Convert a single JamPattern bar into metronome PatternAccentLevels (0..3):
 * - 0 (Rest): all drum & percussion lanes are silent on this tick
 * - 3 (Strong): peak (4), crash accent, snare backbeat accent (2), clave accent (2), or accented bar downbeat
 * - 2 (Medium): kick hit/accent, snare hit or cross-stick rim, tom hit, open hat, clave hit, accented cowbell/percussion, or beat-start cymbal accent
 * - 1 (Plain): subdivision hi-hat/ride hit, ghost note, or shaker/cabasa timekeeper
 */
export function jamBarToTicks(
  bar: JamPattern,
  beatsPerBar: number,
  ticksPerBeat: number,
  snareGhostIsRim?: boolean
): PatternAccentLevel[] {
  const length = beatsPerBar * ticksPerBeat;
  const ticks: PatternAccentLevel[] = [];

  for (let i = 0; i < length; i++) {
    const kick = bar.kick[i] ?? 0;
    const snare = bar.snare[i] ?? 0;
    const hat = bar.hat[i] ?? 0;
    const ride = bar.ride[i] ?? 0;
    const crash = bar.crash[i] ?? 0;
    const hatOpen = bar.hatOpen?.[i] ?? 0;
    const tomHi = bar.tomHi?.[i] ?? 0;
    const tomLo = bar.tomLo?.[i] ?? 0;
    const claves = bar.claves?.[i] ?? 0;
    const cowbell = bar.cowbell?.[i] ?? 0;

    let anyPerc = 0;
    let accentedPerc = false;
    let peakPerc = false;
    for (const lane of JAM_PERC_LANES) {
      const val = bar[lane]?.[i] ?? 0;
      if (val > 0) anyPerc = Math.max(anyPerc, val);
      if (val === 2) accentedPerc = true;
      if (val === 4) peakPerc = true;
    }

    const anyActive =
      kick > 0 ||
      snare > 0 ||
      hat > 0 ||
      ride > 0 ||
      crash > 0 ||
      hatOpen > 0 ||
      tomHi > 0 ||
      tomLo > 0 ||
      anyPerc > 0;

    if (!anyActive) {
      ticks.push(0);
      continue;
    }

    const isPeak =
      kick === 4 ||
      snare === 4 ||
      hat === 4 ||
      ride === 4 ||
      crash === 4 ||
      hatOpen === 4 ||
      tomHi === 4 ||
      tomLo === 4 ||
      peakPerc;

    const isStrong =
      isPeak ||
      crash >= 2 ||
      snare === 2 ||
      claves === 2 ||
      (i === 0 && (kick >= 2 || hat >= 2 || ride >= 2 || tomLo >= 2 || accentedPerc)) ||
      (kick === 2 && (snare >= 1 || hatOpen >= 1 || cowbell >= 2));

    if (isStrong) {
      ticks.push(3);
      continue;
    }

    const isBeatStart = i % Math.max(1, ticksPerBeat) === 0;
    const isMedium =
      kick >= 1 ||
      snare === 1 ||
      (snare === 3 && !!snareGhostIsRim) ||
      tomHi >= 1 ||
      tomLo >= 1 ||
      hatOpen >= 1 ||
      claves >= 1 ||
      cowbell >= 2 ||
      accentedPerc ||
      (isBeatStart && (hat === 2 || ride === 2));

    if (isMedium) {
      ticks.push(2);
    } else {
      ticks.push(1);
    }
  }

  return ticks;
}

/**
 * Convert a Jam Groove into a MultiMeasurePattern.
 * When `includeFill` is true and `loopBars >= 2`, the final bar uses `groove.fill`.
 */
export function grooveToPattern(
  groove: Groove,
  loopBars = 2,
  includeFill = false,
  displayName?: string
): MultiMeasurePattern {
  const bars = Math.max(1, Math.min(8, loopBars));
  const mainTicks = jamBarToTicks(
    groove.bar,
    groove.beatsPerBar,
    groove.ticksPerBeat,
    groove.snareGhostIsRim
  );
  const fillTicks = includeFill
    ? jamBarToTicks(
        groove.fill,
        groove.beatsPerBar,
        groove.ticksPerBeat,
        groove.snareGhostIsRim
      )
    : mainTicks;

  const measures: PatternMeasure[] = Array.from({ length: bars }, (_, idx) => ({
    beats: groove.beatsPerBar,
    subdivision: groove.ticksPerBeat,
    ticks: [...(includeFill && bars >= 2 && idx === bars - 1 ? fillTicks : mainTicks)],
  }));

  return {
    id: `jam-${groove.id}`,
    name: displayName ?? groove.id,
    loopBars: bars,
    measures,
  };
}

/**
 * Standard beatGroups array for a preset's beatsPerBar count.
 */
export function defaultBeatGroupsForBeats(beatsPerBar: number): number[] {
  const match = METER_PRESETS.find(
    (p) => p.groups.reduce((a, b) => a + b, 0) === beatsPerBar
  );
  if (match) return [...match.groups];
  return [Math.max(1, Math.min(16, beatsPerBar))];
}

/**
 * Built-in multi-measure pattern presets for practice.
 */
export interface PatternPreset {
  id: string;
  name: string;
  nameKey?: string;
  category: PatternPresetCategory;
  description: string;
  pattern: MultiMeasurePattern;
  groove?: Groove;
}

export const CORE_PATTERN_PRESETS: PatternPreset[] = [
  {
    id: "son-clave-3-2",
    name: "Son Clave (3:2)",
    category: "practice",
    description: "Traditional 2-bar Afro-Cuban 3:2 syncopation (8th notes)",
    pattern: {
      id: "son-clave-3-2",
      name: "Son Clave (3:2)",
      loopBars: 2,
      measures: [
        {
          beats: 4,
          subdivision: 2,
          ticks: [3, 0, 0, 3, 0, 0, 3, 0],
        },
        {
          beats: 4,
          subdivision: 2,
          ticks: [0, 0, 3, 0, 3, 0, 0, 0],
        },
      ],
    },
  },
  {
    id: "son-clave-2-3",
    name: "Son Clave (2:3)",
    category: "practice",
    description: "Traditional 2-bar Afro-Cuban 2:3 clave (8th notes)",
    pattern: {
      id: "son-clave-2-3",
      name: "Son Clave (2:3)",
      loopBars: 2,
      measures: [
        {
          beats: 4,
          subdivision: 2,
          ticks: [0, 0, 3, 0, 3, 0, 0, 0],
        },
        {
          beats: 4,
          subdivision: 2,
          ticks: [3, 0, 0, 3, 0, 0, 3, 0],
        },
      ],
    },
  },
  {
    id: "rumba-clave-3-2",
    name: "Rumba Clave (3:2)",
    category: "practice",
    description: "Afro-Cuban 3:2 rumba clave with delayed 4-& stroke (16th notes)",
    pattern: {
      id: "rumba-clave-3-2",
      name: "Rumba Clave (3:2)",
      loopBars: 2,
      measures: [
        {
          beats: 4,
          subdivision: 4,
          ticks: [
            3, 0, 0, 0,
            0, 0, 3, 0,
            0, 0, 0, 0,
            0, 0, 3, 0,
          ],
        },
        {
          beats: 4,
          subdivision: 4,
          ticks: [
            0, 0, 0, 0,
            3, 0, 0, 0,
            3, 0, 0, 0,
            0, 0, 0, 0,
          ],
        },
      ],
    },
  },
  {
    id: "tresillo-3-3-2",
    name: "Tresillo (3+3+2)",
    category: "practice",
    description: "Foundational 3+3+2 syncopated pulse with ghosted 8th subdivisions",
    pattern: {
      id: "tresillo-3-3-2",
      name: "Tresillo (3+3+2)",
      loopBars: 2,
      measures: [
        {
          beats: 4,
          subdivision: 2,
          ticks: [3, 1, 1, 2, 1, 1, 2, 1],
        },
        {
          beats: 4,
          subdivision: 2,
          ticks: [3, 1, 1, 2, 1, 1, 2, 1],
        },
      ],
    },
  },
  {
    id: "backbeat-2-4",
    name: "Backbeat (2 & 4)",
    category: "practice",
    description: "Pocket click accenting beats 2 and 4",
    pattern: {
      id: "backbeat-2-4",
      name: "Backbeat (2 & 4)",
      loopBars: 2,
      measures: [
        {
          beats: 4,
          subdivision: 1,
          ticks: [1, 3, 1, 3],
        },
        {
          beats: 4,
          subdivision: 1,
          ticks: [1, 3, 1, 3],
        },
      ],
    },
  },
  {
    id: "offbeat-ands",
    name: "Offbeat (&s Only)",
    category: "practice",
    description: "Silent downbeats with clicks only on the 8th-note '&' upbeats",
    pattern: {
      id: "offbeat-ands",
      name: "Offbeat (&s Only)",
      loopBars: 2,
      measures: [
        {
          beats: 4,
          subdivision: 2,
          ticks: [0, 3, 0, 2, 0, 2, 0, 2],
        },
        {
          beats: 4,
          subdivision: 2,
          ticks: [0, 2, 0, 2, 0, 2, 0, 2],
        },
      ],
    },
  },
  {
    id: "gap-practice-1-1",
    name: "1+1 Gap Practice",
    category: "practice",
    description: "1 bar of time followed by 1 bar of silence",
    pattern: {
      id: "gap-practice-1-1",
      name: "1+1 Gap Practice",
      loopBars: 2,
      measures: [
        {
          beats: 4,
          subdivision: 1,
          ticks: [3, 1, 1, 1],
        },
        {
          beats: 4,
          subdivision: 1,
          ticks: [0, 0, 0, 0],
        },
      ],
    },
  },
  {
    id: "gap-practice-3-1",
    name: "3+1 Gap Practice",
    category: "practice",
    description: "3 bars of time, 1 bar of total silence to test internal clock",
    pattern: {
      id: "gap-practice-3-1",
      name: "3+1 Gap Practice",
      loopBars: 4,
      measures: [
        {
          beats: 4,
          subdivision: 1,
          ticks: [3, 1, 1, 1],
        },
        {
          beats: 4,
          subdivision: 1,
          ticks: [2, 1, 1, 1],
        },
        {
          beats: 4,
          subdivision: 1,
          ticks: [2, 1, 1, 1],
        },
        {
          beats: 4,
          subdivision: 1,
          ticks: [0, 0, 0, 0],
        },
      ],
    },
  },
  {
    id: "funk-16ths",
    name: "Funk 16ths Push",
    category: "practice",
    description: "2-bar funk groove with 16th-note syncopated accents",
    pattern: {
      id: "funk-16ths",
      name: "Funk 16ths Push",
      loopBars: 2,
      measures: [
        {
          beats: 4,
          subdivision: 4,
          ticks: [
            3, 1, 1, 1,
            1, 2, 1, 1,
            1, 1, 2, 1,
            1, 1, 1, 2,
          ],
        },
        {
          beats: 4,
          subdivision: 4,
          ticks: [
            1, 1, 2, 1,
            3, 1, 1, 1,
            1, 2, 1, 1,
            2, 1, 1, 1,
          ],
        },
      ],
    },
  },
  {
    id: "polyrhythm-3-2",
    name: "Hemiola / 3:2 Cross",
    category: "practice",
    description: "3 dotted quarter pulses across two bars of 3/4",
    pattern: {
      id: "polyrhythm-3-2",
      name: "Hemiola / 3:2 Cross",
      loopBars: 2,
      measures: [
        {
          beats: 3,
          subdivision: 2,
          ticks: [3, 0, 0, 2, 0, 0],
        },
        {
          beats: 3,
          subdivision: 2,
          ticks: [0, 0, 2, 0, 0, 0],
        },
      ],
    },
  },
];

function formatGrooveMeterBadge(groove: Groove): string {
  const subNames: Record<number, string> = {
    1: "quarters",
    2: "8ths",
    3: "triplets",
    4: "16ths",
    6: "sextuplets",
  };
  return `${groove.beatsPerBar}/4 · ${subNames[groove.ticksPerBeat] ?? `${groove.ticksPerBeat}x`}`;
}

export const JAM_GROOVE_PRESETS: PatternPreset[] = GROOVES.map((groove) => ({
  id: `jam-${groove.id}`,
  name: groove.id,
  nameKey: groove.nameKey,
  category: groove.family,
  description: `${formatGrooveMeterBadge(groove)} · ${groove.tags.join(", ")}`,
  pattern: grooveToPattern(groove, 2, false),
  groove,
}));

export const PATTERN_PRESETS: PatternPreset[] = [
  ...CORE_PATTERN_PRESETS,
  ...JAM_GROOVE_PRESETS,
];

