import type { ClipBox, ClipCaption, ClipLayout } from "./clip";
import type { ClipPalette } from "./clipRecorder";

/**
 * The scrolling thing under the picture, as the compositor sees it.
 *
 * **The seam that lets one compositor serve two screens.** W25 built "save
 * this take as a video" for Songs, and everything about it except one band
 * across the middle is the same for a jam: the picture, the ground, the
 * caption, the Yames mark, the real-time recording, the chunked save, the
 * share row. What differs is what scrolls — Songs draws the notes of the
 * score with the verdict painted on them, a jam draws its bar grid with the
 * chord names — and that is what this is.
 *
 * So the compositor owns the frame and knows nothing about scores, and a
 * third screen that wants a video of something else writes forty lines here
 * rather than a second compositor.
 *
 * Two methods, because the caption is part of the same question: whatever
 * knows what is scrolling past also knows what bar it is and what to call
 * the thing beside it.
 */
export type ClipStrip = {
  /**
   * Which composition this renderer wants (W32).
   *
   * `false` or absent is Songs': the picture in the top of the frame with the
   * furniture in a band under it. `true` is a jam's: the picture fills the
   * frame and the furniture sits on its lower edge, the way every play-along
   * video on the internet is laid out. See `clipOverlayLayout` in `clip.ts`
   * for why the two exist rather than one.
   *
   * A renderer that asks for the overlay draws its own ground under the
   * furniture — the compositor cannot know how dark that needs to be over a
   * picture it has never seen.
   */
  overlay?: boolean;
  /**
   * Paint over the PICTURE, after it and before the strip. Optional.
   *
   * Where a jam puts the chord you are playing over: large, in a lower corner
   * of the frame, with the one coming next small beside it. It is here rather
   * than in `paintInto` because the strip is a band the compositor clips to
   * and draws a playhead through, and a chord that size does not live in a
   * band. Called whether or not there is a picture, with the picture's box.
   */
  paintOverPicture?: (
    ctx: CanvasRenderingContext2D,
    args: {
      box: ClipBox;
      layout: ClipLayout;
      palette: ClipPalette;
      nowMs: number;
      /** True when there is a real picture under this. */
      hasPicture: boolean;
    },
  ) => void;
  /**
   * Paint the scrolling content into `box`.
   *
   * The compositor has already filled the ground and clipped to the box, and
   * will draw the playhead afterwards — so an implementation draws only what
   * moves, and never has to know where on the canvas it is beyond the box it
   * was handed.
   *
   * `nowMs` is the middle of the box; `windowMs` is how much of the take fits
   * across it. Anything outside is simply not drawn.
   */
  paintInto: (
    ctx: CanvasRenderingContext2D,
    args: {
      box: ClipBox;
      layout: ClipLayout;
      palette: ClipPalette;
      nowMs: number;
      windowMs: number;
      /**
       * Whether the verdict is painted at all. Meaningless to a renderer with
       * no verdict to paint, which simply ignores it.
       */
      marks: boolean;
      /**
       * Whether there is a real picture behind this frame (W32).
       *
       * A renderer laying its own ground needs it: a dark scrim is right over
       * somebody’s living room and wrong over a light theme with nothing
       * behind it, where it reads as a grey slab with the theme’s dark ink
       * on top of it.
       */
      hasPicture: boolean;
    },
  ) => void;
  /**
   * Paint into the space the PICTURE would have taken, when there is no
   * picture. Optional, and most renderers do not want it.
   *
   * It exists because "a take with no camera still makes a clip" means
   * something different for the two screens. Songs' clip without a picture is
   * still the notes of the piece going by with the verdict on them, and a
   * plain ground above them is the right restraint. A JAM without a picture
   * is the owner's "a recording of the app" — the chords going by, and if
   * they are drawn in a band across the bottom quarter of the frame with
   * four-fifths of it empty above, nobody posts it.
   *
   * The compositor calls it only when `picture` is null, before the strip and
   * the caption, with the box the picture would have filled.
   */
  paintInsteadOfPicture?: (
    ctx: CanvasRenderingContext2D,
    args: { box: ClipBox; layout: ClipLayout; palette: ClipPalette; nowMs: number },
  ) => void;
  /**
   * The line under the strip at this moment: a bar number, whatever belongs
   * beside it, and the tempo.
   */
  captionAt: (nowMs: number) => ClipCaption;
};
