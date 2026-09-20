/**
 * The importer — a file the player owns, turned into a `SongScore`.
 *
 * alphaTab reads Guitar Pro 3–7, MusicXML and alphaTex; everything below is
 * the translation from its model to ours, and it is pure so that the whole of
 * it is testable without a browser. `plans/tasks/songs/W4-FINDINGS.md` §2 is
 * the evidence for every mapping here, and §7 lists the traps.
 *
 * Two of those traps are worth repeating where they are used, because both
 * would produce a score that looks right and is silently wrong:
 *
 * - **Ticks come in two bases.** `beat.playbackStart` is relative to its bar.
 *   `MasterBarTickLookup.start` is absolute, in PLAYED order. A third field,
 *   `beat.absolutePlaybackStart`, is absolute in PRINTED order and is the
 *   wrong one — on a repeated bar it has a single value for a bar played
 *   twice. The unroll is `playedBar.start + beat.playbackStart`, and that one
 *   line is the whole of it.
 * - **alphaTab counts strings from the lowest.** Guitar Pro, our contract and
 *   every tab a musician has ever read count from the highest.
 */
import { LogLevel, Logger, importer, midi, model } from "@coderline/alphatab";

// The model's classes are reachable only through the namespace — alphaTab
// exports `model` but not `Note`, `Score` and `Track` at the top level.
type AtNote = model.Note;
type AtScore = model.Score;
type AtTrack = model.Track;
import {
  MAX_COUNT_IN_BARS,
  MAX_TEMPO_PERCENT,
  MIN_TEMPO_PERCENT,
  TICKS_PER_QUARTER,
} from "./types";
// Re-exported so nothing that already reads it from here has to move; the
// constant itself lives in `types.ts`, which does not drag alphaTab along.
export { SONG_FILE_EXTENSIONS } from "./types";
import type {
  SongBacking,
  SongBackingNote,
  SongBackingTrack,
  SongBar,
  SongFormat,
  SongMeter,
  SongNote,
  SongRole,
  SongScore,
  SongSection,
  SongTechnique,
  SongTempo,
  SongTransport,
  SongTransportBar,
} from "./types";
import { clampRange, meterAt } from "./schedule";
import type { BarRange } from "./schedule";

/**
 * A file we could not read, carrying a sentence a musician can act on.
 *
 * The `cause` keeps alphaTab's own error for the console; `message` is the
 * only part that ever reaches a screen, so it says what to do rather than
 * what failed (`AGENTS.md`: musicians, not developers).
 */
export class SongImportError extends Error {
  /**
   * alphaTab's own error, kept for the console. Its own property rather than
   * `Error`'s `cause` because the repo targets ES2020, where the constructor
   * takes no options bag.
   */
  readonly reason?: unknown;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "SongImportError";
    this.reason = options?.cause;
  }
}

/** Something we changed on the way in, and the player deserves to know. */
export type SongImportWarning =
  /**
   * A tempo that slides rather than steps. `SONGS.md` A4 decided v1 holds
   * step changes on bar lines, so a ritardando becomes one tempo per bar.
   */
  | { kind: "tempoFlattened"; bars: number }
  /** A bar whose notes ran past its own meter. Kept, but it will look odd. */
  | { kind: "barOverfilled"; printedBar: number };

export type SongImportResult = { score: SongScore; warnings: SongImportWarning[] };

/** What the track picker shows before anything plays (`SONGS.md` A3). */
export type SongTrackChoice = {
  index: number;
  name: string;
  /** String 1 (highest) first, open, without the capo. */
  tuning: number[];
  capo: number;
  stringCount: number;
  /** Guitar and bass are offered first; the rest are still importable. */
  kind: "guitar" | "bass" | "other";
};

/** A file read once, so the picker and the import do not parse it twice. */
export type ParsedSong = {
  title: string;
  artist: string;
  fileName: string;
  format: SongFormat;
  tracks: SongTrackChoice[];
  /** alphaTab's model, kept so the tab can be drawn from the source. */
  readonly atScore: AtScore;
};

// --- reading the file ------------------------------------------------------

/**
 * Tidy a piece of text the file gave us.
 *
 * Not cosmetic. alphaTab's MusicXML reader hands back **non-breaking
 * spaces** where the file had ordinary ones: a `<work-title>` reading
 * `Hand written` arrives with U+00A0 between the words. A title like that
 * sorts oddly, cannot be found by typing it, and compares unequal to the
 * same words typed by hand -- all without ever looking wrong on screen.
 * Every string that reaches a library row or a search box goes through
 * here, and `import.test.ts` pins it with a MusicXML fixture.
 */
function tidy(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/gu, " ").trim();
}

function formatFor(fileName: string): SongFormat {
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  if (ext === ".alphatex" || ext === ".tex") return "alphatex";
  if (ext === ".musicxml" || ext === ".xml" || ext === ".mxl") return "musicxml";
  return "gp";
}

/**
 * MIDI programs 25–39 are the guitars and basses in the General MIDI set; 33
 * to 39 are the basses. A file that names its track "Gtr" and leaves the
 * program at piano still reads as a guitar because of the string count, which
 * is the more reliable signal of the two.
 */
function trackKind(track: AtTrack): SongTrackChoice["kind"] {
  const staff = track.staves[0];
  if (staff.isPercussion) return "other";
  const strings = staff.tuning.length;
  const program = track.playbackInfo.program;
  if (strings === 0) return "other";
  if (strings <= 6 && program >= 32 && program <= 39) return "bass";
  if (strings === 4 || strings === 5) return "bass";
  if (strings >= 6) return "guitar";
  return "other";
}

/**
 * Read the file. Throws `SongImportError` and nothing else — alphaTab throws
 * several different shapes (a format error, a reader running off the end of
 * the bytes, a bag of alphaTex diagnostics) and none of them is a sentence.
 */
export function parseSongFile(bytes: Uint8Array, fileName: string): ParsedSong {
  const format = formatFor(fileName);
  let atScore: AtScore;
  // alphaTab logs the failure at error level and then throws it, so a file we
  // handle perfectly well still writes a stack trace to the console. We turn
  // the throw into a sentence below; the log is just noise, and it buries the
  // real errors in a console someone is reading for a different reason.
  const spoken = Logger.logLevel;
  try {
    Logger.logLevel = LogLevel.None;
    atScore =
      format === "alphatex"
        ? importer.ScoreLoader.loadAlphaTex(new TextDecoder().decode(bytes))
        : importer.ScoreLoader.loadScoreFromBytes(bytes);
  } catch (err) {
    throw new SongImportError(
      `Yames could not read ${fileName}. It opens Guitar Pro and MusicXML files — ` +
        `if this one opens in Guitar Pro, try saving it again as .gp or .musicxml.`,
      { cause: err },
    );
  } finally {
    Logger.logLevel = spoken;
  }

  const tracks = atScore.tracks.map<SongTrackChoice>((track: AtTrack) => {
    const staff = track.staves[0];
    return {
      index: track.index,
      name: tidy(track.name) || `Track ${track.index + 1}`,
      // alphaTab hands us the tuning highest-first already; ours is the same.
      tuning: [...staff.tuning],
      capo: staff.capo ?? 0,
      stringCount: staff.tuning.length,
      kind: trackKind(track),
    };
  });

  return {
    title: tidy(atScore.title) || tidy(fileName.replace(/\.[^.]+$/, "")),
    artist: tidy(atScore.artist),
    fileName,
    format,
    tracks,
    atScore,
  };
}

/**
 * Guitars, then basses, then the rest — each group in the file's own order.
 *
 * Percussion and anything with no strings stay in the list rather than being
 * hidden: a player who wants to follow the drum chart should be able to, and
 * a list that silently drops tracks is a list that looks like it lost them.
 */
export function playableTracks(parsed: ParsedSong): SongTrackChoice[] {
  const rank = { guitar: 0, bass: 1, other: 2 };
  return [...parsed.tracks].sort((a, b) => rank[a.kind] - rank[b.kind] || a.index - b.index);
}

// --- the id ----------------------------------------------------------------

/**
 * FNV-1a, twice, over the bytes and the track index.
 *
 * Sixteen hex characters from two passes with different offsets, because one
 * 32-bit pass over a megabyte of Guitar Pro is not enough to be sure two songs
 * differ. Synchronous on purpose: `crypto.subtle` is a promise, and this id is
 * wanted in the same breath as the score it names. Not a security hash and
 * never used as one — it is a library key.
 */
export function songId(bytes: Uint8Array, trackIndex: number): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < bytes.length; i++) {
    a = Math.imul(a ^ bytes[i], 0x01000193);
    b = Math.imul(b ^ bytes[i], 0x811c9dc5) + i;
  }
  a = Math.imul(a ^ trackIndex, 0x01000193);
  b = Math.imul(b ^ trackIndex, 0x811c9dc5);
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  return hex(a) + hex(b);
}

// --- the translation -------------------------------------------------------

/** alphaTab's string 1 is the lowest; ours is the highest. */
function contractString(atString: number, stringCount: number): number {
  return stringCount - atString + 1;
}

function techniquesOf(note: AtNote): SongTechnique[] {
  const out: SongTechnique[] = [];
  if (note.isHammerPullDestination) {
    // Which of the two it is depends on the note it came from: onto a higher
    // fret is a hammer-on, back to a lower one is a pull-off.
    const from = note.hammerPullOrigin;
    out.push(from && from.fret > note.fret ? "pull" : "hammer");
  }
  if (note.slideOutType !== model.SlideOutType.None) out.push("slide");
  if (note.hasBend) out.push("bend");
  if (note.vibrato !== model.VibratoType.None) out.push("vibrato");
  if (note.isPalmMute) out.push("palmMute");
  if (note.harmonicType !== model.HarmonicType.None) out.push("harmonic");
  if (note.isLeftHandTapped || note.beat.tap) out.push("tap");
  if (note.isLetRing) out.push("letRing");
  return out;
}

/**
 * The played timeline, from alphaTab's MIDI generator.
 *
 * We never play this MIDI — the generator is run purely because generating it
 * is what expands the repeats, and `tickLookup` is the expansion. The handler
 * it writes into is thrown away with the `MidiFile` it holds.
 */
function playedBars(atScore: AtScore): midi.MasterBarTickLookup[] {
  const generator = new midi.MidiFileGenerator(
    atScore,
    null,
    new midi.AlphaSynthMidiFileHandler(new midi.MidiFile()),
  );
  generator.generate();
  return generator.tickLookup.masterBars;
}

/**
 * Turn the chosen track into a `SongScore`.
 *
 * `bytes` is wanted again only for the id; the parse is not repeated.
 */
export function buildSongScore(
  parsed: ParsedSong,
  trackIndex: number,
  bytes: Uint8Array,
): SongImportResult {
  const track = parsed.atScore.tracks[trackIndex];
  if (!track) {
    throw new SongImportError(
      `That track is not in ${parsed.fileName} any more. Import the file again and pick a track.`,
    );
  }
  const staff = track.staves[0];
  const stringCount = staff.tuning.length;
  if (stringCount === 0) {
    throw new SongImportError(
      `"${track.name}" is not written as tab, so Yames cannot follow your fingers on it. ` +
        `Pick the guitar or bass track instead.`,
    );
  }

  const warnings: SongImportWarning[] = [];
  const bars: SongBar[] = [];
  const notes: SongNote[] = [];
  const tempoMap: SongTempo[] = [];
  const meterMap: SongMeter[] = [];
  const sections: SongSection[] = [];

  let flattenedBars = 0;
  let openSection: SongSection | null = null;

  const played = playedBars(parsed.atScore);
  for (const playedBar of played) {
    const master = playedBar.masterBar;
    const barIndex = bars.length;
    const startTick = playedBar.start;
    const lengthTicks = playedBar.end - playedBar.start;

    // Tempo: one step per played bar, at its bar line. A bar that carries
    // more than one change is a gradual change the file wrote out beat by
    // beat, and A4 says we keep the first and say we did.
    const changes = playedBar.tempoChanges;
    const bpm =
      changes.length > 0
        ? changes[0].tempo
        : (tempoMap[tempoMap.length - 1]?.bpm ?? parsed.atScore.tempo);
    if (changes.length > 1) flattenedBars++;
    if (tempoMap.length === 0 || tempoMap[tempoMap.length - 1].bpm !== bpm) {
      tempoMap.push({ tick: startTick, bpm });
    }

    // Meter: a step change, same rule.
    const numerator = master.timeSignatureNumerator;
    const denominator = master.timeSignatureDenominator;
    const lastMeter = meterMap[meterMap.length - 1];
    if (!lastMeter || lastMeter.numerator !== numerator || lastMeter.denominator !== denominator) {
      meterMap.push({ bar: barIndex, numerator, denominator });
    }

    // Sections: a marker opens one and closes the one before it. They are
    // named over PLAYED bars, so a chorus played twice is two sections —
    // which is what "loop the second chorus" needs to be able to mean.
    const sectionName = tidy(master.section?.text) || tidy(master.section?.marker);
    if (sectionName) {
      if (openSection) openSection.endBar = barIndex - 1;
      openSection = { name: sectionName, startBar: barIndex, endBar: barIndex };
      sections.push(openSection);
    }

    bars.push({
      index: barIndex,
      startTick,
      lengthTicks,
      printedBar: master.index,
      ...(openSection ? { section: openSection.name } : {}),
    });

    // The notes of this played bar come from the PRINTED bar's beats, at
    // offsets relative to their own bar. This is the unroll.
    const printed = staff.bars[master.index];
    if (!printed) continue;
    let overfilled = false;
    for (const voice of printed.voices) {
      for (const beat of voice.beats) {
        if (beat.isRest || beat.notes.length === 0) continue;
        const tick = startTick + beat.playbackStart;
        if (beat.playbackStart >= lengthTicks) overfilled = true;
        for (const note of beat.notes) {
          if (note.string <= 0) continue; // not written on a string: not ours to follow
          notes.push({
            id: notes.length,
            tick,
            durTicks: beat.playbackDuration,
            string: contractString(note.string, stringCount),
            fret: note.fret,
            midi: note.realValue,
            tieFromPrevious: note.isTieDestination,
            ghost: note.isGhost,
            dead: note.isDead,
            accent: note.accentuated !== model.AccentuationType.None,
            techniques: techniquesOf(note),
          });
        }
      }
    }
    if (overfilled) warnings.push({ kind: "barOverfilled", printedBar: master.index });
  }

  if (openSection) openSection.endBar = bars.length - 1;
  if (flattenedBars > 0) warnings.push({ kind: "tempoFlattened", bars: flattenedBars });

  // Sorted by tick, then string, and the ids renumbered to match — `id` is
  // "index in `notes`", so it has to be assigned after the sort, not before.
  notes.sort((a, b) => a.tick - b.tick || a.string - b.string);
  notes.forEach((note, i) => (note.id = i));

  if (tempoMap.length === 0) tempoMap.push({ tick: 0, bpm: parsed.atScore.tempo });
  if (meterMap.length === 0) meterMap.push({ bar: 0, numerator: 4, denominator: 4 });

  const score: SongScore = {
    schema: 1,
    id: songId(bytes, trackIndex),
    title: parsed.title,
    artist: parsed.artist,
    source: {
      fileName: parsed.fileName,
      format: parsed.format,
      trackIndex,
      trackName: tidy(track.name) || `Track ${trackIndex + 1}`,
    },
    tuning: [...staff.tuning],
    capo: staff.capo ?? 0,
    ticksPerQuarter: TICKS_PER_QUARTER,
    tempoMap,
    meterMap,
    bars,
    notes,
    sections,
  };
  return { score, warnings };
}

/** Read a file and take one track, in one call. */
export function importSong(
  bytes: Uint8Array,
  fileName: string,
  trackIndex: number,
): SongImportResult {
  return buildSongScore(parseSongFile(bytes, fileName), trackIndex, bytes);
}

// --- what the engine is handed ---------------------------------------------
//
// Two functions, and the split is the contract's: a `SongTransport` is made
// from the SCORE, because the range and the speed change every time the
// player touches a chip and rebuilding it must not cost a parse; a
// `SongBacking` is made from the FILE, because the other tracks were never in
// the score — it holds the one part the player chose.

/** The tempo range the engine's click will take. `song.rs`'s own bounds. */
const MIN_BPM = 20;
const MAX_BPM = 300;

/** The widest bar the click will mark, and the denominators it knows. */
const MAX_BEATS_PER_BAR = 32;
const DENOMINATORS = [1, 2, 4, 8, 16, 32];

/** The most notes one backing track may carry. `song.rs`'s `MAX_NOTES`. */
const MAX_BACKING_NOTES = 200_000;

function clampInt(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return low;
  return Math.min(high, Math.max(low, Math.round(value)));
}

/** What `buildTransport` is asked for besides the range. */
export type TransportOptions = {
  loops?: boolean;
  /** A percentage of what is written, 25 to 100. */
  tempoPercent?: number;
  /** 0, 1 or 2 bars before the first pass. */
  countInBars?: number;
};

/**
 * The score, as the engine plays it.
 *
 * Everything here is clamped to what `song::plan_range` accepts, and that is
 * the whole job: the engine refuses a transport it cannot check rather than
 * guessing, and a file that says 480 BPM or writes a bar in 9/64 would
 * otherwise be a song that will not load with a sentence nobody can act on.
 * A clamped tempo plays; a rejected one does not.
 *
 * `bars` is the WHOLE song, not the range — the range is a pair of indices
 * into it, and the engine reads the bars on either side to know where a loop
 * seam falls.
 */
export function buildTransport(
  score: SongScore,
  range: BarRange,
  options: TransportOptions = {},
): SongTransport {
  const bars: SongTransportBar[] = score.bars.map((bar) => {
    const meter = meterAt(score, bar.index);
    const denominator = DENOMINATORS.includes(meter.denominator) ? meter.denominator : 4;
    return {
      startTick: Math.max(0, Math.round(bar.startTick)),
      // A bar of no length is one the engine refuses; a beat of the meter is
      // the least dishonest thing to give it.
      lengthTicks: Math.max(1, Math.round(bar.lengthTicks)),
      numerator: clampInt(meter.numerator, 1, MAX_BEATS_PER_BAR),
      denominator,
    };
  });

  // Sorted, non-empty, and opening at or before the first bar: the three
  // things the engine checks before it will walk a map at all.
  const tempoMap: SongTempo[] = score.tempoMap
    .map((step) => ({
      tick: Math.max(0, Math.round(step.tick)),
      bpm: Math.min(MAX_BPM, Math.max(MIN_BPM, step.bpm)),
    }))
    .sort((a, b) => a.tick - b.tick);
  const firstBarTick = bars[0]?.startTick ?? 0;
  if (tempoMap.length === 0) tempoMap.push({ tick: firstBarTick, bpm: 120 });
  if (tempoMap[0].tick > firstBarTick) tempoMap[0] = { ...tempoMap[0], tick: firstBarTick };

  return {
    ticksPerQuarter: TICKS_PER_QUARTER,
    tempoMap,
    bars,
    range: clampRange(score, range),
    loops: options.loops ?? false,
    tempoPercent: clampInt(options.tempoPercent ?? 100, MIN_TEMPO_PERCENT, MAX_TEMPO_PERCENT),
    countInBars: clampInt(options.countInBars ?? 0, 0, MAX_COUNT_IN_BARS),
  };
}

/** A track the band has nobody to play, and why it is not in the backing. */
export type SongBackingResult = {
  backing: SongBacking;
  /**
   * The tracks that were left out, by name, so the screen can say so rather
   * than let a horn section vanish without a word.
   */
  leftOut: string[];
};

/**
 * General MIDI programs, by the only two families the band can play.
 *
 * 0–7 are the pianos and 16–23 the organs, which between them are every
 * keyboard the set has; 32–39 are the basses. Everything else — strings,
 * horns, voices, the whole synth half of the set — has no voice here and is
 * named rather than silently dropped.
 */
const KEYS_PROGRAMS = (program: number) =>
  (program >= 0 && program <= 7) || (program >= 16 && program <= 23);
const BASS_PROGRAMS = (program: number) => program >= 32 && program <= 39;

/**
 * The top note of a bass's open strings.
 *
 * E3. A four-string bass's top string is G2 (43) and a six-string's is C3
 * (48); a guitar's is E4 (64) and a baritone's B3 (59). So anything whose
 * highest open string is at or below E3 is tuned as a bass whatever its
 * program says, which is the case that matters: files written by hand, and
 * files whose author never set a program at all.
 */
const BASS_TOP_STRING = 52;

/** The bass clef. A staff written on one is a bass or a left hand. */
const BASS_CLEF = 3;

function roleOf(track: AtTrack): SongRole | null {
  const staff = track.staves[0];
  if (!staff) return null;
  if (track.isPercussion || staff.isPercussion) return "drums";
  const program = track.playbackInfo.program;
  const tuning = staff.tuning;
  const bassTuned = tuning.length >= 4 && Math.max(...tuning) <= BASS_TOP_STRING;
  const bassClef = staff.bars[0]?.clef === BASS_CLEF;
  if (BASS_PROGRAMS(program) || bassTuned || bassClef) return "bass";
  if (KEYS_PROGRAMS(program)) return "keys";
  return null;
}

/**
 * How hard a note is struck, 0..1, from what the page says.
 *
 * Guitar Pro's own eight dynamics, on Guitar Pro's own velocities (15 to 127
 * in steps of 16), divided by 127. The extended marks — four and five p's,
 * the sforzandos — are not in that ladder and are read as the nearest one
 * that is: a file that writes `ffff` means "louder than ff", and the band
 * has one ceiling.
 */
const DYNAMIC_VELOCITY = [15, 31, 47, 63, 79, 95, 111, 127];

function velocityOf(note: AtNote): number {
  const dynamics = note.dynamics as number;
  const midi =
    dynamics >= 0 && dynamics < DYNAMIC_VELOCITY.length
      ? DYNAMIC_VELOCITY[dynamics]
      : // PPPP…PPPPPP (8–10) are softer than pp; FFFF…FFFFFF (11–13) and the
        // sforzandos (14 and up) are an accent, which is as loud as it gets.
        dynamics >= 8 && dynamics <= 10
        ? DYNAMIC_VELOCITY[1]
        : DYNAMIC_VELOCITY[7];
  return Math.min(1, Math.max(0, midi / 127));
}

/**
 * The General MIDI percussion number a drum note names.
 *
 * `note.realValue` is useless on a percussion staff — it hands back the
 * articulation's INDEX, so a kick and a hi-hat come out as 0 and 1. The
 * number the engine wants is the articulation's `outputMidiNumber`. When the
 * file lists no articulations at all, alphaTab documents
 * `percussionArticulation` as being the Guitar Pro 7 number itself, which for
 * every drum in the kit IS the General MIDI one (35 kick, 38 snare, 42 hat),
 * so it passes through.
 */
function drumMidi(track: AtTrack, note: AtNote): number | null {
  const index = note.percussionArticulation;
  if (index < 0) return null;
  const articulation = track.percussionArticulations[index];
  const midi = articulation ? articulation.outputMidiNumber : index;
  return midi >= 0 && midi <= 127 ? midi : null;
}

/**
 * The file's own rhythm section, every track but the one being played.
 *
 * The unroll is the same one line `buildSongScore` uses and for the same
 * reason — `playedBar.start + beat.playbackStart` — so the band's notes and
 * the player's notes are on one timeline and a repeat is played by both.
 *
 * A tied note makes no event: the file has already sounded it, and striking
 * a sampled bass again on the tie is the one thing that would make the
 * backing audibly wrong rather than merely approximate.
 */
export function buildBacking(parsed: ParsedSong, chosenTrackIndex: number): SongBackingResult {
  const tracks: SongBackingTrack[] = [];
  const leftOut: string[] = [];
  const byTrack = new Map<number, SongBackingNote[]>();

  for (const track of parsed.atScore.tracks) {
    // THE PLAYER'S OWN TRACK IS NEVER IN THE BACKING. That is the whole point
    // of the mode: the part under the cursor is the part you play.
    if (track.index === chosenTrackIndex) continue;
    const role = roleOf(track);
    if (!role) {
      leftOut.push(tidy(track.name) || `Track ${track.index + 1}`);
      continue;
    }
    const notes: SongBackingNote[] = [];
    byTrack.set(track.index, notes);
    tracks.push({ role, name: tidy(track.name) || `Track ${track.index + 1}`, notes });
  }

  if (tracks.length > 0) {
    for (const playedBar of playedBars(parsed.atScore)) {
      const master = playedBar.masterBar;
      const startTick = playedBar.start;
      for (const track of parsed.atScore.tracks) {
        const notes = byTrack.get(track.index);
        if (!notes) continue;
        const drums = track.isPercussion || track.staves[0]?.isPercussion;
        for (const staff of track.staves) {
          const printed = staff.bars[master.index];
          if (!printed) continue;
          for (const voice of printed.voices) {
            for (const beat of voice.beats) {
              if (beat.isRest || beat.notes.length === 0) continue;
              const tick = startTick + beat.playbackStart;
              for (const note of beat.notes) {
                if (note.isTieDestination) continue;
                const midi = drums ? drumMidi(track, note) : note.realValue;
                if (midi === null || midi < 0 || midi > 127) continue;
                notes.push({
                  tick,
                  durTicks: beat.playbackDuration,
                  midi,
                  velocity: velocityOf(note),
                });
              }
            }
          }
        }
      }
    }
  }

  // Sorted, because the engine places them in the order they arrive and a
  // chord written across two voices would otherwise be two instants.
  for (const track of tracks) {
    track.notes.sort((a, b) => a.tick - b.tick || a.midi - b.midi);
    // The engine refuses a track longer than this rather than allocate for
    // it. Two hundred thousand notes is not a song anybody wrote, so cutting
    // the tail is the right shape of failure: the piece still plays.
    if (track.notes.length > MAX_BACKING_NOTES) track.notes.length = MAX_BACKING_NOTES;
  }
  return { backing: { tracks }, leftOut };
}
