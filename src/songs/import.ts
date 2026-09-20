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
import { TICKS_PER_QUARTER } from "./types";
import type {
  SongBar,
  SongFormat,
  SongMeter,
  SongNote,
  SongScore,
  SongSection,
  SongTechnique,
  SongTempo,
} from "./types";

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

/** The extensions we say we take, for the file input and the drop target. */
export const SONG_FILE_EXTENSIONS = [
  ".gp",
  ".gp3",
  ".gp4",
  ".gp5",
  ".gpx",
  ".musicxml",
  ".xml",
  ".mxl",
  ".alphatex",
  ".tex",
] as const;

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
