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
 * This file is the FRAME and nothing else: no canvas, no `MediaRecorder`, no
 * clock, no DOM — and, since W33 item 4, no score either. How big a clip is,
 * and where the picture, the band, the caption and the Yames mark go at each
 * shape. `clip.test.ts` is the whole of its verification, which is only
 * possible because none of it touches a rendering context; `clipRecorder.ts`
 * is the half that does, and it holds no idea of its own about where anything
 * is.
 *
 * ## Nothing here knows what is being recorded
 *
 * Which is the whole reason a JAM could be given a video without a score
 * anywhere near it (W30, W32). The song's own arithmetic — which notes are on
 * the strip at a moment, what tempo was in force, which stretch of the take a
 * clip is of — lives in `src/songs/camera/songClip.ts`, where it takes a
 * `SongScore` in every signature. W32 left the two in one file because it was
 * mid-rename and a split is not a rename; both branches have landed now.
 */

/**
 * What the caption under a clip says at this moment.
 *
 * The FRAME's type and not the song's, even though a song is what fills it in
 * most often: a jam fills one in too, off its form rather than off a score
 * (`jamStrip.ts`), and the compositor draws whichever it is handed without
 * knowing which. `songClip.ts` is where a SongScore is turned into one.
 */
export type ClipCaption = {
  /** The bar as the page numbers it. */
  printedBar: number;
  /** The section this bar is in, or null where the file named none. */
  section: string | null;
  /** The tempo the click is actually running at, rounded. */
  bpm: number;
};

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

/** The gap the frame keeps around everything in it, for one shape. */
export function clipPad(shape: ClipShape): number {
  return Math.round(clipSize(shape).width * 0.02);
}

/** How tall the caption's own line is. */
function captionHeightOf(shape: ClipShape): number {
  return shape === "tall" ? 64 : 46;
}

/**
 * The tallest a band can be: the frame, less the caption under it (W31).
 *
 * What a renderer asks for when it IS the clip rather than a strip inside one
 * — a take with no camera in it, which is every take until somebody turns the
 * camera on. The picture's box then has no height and nothing is drawn in it.
 */
export function fullBandHeight(shape: ClipShape): number {
  const pad = clipPad(shape);
  return Math.max(0, clipSize(shape).height - captionHeightOf(shape) - pad * 3);
}

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
  /**
   * Where the playhead sits across the strip, 0 at its left edge (W31).
   *
   * The middle for the dots and for a jam. A third of the way in for the tab,
   * because a fret number is something you play and a player reads ahead.
   */
  head: number;
  /**
   * The strip and its caption are drawn OVER the bottom of the picture rather
   * than in a band under it (W31, 9:16).
   *
   * A tall frame is 1280 pixels of it, and giving a third of that to
   * furniture would leave a portrait clip of somebody's chin. So the picture
   * keeps the whole frame and the tab sits over its lower third on a soft
   * dark ground, which is what a phone-shaped play-along video looks like.
   */
  overPicture: boolean;
};

/**
 * How one renderer wants its band placed and driven (W31).
 *
 * See `ClipStrip.bandFor`. Absent is the clip the compositor has always made;
 * every field here is something only the thing being drawn can know.
 */
export type ClipBand = {
  /**
   * How tall the band is, in canvas pixels.
   *
   * `0` means no band at all — the picture, the caption and the mark, and
   * nothing scrolling. That is a real answer: "Nothing" is one of the three
   * things a player may want under their picture.
   */
  height: number;
  /** Over the bottom of the picture, with the caption above it. */
  overPicture: boolean;
  /** Where the playhead sits across it, 0..1. */
  head: number;
  /** How much of the take is across it at once, in transport milliseconds. */
  windowMs: number;
};

/**
 * Where everything sits, for one shape.
 *
 * The picture is the largest thing in both, because it is the reason anybody
 * watches a clip of somebody playing (`plans/ECHORA.md` E0.7). The strip and
 * the caption sit UNDER it rather than over it in both shapes: a marked-up
 * band across a person's hands is the one composition that makes the picture
 * worse, and a clip whose furniture moves between shapes is two designs.
 *
 * `band` is the one renderer that argues with that, and it is allowed to
 * (W31). Six lines of tablature legible on a phone do not fit in 86 pixels,
 * and in a 1280-tall frame the only place they fit without eating the picture
 * is over its lower third. Called with nothing — the dots, a jam's chord grid
 * — this function is exactly what it was.
 */
export function clipLayout(shape: ClipShape, band?: ClipBand | null): ClipLayout {
  const { width, height } = clipSize(shape);
  // The furniture is kept under a quarter of the frame in both shapes, and
  // `clip.test.ts` holds it there: the picture is the reason anybody watches
  // a clip of somebody playing, and a marked-up band that took a third of a
  // 16:9 frame would be a clip nobody posts.
  const pad = clipPad(shape);
  const stripHeight = band ? Math.max(0, Math.round(band.height)) : shape === "tall" ? 86 : 56;
  const captionHeight = captionHeightOf(shape);
  const overPicture = band?.overPicture === true;
  const furniture = stripHeight + captionHeight + pad * 3;

  // Over the picture: the band is hard against the bottom of the frame with
  // the caption directly above it, and the picture keeps the whole frame.
  const stripY = overPicture ? height - pad - stripHeight : height - furniture + pad;
  const captionY = overPicture
    ? stripY - captionHeight - Math.round(pad / 2)
    : height - captionHeight - pad;

  return {
    width,
    height,
    picture: { x: 0, y: 0, width, height: overPicture ? height : Math.max(0, height - furniture) },
    strip: {
      x: pad,
      y: stripY,
      width: width - pad * 2,
      height: stripHeight,
    },
    caption: {
      x: pad,
      y: captionY,
      width: width - pad * 2,
      height: captionHeight,
    },
    mark: markBox(shape, width, pad),
    type: {
      caption: shape === "tall" ? 30 : 26,
      section: shape === "tall" ? 20 : 18,
      mark: markType(shape),
    },
    head: band ? band.head : 0.5,
    overPicture,
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
    // The playhead through the middle of the grid, which is where a bar grid
    // reads from: a chord is a thing you are ON, and W31's third-of-the-way-in
    // playhead is for a tab, where the numbers are things you are about to
    // play and a player reads ahead.
    head: 0.5,
    // FALSE, even though this whole composition is over the picture — the flag
    // is the compositor's instruction to draw W31's dark rounded panel behind
    // a band and lift the caption above it, and this composition lays its own
    // ground and puts the caption underneath. Two ways of sitting on a
    // picture, and the compositor must not apply one renderer's to the other.
    overPicture: false,
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

/** How long the clip will take to make, which is how long it lasts. */
export function clipSeconds(span: { startMs: number; endMs: number }): number {
  return Math.max(0, (span.endMs - span.startMs) / 1000);
}
