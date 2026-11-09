import { jamMeter } from "../jam/compile";
import { chordName } from "../jam/harmony";
import { parseKey } from "../jam/harmony";
import { jamChords } from "../jam/progression";
import type { Jam, JamTake } from "../jam/types";
import type { ClipStrip } from "./clipStrip";
import type { ClipBox, ClipCaption, ClipLayout } from "./clip";

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
  /**
   * One beat of the click, in milliseconds (W32).
   *
   * So the clip can SHOW the time. A viewer with the sound off is the
   * normal case on every site a musician posts to — half of them start a
   * video muted — and a clip of somebody playing over changes is unreadable
   * without a pulse to read the tempo from.
   */
  beatMs: number;
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
   * Who is playing, small: "drums · bass · keys" (W32).
   *
   * On a clip with NO picture, which for a jam is the common case, this is
   * what says the thing behind the chords is a band rather than a
   * metronome. Already translated; null when nothing is playing.
   */
  lineup: string | null;
  /** "next", translated — it goes in front of the chord coming up. */
  nextWord: string;
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
  /** "drums · bass · keys", already translated, or null. */
  lineup?: string | null,
  /** "next", translated. */
  nextWord = "next",
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
    beatMs: 60_000 / bpm,
    formBars,
    startBar,
    chords,
    lengthMs: Math.max(0, take.durationSec * 1000),
    bpm: Math.round(bpm),
    subtitle,
    lineup: lineup ?? null,
    nextWord,
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
 * How hard the beat is landing right now, 0 to 1 (W32).
 *
 * A clip of somebody playing over changes is watched muted more often than
 * not — every site a musician posts to starts a video silent — so the time
 * has to be VISIBLE. This is that: a value that snaps to one on each beat and
 * falls away over the rest of it, used to swell the playhead and lift the
 * chord.
 *
 * It decays over a fixed 140 ms rather than over a fraction of the beat, so a
 * ballad and a bebop head pulse with the same weight rather than the slow one
 * looking like a fade. Exported and pure, because "does the beat land on the
 * beat" is a thing a test can ask.
 */
export function beatPulse(shape: JamTapeShape, nowMs: number): number {
  if (!(shape.beatMs > 0) || nowMs < 0) return 0;
  const into = nowMs % shape.beatMs;
  const decay = Math.min(140, shape.beatMs * 0.75);
  return into >= decay ? 0 : 1 - into / decay;
}

/** True on the first beat of a bar — the stroke that gets the heavier mark. */
export function onBarLine(shape: JamTapeShape, nowMs: number): boolean {
  if (!(shape.barMs > 0) || !(shape.beatMs > 0)) return false;
  return nowMs % shape.barMs < shape.beatMs;
}

/** A rounded rectangle, by hand — `roundRect` is missing on old WebKitGTK. */
function panel(
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

/**
 * The biggest this text can be set and still fit across `room` (W33 item 2).
 *
 * Chord names are not all two characters. "F7" is; "Bbmaj7#11" is nine, and
 * at the size a two-character chord wants it runs off the side of a
 * phone-shaped frame — and the serif face Ivory is set in is wider again than
 * the sans the sizes were chosen against. So every piece of type on a clip
 * that carries a chord name asks for its size rather than being told it.
 *
 * It measures rather than estimating characters, because the compositor HAS a
 * context and `clip.ts`'s own header says what estimating costs (the final
 * "p" of "yames.app" clipped off the edge of a 720-wide frame under Ivory).
 * Ten steps at most: each takes a millisecond off a painter with 33 to spend,
 * and the answer is always within one step of exact.
 */
function fitType(
  measure: Measure,
  text: string,
  weight: number,
  wanted: number,
  room: number,
): number {
  let size = Math.max(8, Math.round(wanted));
  for (let i = 0; i < 10; i++) {
    const width = measure(text, weight, size);
    if (width <= room || size <= 10) break;
    // Straight to the size that fits, then a hair off for the rounding.
    size = Math.max(10, Math.floor(size * (room / width)) - 1);
  }
  return size;
}

/**
 * How wide this text is at this weight and size.
 *
 * A function rather than a canvas, so the geometry below can be worked out —
 * and tested — without one. The painter passes a closure over its own
 * context; a test passes a ruler it can reason about.
 */
export type Measure = (text: string, weight: number, size: number) => number;

/**
 * A `Measure` over a real canvas.
 *
 * It leaves `ctx.font` wherever the last question left it, which is fine
 * because every painter below sets the font it is about to draw with.
 */
function ruler(ctx: CanvasRenderingContext2D, face: string): Measure {
  return (text, weight, size) => {
    ctx.font = `${String(weight)} ${String(size)}px ${face}`;
    return ctx.measureText(text).width;
  };
}

/** Where the chord and the line under it go, in canvas pixels. */
export type JamChordBlock = {
  /** The chord's type size. */
  size: number;
  /** The next line's type size, or 0 when there is no next line. */
  small: number;
  /** The chord's baseline (over a picture) or its middle (with none). */
  chordY: number;
  /** Where the chord starts across the frame. */
  chordX: number;
  /** The next line's baseline (over a picture) or its middle (with none). */
  nextY: number;
  nextX: number;
  /** How far the chord block reaches from its middle. 0 over a picture. */
  ringR: number;
  /**
   * Whether a beat ring is drawn around the chord at all.
   *
   * False when one wide enough to go round the name would not fit the frame:
   * a circle through the middle of "Bbmaj7#11" is worse than no circle, and
   * the beat is still readable in the chord itself.
   */
  ring: boolean;
  /** Where the line-up sits, or null when there is nobody to name. */
  lineupY: number | null;
  lineupSize: number;
};

/**
 * The chord block ON a picture: bottom-left, above the grid (W32, W33 §2).
 *
 * Pure, and exported, because the two facts it has to get right are facts a
 * test can check and a rendered frame can only be looked at: the block must
 * not reach into the bar-grid panel under it, and nothing in it may run off
 * the side of the frame. Both of those were wrong — "next Bb7" sat twelve
 * pixels inside the top of the panel in 9:16, and the chord's size was a
 * fraction of the frame's width, which a nine-character name in a serif face
 * overruns.
 */
export function jamOverPictureBlock(args: {
  layout: ClipLayout;
  box: ClipBox;
  /** The chord being played, and "next Bb7" or "" — already assembled. */
  now: string;
  word: string;
  measure: Measure;
}): JamChordBlock {
  const { layout, box, now, word, measure } = args;
  const tall = layout.height > layout.width;
  const pad = Math.round(layout.width * 0.045);
  const across = box.width - pad * 2;
  // Wide puts the next chord BESIDE the chord, so the two share the width;
  // tall puts it under, so each has the frame to itself. A phone-shaped frame
  // has height to spend and no width at all.
  const nowRoom = tall ? across : across * 0.62;
  const size = fitType(measure, now, 700, layout.width * (tall ? 0.24 : 0.13), nowRoom);
  const small = word
    ? fitType(
        measure,
        word,
        600,
        Math.round(size * (tall ? 0.3 : 0.34)),
        tall ? across : across - nowRoom - Math.round(size * 0.22),
      )
    : 0;

  /*
   * The bottom of the block, a DESCENDER clear of the grid.
   *
   * Both pieces sit on an alphabetic baseline, so what has to clear the panel
   * is not the baseline but the tail of the "j" in "maj7" — about a quarter
   * of the type size. Placing the baseline a fixed fraction of the FRAME's
   * height above the grid is what W32 did and what put "next Bb7" inside the
   * panel in 9:16: the frame's height has nothing to do with how far a letter
   * hangs below its line.
   */
  const tail = Math.round((tall && word ? small : size) * 0.3);
  const foot = layout.strip.y - Math.round(layout.height * 0.012) - tail;
  // In tall the chord stands on the next line, far enough up that its own
  // descenders clear that line's capitals.
  const chordY = tall && word ? foot - Math.round(small + size * 0.3) : foot;
  const chordX = box.x + pad;
  // Beside it in wide, and never off the right edge: the gap closes before
  // the type shrinks, because a name a player can read matters more than the
  // space between two of them.
  const nextX = tall
    ? chordX
    : Math.min(
        chordX + measure(now, 700, size) + Math.round(size * 0.22),
        Math.max(chordX, box.x + box.width - pad - measure(word, 600, small)),
      );
  return {
    size,
    small,
    chordY,
    chordX,
    nextY: tall ? foot : chordY,
    nextX,
    ringR: 0,
    ring: false,
    lineupY: null,
    lineupSize: 0,
  };
}

/**
 * The chord block with NO picture, where the chord IS the clip (W32, W33 §2).
 *
 * W32 put the chord half way between the top of the frame and the grid and
 * hung everything off its type size — and the beat ring, drawn at 0.88 of
 * that size, was not in the arithmetic. It came down across the top of "next
 * Bb7" on every stroke. A ring through a word is not something a viewer
 * forgives, so the ring is part of the measurement now: the chord, the ring
 * around it and the line under it are ONE block, fitted into the space
 * between the top of the frame and whatever is below it.
 */
export function jamFullFrameBlock(args: {
  layout: ClipLayout;
  box: ClipBox;
  now: string;
  word: string;
  /** "drums · bass · keys", or null when nothing is playing. */
  lineup: string | null;
  measure: Measure;
}): JamChordBlock {
  const { layout, box, now, word, lineup, measure } = args;
  const tall = layout.height > layout.width;
  const pad = Math.round(layout.width * 0.045);
  const across = box.width - pad * 2;

  // Who is playing, measured first, because it is what the rest of the frame
  // has to stay clear of.
  const lineupSize = Math.round(layout.type.section * 0.95);
  const lineupY = lineup ? layout.strip.y - Math.round(lineupSize * 1.5) : null;
  const ceiling = box.y + Math.round(layout.height * 0.05);
  const floor = (lineupY ?? layout.strip.y) - Math.round(lineupSize * (lineup ? 1.1 : 0.4));
  const room = Math.max(40, floor - ceiling);

  // The ring reaches 0.88 of the type size either side of the chord's middle;
  // the line under it is 0.26 of it and sits a fifth of it clear of the ring.
  // So a block is about 2.35 type sizes tall with the line and 1.9 without,
  // and the type is whichever of that and the width the frame can afford.
  const stack = word ? 2.35 : 1.9;
  const wanted = Math.min(box.height * (tall ? 0.2 : 0.34), box.width * 0.44, room / stack);
  const size = fitType(measure, now, 700, wanted, across);
  const small = word ? fitType(measure, word, 600, Math.round(size * 0.26), across) : 0;
  const gap = Math.round(size * 0.2);

  /*
   * The ring is as wide as the CHORD, or it is not drawn at all.
   *
   * 0.88 of the type size is a circle around "F7" and a circle through the
   * middle of "Bbmaj7#11", which nine characters of a serif face overflow
   * long before the type has had to shrink. So the ring takes whichever is
   * bigger — and where that will not fit the frame, there is no ring: the
   * beat is still in the chord itself, and a ring drawn through the name of
   * the chord is worse than no ring at all.
   */
  const wantR = Math.max(Math.round(size * 0.88), Math.round(measure(now, 700, size) / 2 + size * 0.3));
  const ring =
    wantR * 2 <= box.width - pad &&
    wantR * 2 + (word ? gap + small : 0) <= room;
  // Half the chord block either way, so the line below is placed against the
  // same number whether the ring is there or not.
  const ringR = ring ? wantR : Math.round(size * 0.62);
  const blockH = ringR * 2 + (word ? gap + small : 0);
  // Centred in the room it was given, so the frame is composed rather than
  // top-heavy when the chord had to shrink.
  const chordY = ceiling + Math.round((room - blockH) / 2) + ringR;
  const centreX = box.x + box.width / 2;

  return {
    size,
    small,
    chordY,
    chordX: centreX,
    // BELOW the ring's widest moment, not below the letters: the ring swells
    // on every beat, and a line that only cleared the chord would be crossed
    // four times a bar.
    nextY: chordY + ringR + gap + small / 2,
    nextX: centreX,
    ring,
    ringR,
    lineupY,
    lineupSize,
  };
}

/**
 * The renderer: what a jam looks like as a video somebody would post.
 *
 * W30 got this working and it was plain — a flat ground, the chord in a
 * system font, a thin grid, and with no picture four fifths of the frame
 * empty. This is the pass that makes it look like Yames, and every decision
 * in it answers the same question: **what does a stranger scrolling past,
 * with the sound off, need in order to want to watch this?**
 *
 * * **The chord, large, in a lower corner**, with the one coming next small
 *   beside it. That is the question anybody watching has — "what is he
 *   playing over" — and it is the answer every play-along video on the
 *   internet gives, over the picture rather than beside it.
 * * **The bar grid along the bottom**, on a ground the renderer lays itself,
 *   because the compositor has never seen the room behind it.
 * * **The beat, visible.** The playhead swells and the chord lifts on every
 *   stroke, harder on the bar line. Without it a muted clip has no tempo in
 *   it at all.
 * * **The app's own face and the theme's own colours**, both handed in: a
 *   clip made in Ember looks like Ember.
 *
 * ## With no picture it is a different drawing, not a smaller one
 *
 * Which for a jam is the common case and the owner's first ask: "a recording
 * of the app", made by somebody who is not filming themselves. So the frame
 * is composed rather than left over — the chord fills it, the next one sits
 * under it, the chorus and the band's line-up are named small, and the beat
 * ring is around the chord where the eye already is.
 *
 * ## Nothing here allocates per frame worth the name
 *
 * Thirty frames a second while a machine is also encoding video: the visible
 * bars are the only array made per frame and it holds at most six entries
 * (a four-bar window), the text is measured once per frame rather than per
 * bar, and every colour is a string the palette already owns.
 */
export function jamStrip(shape: JamTapeShape): ClipStrip {
  return {
    // A jam's furniture goes ON the picture, not under it. See
    // `clipOverlayLayout` in `clip.ts`.
    overlay: true,

    paintInto(ctx, { box, layout, palette, nowMs, windowMs, hasPicture }) {
      const bars = visibleJamBars(shape, nowMs, windowMs);
      const radius = Math.round(box.height * 0.22);

      // The ground the compositor left to this renderer, and it is two
      // different grounds.
      //
      // OVER A PICTURE it is dark and translucent rather than the theme's
      // card, because what it has to survive is whatever the room was — a
      // white wall or a dark studio — and one panel has to be legible on
      // both. WITH NO PICTURE there is no room to survive, and that same dark
      // scrim under a light theme is a grey slab with that theme's dark ink
      // on it, which was the least legible thing on the frame. So it is the
      // theme's own line colour instead, barely there.
      panel(ctx, box.x, box.y, box.width, box.height, radius);
      if (hasPicture) {
        ctx.fillStyle = "rgba(11, 10, 20, 0.52)";
        ctx.fill();
      } else {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = palette.line;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.save();
      panel(ctx, box.x, box.y, box.width, box.height, radius);
      ctx.clip();

      // See `paintCaption`: over a picture the ink is light in every theme.
      const ink = hasPicture ? "#FFFFFF" : palette.ink;
      const quiet = hasPicture ? "rgba(255, 255, 255, 0.72)" : palette.quiet;
      const type = Math.round(layout.type.section * 0.92);
      ctx.font = `600 ${type}px ${palette.face}`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      const middle = box.y + box.height / 2;

      for (const bar of bars) {
        const x = box.x + bar.at * box.width;
        const opensChorus = bar.formBar === 0;
        // A chorus line is heavier than a bar line: "the form came round
        // again" is the thing you want to see at a glance.
        ctx.strokeStyle = opensChorus ? palette.accent : quiet;
        ctx.lineWidth = opensChorus ? 3 : 1;
        ctx.globalAlpha = opensChorus ? 0.95 : 0.45;
        ctx.beginPath();
        ctx.moveTo(x, box.y + 4);
        ctx.lineTo(x, box.y + box.height - 4);
        ctx.stroke();
        ctx.globalAlpha = 1;

        if (bar.chord) {
          // The chord coming up is quiet; the one being played is drawn over
          // the picture, large, and would read as a stutter twice.
          const playing = nowMs >= bar.barsIn * shape.barMs && nowMs < (bar.barsIn + 1) * shape.barMs;
          ctx.fillStyle = playing ? ink : quiet;
          ctx.globalAlpha = playing ? 0.95 : 0.7;
          ctx.fillText(bar.chord, x + 8, middle);
          ctx.globalAlpha = 1;
        }
      }
      ctx.restore();
    },

    /**
     * The chord you are playing over, large, in the lower corner.
     *
     * Over the picture in both shapes, and in the LOWER corner in both: the
     * top of a frame is where a face is and the top right is the Yames mark's.
     * The 9:16 composition is its own rather than a squeezed 16:9 — the chord
     * is bigger relative to the frame and the next chord goes UNDER it rather
     * than beside it, because a phone-shaped frame has height to spend and no
     * width at all.
     */
    paintOverPicture(ctx, { box, layout, palette, nowMs, hasPicture }) {
      if (!hasPicture) return;
      const barsIn = barIndexAt(shape, nowMs);
      const now = chordAt(shape, barsIn);
      if (!now) return;
      const next = chordAt(shape, barsIn + 1);
      const tall = layout.height > layout.width;
      const pulse = beatPulse(shape, nowMs) * (onBarLine(shape, nowMs) ? 1 : 0.55);

      // A gradient up from the bottom edge, so the furniture has something to
      // sit on whatever the room was. It reaches further up in 9:16, where
      // there is more frame below the player's hands.
      const fade = ctx.createLinearGradient(0, box.y + box.height * (tall ? 0.52 : 0.6), 0, box.y + box.height);
      fade.addColorStop(0, "rgba(11, 10, 20, 0)");
      fade.addColorStop(1, "rgba(11, 10, 20, 0.82)");
      ctx.fillStyle = fade;
      ctx.fillRect(box.x, box.y, box.width, box.height);

      const word = next && next !== now ? `${shape.nextWord} ${next}` : "";
      const at = jamOverPictureBlock({ layout, box, now, word, measure: ruler(ctx, palette.face) });

      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";

      // The beat, in the chord itself: it lifts a little and brightens on
      // every stroke and harder on the one. A muted clip has no tempo in it
      // otherwise, and this is the one element a viewer is already looking at.
      ctx.font = `700 ${String(at.size + Math.round(at.size * 0.035 * pulse))}px ${palette.face}`;
      // White, not the theme’s ink: this is over the room. See
      // `paintCaption` in `clipRecorder.ts` for the rule and why it is one.
      ctx.fillStyle = "#FFFFFF";
      ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
      ctx.shadowBlur = Math.round(at.size * 0.18);
      ctx.fillText(now, at.chordX, at.chordY);
      ctx.shadowBlur = 0;

      // "next Bb7", quietly — the thing a player's eye is already looking
      // for. Left out when it is the same chord again, which on a blues is
      // most bars and would read as a stutter.
      if (word) {
        ctx.font = `600 ${String(at.small)}px ${palette.face}`;
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
        ctx.shadowBlur = Math.round(at.small * 0.4);
        ctx.fillText(word, at.nextX, at.nextY);
        ctx.shadowBlur = 0;
      }
    },

    /**
     * With no camera, the chords ARE the clip.
     *
     * The owner asked for two things and this is the first: "a recording of
     * the app", made by somebody who is not pointing a camera at themselves.
     * W30's first render put the chord in the middle and left four fifths of
     * the frame empty; this composes the whole of it — the chord at the
     * optical centre with the beat ringing around it, what is coming next
     * under that, and which time round the form and who is playing named
     * small at the foot of the picture, above the grid.
     */
    paintInsteadOfPicture(ctx, { box, layout, palette, nowMs }) {
      const barsIn = barIndexAt(shape, nowMs);
      const now = chordAt(shape, barsIn);
      if (!now) return;
      const next = chordAt(shape, barsIn + 1);
      const onOne = onBarLine(shape, nowMs);
      const pulse = beatPulse(shape, nowMs);

      // A wash from the accent, so the frame is the app's colour rather than
      // a flat card. Very low alpha: it is a ground, not a graphic.
      const wash = ctx.createRadialGradient(
        box.x + box.width / 2,
        box.y + box.height * 0.44,
        0,
        box.x + box.width / 2,
        box.y + box.height * 0.44,
        Math.max(box.width, box.height) * 0.62,
      );
      wash.addColorStop(0, palette.accent);
      wash.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.globalAlpha = 0.1 + 0.05 * pulse;
      ctx.fillStyle = wash;
      ctx.fillRect(box.x, box.y, box.width, box.height);
      ctx.globalAlpha = 1;

      const word = next && next !== now ? `${shape.nextWord} ${next}` : "";
      const at = jamFullFrameBlock({
        layout,
        box,
        now,
        word,
        lineup: shape.lineup,
        measure: ruler(ctx, palette.face),
      });

      // The beat, as a ring around the chord — where the eye already is. It
      // is drawn UNDER the chord so a thick stroke never crosses a letter,
      // and its widest moment is what the line below was placed clear of.
      if (at.ring && pulse > 0.02) {
        const radius = at.ringR * (0.89 + 0.11 * (1 - pulse));
        ctx.strokeStyle = palette.accent;
        ctx.globalAlpha = (onOne ? 0.34 : 0.16) * pulse;
        ctx.lineWidth = Math.max(2, Math.round(at.size * (onOne ? 0.028 : 0.016)));
        ctx.beginPath();
        ctx.arc(at.chordX, at.chordY, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 ${String(at.size)}px ${palette.face}`;
      ctx.fillStyle = palette.ink;
      ctx.fillText(now, at.chordX, at.chordY);

      if (word) {
        ctx.font = `600 ${String(at.small)}px ${palette.face}`;
        ctx.fillStyle = palette.quiet;
        ctx.fillText(word, at.nextX, at.nextY);
      }

      // Who is playing — and only that: which time round is already on the
      // caption a centimetre below, and a frame that says "Chorus 1" twice
      // is a frame talking to itself. The line-up is what says the thing
      // behind the chords is a band rather than a metronome.
      if (shape.lineup && at.lineupY !== null) {
        ctx.font = `600 ${String(at.lineupSize)}px ${palette.face}`;
        ctx.fillStyle = palette.quiet;
        ctx.globalAlpha = 0.8;
        ctx.fillText(shape.lineup, at.chordX, at.lineupY);
        ctx.globalAlpha = 1;
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
