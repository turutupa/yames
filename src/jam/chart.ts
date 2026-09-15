/**
 * Paste a chord chart (plans/JAM_KILLER.md §2 A3).
 *
 * The fastest way to jam over a tune is to paste the chart you already have.
 * People have charts in three shapes and this reads all three:
 *
 * 1. **Bar lines.** `| Am | F | C | G |`, or the same thing without the outer
 *    pipes. `%` or a bar of slashes means "same as the bar before"; `/` after
 *    a chord is a beat mark and means nothing; `x2` repeats a bar and
 *    `|: … :| x3` repeats a group.
 * 2. **iReal-style.** `Am7 D7 | Gmaj7 | …`, with `[A]` and `[B]` section
 *    letters. The letters become sections where the shape allows it — see
 *    `formForChart` — and are otherwise dropped, because a `custom` form is
 *    one section and inventing a second would be a lie on the timeline.
 * 3. **A lyric sheet with the chords above the words.** Every line is judged
 *    whole: a line all of whose tokens are chords is a chord line, and every
 *    other line is words and is ignored. That one rule is the whole of it, and
 *    it is why "A long time ago" is a lyric (four tokens, one chord) while
 *    "C G Am F" is not.
 *
 * ## What `warnings` holds, and why it is not a sentence
 *
 * The strings are **the chart's own words**: the exact text of every cell this
 * parser did something lossy with — a symbol it could not read, a slash chord
 * whose bass note it dropped, a bar that held two chords. Not our sentences,
 * for two reasons. They are the only part of the answer that is already in the
 * user's language, and the UI needs the COUNT ("2 chords you may want to
 * check") rather than a paragraph — a list of our own prose would have to be
 * translated fifteen times to say something the chart already said.
 *
 * ## What it does not do
 *
 * It does not guess a tempo, because a chart has none. It does not read
 * rhythms: `| Am . . . |` is a bar of A minor and the dots are gone. And a bar
 * with two chords in it becomes two bars, because the jam grid is one chord to
 * a bar — the source text goes into `warnings` so the preview can say so
 * rather than the form quietly coming out four bars long from three.
 */
import { chordName, keyName, parseChordName, parseKey } from "./harmony";
import { chordsInKey, seventhsInKey } from "./diatonic";
import type { Chord, Key, KeyMode, PitchClass } from "./harmony";
import { createJam } from "./jams";
import { grooveById } from "./grooves";
import { AS_THE_FORM } from "./progression";
import { JAM_MAX_FORM_BARS } from "./types";
import type { Jam, JamForm } from "./types";

/** A section letter and the bar of the chart it opens. */
export type ChartSection = { name: string; start: number };

export type ChordChart = {
  /** One entry per bar. `null` is a bar with no chord of its own. */
  bars: (Chord | null)[];
  /** 4, unless the text says `3/4` or `6/8`. */
  beatsPerBar: number;
  /** The diatonic fit of the chord set, or absent when there are no chords. */
  key?: Key;
  /** The chart's own words for everything this parser handled lossily. */
  warnings: string[];
  /** `[A]`, `[B]` … and the bar each opens. Empty when the chart has none. */
  sections: ChartSection[];
};

/** Sentinels for the repeat signs, so splitting on `|` cannot eat them. */
const OPEN_REPEAT = "";
const CLOSE_REPEAT = "";

/**
 * The characters a chart arrives with that mean something else here.
 *
 * `∆` is the INCREMENT sign and `Δ` is a Greek capital delta; every chart on
 * the internet uses one or the other for a major seventh and `harmony.ts`
 * reads the Greek one. The dashes are the same story turned the other way: a
 * typographer's dash is not the hyphen that means minor.
 */
function normalise(text: string): string {
  return text
    .replace(/∆/g, "Δ")
    .replace(/[–—−]/g, "-")
    .replace(/[   ]/g, " ")
    .replace(/‘|’/g, "'")
    .replace(/\|\s*:/g, ` ${OPEN_REPEAT} `)
    .replace(/:\s*\|/g, ` ${CLOSE_REPEAT} `);
}

/**
 * The meter, from a time signature written anywhere in the text.
 *
 * Anywhere rather than on the first line, because a pasted chart puts it in
 * the header, beside the tempo, or over the first bar depending on where it
 * came from. Three and six only: those are the two a chart writes that change
 * what a bar IS here, and a `5/4` chart needs a meter decision no parser
 * should make for you.
 */
function meterOf(text: string): number {
  if (/\b3\s*\/\s*4\b/.test(text)) return 3;
  if (/\b6\s*\/\s*8\b/.test(text)) return 6;
  return 4;
}

/** `x2`, `X4` — how many times the thing before it plays in total. */
function timesOf(token: string): number | null {
  const match = /^[xX](\d{1,2})$/.exec(token);
  if (!match) return null;
  const times = Number(match[1]);
  return times >= 1 && times <= 64 ? times : null;
}

/** "N.C.", "NC" — a bar the band sits out. Not a chord and not a mistake. */
function isNoChord(token: string): boolean {
  return /^n\.?c\.?$/i.test(token);
}

/** A bar of slashes or a `%`: the bar before, again. */
function isRepeatMark(token: string): boolean {
  return token === "%" || /^\/+$/.test(token);
}

/**
 * Is this token something a chord line is allowed to contain?
 *
 * The whole of the lyric-sheet rule. A line qualifies as a chord line when it
 * holds at least one chord and nothing this does not recognise.
 */
function isChartToken(token: string): boolean {
  if (!token) return true;
  if (token === OPEN_REPEAT || token === CLOSE_REPEAT) return true;
  if (isRepeatMark(token) || isNoChord(token)) return true;
  if (timesOf(token) !== null) return true;
  if (/^[.·]+$/.test(token)) return true;
  return parseChordName(token.split("/")[0]) !== null;
}

const SECTION = /\[\s*([A-Za-z][A-Za-z0-9' ]{0,11})\s*\]/;
const SECTION_ALL = new RegExp(SECTION.source, "g");

type Cell =
  | { kind: "bar"; text: string; chords: (Chord | null)[] }
  | { kind: "repeat" }
  | { kind: "times"; times: number }
  | { kind: "open" }
  | { kind: "close" }
  | { kind: "section"; name: string };

/**
 * One cell of the chart — a bar, a marker, or a section letter.
 *
 * A cell may carry more than one chord (`| Am F |`); turning that into bars is
 * the caller's job, because the caller is the one that has to warn about it.
 */
/**
 * Is this line a chart line, or is it the words underneath one?
 *
 * Two answers, and the second is why this is not one rule. A line WITHOUT bar
 * lines has to be all chords: "A long time ago in a room" holds an A and is a
 * lyric, and the only thing that tells it apart from "C G Am F" is that
 * everything on the second line is a chord. A line WITH bar lines has already
 * declared itself — nobody types a pipe into a lyric — so one chord is enough,
 * and a symbol inside it that nobody can read is a warning rather than a
 * reason to throw the other three bars away.
 */
function isChartLine(text: string): boolean {
  const tokens = text
    .split(/[|\s]+/)
    .filter(Boolean)
    .filter((t) => t !== OPEN_REPEAT && t !== CLOSE_REPEAT);
  const hasChord = tokens.some(
    (t) =>
      !isRepeatMark(t) && !isNoChord(t) && timesOf(t) === null && parseChordName(t.split("/")[0]),
  );
  if (!hasChord) return false;
  return text.includes("|") || tokens.every(isChartToken);
}

/** One stretch of a line between two section letters. */
function cellsOfSegment(text: string, warnings: string[]): Cell[] {
  const cells: Cell[] = [];
  const tokens = text.split(/[|\s]+/).filter(Boolean);
  // With bar lines, a cell is what sits between two pipes; without them, every
  // token is its own bar. The two are the same walk once the line is split.
  const groups = text.includes("|") ? text.split("|") : tokens;
  for (const group of groups) {
    const inner = group.split(/\s+/).filter(Boolean);
    if (inner.length === 0) continue;
    const chords: (Chord | null)[] = [];
    let sawSomething = false;
    // One repeat mark a cell: `| / / / / |` is the bar before, once, and four
    // of them would be the commonest way for a pasted chart to come out four
    // times too long.
    let repeated = false;
    for (const token of inner) {
      if (token === OPEN_REPEAT) {
        cells.push({ kind: "open" });
        continue;
      }
      if (token === CLOSE_REPEAT) {
        if (chords.length > 0) {
          cells.push({ kind: "bar", text: group.trim(), chords: [...chords] });
          chords.length = 0;
        }
        cells.push({ kind: "close" });
        sawSomething = true;
        continue;
      }
      const times = timesOf(token);
      if (times !== null) {
        if (chords.length > 0) {
          cells.push({ kind: "bar", text: group.trim(), chords: [...chords] });
          chords.length = 0;
        }
        cells.push({ kind: "times", times });
        sawSomething = true;
        continue;
      }
      if (/^[.·]+$/.test(token)) continue;
      if (isRepeatMark(token)) {
        // A slash AFTER a chord is a beat mark — `| Am / / / |` is one bar of
        // A minor, not four. A cell that is nothing but slashes is the repeat.
        if (chords.length > 0 || repeated) continue;
        cells.push({ kind: "repeat" });
        repeated = true;
        sawSomething = true;
        continue;
      }
      if (isNoChord(token)) {
        chords.push(null);
        continue;
      }
      const head = token.split("/")[0];
      const chord = parseChordName(head);
      if (!chord) {
        warnings.push(token);
        chords.push(null);
        continue;
      }
      // A slash chord keeps its root; the bass note is a voicing instruction
      // and nothing in this mode plays an inversion you asked for by name.
      if (token.includes("/") && token.split("/")[1]) warnings.push(token);
      chords.push(chord);
    }
    if (chords.length > 0) cells.push({ kind: "bar", text: group.trim(), chords });
    else if (!sawSomething && inner.length > 0) continue;
  }
  return cells;
}

/**
 * One line of the chart, section letters and all.
 *
 * The letters are taken out before anything is read — `[A]` is a section and
 * never a bar of A major — and put back as cells in the place they were found,
 * so `[A] | C | F | [B] | D7 |` says the B section starts at bar two rather
 * than at bar zero with the A.
 */
function cellsOfLine(line: string, warnings: string[]): Cell[] {
  if (!isChartLine(line.replace(SECTION_ALL, " "))) return [];
  const cells: Cell[] = [];
  // A capturing split interleaves the section names with the text around them:
  // [text, name, text, name, text].
  const pieces = line.split(SECTION_ALL);
  pieces.forEach((piece, index) => {
    if (index % 2 === 1) cells.push({ kind: "section", name: piece.trim() });
    else cells.push(...cellsOfSegment(piece, warnings));
  });
  return cells;
}

/** Every cell of the chart, line by line, words already thrown away. */
function cellsOf(text: string, warnings: string[]): Cell[] {
  const out: Cell[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    out.push(...cellsOfLine(line, warnings));
  }
  return out;
}

/**
 * The cells, played out into bars.
 *
 * Repeats are expanded here rather than carried on the record, because the
 * record is a progression: exactly one chord name per bar of the form, and a
 * form that says "these four bars, twice" is a form with eight bars in it.
 */
function barsOf(cells: readonly Cell[], warnings: string[]): {
  bars: (Chord | null)[];
  sections: ChartSection[];
} {
  const bars: (Chord | null)[] = [];
  const sections: ChartSection[] = [];
  // Where the innermost open repeat began, as a bar index.
  const opens: number[] = [];
  let lastGroupStart = -1;
  let lastGroupEnd = -1;
  let lastBarStart = -1;

  for (const cell of cells) {
    switch (cell.kind) {
      case "section":
        sections.push({ name: cell.name, start: bars.length });
        break;
      case "open":
        opens.push(bars.length);
        break;
      case "close": {
        const from = opens.pop() ?? 0;
        lastGroupStart = from;
        lastGroupEnd = bars.length;
        // A repeat sign with no `xN` after it is played twice, which is what
        // the sign means on paper.
        bars.push(...bars.slice(from, bars.length));
        break;
      }
      case "repeat":
        bars.push(bars.length > 0 ? bars[bars.length - 1] : null);
        lastBarStart = bars.length - 1;
        break;
      case "times": {
        // `x3` after a group means three times in all, and the group has
        // already been played twice by its closing sign.
        if (lastGroupEnd === bars.length - (lastGroupEnd - lastGroupStart)) {
          const body = bars.slice(lastGroupStart, lastGroupEnd);
          bars.length = lastGroupStart + body.length;
          for (let i = 1; i < cell.times; i += 1) bars.push(...body);
          lastGroupEnd = bars.length;
        } else if (lastBarStart >= 0) {
          const bar = bars[lastBarStart];
          bars.length = lastBarStart + 1;
          for (let i = 1; i < cell.times; i += 1) bars.push(bar);
        }
        break;
      }
      case "bar": {
        // Two chords in a bar become two bars: the grid is one chord to a bar,
        // and halving them evenly is the only split that keeps both.
        if (cell.chords.length > 1) warnings.push(cell.text);
        lastBarStart = bars.length;
        for (const chord of cell.chords) bars.push(chord);
        break;
      }
    }
  }
  return { bars, sections };
}

const MODES: readonly KeyMode[] = ["major", "minor", "blues"];

/** Every chord a key contains, triads and sevenths together. */
function chordsOfKey(root: PitchClass, mode: KeyMode): Chord[] {
  return [...chordsInKey(root, mode), ...seventhsInKey(root, mode)].map((c) => ({
    root: c.root,
    quality: c.quality,
  }));
}

/**
 * The key, as the diatonic fit of the chord set.
 *
 * Two points for a chord the key contains outright, one for a chord whose root
 * is in the key under another quality — that second half is what stops a
 * single borrowed chord throwing the answer off a key the other eleven bars
 * are plainly in. Ties go to the key the FIRST chord is the tonic of, which is
 * how a player reads a chart: whatever else is in it, a tune that starts on A
 * minor and ends on A minor is in A minor.
 *
 * Blues is a candidate mode, and has to be: three dominant sevenths a step
 * apart belong to no major or minor key, and guessing "D major" for a blues in
 * A would light the wrong chords on every strip on the screen.
 */
export function guessKey(chords: readonly Chord[]): Key | undefined {
  const played = chords.filter(Boolean);
  if (played.length === 0) return undefined;
  const distinct = new Map<string, Chord>();
  for (const chord of played) distinct.set(`${chord.root}:${chord.quality}`, chord);
  const first = played[0];

  let best: Key | undefined;
  let bestScore = -1;
  let bestTonic = false;
  for (const root of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
    for (const mode of MODES) {
      const inKey = chordsOfKey(root, mode);
      let score = 0;
      for (const chord of distinct.values()) {
        if (inKey.some((c) => c.root === chord.root && c.quality === chord.quality)) score += 2;
        else if (inKey.some((c) => c.root === chord.root)) score += 1;
      }
      const tonic = root === first.root;
      if (score > bestScore || (score === bestScore && tonic && !bestTonic)) {
        best = { root, mode };
        bestScore = score;
        bestTonic = tonic;
      }
    }
  }
  return best;
}

/**
 * A chart, read.
 *
 * Never throws and never returns nothing: an empty box is an empty chart, and
 * a box of prose is a chart with no chords in it. Both come back as zero bars,
 * which is what the preview line has to be able to say.
 */
export function parseChordChart(text: string): ChordChart {
  const warnings: string[] = [];
  const source = normalise(text ?? "");
  const beatsPerBar = meterOf(source);
  const { bars, sections } = barsOf(cellsOf(source, warnings), warnings);
  const key = guessKey(bars.filter((c): c is Chord => c !== null));
  return { bars, beatsPerBar, ...(key ? { key } : {}), warnings, sections };
}

/**
 * The form a chart wants.
 *
 * Its own letters where they describe a shape the app already has — four
 * eight-bar sections lettered A A B A is the thirty-two-bar standard, and
 * calling it `custom` would throw away the section rules the timeline draws —
 * and `custom` at the chart's own length everywhere else. Nothing here invents
 * a section: a `custom` form is one section, and a chart whose letters say
 * otherwise loses them, which is honest and visible.
 */
export function formForChart(chart: ChordChart, bars: number): JamForm {
  const letters = chart.sections.map((s) => s.name.toUpperCase());
  const starts = chart.sections.map((s) => s.start);
  if (
    bars === 32 &&
    letters.join("") === "AABA" &&
    starts.join(",") === "0,8,16,24"
  ) {
    return { kind: "aaba32", bars: 32 };
  }
  if (bars === 12) return { kind: "blues12", bars: 12 };
  if (bars === 8) return { kind: "loop8", bars: 8 };
  if (bars === 16) return { kind: "bars16", bars: 16 };
  return { kind: "custom", bars };
}

/**
 * The groove for a chart in this meter.
 *
 * A chart in three under a rock groove would not fit the meter, and the
 * drummer would fall back to the rule groove — which is honest and is not what
 * anybody pasting a waltz wants. There is a waltz and there is a 6/8, so a
 * chart that says three or six gets the one it means and the rest keep the
 * groove they came in with.
 */
function grooveForMeter(beatsPerBar: number, fallback: string): string {
  if (beatsPerBar === 3) return "waltz";
  if (beatsPerBar === 6) return "sixEight";
  return fallback;
}

/**
 * What a pasted chart changes about a jam.
 *
 * The chart decides the changes, the key, the length and — where it says so —
 * the meter and with it the groove and the count-in. Nothing else: the vibe,
 * the tempo, the kit and the band are whatever you were already listening to,
 * so "use these chords" means "play THIS, over that" rather than "start
 * again". A chart longer than the engine's form takes is cut to it, because a
 * form the engine will refuse is not a form.
 *
 * One function, two callers — the setup sheet applies this as an edit to the
 * jam on the stage, and `jamFromChart` hands it to `createJam` — so the two
 * cannot drift into meaning different things by the same words on screen.
 */
export function chartEdit(
  text: string,
  base?: Pick<Jam, "key" | "grooveId">,
): Pick<Jam, "form" | "key" | "progression" | "grooveId" | "countIn" | "chords"> {
  const chart = parseChordChart(text);
  const bars = Math.max(1, Math.min(JAM_MAX_FORM_BARS, chart.bars.length || 1));
  const key =
    chart.key ?? (base?.key ? parseKey(base.key) : null) ?? ({ root: 0, mode: "major" } as Key);
  const grooveId = grooveForMeter(chart.beatsPerBar, base?.grooveId ?? "rock8");
  const progression = chart.bars
    .slice(0, bars)
    .map((chord) => (chord ? chordName(chord, key) : AS_THE_FORM));
  while (progression.length < bars) progression.push(AS_THE_FORM);

  return {
    form: formForChart(chart, bars),
    key: keyName(key),
    progression,
    grooveId,
    // The count-in follows the groove's meter, which the chart may just have
    // changed: one bar of a waltz is three beats, not four.
    countIn: grooveById(grooveId).beatsPerBar,
    chords: true,
  };
}

/** A jam of its own made of a pasted chart, over the band the base jam has. */
export function jamFromChart(name: string, text: string, base?: Jam): Jam {
  return createJam(name, {
    bpm: base?.bpm ?? 100,
    feel: base?.feel ?? "straight",
    intensity: base?.intensity ?? "normal",
    kit: base?.kit ?? "studio",
    fills: base?.fills ?? true,
    ...(base?.band ? { band: { ...base.band } } : {}),
    ...(base?.fillEvery ? { fillEvery: base.fillEvery } : {}),
    ...(base?.mix ? { mix: { ...base.mix } } : {}),
    ...(base?.keysStyle ? { keysStyle: base.keysStyle } : {}),
    ...(base?.bassVoice ? { bassVoice: base.bassVoice } : {}),
    ...(base?.keysVoice ? { keysVoice: base.keysVoice } : {}),
    ...(base?.vibe ? { vibe: base.vibe } : {}),
    ...(base?.variation ? { variation: base.variation } : {}),
    ...chartEdit(text, base),
  });
}
