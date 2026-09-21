// The importer is where a file stops being someone else's format and starts
// being something the coach can be told about, so the things pinned here are
// the ones that would be wrong in a way nobody notices: a repeat that plays
// the wrong bars, a string counted from the wrong end, a capo that never
// reaches the pitch. Every fixture was hand-written (`fixtures.ts`).
import { exporter } from "@coderline/alphatab";
import { describe, expect, it } from "vitest";
import {
  SONG_FILE_EXTENSIONS,
  SongImportError,
  buildBacking,
  buildTransport,
  importSong,
  parseSongFile,
  playableTracks,
  songId,
} from "./import";
import { TICKS_PER_QUARTER } from "./types";
import { wholeSong } from "./schedule";
import {
  BAND_WITH_SEVEN_EIGHT,
  CAPO_TWO,
  CHORD_THEN_SINGLES,
  DROP_D,
  GUITAR_AND_BASS,
  HAMMER_AND_PULL,
  NO_STRINGS,
  REPEAT_WITH_ENDINGS,
  SECTIONS,
  SEVEN_STRING,
  TEMPO_AND_SEVEN_EIGHT,
  texBytes,
} from "./fixtures";

/** Every fixture is alphaTex, so every import in here goes through one name. */
function load(tex: string, track = 0) {
  const bytes = texBytes(tex);
  return importSong(bytes, "fixture.alphatex", track);
}

describe("reading a file", () => {
  it("takes the formats the picker offers", () => {
    expect(SONG_FILE_EXTENSIONS).toContain(".gp");
    expect(SONG_FILE_EXTENSIONS).toContain(".musicxml");
    expect(SONG_FILE_EXTENSIONS).toContain(".alphatex");
  });

  it("reads the title and the artist off the file", () => {
    const { score } = load(REPEAT_WITH_ENDINGS);
    expect(score.title).toBe("Repeat and endings");
    expect(score.artist).toBe("Nobody");
  });

  it("falls back to the file name when the file names nothing", () => {
    const parsed = parseSongFile(texBytes(`\\tempo 120\n.\n3.3.4 |`), "Riff in A.alphatex");
    expect(parsed.title).toBe("Riff in A");
  });

  it("says what to do when it cannot read the bytes at all", () => {
    const junk = new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9]);
    expect(() => importSong(junk, "broken.gp", 0)).toThrow(SongImportError);
    try {
      importSong(junk, "broken.gp", 0);
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("broken.gp");
      expect(message).toContain("Guitar Pro");
      // A musician reads this. No stack, no type name, no "failed to parse".
      expect(message).not.toMatch(/undefined|Error|null|exception/i);
    }
  });

  it("refuses a track that is not written on strings, and says which to pick", () => {
    expect(() => load(NO_STRINGS)).toThrow(SongImportError);
    try {
      load(NO_STRINGS);
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("Keys");
      expect(message).toContain("guitar or bass");
      expect(message).not.toMatch(/undefined|null|tuning\.length/i);
    }
  });

  it("refuses a track index the file does not have", () => {
    expect(() => load(REPEAT_WITH_ENDINGS, 7)).toThrow(SongImportError);
  });
});

describe("the track picker", () => {
  it("offers guitars before basses, whatever order the file wrote them", () => {
    const parsed = parseSongFile(texBytes(GUITAR_AND_BASS), "two.alphatex");
    // The file writes the bass first on purpose.
    expect(parsed.tracks[0].name).toBe("Bass");
    const offered = playableTracks(parsed);
    expect(offered.map((t) => t.name)).toEqual(["Lead", "Bass"]);
    expect(offered[0].kind).toBe("guitar");
    expect(offered[1].kind).toBe("bass");
  });

  it("shows the tuning and the capo before anything plays", () => {
    const parsed = parseSongFile(texBytes(CAPO_TWO), "capo.alphatex");
    expect(parsed.tracks[0].capo).toBe(2);
    expect(parsed.tracks[0].stringCount).toBe(6);
    // Highest string first, the way a player reads a tab.
    expect(parsed.tracks[0].tuning).toEqual([76, 71, 67, 62, 57, 52]);
  });

  it("keeps a track it cannot follow in the list rather than hiding it", () => {
    const parsed = parseSongFile(texBytes(NO_STRINGS), "keys.alphatex");
    expect(parsed.tracks).toHaveLength(1);
    expect(parsed.tracks[0].kind).toBe("other");
  });
});

describe("repeats and endings", () => {
  const { score } = load(REPEAT_WITH_ENDINGS);

  it("unrolls into the bars that are actually played", () => {
    // Printed 0,1 are the body; 2 is the first ending, 3 the second.
    expect(score.bars.map((b) => b.printedBar)).toEqual([0, 1, 2, 0, 1, 3]);
  });

  it("numbers the played bars from zero, in order", () => {
    expect(score.bars.map((b) => b.index)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("lays the played bars end to end with no gap", () => {
    let tick = 0;
    for (const bar of score.bars) {
      expect(bar.startTick).toBe(tick);
      tick += bar.lengthTicks;
    }
    expect(tick).toBe(6 * 4 * TICKS_PER_QUARTER);
  });

  it("plays the repeated bar's notes again, at the second time's ticks", () => {
    const first = score.notes.filter((n) => n.tick >= 0 && n.tick < 3840);
    const second = score.notes.filter((n) => n.tick >= 11520 && n.tick < 15360);
    expect(second).toHaveLength(first.length);
    expect(second.map((n) => n.fret)).toEqual(first.map((n) => n.fret));
    expect(second.map((n) => n.tick - 11520)).toEqual(first.map((n) => n.tick));
  });
});

describe("tempo and meter", () => {
  const { score, warnings } = load(TEMPO_AND_SEVEN_EIGHT);

  it("lands a tempo change on its own bar line", () => {
    expect(score.tempoMap).toEqual([
      { tick: 0, bpm: 100 },
      { tick: 3840, bpm: 140 },
    ]);
    expect(score.tempoMap[1].tick).toBe(score.bars[1].startTick);
  });

  it("does not repeat a tempo that has not changed", () => {
    // Bar 3 is still 140. Two entries, not three.
    expect(score.tempoMap).toHaveLength(2);
  });

  it("gives a 7/8 bar seven eighths, not four quarters", () => {
    expect(score.bars[2].lengthTicks).toBe(7 * (TICKS_PER_QUARTER / 2));
    expect(score.bars[2].lengthTicks).toBe(3360);
    expect(score.bars[0].lengthTicks).toBe(3840);
  });

  it("records the meter change against the bar it starts on", () => {
    expect(score.meterMap).toEqual([
      { bar: 0, numerator: 4, denominator: 4 },
      { bar: 2, numerator: 7, denominator: 8 },
    ]);
  });

  it("says nothing was flattened when nothing was", () => {
    expect(warnings).toEqual([]);
  });
});

describe("tunings", () => {
  it("keeps all seven strings, highest first", () => {
    const { score } = load(SEVEN_STRING);
    expect(score.tuning).toEqual([76, 71, 67, 62, 57, 52, 47]);
  });

  it("numbers strings the way a tab does — 1 is the highest", () => {
    const { score } = load(SEVEN_STRING);
    // The fixture plays the lowest string and then the highest.
    const lowest = score.notes.find((n) => n.midi === 47);
    const highest = score.notes.find((n) => n.midi === 76);
    expect(lowest?.string).toBe(7);
    expect(highest?.string).toBe(1);
  });

  it("survives drop D", () => {
    const { score } = load(DROP_D);
    expect(score.tuning).toEqual([76, 71, 67, 62, 57, 50]);
    // Every note in the fixture is the open sixth string: D, not E.
    expect(score.notes.every((n) => n.string === 6 && n.fret === 0)).toBe(true);
    expect(score.notes.every((n) => n.midi === 50)).toBe(true);
  });

  it("sounds a capo without moving the fret numbers", () => {
    const { score } = load(CAPO_TWO);
    expect(score.capo).toBe(2);
    // Open first string, capo 2: written as fret 0, sounds two semitones up.
    const open = score.notes.find((n) => n.string === 1)!;
    expect(open.fret).toBe(0);
    expect(open.midi).toBe(78);
    // Fret 3 on the fourth string (D), plus the capo.
    const fretted = score.notes.find((n) => n.string === 4)!;
    expect(fretted.fret).toBe(3);
    expect(fretted.midi).toBe(67);
    // The tuning itself stays open — the capo is not baked into it.
    expect(score.tuning[0]).toBe(76);
  });
});

describe("notes", () => {
  it("sorts by tick, then by string", () => {
    const { score } = load(CHORD_THEN_SINGLES);
    for (let i = 1; i < score.notes.length; i++) {
      const prev = score.notes[i - 1];
      const next = score.notes[i];
      expect(next.tick > prev.tick || (next.tick === prev.tick && next.string >= prev.string)).toBe(
        true,
      );
    }
  });

  it("gives every note its index as its id, after the sort", () => {
    const { score } = load(REPEAT_WITH_ENDINGS);
    expect(score.notes.map((n) => n.id)).toEqual(score.notes.map((_, i) => i));
  });

  it("marks a tied note as making no new attack", () => {
    const { score } = load(REPEAT_WITH_ENDINGS);
    const tied = score.notes.filter((n) => n.tieFromPrevious);
    expect(tied).toHaveLength(1);
    // It is the last note of the second ending.
    expect(tied[0].tick).toBe(score.bars[5].startTick + 3 * TICKS_PER_QUARTER);
  });

  it("tells a hammer-on from a pull-off by where the fret went", () => {
    const { score } = load(HAMMER_AND_PULL);
    const hammer = score.notes.find((n) => n.techniques.includes("hammer"));
    const pull = score.notes.find((n) => n.techniques.includes("pull"));
    expect(hammer?.fret).toBe(7); // 5 -> 7, upwards
    expect(pull?.fret).toBe(5); // 7 -> 5, back down
  });

  it("gives a chord one tick and three notes", () => {
    const { score } = load(CHORD_THEN_SINGLES);
    const atZero = score.notes.filter((n) => n.tick === 0);
    expect(atZero).toHaveLength(3);
    expect(atZero.map((n) => n.string)).toEqual([1, 2, 3]);
  });

  it("carries a duration in ticks", () => {
    const { score } = load(CHORD_THEN_SINGLES);
    expect(score.notes.every((n) => n.durTicks === TICKS_PER_QUARTER)).toBe(true);
  });
});

describe("sections", () => {
  const { score } = load(SECTIONS);

  it("names the sections the file marked", () => {
    expect(score.sections.map((s) => s.name)).toEqual(["Verse", "Chorus"]);
  });

  it("runs each section up to the bar before the next one starts", () => {
    expect(score.sections[0]).toEqual({ name: "Verse", startBar: 0, endBar: 1 });
    expect(score.sections[1]).toEqual({ name: "Chorus", startBar: 2, endBar: 3 });
  });

  it("tags each played bar with the section it is in", () => {
    expect(score.bars.map((b) => b.section)).toEqual(["Verse", "Verse", "Chorus", "Chorus"]);
  });
});

describe("the score's shape", () => {
  it("is schema 1 at 960 ticks a quarter, and says where it came from", () => {
    const { score } = load(REPEAT_WITH_ENDINGS);
    expect(score.schema).toBe(1);
    expect(score.ticksPerQuarter).toBe(960);
    expect(score.source).toEqual({
      fileName: "fixture.alphatex",
      format: "alphatex",
      trackIndex: 0,
      trackName: "Lead",
    });
  });

  it("gives the same file and track the same id, and a different track a different one", () => {
    const bytes = texBytes(GUITAR_AND_BASS);
    expect(songId(bytes, 0)).toBe(songId(bytes, 0));
    expect(songId(bytes, 0)).not.toBe(songId(bytes, 1));
    expect(songId(bytes, 0)).not.toBe(songId(texBytes(SECTIONS), 0));
    expect(songId(bytes, 0)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("reads a file's format from its name", () => {
    const parsed = parseSongFile(texBytes(SECTIONS), "song.tex");
    expect(parsed.format).toBe("alphatex");
  });
});

// Nobody imports alphaTex. The fixtures are written in it because it is
// readable, but the paths that matter are the binary Guitar Pro reader and
// the MusicXML one, and neither is exercised by anything above. These two
// tests reach them without a copyrighted file existing: the Guitar Pro bytes
// are written here by alphaTab's own exporter from a fixture we typed, and
// the MusicXML is typed out in full.
describe("the formats people actually import", () => {
  it("reads a Guitar Pro file, repeats and all", () => {
    const original = importSong(texBytes(REPEAT_WITH_ENDINGS), "fixture.alphatex", 0).score;
    const gpBytes = new exporter.Gp7Exporter().export(
      parseSongFile(texBytes(REPEAT_WITH_ENDINGS), "fixture.alphatex").atScore,
      null,
    );
    // A real .gp is a zip; if this stops being one, the exporter changed.
    expect(gpBytes[0]).toBe(0x50);
    expect(gpBytes[1]).toBe(0x4b);

    const { score } = importSong(gpBytes, "Round trip.gp", 0);
    expect(score.source.format).toBe("gp");
    expect(score.title).toBe("Repeat and endings");
    expect(score.artist).toBe("Nobody");
    expect(score.tuning).toEqual(original.tuning);
    expect(score.bars.map((b) => b.printedBar)).toEqual([0, 1, 2, 0, 1, 3]);
    expect(score.notes.map((n) => n.midi)).toEqual(original.notes.map((n) => n.midi));
  });

  it("reads MusicXML, with its tuning and its capo", () => {
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Hand written</work-title></work>
  <identification><creator type="composer">Nobody</creator></identification>
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>TAB</sign><line>5</line></clef>
        <staff-details>
          <staff-lines>6</staff-lines>
          <staff-tuning line="1"><tuning-step>E</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
          <staff-tuning line="2"><tuning-step>A</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
          <staff-tuning line="3"><tuning-step>D</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
          <staff-tuning line="4"><tuning-step>G</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
          <staff-tuning line="5"><tuning-step>B</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
          <staff-tuning line="6"><tuning-step>E</tuning-step><tuning-octave>4</tuning-octave></staff-tuning>
          <capo>2</capo>
        </staff-details>
      </attributes>
      <note><pitch><step>G</step><octave>3</octave></pitch><duration>2</duration><type>quarter</type>
        <notations><technical><string>4</string><fret>0</fret></technical></notations></note>
      <note><pitch><step>A</step><octave>3</octave></pitch><duration>2</duration><type>quarter</type>
        <notations><technical><string>4</string><fret>2</fret></technical></notations></note>
    </measure>
  </part>
</score-partwise>`;
    const { score } = importSong(new TextEncoder().encode(musicXml), "Hand written.musicxml", 0);
    expect(score.source.format).toBe("musicxml");
    // alphaTab's MusicXML reader returns U+00A0 between the words, which is
    // invisible on screen and wrong everywhere else. `tidy` takes it out.
    expect(score.title).toBe("Hand written");
    expect(score.title).not.toContain(" ");
    expect(score.tuning).toEqual([64, 59, 55, 50, 45, 40]);
    expect(score.capo).toBe(2);
    expect(score.notes).toHaveLength(2);
    expect(score.notes.map((n) => n.fret)).toEqual([0, 2]);
  });
});

// ---------------------------------------------------------------------------
// What the engine is handed
//
// The transport is what the click walks and the backing is what the band
// plays, and both fail in the same silent way: the piece still sounds, in the
// wrong meter or with the kick where the snare should be. So these pin the
// numbers rather than the shapes.
// ---------------------------------------------------------------------------

describe("the transport", () => {
  it("carries every played bar with its own meter", () => {
    const { score } = load(TEMPO_AND_SEVEN_EIGHT);
    const transport = buildTransport(score, wholeSong(score));

    expect(transport.ticksPerQuarter).toBe(TICKS_PER_QUARTER);
    expect(transport.bars).toHaveLength(3);
    expect(transport.bars.map((b) => `${b.numerator}/${b.denominator}`)).toEqual([
      "4/4",
      "4/4",
      "7/8",
    ]);
    // A 7/8 bar is seven eighths, and an eighth is 480 ticks.
    expect(transport.bars[2].lengthTicks).toBe(7 * 480);
    expect(transport.bars.map((b) => b.startTick)).toEqual([0, 3840, 7680]);
  });

  it("hands over the tempo steps, in order and inside what the click plays", () => {
    const { score } = load(TEMPO_AND_SEVEN_EIGHT);
    const transport = buildTransport(score, wholeSong(score));
    expect(transport.tempoMap.map((t) => t.bpm)).toEqual([100, 140]);
    expect(transport.tempoMap[0].tick).toBe(0);
    expect(transport.tempoMap[1].tick).toBe(3840);
  });

  it("opens the tempo map at or before the first bar, whatever the file did", () => {
    const { score } = load(TEMPO_AND_SEVEN_EIGHT);
    const moved = { ...score, tempoMap: [{ tick: 999, bpm: 100 }] };
    expect(buildTransport(moved, wholeSong(score)).tempoMap[0].tick).toBe(0);
  });

  it("holds a tempo the engine cannot click inside the range it can", () => {
    const { score } = load(TEMPO_AND_SEVEN_EIGHT);
    const silly = { ...score, tempoMap: [{ tick: 0, bpm: 900 }] };
    expect(buildTransport(silly, wholeSong(score)).tempoMap[0].bpm).toBe(300);
  });

  it("clamps the range, the speed and the count-in rather than let the load fail", () => {
    const { score } = load(TEMPO_AND_SEVEN_EIGHT);
    const transport = buildTransport(
      score,
      { startBar: 7, endBar: 2 },
      { loops: true, tempoPercent: 300, countInBars: 9 },
    );
    expect(transport.range).toEqual({ startBar: 2, endBar: 2 });
    expect(transport.loops).toBe(true);
    expect(transport.tempoPercent).toBe(100);
    expect(transport.countInBars).toBe(2);
  });

  it("defaults to the whole piece once through, at the written tempo, with no count-in", () => {
    const { score } = load(SECTIONS);
    const transport = buildTransport(score, wholeSong(score));
    expect(transport.loops).toBe(false);
    expect(transport.tempoPercent).toBe(100);
    expect(transport.countInBars).toBe(0);
  });
});

describe("the band from the file", () => {
  const parsed = () => parseSongFile(texBytes(BAND_WITH_SEVEN_EIGHT), "band.alphatex");

  it("gives EVERY track a player, the one you are learning included", () => {
    // W28. Before it, the horn and the guitar were in `leftOut` and a file
    // of two guitars played as a metronome — which is the bug this whole
    // task is. Every track now has somebody to play it, and what the
    // recorded band cannot play goes to the General MIDI synthesiser.
    const { backing } = buildBacking(parsed(), 0);
    expect(backing.tracks.map((t) => [t.name, t.role])).toEqual([
      ["Guitar", "synth"],
      ["Drums", "drums"],
      ["Bass", "bass"],
      ["Piano", "keys"],
      ["Horn", "synth"],
    ]);
  });

  it("marks the part you are learning as the guide, and only that one", () => {
    const { backing } = buildBacking(parsed(), 0);
    expect(backing.tracks.filter((t) => t.guide).map((t) => t.name)).toEqual(["Guitar"]);
    const bassist = buildBacking(parsed(), 2);
    expect(bassist.backing.tracks.filter((t) => t.guide).map((t) => t.name)).toEqual(["Bass"]);
  });

  it("leaves nothing out of a file MIDI itself has room for", () => {
    expect(buildBacking(parsed(), 0).leftOut).toEqual([]);
    expect(buildBacking(parsed(), 2).leftOut).toEqual([]);
  });

  it("carries the General MIDI instrument each track asks for", () => {
    const { backing } = buildBacking(parsed(), 0);
    for (const track of backing.tracks) {
      expect(track.program).toBeGreaterThanOrEqual(0);
      expect(track.program).toBeLessThanOrEqual(127);
    }
  });

  it("gives a synthesised track its notes out of the file's own MIDI", () => {
    // The guitar the player is learning is one of them, because it is the
    // guide. Lengths come from the note-offs the generator wrote, which is
    // where a palm mute and a let-ring already differ.
    const { backing } = buildBacking(parsed(), 0);
    const guitar = backing.tracks.find((t) => t.name === "Guitar")!;
    expect(guitar.notes.length).toBeGreaterThan(0);
    expect(guitar.notes.every((n) => n.durTicks > 0)).toBe(true);
    expect(guitar.notes.every((n) => n.midi >= 0 && n.midi <= 127)).toBe(true);
    expect(guitar.notes.every((n) => n.velocity > 0 && n.velocity <= 1)).toBe(true);
    // Sorted, because the engine walks them in the order they arrive.
    const ticks = guitar.notes.map((n) => n.tick);
    expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
  });

  it("reads drums as General MIDI percussion numbers, not as articulations", () => {
    const { backing } = buildBacking(parsed(), 0);
    const drums = backing.tracks.find((t) => t.role === "drums")!;
    // Bar one: kick and hat together, hat, snare and hat together, hat.
    expect(drums.notes.slice(0, 6).map((n) => [n.tick, n.midi])).toEqual([
      [0, 35],
      [0, 42],
      [960, 42],
      [1920, 38],
      [1920, 42],
      [2880, 42],
    ]);
  });

  it("reads the bass and the keys as sounding pitches", () => {
    const { backing } = buildBacking(parsed(), 0);
    const bass = backing.tracks.find((t) => t.role === "bass")!;
    const keys = backing.tracks.find((t) => t.role === "keys")!;
    // Fret 3 of the low E of a four-string bass is G1.
    expect(bass.notes[0].midi).toBe(31);
    expect(keys.notes.slice(0, 4).map((n) => n.midi)).toEqual([60, 64, 67, 72]);
  });

  it("puts the 7/8 bar's notes where the 7/8 bar is", () => {
    const { backing } = buildBacking(parsed(), 0);
    const keys = backing.tracks.find((t) => t.role === "keys")!;
    // Two 4/4 bars, then seven eighths starting at 7680, 480 apart.
    const seven = keys.notes.filter((n) => n.tick >= 7680);
    expect(seven.map((n) => n.tick)).toEqual([7680, 8160, 8640, 9120, 9600, 10080, 10560]);
    expect(seven.every((n) => n.durTicks === 480)).toBe(true);
  });

  it("carries a velocity the engine can read, between nothing and everything", () => {
    const { backing } = buildBacking(parsed(), 0);
    for (const track of backing.tracks) {
      for (const note of track.notes) {
        expect(note.velocity).toBeGreaterThan(0);
        expect(note.velocity).toBeLessThanOrEqual(1);
      }
    }
  });

  it("is your own part alone when that is all the file has in it", () => {
    // Not an empty band any more: a file with one track still plays, because
    // the one track is the guide. A player who opened a solo transcription
    // presses play and hears the piece.
    const { backing, leftOut } = buildBacking(
      parseSongFile(texBytes(REPEAT_WITH_ENDINGS), "repeat.alphatex"),
      0,
    );
    expect(backing.tracks.map((t) => [t.name, t.guide])).toEqual([["Lead", true]]);
    expect(backing.tracks[0].notes.length).toBeGreaterThan(0);
    expect(leftOut).toEqual([]);
  });
});
