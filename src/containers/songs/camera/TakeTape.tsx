/**
 * The tape: the pass laid out in time, with the verdict painted on it.
 *
 * `W21-CAMERA.md` item 6. A strip the width of the take. Every note the player
 * was asked for is a tick in the colour and the glyph the rest of the review
 * uses for it (`review/marks.ts` — colour is never the only signal, because two
 * of the thirteen themes are deliberately low-contrast and some players cannot
 * tell this theme's green from its amber). Notes they played and were not asked
 * for sit under the line. Bar numbers and section names run above it. The joins
 * between passes are drawn, because a loop played four times is four goes and
 * not one long one.
 *
 * Drag it and the picture moves. That is the whole interaction: a person
 * looking for the moment their hand went wrong does not want a scrubber, they
 * want to put their finger on the red mark.
 *
 * The model is `src/songs/camera/tape.ts` and is pure. This file is the
 * drawing and the pointer, and holds no idea of its own about where anything
 * is in time.
 */
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { MARK_GLYPH, MARK_TOKEN } from "../review/marks";
import type { Tape } from "../../../songs/camera/tape";

export type TakeTapeProps = {
  tape: Tape;
  /** Where playback is, in transport milliseconds. */
  nowMs: number;
  /** The window being looped, in transport milliseconds, or null. */
  loop: { startMs: number; endMs: number } | null;
  onScrub: (atMs: number) => void;
};

/** A moment as a percentage of the tape's width. */
function at(ms: number, lengthMs: number): string {
  return `${((Math.max(0, ms) / Math.max(1, lengthMs)) * 100).toFixed(4)}%`;
}

export function TakeTape({ tape, nowMs, loop, onScrub }: TakeTapeProps) {
  const { t } = useTranslation();
  const stripRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const scrubTo = useCallback(
    (clientX: number) => {
      const box = stripRef.current?.getBoundingClientRect();
      if (!box || box.width <= 0) return;
      const fraction = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
      onScrub(fraction * tape.lengthMs);
    },
    [onScrub, tape.lengthMs],
  );

  return (
    <div className="songs-tape">
      {/* Bars and sections, above the line. Only the bars that open a pass or
          a section carry a name: one number per bar on a forty-bar loop is a
          row of illegible digits, and the two that mean something are the one
          you came back to and the one the section is called. */}
      <div className="songs-tape-heads" aria-hidden="true">
        {tape.bars.map((bar, i) => (
          <span
            key={i}
            className="songs-tape-barline"
            data-pass-start={bar.passStart ? "" : undefined}
            data-section={bar.section ? "" : undefined}
            style={{ left: at(bar.atMs, tape.lengthMs) }}
          >
            {bar.section ? (
              <span className="songs-tape-section">{bar.section}</span>
            ) : bar.passStart ? (
              <span className="songs-tape-pass">{t("songs.review.pass", { n: bar.pass + 1 })}</span>
            ) : null}
          </span>
        ))}
      </div>

      <div
        ref={stripRef}
        className="songs-tape-strip"
        role="slider"
        tabIndex={0}
        aria-label={t("songs.camera.tape")}
        aria-valuemin={0}
        aria-valuemax={Math.round(tape.lengthMs)}
        aria-valuenow={Math.round(nowMs)}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          scrubTo(e.clientX);
        }}
        onPointerMove={(e) => {
          if (dragging.current) scrubTo(e.clientX);
        }}
        onPointerUp={(e) => {
          dragging.current = false;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onKeyDown={(e) => {
          // A second of the tape per press, a bar per page. The tape is a
          // slider and a keyboard has to be able to move it.
          const step = e.key === "PageUp" || e.key === "PageDown" ? 2000 : 250;
          if (e.key === "ArrowLeft" || e.key === "PageDown") {
            e.preventDefault();
            onScrub(Math.max(0, nowMs - step));
          } else if (e.key === "ArrowRight" || e.key === "PageUp") {
            e.preventDefault();
            onScrub(Math.min(tape.lengthMs, nowMs + step));
          }
        }}
      >
        {loop && (
          <span
            className="songs-tape-loop"
            aria-hidden="true"
            style={{
              left: at(loop.startMs, tape.lengthMs),
              width: at(Math.max(0, loop.endMs - loop.startMs), tape.lengthMs),
            }}
          />
        )}

        {tape.ticks.map((tick) => (
          <span
            key={`${tick.pass}-${tick.onsetId}`}
            className="songs-tape-tick"
            data-mark={tick.mark}
            style={{ left: at(tick.atMs, tape.lengthMs), color: MARK_TOKEN[tick.mark] }}
            title={
              tick.deviationMs === null
                ? t("songs.camera.tickPlain", { bar: tick.printedBar })
                : t("songs.camera.tickOff", {
                    bar: tick.printedBar,
                    ms: Math.round(tick.deviationMs),
                  })
            }
          >
            <span className="songs-tape-glyph" aria-hidden="true">
              {MARK_GLYPH[tick.mark]}
            </span>
          </span>
        ))}

        {tape.extras.map((extra, i) => (
          <span
            key={`x${i}`}
            className="songs-tape-extra"
            aria-hidden="true"
            style={{ left: at(extra.atMs, tape.lengthMs) }}
          />
        ))}

        <span
          className="songs-tape-head"
          aria-hidden="true"
          style={{ left: at(nowMs, tape.lengthMs) }}
        />
      </div>
    </div>
  );
}
