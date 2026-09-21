/**
 * The tab, drawn — the half of W31 that touches a canvas.
 *
 * `tabTape.ts` says where every fret number is in time and holds no idea of
 * where anything is on screen; this says where they are on screen and holds
 * no idea of its own about time. Between them is the third renderer behind
 * `clipStrip.ts`'s seam (W30 made it for Jam), so the compositor still owns
 * the frame, the picture, the caption, the Yames mark and the recording, and
 * still knows nothing about scores.
 *
 * ## Where it sits, and why that differs by shape
 *
 * **16:9** — a band under the picture, where the dots were. A wide frame is
 * watched on something wide, and a band across the bottom of it is the
 * arrangement every play-along video on the internet uses.
 *
 * **9:16** — over the LOWER THIRD of the picture, on a soft dark ground, with
 * the bar / section / tempo line above it. A tall frame is 1280 pixels of
 * picture; taking a third of it away for furniture would leave a portrait clip
 * of somebody's chin, and a phone-shaped clip is exactly the one somebody
 * posts. So the picture keeps the whole frame and the tab lies over the part
 * of it that is floor, amp and jeans.
 *
 * **No picture** — the tab IS the clip, filling the frame. That is every take
 * until somebody turns the camera on, and a player without a camera should
 * still end up with something worth sending.
 *
 * The Yames mark is top right in all three and nothing here draws near it:
 * the string block is centred in whatever room it has and the bar numbers sit
 * directly above it, so in the tall no-picture case they are half a frame
 * below the mark rather than beside it.
 *
 * ## Legible on a phone, which is the whole job
 *
 * A 720-wide clip in a phone feed is scaled to about 0.55, so a 22-pixel fret
 * number lands at about twelve points — a caption's size, which is legible.
 * That is the number the tall shape is built around, and it is why the tall
 * window is two bars and not four: sixteenths four bars wide across 692 pixels
 * are 11 pixels apart, and no type size makes that readable. A wide frame has
 * nearly twice the room across, so it shows three.
 *
 * ## Thirty frames a second while the machine is encoding video
 *
 * Text is measured once per font rather than per note, the labels "0".."36"
 * are a table rather than `String(fret)` thirty times a second, and the two
 * scratch arrays the string lines need are allocated with the renderer and
 * refilled in place. Only the window is walked — `visibleTabNotes` bisects —
 * so a six-minute attempt costs what a four-bar one does.
 */
import { captionAt, clipPad, clipSize, fullBandHeight, visibleBars } from "./clip";
import type { ClipBox, ClipShape } from "./clip";
import type { ClipPalette } from "./clipRecorder";
import { barLengthMs } from "../songs/camera/tape";
import type { Tape } from "../songs/camera/tape";
import { clampRange } from "../songs/schedule";
import type { BarRange } from "../songs/schedule";
import type { SongScore } from "../songs/types";
import type { ClipStrip } from "./clipStrip";
import { isLit, TAB_HEAD_AT, visibleTabExtras, visibleTabNotes } from "./tabTape";
import type { TabNote, TabTape } from "./tabTape";

/**
 * How many bars are across the tab at once.
 *
 * A fixed number of BARS, like the dots' window and for the same reason: a
 * window that breathed with the tempo would make the notes appear to speed up
 * and slow down independently of the music, and the whole claim here is that
 * the spacing IS the time. Two in a tall frame and three in a wide one
 * because the two frames are 692 and 1228 pixels across — a bar of sixteenths
 * needs about 350 pixels before the numbers stop touching.
 */
export const TAB_WINDOW_BARS: Record<ClipShape, number[]> = { wide: [3, 2, 1], tall: [2, 1] };

/**
 * The closest two fret numbers may get before the window has to narrow.
 *
 * Thirty pixels holds a two-digit number at about twenty-three-point type,
 * which is where legible starts once a phone has scaled a 720-wide clip down.
 * Below it there is no type size that helps and the only thing that does is
 * showing less music at a time.
 */
const MIN_NOTE_PX = 30;

/**
 * How much of the take is across the tab at once, for one shape.
 *
 * A whole number of bars, so the scroll speed is constant at a constant tempo
 * — but WHICH whole number depends on the music. Three bars of a riff in
 * eighths reads beautifully across a wide frame; three bars of sixteenths
 * across a tall one is a number every eleven pixels. So the widest window
 * whose tightest pair still has room is the one taken, and a run of
 * sixteenths simply shows fewer bars at a time, which is what a human
 * transcriber would do with the same page.
 */
export function tabWindowMs(
  score: SongScore,
  range: BarRange,
  tempoPercent: number,
  shape: ClipShape,
  tightestMs = Number.POSITIVE_INFINITY,
): number {
  const clamped = clampRange(score, range);
  const bar = barLengthMs(score, clamped, tempoPercent, clamped.startBar);
  const across = clipSize(shape).width - clipPad(shape) * 2;
  const choices = TAB_WINDOW_BARS[shape];
  for (const bars of choices) {
    // A score with one zero-length bar in it is a file, not an impossibility.
    const windowMs = Math.max(800, bar * bars);
    if ((tightestMs * across) / windowMs >= MIN_NOTE_PX) return windowMs;
  }
  return Math.max(800, bar * choices[choices.length - 1]);
}

/**
 * The type sizes and spacings of one shape, before a box is known.
 *
 * `gap` is a CEILING rather than the answer: the strings are spread as far as
 * the room allows up to it, so a band that got taller does not leave six lines
 * huddled at the top of it.
 */
type TabMetrics = {
  small: number;
  header: number;
  foot: number;
  edge: number;
  maxGap: number;
  maxFret: number;
};

/**
 * `big` is the no-picture clip, where the tab is not a band in a frame — it
 * IS the frame. Everything grows: a player with no camera should get a video
 * of their piece going by, large, and the same six lines huddled in the
 * middle of 720 pixels of empty ground is not that.
 */
function tabMetrics(shape: ClipShape, strings: number, big = false): TabMetrics {
  const small = big ? (shape === "tall" ? 30 : 26) : shape === "tall" ? 20 : 17;
  const lines = Math.max(1, strings - 1);
  if (big) {
    return {
      small,
      header: small + 12,
      foot: Math.round(small * 0.8) + 12,
      edge: 16,
      maxGap: shape === "tall" ? Math.min(78, Math.floor(430 / lines)) : Math.min(56, Math.floor(300 / lines)),
      maxFret: shape === "tall" ? 40 : 34,
    };
  }
  return {
    small,
    maxFret: shape === "tall" ? 22 : 16,
    // The bar numbers and section names, and the air under them.
    header: small + 8,
    // Under the strings: "P.M.", "let ring", and the ticks for notes that
    // were played and never asked for. A row of its own rather than a second
    // row of words above the strings, because above them is where the bar
    // numbers are and the brief is explicit that nothing may be bought with
    // the fret numbers' legibility.
    foot: Math.round(small * 0.8) + 8,
    edge: shape === "tall" ? 12 : 8,
    // The string block is held to a height rather than a spacing, so an
    // eight-string file is an eight-string tab and not a taller clip.
    maxGap:
      shape === "tall"
        ? Math.min(34, Math.floor(180 / lines))
        : Math.min(20, Math.floor(110 / lines)),
  };
}

/** How tall a band of `strings` lines wants to be, under a picture. */
export function tabBandHeight(shape: ClipShape, strings: number): number {
  const m = tabMetrics(shape, strings);
  return m.header + m.maxGap * Math.max(1, strings - 1) + m.foot + m.edge * 2;
}

/** Everything the drawing needs to know about where it is, in one box. */
export type TabGeometry = {
  /** The line of string 1 — the highest, drawn at the top. */
  topY: number;
  /** Down to the next string. */
  gap: number;
  /** How far the block reaches below `topY`. */
  block: number;
  /** Fret numbers. */
  fret: number;
  /** Bar numbers, section names, tuning letters, the small marks. */
  small: number;
  /** The bottom of the header line, above the top string. */
  headerY: number;
  /** The top of the row under the strings: "P.M.", "let ring", extras. */
  footY: number;
  /** How far in from the left edge the tuning letters reach. */
  letters: number;
};

/**
 * Where the lines go inside one box.
 *
 * Pure, so the arithmetic that decides whether a phone can read this is
 * checked by a test rather than by squinting at a frame — though the frames
 * were looked at too, because a number that fits is not the same as a number
 * anybody wants to read.
 */
export function tabGeometry(
  box: ClipBox,
  strings: number,
  shape: ClipShape,
  options: {
    /** The band IS the clip — there is no picture over it. */
    big?: boolean;
    /**
     * How far apart the tightest notes are, in pixels across this box.
     *
     * The second half of "legible": type is sized to the MUSIC as well as to
     * the frame, so a run of sixteenths comes out small enough to read and a
     * piece of half notes comes out as large as the band allows. Left out
     * (or zero) means only the frame decides, which is what a caller with no
     * tape in its hand can say.
     */
    tightestPx?: number;
  } = {},
): TabGeometry {
  const m = tabMetrics(shape, strings, options.big === true);
  const lines = Math.max(1, strings - 1);
  const room = box.height - m.header - m.foot - m.edge * 2;
  const roomGap = Math.max(9, Math.min(m.maxGap, Math.floor(room / lines)));
  // A two-digit fret is about 1.15 type sizes wide, so 0.78 of the spacing
  // leaves a hair of air between the tightest pair in the piece.
  const byMusic = options.tightestPx ? Math.round(options.tightestPx * 0.78) : m.maxFret;
  const fret = Math.max(9, Math.min(m.maxFret, byMusic, Math.round(roomGap * 0.76)));
  // The strings close up around the numbers once the numbers have had to get
  // smaller. Six lines spread across 400 pixels with 17-pixel numbers on them
  // is not a tab; it is six lines with something written on two of them.
  const gap = Math.max(9, Math.min(roomGap, Math.round(fret * 2)));
  const block = gap * lines;
  // Centred in whatever is left, which is what keeps the tall no-picture clip
  // — where the band is the whole frame — well clear of the Yames mark.
  const spare = box.height - m.header - m.foot - block;
  const topY = box.y + m.header + Math.max(m.edge, spare / 2);
  return {
    topY,
    gap,
    block,
    fret,
    small: m.small,
    headerY: topY - Math.round(fret / 2) - 4,
    footY: topY + block + Math.round(fret / 2) + 4,
    letters: Math.round(m.small * 1.5),
  };
}

/**
 * The fret numbers, as strings, once.
 *
 * `String(fret)` for every note of every frame is a few thousand throwaway
 * strings a second on a thread that is encoding video. Twenty-five frets is
 * further than any of this repository's fixtures go and further than most
 * necks; past it the number is built, which costs nothing because it never
 * happens.
 */
const FRET_LABELS: string[] = Array.from({ length: 25 }, (_, i) => String(i));

function fretLabel(note: TabNote): string {
  // A dead note is an x where the number would be — the one place the tab
  // says "damp this" rather than "play this".
  if (note.dead) return "x";
  return FRET_LABELS[note.fret] ?? String(note.fret);
}

/**
 * The small letter that goes BETWEEN two notes on a string.
 *
 * The conventional ones and no more: a hammer-on, a pull-off and a slide are
 * the three that change what your left hand does between one note and the
 * next, and they are the three a tab writes in the gap. Everything else is
 * either on the note (a bend, a dead note) or over the passage (a palm mute,
 * a let ring).
 */
function joinGlyph(note: TabNote): string | null {
  if (note.techniques.includes("hammer")) return "h";
  if (note.techniques.includes("pull")) return "p";
  if (note.techniques.includes("slide")) return "/";
  return null;
}

/** What a note is drawn in. */
function inkFor(note: TabNote, palette: ClipPalette, marks: boolean): string {
  // A tie was never picked, so there is no verdict on it either way.
  if (note.mark === null) return palette.quiet;
  if (!marks) return palette.ink;
  return palette.marks[note.mark];
}

export type TabStripArgs = {
  tab: TabTape;
  tape: Tape;
  score: SongScore;
  range: BarRange;
  tempoPercent: number;
};

/**
 * Songs' tablature, as a renderer the compositor can be handed.
 *
 * The scratch state lives in the closure rather than inside `paintInto`,
 * which is the whole of this file's performance story: two arrays per string
 * and one measured font, built when the clip is, refilled thirty times a
 * second and never reallocated.
 */
export function tabStrip(args: TabStripArgs): ClipStrip {
  const { tab, tape, score, range, tempoPercent } = args;

  /**
   * Where each string's line is INTERRUPTED, as pairs of x.
   *
   * A tab is fret numbers sitting in the line, not on top of it, so the line
   * is drawn as the segments between them. Doing it this way rather than
   * painting a patch of ground behind every number means the drawing does not
   * have to know what colour the ground under it is — which over a picture it
   * genuinely does not.
   */
  const breaks: number[][] = Array.from({ length: tab.strings + 1 }, () => []);
  /** The last note drawn on each string, for the letter in the gap. */
  const lastX: number[] = new Array<number>(tab.strings + 1).fill(Number.NEGATIVE_INFINITY);
  const lastRight: number[] = new Array<number>(tab.strings + 1).fill(Number.NEGATIVE_INFINITY);
  const lastJoin: number[] = new Array<number>(tab.strings + 1).fill(Number.NEGATIVE_INFINITY);

  let measuredFont = "";
  let labelWidth: number[] = [];
  let deadWidth = 0;
  const measure = (ctx: CanvasRenderingContext2D, font: string) => {
    if (font === measuredFont) return;
    ctx.font = font;
    labelWidth = FRET_LABELS.map((label) => ctx.measureText(label).width);
    deadWidth = ctx.measureText("x").width;
    measuredFont = font;
  };
  const widthOf = (note: TabNote) =>
    note.dead ? deadWidth : (labelWidth[note.fret] ?? labelWidth[labelWidth.length - 1] ?? 10);

  return {
    bandFor(shape, hasPicture) {
      const windowMs = tabWindowMs(score, range, tempoPercent, shape, tab.tightestMs);
      if (!hasPicture) {
        // No camera: the tab is the clip, and it fills the frame.
        return { height: fullBandHeight(shape), overPicture: false, head: TAB_HEAD_AT, windowMs };
      }
      return {
        height: tabBandHeight(shape, tab.strings),
        // Tall frames only. In a wide one the band goes under the picture,
        // where the dots were: a 16:9 picture is already the short way up and
        // a band across its bottom third would cover the hands.
        overPicture: shape === "tall",
        head: TAB_HEAD_AT,
        windowMs,
      };
    },

    paintInto(ctx, { box, layout, palette, nowMs, windowMs, marks, hasPicture }) {
      const shape: ClipShape = layout.width > layout.height ? "wide" : "tall";
      const g = tabGeometry(box, tab.strings, shape, {
        big: !hasPicture,
        tightestPx: windowMs > 0 ? (tab.tightestMs * box.width) / windowMs : 0,
      });
      const head = layout.head;
      const bottom = g.topY + g.block;

      for (const row of breaks) row.length = 0;
      lastX.fill(Number.NEGATIVE_INFINITY);
      lastRight.fill(Number.NEGATIVE_INFINITY);
      lastJoin.fill(Number.NEGATIVE_INFINITY);

      // --- The bars, behind everything ------------------------------------
      // Only as tall as the strings are, so nothing reaches up towards the
      // Yames mark in the no-picture clip where the band is the whole frame.
      const lineTop = g.topY - Math.round(g.fret / 2) - 3;
      const lineBottom = bottom + Math.round(g.fret / 2) + 3;
      ctx.lineWidth = 1;
      ctx.strokeStyle = palette.quiet;
      ctx.globalAlpha = 0.55;
      ctx.textBaseline = "bottom";
      ctx.textAlign = "left";
      let headerRight = box.x + g.letters;
      for (const bar of visibleBars(tape, nowMs, windowMs, head)) {
        const x = box.x + bar.at * box.width;
        ctx.beginPath();
        ctx.moveTo(x, lineTop);
        ctx.lineTo(x, lineBottom);
        ctx.stroke();
        if (x < headerRight) continue;
        ctx.globalAlpha = 1;
        // The bar as the page numbers it, and the section it opens where it
        // opens one — the two things a player reading along needs to find
        // their place in the file they imported.
        ctx.font = `${String(g.small)}px system-ui, sans-serif`;
        ctx.fillStyle = palette.quiet;
        const label = String(bar.printedBar);
        ctx.fillText(label, x + 4, g.headerY);
        headerRight = x + 4 + ctx.measureText(label).width + 8;
        if (bar.section) {
          ctx.font = `600 ${String(g.small)}px system-ui, sans-serif`;
          ctx.fillStyle = palette.accent;
          ctx.fillText(bar.section, headerRight, g.headerY);
          headerRight += ctx.measureText(bar.section).width + 10;
        }
        ctx.globalAlpha = 0.55;
      }
      ctx.globalAlpha = 1;

      // --- The notes, measured before anything is drawn -------------------
      // Two passes over the window: the first works out where the lines have
      // to break, the second draws. Cheaper than it looks — the window is a
      // couple of bars — and it is the only order in which a number can sit
      // IN the string rather than on top of it.
      const fretFont = `600 ${String(g.fret)}px system-ui, sans-serif`;
      measure(ctx, fretFont);
      const notes = visibleTabNotes(tab, nowMs, windowMs, head);
      // The tuning letters are a break on every line, so the lines stop short
      // of them instead of running through the letters at the left edge.
      for (let s = 1; s <= tab.strings; s++) {
        breaks[s].push(box.x - 2, box.x + g.letters);
      }
      const firstX = box.x + g.letters + 4;
      for (const { note, at } of notes) {
        if (note.string < 1 || note.string > tab.strings) continue;
        const x = box.x + at * box.width;
        const half = widthOf(note) / 2 + 3;
        // Already behind the tuning letters, which are fixed at the left edge
        // and win: a number half under an "A" is worse than a number gone.
        if (x - half < firstX) continue;
        breaks[note.string].push(x - half, x + half);
      }

      // --- The strings ----------------------------------------------------
      ctx.strokeStyle = palette.quiet;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 1;
      for (let s = 1; s <= tab.strings; s++) {
        const y = Math.round(g.topY + (s - 1) * g.gap) + 0.5;
        const row = breaks[s];
        let from = box.x;
        ctx.beginPath();
        // `row` is pairs in the order the notes came, which is ascending in
        // time and therefore ascending in x.
        for (let i = 0; i < row.length; i += 2) {
          if (row[i] > from) {
            ctx.moveTo(from, y);
            ctx.lineTo(Math.min(row[i], box.x + box.width), y);
          }
          from = Math.max(from, row[i + 1]);
        }
        if (from < box.x + box.width) {
          ctx.moveTo(from, y);
          ctx.lineTo(box.x + box.width, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // --- Which string is which -------------------------------------------
      // The tuning's own letters down the left edge, fixed while the music
      // moves past them, because "the third line is the G string" is the one
      // thing a tab has to say that is not a number. The score's tuning is the
      // OPEN string without the capo, which is what a tab is labelled with
      // however far up the neck the capo is.
      ctx.font = `600 ${String(g.small)}px system-ui, sans-serif`;
      ctx.fillStyle = palette.quiet;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      for (let s = 1; s <= tab.strings; s++) {
        ctx.fillText(tab.stringNames[s - 1] ?? "", box.x + 2, g.topY + (s - 1) * g.gap + 1);
      }

      // --- The fret numbers -----------------------------------------------
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const { note, at } of notes) {
        if (note.string < 1 || note.string > tab.strings) continue;
        const x = box.x + at * box.width;
        const width = widthOf(note);
        if (x - width / 2 - 3 < firstX) continue;
        const y = g.topY + (note.string - 1) * g.gap;
        const ink = inkFor(note, palette, marks);
        const label = fretLabel(note);

        // The letter in the gap, where there is a gap to put it in: a hammer,
        // a pull or a slide, half way between this note and the last one on
        // this string, and only when the two are far enough apart that it is
        // not a third character crushed between them.
        const join = joinGlyph(note);
        const previous = lastX[note.string];
        if (join !== null && previous > Number.NEGATIVE_INFINITY) {
          const room = x - previous;
          if (room > g.small * 2.6 && previous > lastJoin[note.string]) {
            ctx.font = `${String(Math.round(g.small * 0.85))}px system-ui, sans-serif`;
            ctx.fillStyle = palette.quiet;
            ctx.fillText(join, previous + room / 2, y - Math.round(g.gap * 0.42));
            lastJoin[note.string] = x;
          }
        }
        // A TIE, which is the one mark that is a curve rather than a letter:
        // the note is held over and never picked again, so the tab arcs from
        // the number that WAS picked to the one that is only still sounding.
        if (note.mark === null && lastRight[note.string] > Number.NEGATIVE_INFINITY) {
          const from = lastRight[note.string];
          const to = x - width / 2 - 3;
          if (to - from > 6) {
            ctx.strokeStyle = palette.quiet;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(from, y - Math.round(g.fret * 0.32));
            ctx.quadraticCurveTo(
              (from + to) / 2,
              y - Math.round(g.gap * 0.55),
              to,
              y - Math.round(g.fret * 0.32),
            );
            ctx.stroke();
          }
        }
        lastX[note.string] = x;
        lastRight[note.string] = x + width / 2 + 3;

        ctx.font = fretFont;
        if (isLit(note, nowMs)) {
          // Lit as the playhead crosses it: the number knocked out of its own
          // colour, which reads at a glance and costs one rounded rectangle.
          const padX = 4;
          const h = g.fret + 6;
          roundedRect(ctx, x - width / 2 - padX, y - h / 2, width + padX * 2, h, 4);
          ctx.fillStyle = ink;
          ctx.fill();
          ctx.fillStyle = palette.ground;
        } else {
          ctx.fillStyle = ink;
        }
        ctx.globalAlpha = note.ghost ? 0.6 : 1;
        ctx.fillText(label, x, y + 1);
        ctx.globalAlpha = 1;

        // A bend goes after the number, small and up, where a tab puts it.
        if (note.techniques.includes("bend")) {
          ctx.font = `${String(Math.round(g.small * 0.8))}px system-ui, sans-serif`;
          ctx.fillStyle = palette.quiet;
          ctx.textAlign = "left";
          ctx.fillText("b", x + width / 2 + 2, y - Math.round(g.gap * 0.3));
          ctx.textAlign = "center";
        }
      }

      // --- What is done to the whole passage rather than to one note -------
      // A palm mute and a let ring are properties of a RUN, so they are drawn
      // as a run: the word where the run starts and a line along the rest of
      // it, under the strings. The word is left out where the run is too
      // short to hold it and the line is drawn alone, which is the "only
      // where they fit" the brief asks for — the line still says "this is
      // still going on" and nothing has been taken off the numbers.
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      ctx.font = `${String(Math.round(g.small * 0.8))}px system-ui, sans-serif`;
      paintRun(ctx, notes, box, "palmMute", "P.M.", g, palette, true);
      paintRun(ctx, notes, box, "letRing", "let ring", g, palette, false);

      // --- Played, but never asked for -------------------------------------
      // The same faint tick the tape on screen draws for an extra note, under
      // the lowest string where it cannot be read as a fret.
      const extras = visibleTabExtras(tab, nowMs, windowMs, head);
      if (extras.length > 0) {
        ctx.fillStyle = palette.quiet;
        ctx.globalAlpha = 0.8;
        for (const { at } of extras) {
          ctx.fillRect(box.x + at * box.width - 1, bottom + 3, 2, Math.max(4, g.fret * 0.35));
        }
        ctx.globalAlpha = 1;
      }
    },

    captionAt(nowMs) {
      return captionAt(tape, score, range, tempoPercent, nowMs);
    },
  };
}

/**
 * One technique that spans a run of notes, drawn under the strings.
 *
 * A single walk over the window's notes, which are already in time order:
 * open a run at the first note carrying the technique, close it at the first
 * one that does not, draw. `dashed` is the palm mute's own convention and is
 * what tells the two apart at a glance without reading the words.
 */
function paintRun(
  ctx: CanvasRenderingContext2D,
  notes: readonly { note: TabNote; at: number }[],
  box: ClipBox,
  technique: "palmMute" | "letRing",
  word: string,
  g: TabGeometry,
  palette: ClipPalette,
  dashed: boolean,
): void {
  const y = g.footY;
  const wordWidth = ctx.measureText(word).width;
  let from = Number.NaN;
  let to = Number.NaN;

  const left = box.x + g.letters;
  const flush = () => {
    if (Number.isNaN(from)) return;
    const span = Math.max(to - from, 0);
    let lineFrom = from;
    ctx.fillStyle = palette.quiet;
    ctx.strokeStyle = palette.quiet;
    ctx.globalAlpha = 0.85;
    // The word only where the run STARTS on screen. A run that began before
    // the window did would otherwise show its last two letters at the left
    // edge, which reads as a mistake rather than as a palm mute.
    if (span > wordWidth * 1.25 && from >= left) {
      ctx.fillText(word, from, y);
      lineFrom = from + wordWidth + 5;
    } else if (from < left) {
      lineFrom = left;
    }
    if (to > lineFrom + 4) {
      const line = y + Math.round(g.small * 0.4);
      if (dashed) ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lineFrom, line);
      ctx.lineTo(to, line);
      ctx.stroke();
      if (dashed) ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;
    from = Number.NaN;
    to = Number.NaN;
  };

  for (const { note, at } of notes) {
    const x = box.x + at * box.width;
    if (note.techniques.includes(technique)) {
      if (Number.isNaN(from)) from = x;
      to = x;
    } else if (!Number.isNaN(from) && x > to) {
      flush();
    }
  }
  flush();
}

/** A rounded rectangle path, by hand — `roundRect` is missing on old WebKitGTK. */
function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.arcTo(x + width, y, x + width, y + r, r);
  ctx.lineTo(x + width, y + height - r);
  ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
  ctx.lineTo(x + r, y + height);
  ctx.arcTo(x, y + height, x, y + height - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
