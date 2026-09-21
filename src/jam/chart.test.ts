// Paste a chord chart. Every notation in plans/tasks/jam-v4/W31-CONTENT.md §3
// has a test here, and so does every ugly case — an empty box, a box of prose,
// a symbol nobody can read — because the paste box is the one control in Jam
// whose input is somebody else's file, and the only honest way to build it is
// to decide what each shape means and then hold the decision down.
import { describe, expect, it } from "vitest";
import { formForChart, guessKey, jamFromChart, parseChordChart } from "./chart";
import { chordName, keyName, parseChordName } from "./harmony";
import type { Key } from "./harmony";
import { STARTER_JAMS } from "./jams";
import { JAM_MAX_FORM_BARS } from "./types";

/** The bars as a player would read them back, in the key that was guessed. */
function read(text: string): string[] {
  const chart = parseChordChart(text);
  const key: Key = chart.key ?? { root: 0, mode: "major" };
  return chart.bars.map((chord) => (chord ? chordName(chord, key) : "—"));
}

describe("bar lines", () => {
  it("reads one chord a bar, with or without the outer pipes", () => {
    expect(read("| Am | F | C | G |")).toEqual(["Am", "F", "C", "G"]);
    expect(read("Am | F | C | G")).toEqual(["Am", "F", "C", "G"]);
  });

  it("splits a bar of two chords into two bars, and says it did", () => {
    // The grid is one chord to a bar; halving them evenly is the only split
    // that keeps both, and the source text goes into the warnings so the
    // preview can say the form came out longer than the chart looks.
    const chart = parseChordChart("| Am F | C G |");
    expect(read("| Am F | C G |")).toEqual(["Am", "F", "C", "G"]);
    expect(chart.warnings).toEqual(["Am F", "C G"]);
  });

  it("takes % and a bar of slashes as the bar before", () => {
    expect(read("| C | % | F | / / / / |")).toEqual(["C", "C", "F", "F"]);
  });

  it("reads slashes after a chord as beat marks, not as bars", () => {
    // `| Am / / / |` is one bar of A minor. Four bars would be the single
    // most common way for a pasted chart to come out four times too long.
    expect(read("| Am / / / | F / / / |")).toEqual(["Am", "F"]);
  });

  it("repeats a bar on x2 and a group on a repeat sign", () => {
    expect(read("| C | x2 | F |")).toEqual(["C", "C", "F"]);
    expect(read("|: C | F :|")).toEqual(["C", "F", "C", "F"]);
    expect(read("|: C | F :| x3")).toEqual(["C", "F", "C", "F", "C", "F"]);
  });

  it("counts a dotted bar as one bar", () => {
    expect(read("| C . . . | G . . . |")).toEqual(["C", "G"]);
  });
});

describe("iReal-style charts", () => {
  it("reads several bars from one line", () => {
    expect(read("Am7 D7 | Gmaj7 | Cmaj7 | F#m7b5 B7")).toEqual([
      "Am7",
      "D7",
      "Gmaj7",
      "Cmaj7",
      "F#m7b5",
      "B7",
    ]);
  });

  it("turns the section letters into sections", () => {
    const chart = parseChordChart("[A] | C | F | [B] | D7 | G7 |");
    expect(chart.sections).toEqual([
      { name: "A", start: 0 },
      { name: "B", start: 2 },
    ]);
    // And the letter is never read as a chord of A.
    expect(chart.bars).toHaveLength(4);
  });

  it("gives a lettered A A B A of eight bars the form it is", () => {
    const eight = (chord: string) => `| ${chord} |`.repeat(8);
    const chart = parseChordChart(
      `[A] ${eight("C")} [A] ${eight("C")} [B] ${eight("F")} [A] ${eight("C")}`,
    );
    expect(chart.bars).toHaveLength(32);
    expect(formForChart(chart, 32)).toEqual({ kind: "aaba32", bars: 32 });
  });
});

describe("a lyric sheet with the chords above the words", () => {
  const sheet = [
    "C              G",
    "A long time ago in a room",
    "Am             F",
    "I heard a song that was true",
  ].join("\n");

  it("takes the chords and ignores the words", () => {
    expect(read(sheet)).toEqual(["C", "G", "Am", "F"]);
  });

  it("judges a line whole, so one chord-shaped word is still a lyric", () => {
    // "A long time ago" has an A in it. A line is a chord line only when
    // everything on it is a chord, which is the whole of the rule.
    expect(read("A long time ago")).toEqual([]);
    expect(read("Do you remember")).toEqual([]);
  });

  it("takes one bar per chord when the sheet has no bar lines", () => {
    expect(parseChordChart(sheet).bars).toHaveLength(4);
  });

  it("still reads bar lines when the sheet has them", () => {
    expect(read("| C | G |\nthe words underneath\n| Am | F |")).toEqual(["C", "G", "Am", "F"]);
  });
});

describe("the spellings people actually type", () => {
  it("reads them all as the chord they mean", () => {
    // `A∆7` is the increment sign on most charts and a Greek delta in
    // `harmony.ts`, which is why the parser normalises one to the other.
    const chart = parseChordChart("Amin | A- | AM7 | A∆7 | Aø | A° | A5");
    expect(chart.bars.map((c) => c?.quality)).toEqual([
      "min",
      "min",
      "maj7",
      "maj7",
      "m7b5",
      "dim",
      "5",
    ]);
    expect(chart.warnings).toEqual([]);
  });

  it("keeps the root of a slash chord and puts the whole symbol in warnings", () => {
    const chart = parseChordChart("| D/F# | G |");
    expect(chart.bars.map((c) => c?.root)).toEqual([
      parseChordName("D")!.root,
      parseChordName("G")!.root,
    ]);
    expect(chart.warnings).toEqual(["D/F#"]);
  });

  it("takes N.C. as a bar with no chord in it", () => {
    const chart = parseChordChart("| C | N.C. | G |");
    expect(chart.bars[1]).toBeNull();
    expect(chart.warnings).toEqual([]);
  });
});

describe("the meter", () => {
  it("is four unless the chart says otherwise", () => {
    expect(parseChordChart("| C | G |").beatsPerBar).toBe(4);
    expect(parseChordChart("4/4\n| C | G |").beatsPerBar).toBe(4);
  });

  it("takes 3/4 and 6/8 from anywhere in the text", () => {
    expect(parseChordChart("Waltz, 3/4\n| C | G |").beatsPerBar).toBe(3);
    expect(parseChordChart("| C | G |\n(6/8 throughout)").beatsPerBar).toBe(6);
  });

  it("does not mistake a slash chord for a time signature", () => {
    expect(parseChordChart("| C/G | D |").beatsPerBar).toBe(4);
  });
});

describe("the key", () => {
  it("guesses the key a diatonic set is in", () => {
    expect(keyName(parseChordChart("| C | G | Am | F |").key!)).toBe("C");
    expect(keyName(parseChordChart("| Dm7 | G7 | Cmaj7 | Cmaj7 |").key!)).toBe("C");
  });

  it("breaks a tie toward the chord the chart starts on", () => {
    // C G Am F and Am F C G hold the same four chords and are the same fit for
    // C major and A minor. A tune that opens on A minor is in A minor.
    expect(keyName(parseChordChart("| C | G | Am | F |").key!)).toBe("C");
    expect(keyName(parseChordChart("| Am | F | C | G |").key!)).toBe("Am");
  });

  it("calls a blues a blues", () => {
    // Three dominant sevenths a step apart belong to no major or minor key,
    // and "D" would light the wrong chords on every strip on the screen.
    expect(keyName(parseChordChart("| A7 | D7 | A7 | E7 |").key!)).toBe("A blues");
  });

  it("is not thrown off a key by one borrowed chord", () => {
    expect(keyName(parseChordChart("| C | Am | Eb | F | C | G |").key!)).toBe("C");
  });

  it("has no key to give when there are no chords", () => {
    expect(parseChordChart("").key).toBeUndefined();
    expect(guessKey([])).toBeUndefined();
  });
});

describe("the ugly cases", () => {
  it("reads an empty box as an empty chart rather than throwing", () => {
    for (const text of ["", "   ", "\n\n\n"]) {
      const chart = parseChordChart(text);
      expect(chart.bars).toEqual([]);
      expect(chart.warnings).toEqual([]);
      expect(chart.beatsPerBar).toBe(4);
    }
  });

  it("reads a box of prose as a chart with no chords in it", () => {
    const chart = parseChordChart("the quick brown fox jumped over\nthe lazy dog again");
    expect(chart.bars).toEqual([]);
    expect(chart.key).toBeUndefined();
  });

  it("keeps the readable chords when one symbol is not", () => {
    // A progression is a row of things a person typed, and one of them being
    // "??" must leave the others playing.
    const chart = parseChordChart("| C | ?? | G | Hm |");
    expect(chart.bars.map((c) => c?.quality ?? null)).toEqual(["maj", null, "maj", null]);
    expect(chart.warnings).toEqual(["??", "Hm"]);
  });

  it("survives a chart longer than the engine's form", () => {
    const long = Array.from({ length: 200 }, () => "| C |").join(" ");
    expect(parseChordChart(long).bars.length).toBe(200);
    expect(jamFromChart("Long", long).form.bars).toBe(JAM_MAX_FORM_BARS);
  });

  it("never returns a repeat of a bar that does not exist", () => {
    const chart = parseChordChart("| % | C |");
    expect(chart.bars).toEqual([null, chart.bars[1]]);
  });
});

describe("a jam made of a chart", () => {
  const base = STARTER_JAMS.find((j) => j.name === "Rock in G")!;

  it("sets the changes, the key and the form, and keeps the vibe and the tempo", () => {
    const jam = jamFromChart("Pasted", "| Am | F | C | G | Am | F | C | G |", base);
    expect(jam.name).toBe("Pasted");
    expect(jam.progression).toEqual(["Am", "F", "C", "G", "Am", "F", "C", "G"]);
    expect(jam.key).toBe("Am");
    expect(jam.form).toEqual({ kind: "loop8", bars: 8 });
    // The jam you were looking at, playing the tune you pasted.
    expect(jam.bpm).toBe(base.bpm);
    expect(jam.vibe).toBe(base.vibe);
    expect(jam.kit).toBe(base.kit);
    expect(jam.chords).toBe(true);
  });

  it("gives an odd length its own form rather than rounding it", () => {
    const jam = jamFromChart("Five bars", "| C | F | G | Am | F |", base);
    expect(jam.form).toEqual({ kind: "custom", bars: 5 });
    expect(jam.progression).toHaveLength(5);
  });

  it("takes the groove and the count-in from the chart's meter", () => {
    // A chart in three under a rock groove would not fit the meter, and the
    // drummer would fall back to the rule. There is a waltz; play the waltz.
    const jam = jamFromChart("In three", "3/4\n| C | Am | F | G |", base);
    expect(jam.grooveId).toBe("waltz");
    expect(jam.countIn).toBe(3);
    const six = jamFromChart("In six", "6/8\n| C | F |", base);
    expect(six.grooveId).toBe("sixEight");
    expect(six.countIn).toBe(6);
  });

  it("still makes a playable jam from nothing at all", () => {
    const jam = jamFromChart("Nothing", "");
    expect(jam.form.bars).toBeGreaterThanOrEqual(1);
    expect(jam.key).toBe("C");
    expect(jam.grooveId).toBe("rock8");
  });

  it("writes a bar with no chord as 'as the form' rather than as a name", () => {
    const jam = jamFromChart("Rest", "| C | N.C. | G | G |", base);
    expect(jam.progression).toEqual(["C", "", "G", "G"]);
  });
});
