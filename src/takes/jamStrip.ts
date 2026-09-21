import { jamMeter } from "../jam/compile";
import { chordName } from "../jam/harmony";
import { parseKey } from "../jam/harmony";
import { jamChords } from "../jam/progression";
import type { Jam, JamTake } from "../jam/types";
import type { ClipStrip } from "./clipStrip";
import type { ClipCaption } from "./clip";

/**
 * A jam, as the thing that scrolls under the picture in a saved video (W30).
 *
 * Songs' strip is the notes of a piece with the verdict painted on them,
 * because that is what a pass through a song IS. A jam has no notes to be
 * right or wrong about — it has a FORM, and what a musician wants to see
 * going by is the bar grid with the chord on each bar and the one they are
 * playing right now lit up. So this is the second renderer, and the reason
 * `clipStrip.ts` exists at all.
 *
 * ## How it knows where anything is
 *
 * From the jam's own tempo and meter, and nothing else. A jam runs at one
 * tempo with one meter for the length of a take (a rising speed ramp is the
 * exception, and this says so by drawing the bar grid at the tempo the take
 * STARTED at rather than pretending to know where the ramp had got to). So a
 * bar is a fixed number of milliseconds, the form repeats, and bar N of the
 * take is bar `(startBar + N) % formBars` of the form.
 *
 * That is exact for the overwhelming majority of takes and honest about the
 * one case it is not, which is the right trade for something whose job is to
 * look right in a clip somebody posts.
 */
export type JamTapeShape = {
  /** Milliseconds of one bar at the jam's tempo and meter. */
  barMs: number;
  /** Bars in one time round the form. */
  formBars: number;
  /** The bar of the form the take opened on, 0-based. */
  startBar: number;
  /** One chord name per bar of the form, already in the reader's spelling. */
  chords: string[];
  /** How long the take is, in milliseconds. */
  lengthMs: number;
  /** The tempo the take was played at, for the caption. */
  bpm: number;
  /** What goes beside the bar number: the vibe and the key. */
  subtitle: string | null;
  /**
   * What to call the Nth time round the form, translated.
   *
   * A FUNCTION rather than a word and a number joined at the end, because
   * those two do not go in that order in every language. It is on the shape
   * because a canvas painter has no business holding a translator, and the
   * caller already has one.
   */
  chorusLabel: (n: number) => string;
};

/**
 * Work out that shape from a jam record and one of its takes.
 *
 * `take.position` is the engine's own answer to "which bar did this open
 * on", stamped by the audio callback on the first sample it recorded — so a
 * take that began in the middle of a chorus draws its grid in the right
 * place. A take with no position (every one recorded before W15, and any
 * recorded with the transport stopped) opens at bar one, which is the honest
 * default rather than a guess.
 */
export function jamTapeShape(
  jam: Jam,
  take: JamTake,
  vibeLabel?: string | null,
  chorusLabel: (n: number) => string = (n) => `Chorus ${String(n)}`,
): JamTapeShape {
  const meter = jamMeter(jam);
  const beats = Math.max(1, meter.beatsPerBar);
  const bpm = Math.max(1, jam.bpm);
  const barMs = (beats * 60_000) / bpm;
  const formBars = Math.max(1, jam.form?.bars ?? 1);

  // A record from before keys existed, or one whose key cannot be read, is
  // read as C major — the same fallback `jam/types.ts` documents for the
  // field itself, so the clip and the stage agree about what it is in.
  const key = parseKey(jam.key ?? "C") ?? { root: 0, mode: "major" as const };
  let chords: string[] = [];
  try {
    chords = jamChords(jam, key).map((chord) => chordName(chord, key));
  } catch {
    // A record whose progression cannot be read is still a take worth
    // showing: the grid goes by with no names on it rather than no grid.
    chords = [];
  }

  const startBar =
    take.position && take.position.mode === "jam"
      ? ((take.position.bar % formBars) + formBars) % formBars
      : 0;

  const subtitle = [vibeLabel ?? null, jam.key ?? null].filter(Boolean).join("  ·  ") || null;

  return {
    barMs,
    formBars,
    startBar,
    chords,
    lengthMs: Math.max(0, take.durationSec * 1000),
    bpm: Math.round(bpm),
    subtitle,
    chorusLabel,
  };
}

/** The chord on the bar `barsIn` bars after the take started, or "". */
export function chordAt(shape: JamTapeShape, barsIn: number): string {
  if (shape.chords.length === 0) return "";
  const bar = (((shape.startBar + barsIn) % shape.formBars) + shape.formBars) % shape.formBars;
  return shape.chords[bar % shape.chords.length] ?? "";
}

/** Which bar of the take `nowMs` falls in, 0-based. Negative before it starts. */
export function barIndexAt(shape: JamTapeShape, nowMs: number): number {
  if (!(shape.barMs > 0)) return 0;
  return Math.floor(nowMs / shape.barMs);
}

/**
 * The bar lines visible in a window centred on `nowMs`, as fractions across
 * it — the same shape `visibleBars` gives the song renderer, so the two draw
 * at the same speed and the eye reads them the same way.
 *
 * Pure, and the reason the drawing below can be trusted without a canvas.
 */
export function visibleJamBars(
  shape: JamTapeShape,
  nowMs: number,
  windowMs: number,
): { at: number; barsIn: number; chord: string; chorus: number; formBar: number }[] {
  const out: { at: number; barsIn: number; chord: string; chorus: number; formBar: number }[] = [];
  if (!(shape.barMs > 0) || !(windowMs > 0)) return out;
  const half = windowMs / 2;
  const first = Math.floor((nowMs - half) / shape.barMs);
  const last = Math.ceil((nowMs + half) / shape.barMs);
  // A window is four bars; a take is at most twenty minutes. The loop is
  // bounded by the window, never by the take, so a long take costs nothing.
  for (let i = first; i <= last; i++) {
    const atMs = i * shape.barMs;
    if (atMs < 0 || atMs > shape.lengthMs) continue;
    const formBar = (((shape.startBar + i) % shape.formBars) + shape.formBars) % shape.formBars;
    out.push({
      at: (atMs - (nowMs - half)) / windowMs,
      barsIn: i,
      chord: chordAt(shape, i),
      chorus: Math.floor((shape.startBar + i) / shape.formBars) + 1,
      formBar,
    });
  }
  return out;
}

/**
 * How much of a jam is across the strip at once.
 *
 * Four bars, like Songs', and for the same reason: it is what a player reads
 * ahead. A floor of a second so a jam at 240 BPM in 2/4 does not scroll into
 * a blur.
 */
export function jamWindowMs(shape: JamTapeShape): number {
  return Math.max(1000, shape.barMs * 4);
}

/**
 * The renderer itself: the bar grid, the chord on each bar, and the one being
 * played now drawn large.
 *
 * The NOW chord is the whole point — a clip of a jam is a clip of somebody
 * playing over changes, and the question anybody watching it has is "what is
 * he playing over". So it is the biggest thing in the strip, sitting at the
 * playhead, while the chords coming up are small and ahead of it.
 */
export function jamStrip(shape: JamTapeShape): ClipStrip {
  return {
    paintInto(ctx, { box, layout, palette, nowMs, windowMs }) {
      const bars = visibleJamBars(shape, nowMs, windowMs);

      // The grid. A chorus line is drawn heavier than a bar line, because
      // "the form came round again" is the thing you want to see at a glance.
      ctx.lineWidth = 1;
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      ctx.font = `${layout.type.section}px system-ui, sans-serif`;
      for (const bar of bars) {
        const x = box.x + bar.at * box.width;
        const opensChorus = bar.formBar === 0;
        ctx.strokeStyle = opensChorus ? palette.accent : palette.quiet;
        ctx.lineWidth = opensChorus ? 2 : 1;
        ctx.globalAlpha = opensChorus ? 0.9 : 0.5;
        ctx.beginPath();
        ctx.moveTo(x, box.y);
        ctx.lineTo(x, box.y + box.height);
        ctx.stroke();
        ctx.globalAlpha = 1;
        if (bar.chord) {
          ctx.fillStyle = palette.quiet;
          ctx.fillText(bar.chord, x + 6, box.y + 4);
        }
      }

      // The chord being played is NOT drawn here: the compositor puts the
      // playhead down last, straight through the middle of the box, and a
      // chord name centred on it comes out with a red line through it. It
      // goes where there is room for it — see `paintInsteadOfPicture`, and
      // the caption, which says the bar and the chorus in words.
    },

    /**
     * With no camera, the chords ARE the clip.
     *
     * The owner asked for two things and this is the first: "a recording of
     * the app", made by somebody who is not pointing a camera at themselves.
     * So the chord being played now is the size of the frame, the one coming
     * next sits under it small, and the bar grid along the bottom goes on
     * scrolling underneath — which together is a video of a jam that somebody
     * would actually post.
     */
    paintInsteadOfPicture(ctx, { box, palette, nowMs }) {
      const barsIn = barIndexAt(shape, nowMs);
      const now = chordAt(shape, barsIn);
      const next = chordAt(shape, barsIn + 1);
      if (!now) return;

      const middle = box.y + box.height * 0.52;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.fillStyle = palette.ink;
      ctx.font = `700 ${Math.round(Math.min(box.height * 0.42, box.width * 0.34))}px system-ui, sans-serif`;
      ctx.fillText(now, box.x + box.width / 2, middle);

      // What is coming, quietly, under it — the thing a player's eye is
      // already looking for. Left out when it is the same chord again, which
      // on a blues is most bars and would read as a stutter.
      if (next && next !== now) {
        ctx.fillStyle = palette.quiet;
        ctx.font = `${Math.round(Math.min(box.height * 0.12, box.width * 0.1))}px system-ui, sans-serif`;
        ctx.fillText(next, box.x + box.width / 2, middle + box.height * 0.3);
      }
    },
    captionAt(nowMs) {
      const barsIn = Math.max(0, barIndexAt(shape, nowMs));
      const chorus = Math.floor((shape.startBar + barsIn) / shape.formBars) + 1;
      const formBar = (((shape.startBar + barsIn) % shape.formBars) + shape.formBars) % shape.formBars;
      const caption: ClipCaption = {
        // The bar of the FORM, one-based — the number a musician counts. Bar
        // forty-one of a twelve-bar blues is a number nobody thinks in.
        printedBar: formBar + 1,
        // The vibe, the key and which time round — a bare "1" beside a key
        // reads as part of the key, so the chorus carries its own word.
        section: [shape.subtitle, shape.chorusLabel(chorus)].filter(Boolean).join("  ·  "),
        bpm: shape.bpm,
      };
      return caption;
    },
  };
}
