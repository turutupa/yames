/**
 * The shape of a clip somebody can send to a friend.
 *
 * `W21-CAMERA.md` addendum 12 and `plans/ECHORA.md` D4: the picture, the
 * scrolling coloured excerpt, the bar / section / tempo, and a small Yames
 * mark, composited onto one canvas while the take plays back — one ordinary
 * video file, made by the webview, saved wherever the player says. Nothing is
 * uploaded; there is no encoder dependency and therefore no licence question
 * (A10 left that open and this is the answer to it: `MediaRecorder` is the
 * encoder, and it is the browser's).
 *
 * This file is the ARITHMETIC of that picture and nothing else: no canvas, no
 * `MediaRecorder`, no clock, no DOM. Where every box goes at a given size,
 * which notes are on the strip at a given moment and where along it, and what
 * the caption says. `clip.test.ts` is the whole of its verification, which is
 * only possible because none of it touches a rendering context —
 * `clipRecorder.ts` is the half that does, and it holds no idea of its own
 * about where anything is.
 *
 * ## One clock, and it is the tape's
 *
 * Everything here is in **transport milliseconds**, exactly as `tape.ts` is:
 * time since beat 0 of the first pass of the played range, at the click's own
 * tempo. The review, the tape and the clip are then three drawings of one
 * number, and a clip cannot drift from the screen it was made on.
 */
import { barLengthMs } from "../songs/camera/tape";
import type { Tape, TapeTick } from "../songs/camera/tape";
import { msAtBeat } from "./offset";
import { clampRange, rangeTempoSteps } from "../songs/schedule";
import type { BarRange } from "../songs/schedule";
import { printedBarNumber } from "../songs/position";
import type { SongScore } from "../songs/types";

/** Which way up the clip is. */
export type ClipShape = "wide" | "tall";

/**
 * The two sizes, and why they are these.
 *
 * 1280×720 is 720p, which is what the camera is capped at (`support.ts`) and
 * therefore the most picture there is to composite — a larger canvas would be
 * upscaling a webcam and paying for it in encoder time on a machine that is
 * also playing a band. 720×1280 is the same pixel budget stood on its end,
 * which is what every phone-shaped place a musician posts a clip wants.
 */
export function clipSize(shape: ClipShape): { width: number; height: number } {
  return shape === "tall" ? { width: 720, height: 1280 } : { width: 1280, height: 720 };
}

/** A rectangle, in canvas pixels. */
export type ClipBox = { x: number; y: number; width: number; height: number };

export type ClipLayout = {
  width: number;
  height: number;
  /** Where the picture goes — the whole frame in wide, the top in tall. */
  picture: ClipBox;
  /** The scrolling excerpt. */
  strip: ClipBox;
  /** Bar, section and tempo, under the strip. */
  caption: ClipBox;
  /**
   * The Yames mark — the tile, the word and the panel behind them.
   *
   * In the TOP-RIGHT of the picture, which is the one corner nothing else
   * uses: the excerpt runs the width of the frame along the bottom and the
   * bar/section/tempo readout is under it on the left. It is over the picture
   * rather than under it because that is where a mark on a shared clip
   * belongs — the bottom of a phone screen is where the caption, the play bar
   * and somebody's thumb are.
   */
  mark: ClipBox;
  /** Type sizes for this shape, so the two are proportionate rather than equal. */
  type: { caption: number; section: number; mark: number };
};

/**
 * Where everything sits, for one shape.
 *
 * The picture is the largest thing in both, because it is the reason anybody
 * watches a clip of somebody playing (`plans/ECHORA.md` E0.7). The strip and
 * the caption sit UNDER it rather than over it in both shapes: a marked-up
 * band across a person's hands is the one composition that makes the picture
 * worse, and a clip whose furniture moves between shapes is two designs.
 */
export function clipLayout(shape: ClipShape): ClipLayout {
  const { width, height } = clipSize(shape);
  // The furniture is kept under a quarter of the frame in both shapes, and
  // `clip.test.ts` holds it there: the picture is the reason anybody watches
  // a clip of somebody playing, and a marked-up band that took a third of a
  // 16:9 frame would be a clip nobody posts.
  const pad = Math.round(width * 0.02);
  const stripHeight = shape === "tall" ? 86 : 56;
  const captionHeight = shape === "tall" ? 64 : 46;
  const furniture = stripHeight + captionHeight + pad * 3;

  return {
    width,
    height,
    picture: { x: 0, y: 0, width, height: height - furniture },
    strip: {
      x: pad,
      y: height - furniture + pad,
      width: width - pad * 2,
      height: stripHeight,
    },
    caption: {
      x: pad,
      y: height - captionHeight - pad,
      width: width - pad * 2,
      height: captionHeight,
    },
    mark: markBox(shape, width, pad),
    type: {
      caption: shape === "tall" ? 30 : 26,
      section: shape === "tall" ? 20 : 18,
      mark: markType(shape),
    },
  };
}

/**
 * The other composition: the picture fills the frame, the furniture sits ON it.
 *
 * W32. Songs' clip puts a marked-up band UNDER the picture and the comment on
 * `clipLayout` says why — a strip of verdict dots across a person's hands is
 * the one arrangement that makes the picture worse. A JAM has no verdict. What
 * it has is a chord, the next chord and a bar grid, which is furniture of the
 * kind every play-along video on the internet lays over the picture, and
 * which a viewer reads more easily large over the frame than small under a
 * letterboxed one.
 *
 * So a renderer says which composition it wants (`ClipStrip.overlay`) and the
 * two live side by side. Songs' geometry is untouched, to the pixel.
 *
 * The furniture keeps the same boxes and the same names, so the compositor
 * paints one or the other without knowing which: `picture` is simply the whole
 * frame, and `strip` and `caption` sit over its lower edge on a ground the
 * renderer draws for itself.
 */
export function clipOverlayLayout(shape: ClipShape): ClipLayout {
  const { width, height } = clipSize(shape);
  const pad = Math.round(width * 0.02);
  // Taller than the letterboxed band, because it is over the picture rather
  // than beside it and the chord in it is the thing being read.
  const stripHeight = shape === "tall" ? 96 : 64;
  const captionHeight = shape === "tall" ? 60 : 44;

  return {
    width,
    height,
    picture: { x: 0, y: 0, width, height },
    strip: {
      x: pad,
      y: height - captionHeight - stripHeight - pad * 2,
      width: width - pad * 2,
      height: stripHeight,
    },
    caption: {
      x: pad,
      y: height - captionHeight - pad,
      width: width - pad * 2,
      height: captionHeight,
    },
    mark: markBox(shape, width, pad),
    type: {
      caption: shape === "tall" ? 30 : 26,
      section: shape === "tall" ? 22 : 19,
      mark: markType(shape),
    },
  };
}

/**
 * How big the word "yames.app" is on the mark.
 *
 * Big enough to read on a phone, which is the whole requirement and the
 * reason it is not a twelve-pixel ghost: a 1280-wide clip viewed in a feed on
 * a 400-point screen is scaled to about a third, so twenty-eight pixels here
 * is nine there — about the size of a caption, which is legible and is as far
 * as a mark should go.
 */
function markType(shape: ClipShape): number {
  return shape === "tall" ? 30 : 28;
}

/** The panel the tile and the word sit on, in the top right of the picture. */
function markBox(shape: ClipShape, width: number, pad: number): ClipBox {
  const type = markType(shape);
  const tile = Math.round(type * 1.25);
  const inset = Math.round(type * 0.42);
  // The word, measured the way a canvas will lay it out — roughly 0.52 of the
  // type size per character for a system sans at this weight. It is a layout
  // BOX and not the drawing, so an estimate that is a few pixels wide only
  // makes the backing a few pixels wider than it needed to be.
  const word = Math.round(type * 0.52 * "yames.app".length);
  const boxWidth = inset * 2 + tile + Math.round(type * 0.4) + word;
  const boxHeight = inset * 2 + Math.max(tile, Math.round(type * 1.1));
  return { x: width - pad - boxWidth, y: pad, width: boxWidth, height: boxHeight };
}

/**
 * How much of the take is on the strip at once.
 *
 * Four bars, measured off the first bar of the range — a fixed number of
 * MILLISECONDS rather than a window recomputed per tempo step, because a
 * window that breathed with the tempo map would make the notes appear to
 * speed up and slow down independently of the music, which is the one thing a
 * scrolling excerpt must not do. Four is what a guitarist reads ahead.
 */
export const WINDOW_BARS = 4;

export function clipWindowMs(
  score: SongScore,
  range: BarRange,
  tempoPercent: number,
): number {
  const clamped = clampRange(score, range);
  const bar = barLengthMs(score, clamped, tempoPercent, clamped.startBar);
  // A score with one zero-length bar in it is a file, not an impossibility.
  return Math.max(1000, bar * WINDOW_BARS);
}

/** A note on the strip: which mark, and where along it, 0 at the left edge. */
export type ClipTick = { tick: TapeTick; at: number };

/**
 * The notes on the strip right now, with the playhead at the middle.
 *
 * Half a window either side, and the slice is taken from the tape's own
 * ascending order — so a forty-bar loop costs a scan of the ticks and not a
 * sort, once per frame, on a thread that is also encoding video.
 */
export function visibleTicks(tape: Tape, nowMs: number, windowMs: number): ClipTick[] {
  const half = windowMs / 2;
  const out: ClipTick[] = [];
  for (const tick of tape.ticks) {
    if (tick.atMs < nowMs - half) continue;
    if (tick.atMs > nowMs + half) break;
    out.push({ tick, at: (tick.atMs - (nowMs - half)) / windowMs });
  }
  return out;
}

/** The bar lines on the strip right now, same axis. */
export function visibleBars(
  tape: Tape,
  nowMs: number,
  windowMs: number,
): { printedBar: number; section: string | null; at: number }[] {
  const half = windowMs / 2;
  return tape.bars
    .filter((bar) => bar.atMs >= nowMs - half && bar.atMs <= nowMs + half)
    .map((bar) => ({
      printedBar: bar.printedBar,
      section: bar.section,
      at: (bar.atMs - (nowMs - half)) / windowMs,
    }));
}

/**
 * The tempo in force at a moment inside one pass.
 *
 * Each step is a beat and a BPM (`rangeTempoSteps`), so the milliseconds a
 * step occupies is the beats it spans at its own BPM, and walking the list
 * accumulating that is the whole of it. The last step runs to the end of the
 * range and is what any moment past the final boundary gets.
 */
export function bpmAtMs(steps: readonly { beat: number; bpm: number }[], ms: number): number {
  if (steps.length === 0) return 0;
  let at = 0;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const next = steps[i + 1];
    if (!next) return step.bpm;
    at += ((next.beat - step.beat) * 60_000) / (step.bpm || 1);
    if (ms < at) return step.bpm;
  }
  return steps[steps.length - 1].bpm;
}

/** What the caption says at this moment. */
export type ClipCaption = {
  /** The bar as the page numbers it. */
  printedBar: number;
  /** The section this bar is in, or null where the file named none. */
  section: string | null;
  /** The tempo the click is actually running at, rounded. */
  bpm: number;
};

/**
 * Bar, section and tempo, at one moment.
 *
 * The bar is the last bar LINE at or before now, which is the bar you are in
 * — not the nearest, which would call the second half of a bar by the next
 * one's number. The section is the last one named at or before now and
 * persists until another is, because that is what a section is.
 *
 * The tempo is read off the range's own steps rather than off the score's
 * tempo map, so a clip of a passage being practised at 70 % says 77 BPM —
 * the number the player was actually hearing, which is the only honest one to
 * put on a clip they are about to show somebody.
 */
export function captionAt(
  tape: Tape,
  score: SongScore,
  range: BarRange,
  tempoPercent: number,
  nowMs: number,
): ClipCaption {
  const clamped = clampRange(score, range);
  let printedBar = printedBarNumber(score, clamped.startBar);
  let section: string | null = null;
  for (const bar of tape.bars) {
    if (bar.atMs > nowMs + 1) break;
    printedBar = bar.printedBar;
    if (bar.section) section = bar.section;
  }
  // The section a pass OPENS in: the loop's first bar may be in the middle of
  // one the tape never draws a line for.
  if (section === null) {
    for (const named of score.sections) {
      if (named.startBar <= clamped.startBar && clamped.startBar <= named.endBar) {
        section = named.name;
        break;
      }
    }
  }

  const steps = rangeTempoSteps(score, clamped, tempoPercent);
  // Inside one time round the range: a tempo map repeats with the loop.
  const within = tape.passMs > 0 ? nowMs % tape.passMs : nowMs;
  const bpm = bpmAtMs(steps, within);
  return { printedBar, section, bpm: Math.round(bpm) };
}

/**
 * The stretch of the take a clip is of, in transport milliseconds.
 *
 * `bars` is the portion the player chose, counted as played-bar indices — the
 * review's own selection by default, which is the passage they have been
 * working on and the one they would want to show. `pass` picks one time round
 * a loop; a clip of the same four bars played six times is a clip nobody
 * watches to the end.
 */
export function clipSpan(args: {
  tape: Tape;
  score: SongScore;
  range: BarRange;
  tempoPercent: number;
  bars: BarRange | null;
  pass: number | null;
}): { startMs: number; endMs: number } {
  const { tape, score, range, tempoPercent, bars, pass } = args;
  const clamped = clampRange(score, range);
  const base = (pass ?? 0) * tape.passMs;
  if (!bars) {
    return pass === null
      ? { startMs: 0, endMs: tape.lengthMs }
      : { startMs: base, endMs: base + tape.passMs };
  }
  const steps = rangeTempoSteps(score, clamped, tempoPercent);
  const ticksPerQuarter = score.ticksPerQuarter || 960;
  const first = score.bars[clamped.startBar]?.startTick ?? 0;
  const msAt = (bar: number, end: boolean) => {
    const held = score.bars[Math.min(Math.max(bar, clamped.startBar), clamped.endBar)];
    if (!held) return 0;
    const tick = end ? held.startTick + held.lengthTicks : held.startTick;
    return msAtBeat(steps, (tick - first) / ticksPerQuarter);
  };
  return { startMs: base + msAt(bars.startBar, false), endMs: base + msAt(bars.endBar, true) };
}

/** How long the clip will take to make, which is how long it lasts. */
export function clipSeconds(span: { startMs: number; endMs: number }): number {
  return Math.max(0, (span.endMs - span.startMs) / 1000);
}
