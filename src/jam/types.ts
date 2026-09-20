/**
 * Jam — the shared contract between the UI and the engine.
 *
 * This file is the boundary two workers build against at the same time, so
 * it changes only by agreement (see plans/tasks/jam/BRIEF.md). The Rust side
 * mirrors `JamEngineConfig` field for field in `src-tauri/src/jam.rs`, with
 * serde camelCase names.
 *
 * The one idea to keep in mind: the band is a table on the tick grid the
 * metronome already runs. Columns are the ticks of one bar (beats per bar ×
 * ticks per beat), rows are drums, a cell is how loud. Nothing about timing
 * changes; the engine looks the table up on every tick it was going to play
 * anyway. See plans/JAM_MODE.md §6.
 */

/**
 * How loud a cell is. 0 off, 1 hit, 2 accent, 3 ghost, **4 peak**.
 *
 * Peak is the top of a fill and the crash on the one — the hardest stroke on
 * the kit, and the reason it is a level rather than a louder accent: a
 * recorded kit has a different SAMPLE for it, and picking that sample is
 * something the engine can only do if the table says which stroke this is.
 * Written last rather than between accent and ghost so that every level a
 * pattern was ever saved with still means what it meant (third pass,
 * plans/tasks/jam-v3/BRIEF.md).
 */
export type JamLevel = 0 | 1 | 2 | 3 | 4;

export type JamLane = "kick" | "snare" | "hat" | "ride" | "crash";

export const JAM_LANES: readonly JamLane[] = ["kick", "snare", "hat", "ride", "crash"];

/**
 * The rows a pattern may carry but need not: they are absent, not empty,
 * where a groove does not play them.
 *
 * Absent rather than zeroed on purpose — a row of zeros is a lane the engine
 * reads past on every tick of every bar to learn nothing, and a lane the
 * editor would draw as an instrument nobody is playing.
 */
export type JamOptionalLane = "hatOpen" | "tomHi" | "tomLo";

export const JAM_OPTIONAL_LANES: readonly JamOptionalLane[] = ["hatOpen", "tomHi", "tomLo"];

/**
 * The percussionist's ten, in the order the contract fixes them
 * (plans/tasks/jam-v5/BRIEF.md).
 *
 * A separate list from `JAM_OPTIONAL_LANES` rather than ten more entries in
 * it, and that is the whole design of this pass in one line: **a percussionist
 * is not a drum kit.** They are a second player, they play under whichever kit
 * the drummer is on, and they do not follow the drummer's rules — the kit
 * drops to the hats in a breakdown and the shaker keeps time straight through
 * it. Every place in the compiler that reshapes the drums therefore has to say
 * out loud what happens to the percussion, and with two lists it cannot forget
 * to: a lane added to the wrong one changes behaviour nobody asked it to.
 *
 * The engine's serde mirror names them `conga_hi`, `bongo_lo` and so on and
 * reads them off the wire as these camelCase names, under the same
 * `rename_all = "camelCase"` the rest of `JamPattern` travels under.
 */
export type JamPercLane =
  | "shaker"
  | "tambourine"
  | "cowbell"
  | "cabasa"
  | "claves"
  | "guiro"
  | "congaHi"
  | "congaLo"
  | "bongoHi"
  | "bongoLo";

export const JAM_PERC_LANES: readonly JamPercLane[] = [
  "shaker",
  "tambourine",
  "cowbell",
  "cabasa",
  "claves",
  "guiro",
  "congaHi",
  "congaLo",
  "bongoHi",
  "bongoLo",
];

/**
 * The two percussion rows that are a running subdivision rather than a figure.
 *
 * A shaker and a cabasa are the percussionist's hi-hat: a stroke on every
 * sixteenth (or eighth), alternating hard and light, holding the time down
 * while everything else in the set answers the bar. Every other percussion row
 * is a FIGURE — a clave, a tumbao, a tambourine on two and four — and a rule
 * written for a hand that never stops would be a lie about all of them.
 *
 * `intensity.ts` is the one place that reads this, and the reason it exists.
 */
export const JAM_PERC_TIMEKEEPERS: readonly JamPercLane[] = ["shaker", "cabasa"];

/** Every row a pattern may carry beyond the five: the kit's three and the ten. */
export const JAM_ALL_OPTIONAL_LANES: readonly (JamOptionalLane | JamPercLane)[] = [
  ...JAM_OPTIONAL_LANES,
  ...JAM_PERC_LANES,
];

/**
 * One bar, one row per drum. Every array has exactly
 * `beatsPerBar × ticksPerBeat` entries, tick 0 first.
 *
 * `hatOpen` is the open hi-hat as its own row (second pass, B5): a level in
 * it plays the kit's open hat instead of the closed one on that tick.
 * Optional, so every pattern ever saved still reads; absent means closed
 * hats only.
 *
 * `tomHi` and `tomLo` are the two toms (third pass), and they exist for one
 * reason: a fill that stays on the snare is a drum roll, not a fill. They are
 * optional for the same reason `hatOpen` is — most grooves never leave the
 * snare, and a groove that does not use its toms should not carry two silent
 * rows around.
 *
 * The engine's serde mirror names these rows `hat_open`, `tom_hi` and
 * `tom_lo` and reads them from `hatOpen`, `tomHi` and `tomLo` on the wire,
 * because `JamPattern` there is `#[serde(rename_all = "camelCase")]`.
 *
 * The ten after them are the PERCUSSIONIST's (fifth pass,
 * plans/tasks/jam-v5/BRIEF.md), optional for the same reason and one more: a
 * percussionist belongs in a latin bar and not in a thrash one, so most of the
 * hundred and fifteen grooves carry none of these rows at all, and the ones
 * that do carry two or three rather than ten.
 */
export type JamPattern = Record<JamLane, JamLevel[]> & {
  hatOpen?: JamLevel[];
  tomHi?: JamLevel[];
  tomLo?: JamLevel[];
} & Partial<Record<JamPercLane, JamLevel[]>>;

/**
 * What the engine receives. The UI is responsible for having ALREADY set the
 * engine's subdivision to `ticksPerBeat` and its beat groups to
 * `[beatsPerBar]` before sending this; the engine checks the product against
 * its own bar length and plays the plain click if they disagree, rather than
 * guessing.
 */
export type JamEngineConfig = {
  ticksPerBeat: 1 | 2 | 3 | 4 | 6;
  beatsPerBar: number;
  /** The groove. */
  bar: JamPattern;
  /**
   * What the drummer plays that is not the groove.
   *
   * Played instead of `bar` on the last bar of every chorus — unless `pickup`
   * is set, and then this row is the pickup and lands on no bar at all. See
   * `pickup` below for why one row does both jobs.
   */
  fill: JamPattern | null;
  /** Bars in one chorus of the form, 1..64. */
  formBars: number;
  /** A crash on tick 0 of bar 0 of every chorus. */
  crashOnOne: boolean;
  /** Gain multiplier on every hit, 0.5..1.5. Soft 0.7, normal 1.0, loud 1.25. */
  intensity: number;
  /**
   * The quiet snare in this groove is a CROSS-STICK, not a ghost note.
   *
   * A bossa, a ballad and a cha-cha are played with the stick laid across the
   * head and the tip on the rim — a different sound entirely from a ghost,
   * which is the same head hit softly. The grooves that want it say so
   * (`Groove.snareGhostIsRim`), and the engine plays its `rim` voice for
   * every level-3 stroke on the snare lane instead of the soft snare.
   *
   * Absent or false: a ghost is a ghost. The engine's field is
   * `snare_ghost_is_rim`; the name on the wire is this one, because its
   * struct is `#[serde(rename_all = "camelCase")]`.
   */
  snareGhostIsRim?: boolean;
  /**
   * Which kit plays the lanes. The two recorded ones — "club" and "studio" —
   * and the five synthesised ones behind them: "raw", "room", "tight",
   * "brushes", "electronic". The list lives in `JAM_KIT_IDS` (`./vibes`),
   * where a test can check that no bundle names one that does not exist.
   */
  kit: string;
  /**
   * The bass, when the band has one. One MIDI note number per tick, 0 for a
   * rest, same length as the drum lanes. Absent or null: no bass.
   */
  bass?: JamBassLine | null;
  /**
   * Practice windows the engine applies per bar from its own form counter,
   * so they land exactly on bar lines. Absent or null: the band plays every
   * bar.
   */
  practice?: JamPracticeConfig | null;
  /**
   * Also play the fill on every bar whose 1-based number within the chorus
   * is a multiple of this (4 or 8), not only on the last bar of the chorus.
   * Absent or 0: the last bar only.
   */
  fillEvery?: number;
  /**
   * The keys, comping. One voicing per tick: up to four MIDI notes, an
   * empty array for a rest. Same length as the drum lanes. Absent or null:
   * no keys.
   */
  keys?: JamKeysLine | null;
  /** Per-lane gain multipliers, 0..1.5. Absent: 1.0 each. */
  mix?: JamMix;
  /** What the count-in plays: the beep the drill uses, or the kit's sticks. */
  countInSound?: JamCountInSound;
  /** Which synthesis recipe the bass and keys use. Absent: "fingered" / "epiano". */
  bassVoice?: JamBassVoice;
  keysVoice?: JamKeysVoice;
  /**
   * A kit of your own samples: a folder on this machine holding any of
   * kick, snare, snare_soft, hat, hat_open, ride, rim, crash as WAV. Voices
   * the folder lacks come from the built-in kit named in `kit`. Decoded off
   * the audio thread when the table is compiled. Absent or null: built-in.
   */
  customKit?: { dir: string } | null;
  // -------------------------------------------------------------------------
  // The arrangement (fourth pass, plans/tasks/jam-v4/BRIEF.md A1). Both are
  // decided in `src/jam/arrangement.ts` and applied by `compileJam`; the Rust
  // side reads them as `apply_at` and `ends_form` under the same camelCase
  // rename as everything above.
  // -------------------------------------------------------------------------
  /**
   * When this table takes effect. `"barLine"` holds the WHOLE table — the
   * drums included — until the next downbeat.
   *
   * The drums used to apply at once and the lines at the bar line, which is
   * right for an edit (you moved a slider, you want to hear it) and wrong for
   * an arrangement: a drummer sent a bar ahead would arrive a bar early, so
   * the breakdown would start halfway through the bar before it. Absent or
   * `"now"` is what an edit sends and what every caller sent before this.
   */
  applyAt?: "now" | "barLine";
  /**
   * The tune finishes at the end of this bar. The engine plays the bar out,
   * stops, and emits `jam-ended` with no payload.
   *
   * Set by `song` on the last bar of its last chorus and by nothing else.
   * Absent or false: the form goes round again, as it always has.
   */
  endsForm?: boolean;
  /**
   * The drummer plays you in: the last beat the count-in would have sounded
   * is the fill's last beat instead, kick, snare and toms, straight into bar
   * one.
   *
   * It is the other half of `intro: "fill"` — the crash on bar one is the
   * half the arrangement can write into a bar, and this is the half that
   * happens before bar one exists, where nothing but the engine's own
   * counter is running.
   *
   * **It also says what `fill` is.** A table with this set spends its fill
   * row on the pickup and plays no bar-line fill, because an arrangement
   * writes its fills into `bar` and a second one on the chorus's last bar
   * would play over the first. Absent or false: `fill` is a fill, which is
   * every jam that loops.
   */
  pickup?: boolean;
};

export type JamKeysLine = {
  voicings: number[][];
  /** Gain multiplier on the keys voice, 0.5..1.5. */
  gain: number;
  /** How hard each voicing is played, per tick. See `JamBassLine.velocities`. */
  velocities?: number[];
  /** How long each voicing rings, in ticks. See `JamBassLine.lengths`. */
  lengths?: number[];
};

/**
 * Per-lane gain, 0..1.5, 1.0 each by default.
 *
 * `perc` is the percussionist's own fader and not part of `drums`, because the
 * two are separate players through separate faders: a shaker that came up with
 * the kit could never be turned down under it, which is the one thing anybody
 * ever wants to do to a shaker.
 */
export type JamMix = { drums: number; bass: number; keys: number; perc: number };
export type JamCountInSound = "beep" | "sticks";

/**
 * How the keys player comps. `pads` is a whole-bar voicing on beat one;
 * `stabs` is the chord off the beat, answering the snare.
 *
 * On the record rather than in `src/jam/keysline.ts` because the record
 * carries it and `keysline.ts` already imports this file — the same reason
 * `JamTransposition` lives here and `harmony.ts` re-exports it.
 */
export type JamKeysStyle =
  | "pads"
  | "stabs"
  | "pulse"
  | "arpeggio"
  | "charleston"
  | "skank"
  | "montuno"
  | "bossaComp"
  | "shuffleComp";

/**
 * How the bass plays (2026-09-16). `auto` — and absent — follows the drummer,
 * which is what every jam did before there was a choice.
 */
export type JamBassStyle =
  | "kick"
  | "eighths"
  | "rootFifth"
  | "octaves"
  | "boogie"
  | "walking"
  | "twoFeel"
  | "pedal"
  | "bossa"
  | "tumbao"
  | "funk"
  | "countryAlt"
  | "gallop"
  | "ballad"
  | "reggae";

/** How much the bass plays around its figure. Absent: normal. */
export type JamBassBusy = "sparse" | "normal" | "busy";

/**
 * Where the form goes next. The engine applies both at the next bar line,
 * never mid-bar, and reports the result on the next BeatEvent's `formBar`.
 * `jumpTo` is consumed once; `loop` stays until replaced with null.
 */
export type JamPositionCommand = {
  /** 0-based bar of the chorus to land on at the next bar line. */
  jumpTo: number | null;
  /** Loop bars start..end inclusive, 0-based within the chorus. */
  loop: { start: number; end: number } | null;
};

export type JamBassLine = {
  pitches: number[];
  /** Gain multiplier on the bass voice, 0.5..1.5. */
  gain: number;
  /**
   * How hard each note is played, per tick, 1.0 as written; a rest's entry is
   * ignored. Absent, or exactly one entry per tick. The engine clamps to
   * 0.3..1.4 and picks the recorded layer from it.
   */
  velocities?: number[];
  /**
   * How long each note rings, in ticks. `0` (or absent) is "until the next
   * note or the bar line"; a shorter length is a detached note.
   */
  lengths?: number[];
};

/**
 * What the band does on each bar of the form, decided by the engine from
 * `formBar` and `chorus` so the change lands on the bar line.
 *
 * Phase-locked to the chorus: both windows are computed from the bar within
 * the chorus and restart at bar 0 of every chorus, so a silence lands on
 * the same chord every time round (see src/jam/practice.ts).
 * dropOut: within each chorus, every `everyBars` bars (never bar 0 itself)
 * the whole band goes silent for `bars` bars, then returns. trade: from bar
 * 0 of each chorus the band plays `bandBars` bars, then for `youBars` bars
 * the drums play hats only and the bass rests; repeats. Both may be set;
 * drop-out wins on a bar where both apply.
 */
export type JamPracticeConfig = {
  dropOut: { everyBars: number; bars: number } | null;
  trade: { bandBars: number; youBars: number } | null;
};

/** What the band is doing on a bar. Mirrored on every BeatEvent as `bandState`. */
export type JamBandState = "full" | "hatsOnly" | "silent";

// ---------------------------------------------------------------------------
// The library item
// ---------------------------------------------------------------------------

export type JamFeel = "straight" | "shuffle" | "swing";
export type JamIntensity = "soft" | "normal" | "loud";

/**
 * Concert pitch, or the part a Bb or Eb instrument reads. This is the union
 * `TranspositionOption` in `./harmony` is; it lives here because the record
 * carries it and `harmony.ts` already imports this file.
 */
export type JamTransposition = "concert" | "bb" | "eb";

/**
 * The shapes on the setup board. `custom` carries its own bar count; the
 * others are fixed: blues12 = 12, loop8 = 8, bars16 = 16, aaba32 = 32,
 * one = 4.
 */
export type JamFormKind = "blues12" | "loop8" | "bars16" | "aaba32" | "one" | "custom";

export type JamForm = { kind: JamFormKind; bars: number };

/** A saved jam. Lives in the store under the `jams` key, like setlists. */
export type Jam = {
  id: string;
  name: string;
  createdAt: number;
  bpm: number;
  /** One of the ids in `src/jam/grooves.ts`. */
  grooveId: string;
  feel: JamFeel;
  intensity: JamIntensity;
  /** One of `JAM_KIT_IDS`. Kept on the record so saved jams survive more kits. */
  kit: string;
  form: JamForm;
  /** Beats counted in before bar 1. 0..8, the engine's own limit. */
  countIn: number;
  /** A fill on the last bar of every chorus and a crash on the one. */
  fills: boolean;
  /**
   * The key, written the way `keyName` in `./harmony` writes it: "A", "Dm",
   * "A blues". The MODE lives in this string — that is what the trailing "m"
   * and " blues" are — so there is no second field to disagree with it, and
   * `parseKey` reads it back. Optional, so a record from before keys still
   * loads; a jam without one is read as C major.
   */
  key?: string;
  /**
   * What the player reads: concert pitch, or a Bb or Eb instrument's part.
   * Display only — the band always plays in concert. Absent: concert.
   */
  transposition?: JamTransposition;
  /** A groove made in the editor, used instead of `grooveId` when present. */
  customGroove?: JamCustomGroove;
  /**
   * Who is in the band. Absent means nobody has touched the toggles, and the
   * band is then the lineup for the instrument you play — the band never
   * plays your instrument (JAM_MODE §3.1). Touch a toggle and the answer
   * becomes the record's, and stays the record's.
   *
   * `perc` is optional and absent means NO percussionist, exactly as `keys`
   * once did: a jam saved before this pass keeps the band it was saved with,
   * and a bossa that played as a kit alone goes on playing as a kit alone
   * until somebody turns the row on. The vibes are what turn it on for new
   * jams (`applyVibe`), which is the whole of the default.
   */
  band?: { drums: boolean; bass: boolean; keys?: boolean; perc?: boolean };
  /**
   * The chord names down the timeline. Absent: off.
   *
   * The TIMELINE only, since 2026-09-18. It governed the NOW block as well,
   * which made a switch named after one part of the screen quietly turn off
   * the most useful part of another — the chord you are on, its scales and
   * the way to the fretboard. Thirty-two names down a timeline is a matter of
   * taste; one chord at the top of the screen is what the mode is for.
   */
  chords?: boolean;
  /** The practice tools. Absent: none. */
  practice?: JamPracticeSettings;
  /** Fills every N bars within the chorus as well as at its end. Absent or 0: end only. */
  fillEvery?: number;
  /**
   * The changes, typed in: one chord name per bar of the chorus ("A7",
   * "Dm7", "Bb"), exactly `form.bars` long. Absent: the form's own
   * progression for the key.
   */
  progression?: string[];
  /**
   * The meter, when it is not the groove's own: the beat groups the
   * metronome's meter editor uses ([2, 2, 3] for 7/8) and the ticks per
   * beat. A groove that does not fit the meter is replaced by the rule
   * groove (kick on group starts, snare late in the group, hats on the
   * subdivision). Absent: the groove's meter.
   */
  meter?: { beatGroups: number[]; ticksPerBeat: 1 | 2 | 3 | 4 | 6 };
  /**
   * How the keys comp, when there are keys. Absent or `auto`: whatever the
   * groove's style calls for (it was "pads" before there were more than two).
   */
  keysStyle?: JamKeysStyle | "auto";
  /** How the bass plays. Absent or `auto`: follows the drummer. */
  bassStyle?: JamBassStyle | "auto";
  /** How busy the bass is around its figure. Absent: normal. */
  bassBusy?: JamBassBusy;
  /**
   * Which named progression the form plays (`src/jam/changes.ts`). Absent or
   * `auto`: the one the groove's style calls for. Typed-in chords
   * (`progression`) still win bar by bar.
   */
  changes?: string;
  /** Per-lane volume. Absent: 1.0 each. */
  mix?: JamMix;
  /** Absent: "beep". */
  countInSound?: JamCountInSound;
  /** Spoken cues (count-in, sections, "your four") where a voice is set up. Absent: off. */
  cues?: boolean;
  /** Record takes, opt-in. Absent: off. */
  takes?: boolean;
  /**
   * Second pass (plans/JAM_UX_DECISIONS.md). The vibe the jam started from
   * and its variation, the voices the bass and keys play with, a kit of your
   * own samples, and what the chord sheet keeps on the playing screen.
   */
  vibe?: string;
  variation?: string;
  bassVoice?: JamBassVoice;
  keysVoice?: JamKeysVoice;
  /** A folder of WAVs on this machine used as the kit; wins over `kit`. */
  customKit?: { dir: string; name: string } | null;
  /** One shape pinned to the playing screen, or none. */
  pinnedShape?: { root: number; quality: string; index: number } | null;
  /** The chord sheet follows the jam (off by default). */
  shapesFollow?: boolean;
  /**
   * Fourth pass: whether the band LOOPS, BUILDS or plays a SONG.
   *
   * Absent means loop — what the band did before there was an arrangement —
   * so every jam anybody has saved plays exactly what it played. New jams are
   * created with `{ mode: "build" }`, so the default is a band that plays a
   * tune rather than a bar on repeat. The rules live in
   * `src/jam/arrangement.ts`; nothing here but the record.
   */
  arrangement?: JamArrangement;
};

// ---------------------------------------------------------------------------
// The arrangement (fourth pass, plans/tasks/jam-v4/BRIEF.md A1)
// ---------------------------------------------------------------------------

export type JamArrangementMode = "loop" | "build" | "song";

/**
 * How the band plays a tune, as four fields on the record.
 *
 * `loop` is a bar that repeats — the whole of what the band could do until
 * this pass. `build` holds back at the top, opens up as the form comes round,
 * drops to a breakdown and never ends. `song` is `build` with a last chorus
 * and an ending.
 *
 * Everything optional has a default in `jamArrangement` (`./arrangement`), and
 * those defaults are read rather than written into the record, so a jam saved
 * before a field existed still means what its author meant.
 */
export type JamArrangement = {
  mode: JamArrangementMode;
  /** Song only: how many times round, 2..32. Absent: 4. */
  choruses?: number;
  /** Whether the band comes in on a pickup. Absent: "fill". */
  intro?: "none" | "fill";
  /** Build and Song: a breakdown chorus every N. Absent: 4. 0: never. */
  breakdownEvery?: number;
};

export type JamBassVoice = "fingered" | "picked" | "upright" | "slap" | "synth";
export type JamKeysVoice = "epiano" | "organ" | "clav" | "pad";

/** A recorded take: your playing with the band mixed in, kept locally. */
export type JamTake = {
  id: string;
  jamId: string;
  createdAt: number;
  durationSec: number;
  /** Absolute path of the WAV in the app's data directory. */
  path: string;
  /**
   * Absolute path of the dry stem — you alone, without the band — when the
   * take was recorded with a mic and there is one (`SONGS.md` A8).
   *
   * Nothing on screen shows it or ever should: it is not a second recording
   * the player has to think about, it is the same take with the band taken
   * out, written under the same opt-in and deleted with it (`take.rs`). It
   * exists because pitch cannot be read off a mix — the review is what will
   * use it.
   *
   * Optional because a take of the band alone has none, and because every
   * sidecar written before the stem existed has none either; `take.rs`
   * skips the field rather than writing a null into those files.
   */
  dryPath?: string;
};

export type JamCustomGroove = {
  name: string;
  beatsPerBar: number;
  ticksPerBeat: 1 | 2 | 3 | 4 | 6;
  bar: JamPattern;
  fill: JamPattern | null;
};

export type JamPracticeSettings = {
  /** 0 = off; else every N bars the band drops out for `dropOutBars`. */
  dropOutEvery: number;
  dropOutBars: number;
  /** 0 = off; else trade this many bars: band plays N, you play N. */
  tradeBars: number;
  /** 0 = off; else the tempo rises by `tempoStep` every `tempoEveryChoruses` choruses. */
  tempoStep: number;
  tempoEveryChoruses: number;
};

export const JAM_INTENSITY_GAIN: Record<JamIntensity, number> = {
  soft: 0.7,
  normal: 1.0,
  loud: 1.25,
};

export const JAM_FORM_BARS: Record<Exclude<JamFormKind, "custom">, number> = {
  blues12: 12,
  loop8: 8,
  bars16: 16,
  aaba32: 32,
  one: 4,
};

export const JAM_MAX_FORM_BARS = 64;
export const JAM_MAX_COUNT_IN = 8;
