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

      const pad = Math.round(layout.width * 0.045);
      // The chord sits above the strip, which is above the caption.
      const baseline = layout.strip.y - Math.round(layout.height * (tall ? 0.045 : 0.035));
      const size = Math.round(layout.width * (tall ? 0.24 : 0.13));

      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      // The beat, in the chord itself: it lifts a little and brightens on
      // every stroke and harder on the one. A muted clip has no tempo in it
      // otherwise, and this is the one element a viewer is already looking at.
      ctx.font = `700 ${size + Math.round(size * 0.035 * pulse)}px ${palette.face}`;
      // White, not the theme’s ink: this is over the room. See
      // `paintCaption` in `clipRecorder.ts` for the rule and why it is one.
      ctx.fillStyle = "#FFFFFF";
      ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
      ctx.shadowBlur = Math.round(size * 0.18);
      ctx.fillText(now, box.x + pad, baseline);
      const nowWidth = ctx.measureText(now).width;
      ctx.shadowBlur = 0;

      // "next Bb7", quietly — the thing a player's eye is already looking
      // for. Left out when it is the same chord again, which on a blues is
      // most bars and would read as a stutter.
      if (next && next !== now) {
        const small = Math.round(size * (tall ? 0.3 : 0.34));
        ctx.font = `600 ${small}px ${palette.face}`;
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
        ctx.shadowBlur = Math.round(small * 0.4);
        const word = `${shape.nextWord} ${next}`;
        if (tall) {
          // Under it: a phone-shaped frame has height to spend and no width.
          ctx.fillText(word, box.x + pad, baseline + Math.round(small * 1.35));
        } else {
          ctx.fillText(word, box.x + pad + nowWidth + Math.round(size * 0.22), baseline);
        }
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
      const tall = layout.height > layout.width;
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

      // The chord sits above the furniture rather than in the middle of the
      // whole frame: the strip and the caption are the bottom sixth, and a
      // chord centred on the frame would sit low against them.
      const centre = box.y + (layout.strip.y - box.y) * 0.5;
      const size = Math.round(Math.min(box.height * (tall ? 0.2 : 0.34), box.width * 0.44));

      // The beat, as a ring around the chord — where the eye already is. It
      // is drawn UNDER the chord so a thick stroke never crosses a letter.
      if (pulse > 0.02) {
        const radius = size * (0.78 + 0.1 * (1 - pulse));
        ctx.strokeStyle = palette.accent;
        ctx.globalAlpha = (onOne ? 0.34 : 0.16) * pulse;
        ctx.lineWidth = Math.max(2, Math.round(size * (onOne ? 0.028 : 0.016)));
        ctx.beginPath();
        ctx.arc(box.x + box.width / 2, centre, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 ${size}px ${palette.face}`;
      ctx.fillStyle = palette.ink;
      ctx.fillText(now, box.x + box.width / 2, centre);

      if (next && next !== now) {
        const small = Math.round(size * 0.26);
        ctx.font = `600 ${small}px ${palette.face}`;
        ctx.fillStyle = palette.quiet;
        ctx.fillText(
          `${shape.nextWord} ${next}`,
          box.x + box.width / 2,
          centre + size * 0.74,
        );
      }

      // Who is playing, and which time round — small, at the foot of the
      // picture and above the grid. The line-up is what says the thing behind
      // the chords is a band rather than a metronome.
      // Who is playing, and only that: which time round is already on the
      // caption a centimetre below, and a frame that says "Chorus 1" twice
      // is a frame talking to itself.
      const foot = shape.lineup;
      if (foot) {
        const small = Math.round(layout.type.section * 0.95);
        ctx.font = `600 ${small}px ${palette.face}`;
        ctx.fillStyle = palette.quiet;
        ctx.globalAlpha = 0.8;
        ctx.fillText(
          foot,
          box.x + box.width / 2,
          layout.strip.y - Math.round(small * 1.5),
        );
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
