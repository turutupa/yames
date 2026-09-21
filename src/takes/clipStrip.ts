import type { ClipBand, ClipBox, ClipCaption, ClipLayout, ClipShape } from "../songs/camera/clip";
import type { ClipPalette } from "../songs/camera/clipRecorder";

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
   * How much room this renderer needs, and how it wants to be driven (W31).
   *
   * Absent — as it is for the dots and for a jam's chord grid — means the
   * clip the compositor has always made: a thin band under the picture, the
   * playhead through the middle of it, and the window the caller passed in.
   *
   * The tab needs all three of those to be different, and none of them is a
   * thing a compositor could work out on its own: how tall six lines of
   * tablature have to be before the fret numbers are legible on a phone is a
   * fact about tablature, reading ahead is a fact about tab players, and how
   * many bars fit across a frame before the numbers collide depends on how
   * wide the frame is. So the renderer says, once per clip, and everything
   * else about the frame stays the compositor's.
   *
   * `hasPicture` is there because the answer genuinely differs: with a
   * camera the tab is a band, without one it is the clip.
   */
  bandFor?: (shape: ClipShape, hasPicture: boolean) => ClipBand;
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
       * Whether there is a camera picture in the frame above the band.
       *
       * A renderer that draws the same thing either way ignores it; one whose
       * band IS the whole clip when there is no picture (the tab) lays itself
       * out differently, and `bandFor` was asked the same question.
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

/**
 * What a player wants under their picture (W31 item 4).
 *
 * The tab by default, because it is the thing the owner asked for and the
 * thing that makes a clip a play-along. The dots stay, because they are what
 * a shared clip looked like until now and somebody will prefer them. And
 * nothing at all, because some people are showing the playing rather than the
 * marking and a bare picture with the mark in the corner is a fine clip.
 */
export type ClipBandChoice = "tab" | "marks" | "none";

/**
 * The renderer for "nothing": no band, and the caption still tells you where
 * in the piece you are.
 *
 * It lives beside the interface rather than in either painter because it
 * belongs to neither — it is the seam's own answer to a player who wants the
 * picture and nothing over it.
 */
export function blankStrip(captionAt: (nowMs: number) => ClipCaption): ClipStrip {
  return {
    bandFor: (_shape, _hasPicture) => ({
      height: 0,
      overPicture: false,
      head: 0.5,
      windowMs: 1000,
    }),
    paintInto: () => {},
    captionAt,
  };
}
