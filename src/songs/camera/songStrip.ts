import { captionAt, clipWindowMs, visibleBars, visibleTicks } from "../../takes/clip";
import type { Tape } from "./tape";
import type { BarRange } from "../schedule";
import type { SongScore } from "../types";
import type { ClipStrip } from "../../takes/clipStrip";

/**
 * Songs' scrolling excerpt, as a renderer the compositor can be handed.
 *
 * This is what `clipRecorder.ts` used to draw inline. It moved out when Jam
 * needed the same compositor with a different thing scrolling in it (W30) —
 * not because it was wrong where it was, but because the alternative was a
 * second compositor, and then two places to fix when the Yames mark moves.
 *
 * Nothing about the drawing changed, and the tests that measure it are the
 * gate on that: the playhead is still fixed at the middle with the music
 * moving past, the marks are still the review's own colours, and turning them
 * off still leaves the notes in the theme's plain ink for a player who wants
 * to show the playing rather than the marking.
 */
export function songStrip(args: {
  tape: Tape;
  score: SongScore;
  range: BarRange;
  tempoPercent: number;
}): ClipStrip {
  const { tape, score, range, tempoPercent } = args;
  return {
    paintInto(ctx, { box, layout, palette, nowMs, windowMs, marks }) {
      // Bar lines, and the section names that open on them.
      ctx.strokeStyle = palette.quiet;
      ctx.lineWidth = 1;
      ctx.font = `600 ${layout.type.section}px system-ui, sans-serif`;
      ctx.textBaseline = "top";
      for (const bar of visibleBars(tape, nowMs, windowMs)) {
        const x = box.x + bar.at * box.width;
        ctx.beginPath();
        ctx.moveTo(x, box.y);
        ctx.lineTo(x, box.y + box.height);
        ctx.stroke();
        if (bar.section) {
          ctx.fillStyle = palette.quiet;
          ctx.fillText(bar.section, x + 6, box.y + 4);
        }
      }

      // The notes.
      const midline = box.y + box.height * 0.62;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `${Math.round(box.height * 0.42)}px system-ui, sans-serif`;
      for (const { tick, at } of visibleTicks(tape, nowMs, windowMs)) {
        const x = box.x + at * box.width;
        ctx.fillStyle = marks ? palette.marks[tick.mark] : palette.ink;
        ctx.beginPath();
        ctx.arc(x, midline, Math.max(3, box.height * 0.08), 0, Math.PI * 2);
        ctx.fill();
      }
    },
    captionAt(nowMs) {
      return captionAt(tape, score, range, tempoPercent, nowMs);
    },
  };
}

/** How much of a song is across the strip at once. See [`clipWindowMs`]. */
export function songWindowMs(score: SongScore, range: BarRange, tempoPercent: number): number {
  return clipWindowMs(score, range, tempoPercent);
}
