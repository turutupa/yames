import { useCallback, useEffect, useRef } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { Presence, useLastPresent } from "../../components/Presence";
import {
  VIBES,
  applyVibe,
  variationShowingFor,
  vibeShowingFor,
} from "../../jam/vibesContract";
import type { Vibe, VibePatch } from "../../jam/vibesContract";
import type { Jam } from "../../jam/types";

/** Which tile the band is on, and whether it is sounding yet (A4). */
export type VibePreviewMark = {
  vibeId: string;
  variationId?: string;
  /** False while the tile is armed and waiting for the bar line. */
  sounding: boolean;
};

interface VibePickerProps {
  /** The jam being set up — for which tile is lit and which of yours to list. */
  jam: Jam;
  /** Every saved jam, so a vibe can start from one of yours (A9). */
  jams: readonly Jam[];
  onApply: (patch: VibePatch) => void;
  /** Load one of your own saved jams of this vibe. */
  onLoadOwn: (jam: Jam) => void;
  /**
   * Play two bars of a vibe on the real engine (A4). Null on a build that
   * cannot, in which case the tiles are tiles and nothing else changes.
   */
  onPreview?: ((vibeId: string, variationId?: string) => void) | null;
  /** Move off, lift off, or press Space again. */
  onStopPreview?: (() => void) | null;
  /** The tile the band is on, so it can say so while it sounds. */
  previewing?: VibePreviewMark | null;
}

/**
 * How long a mouse has to rest on a tile before the band comes in.
 *
 * A grid of nine tiles is four or five tiles wide, so crossing it to reach
 * the one you want passes over three you do not. Without this, a hand moving
 * to Jazz would start and stop Rock, Blues and Funk on the way — and the
 * engine would be asked for four bands in a quarter of a second. A rest is
 * what turns "the mouse went over it" into "you are looking at it".
 */
const HOVER_MS = 280;

/**
 * And how long a finger has to stay down, on a screen with no hover.
 *
 * Longer than the mouse's rest, because every touch begins as a press and a
 * tap that previewed before it applied would make the tile feel like it
 * misfired. Past this, the intent is unmistakable.
 */
const HOLD_MS = 420;

/**
 * The four ways to ask a tile what it sounds like, as one set of handlers.
 *
 * Hover it with a mouse, hold it with a finger, or focus it and press Space —
 * three gestures, one function, because they are one question. Space is
 * intercepted rather than allowed through: on a button it would activate the
 * tile, and asking what a vibe sounds like must never be the same keystroke
 * as choosing it.
 */
function usePreviewGestures(
  onPreview: ((vibeId: string, variationId?: string) => void) | null | undefined,
  onStopPreview: (() => void) | null | undefined,
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
  }, []);

  // A tile that unmounts under a waiting timer — the sheet closing, the
  // variation row folding away — must not start a band a moment later.
  useEffect(() => () => cancel(), [cancel]);

  const stop = useCallback(() => {
    cancel();
    onStopPreview?.();
  }, [cancel, onStopPreview]);

  return useCallback(
    (vibeId: string, variationId?: string) => {
      if (!onPreview) return {};
      const after = (ms: number) => {
        cancel();
        timer.current = setTimeout(() => {
          timer.current = null;
          onPreview(vibeId, variationId);
        }, ms);
      };
      return {
        onPointerEnter: (e: PointerEvent) => {
          if (e.pointerType !== "mouse") return;
          after(HOVER_MS);
        },
        onPointerLeave: (e: PointerEvent) => {
          if (e.pointerType !== "mouse") return;
          stop();
        },
        onPointerDown: (e: PointerEvent) => {
          if (e.pointerType === "mouse") return;
          after(HOLD_MS);
        },
        onPointerUp: (e: PointerEvent) => {
          if (e.pointerType === "mouse") return;
          stop();
        },
        onPointerCancel: () => stop(),
        onKeyDown: (e: KeyboardEvent) => {
          if (e.key !== " " && e.key !== "Spacebar") return;
          // Not the click Space would otherwise be. Enter still applies it.
          e.preventDefault();
          cancel();
          onPreview(vibeId, variationId);
        },
        onBlur: () => stop(),
      };
    },
    [onPreview, cancel, stop],
  );
}

/** Three little bars, moving while the band is on this tile. */
function PlayingMark({ sounding }: { sounding: boolean }) {
  return (
    <span
      className="jam-vibe-playing"
      data-armed={sounding ? undefined : ""}
      aria-hidden="true"
    >
      <i />
      <i />
      <i />
    </span>
  );
}

/**
 * Eight tiles, and the variations of whichever one is picked.
 *
 * This is the thirty-second rule made real (JAM_UX_DECISIONS A2). Before it,
 * a rock drummer meant knowing to set five controls — groove, feel, intensity,
 * kit, form — and the first starter jam was a shuffle at 92, so the first
 * impression was bluesy whatever you meant. One tap now sets the drummer, the
 * kit, the voices, the tempo and the key together, and every control below is
 * a refinement of it.
 *
 * The second row (A9) is depth for a player who lives in one family: Rock is
 * six different drummers, each a groove, a kit, a feel and a loudness
 * together, and none of them is an extra control. "One of yours" is the same
 * row's last chip — a variation you tuned and saved is a way of playing rock
 * exactly as classic and punk are.
 *
 * And every one of them PLAYS (JAM_KILLER §2 A4). Rest a mouse on a tile,
 * hold it with a finger, or focus it and press Space, and the band plays two
 * bars of it on the real engine and hands the jam straight back. Nine words
 * became nine bands, and the difference between a tile that says "Funk" and a
 * tile that plays funk is the difference between reading a menu and tasting
 * something.
 */
export function VibePicker({
  jam,
  jams,
  onApply,
  onLoadOwn,
  onPreview = null,
  onStopPreview = null,
  previewing = null,
}: VibePickerProps) {
  const { t } = useTranslation();
  const gestures = usePreviewGestures(onPreview, onStopPreview);

  /** Is the band on this tile — the vibe alone, or this variation of it? */
  const markFor = (vibeId: string, variationId?: string) =>
    previewing &&
    previewing.vibeId === vibeId &&
    (previewing.variationId ?? null) === (variationId ?? null)
      ? previewing
      : null;

  /*
   * The vibe showing, which is not quite the same as the vibe on the record.
   *
   * A jam made from nothing carries no `vibe`, so all nine tiles opened dark
   * and the variation row with them — and a player who tapped one to find out
   * what it did then had no way back, because there had been nothing selected
   * to go back to. A vibe cannot be un-picked (there is no band that plays no
   * style), so one of them is always the answer and `vibeShowingFor` works
   * out which from the groove. It writes nothing: the drawer says what this
   * jam sounds like, the record still says where it came from.
   */
  const picked: Vibe | null = vibeShowingFor(jam, VIBES);
  const showingVariation = variationShowingFor(jam, VIBES);

  /**
   * The vibe the variation row is about while it folds away.
   *
   * The row belongs to the tile above it, so tapping a vibe with no
   * variations takes it with them — and it should leave holding the chips it
   * had rather than emptying first (A11).
   */
  const shownVibe = useLastPresent(picked && picked.variations.length > 0 ? picked : null);

  /** Your saved jams of the picked vibe, newest first. Excludes this one. */
  const yours = shownVibe
    ? jams.filter((j) => j.vibe === shownVibe.id && j.id !== jam.id).slice().reverse()
    : [];

  /** "8ths · Tight · 120" — what the tile promises, in three words. */
  const tileLine = (vibe: Vibe) =>
    [
      t(`jam.groove.${vibe.grooveId}`, { defaultValue: vibe.grooveId }),
      t(`jam.kit.${vibe.kit}`, { defaultValue: vibe.kit }),
      String(vibe.bpm),
    ].join(" · ");

  return (
    <>
      {/* The stub state. VIBES is empty until the vibe data lands, and eight
          tiles that do nothing would be worse than a sentence saying so. */}
      {VIBES.length === 0 ? (
        <p className="jam-sheet-note">{t("jam.vibe.unavailable")}</p>
      ) : (
        <div className="jam-vibes" role="group" aria-label={t("jam.vibe.label")}>
          {VIBES.map((vibe) => {
            const on = picked?.id === vibe.id;
            const mark = markFor(vibe.id);
            return (
              <button
                key={vibe.id}
                type="button"
                className={`sub-row-btn jam-card jam-vibe${on ? " active" : ""}${
                  mark ? " jam-vibe-previewing" : ""
                }`}
                aria-pressed={on}
                onClick={() => onApply(applyVibe(jam, vibe))}
                {...gestures(vibe.id)}
              >
                <span className="jam-card-title">
                  {t(`jam.vibe.${vibe.id}`, { defaultValue: vibe.id })}
                  {mark && <PlayingMark sounding={mark.sounding} />}
                </span>
                <span className="jam-card-hint">
                  {on && vibe.variations.length > 0
                    ? t("jam.variation.count", { count: vibe.variations.length })
                    : tileLine(vibe)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <Presence open={!!picked && picked.variations.length > 0}>
        {(_state, motion) =>
          shownVibe && (
        <div className="jam-variations-block motion-unfold" {...motion}>
          <div className="jam-sheet-group-head">
            <span className="stage-label">
              {t("jam.variation.label", {
                vibe: t(`jam.vibe.${shownVibe.id}`, { defaultValue: shownVibe.id }),
              })}
            </span>
            <span className="jam-sheet-lead">{t("jam.variation.lead")}</span>
          </div>
          <div className="jam-variations" role="group" aria-label={t("jam.variation.aria")}>
            {shownVibe.variations.map((variation) => {
              const on = showingVariation === variation.id;
              const mark = markFor(shownVibe.id, variation.id);
              return (
                <button
                  key={variation.id}
                  type="button"
                  className={`jam-chip${on ? " active" : ""}${
                    mark ? " jam-vibe-previewing" : ""
                  }`}
                  aria-pressed={on}
                  onClick={() => onApply(applyVibe(jam, shownVibe, variation.id))}
                  {...gestures(shownVibe.id, variation.id)}
                >
                  {t(`jam.variation.${variation.id}`, { defaultValue: variation.id })}
                  {mark && <PlayingMark sounding={mark.sounding} />}
                </button>
              );
            })}

            {/* "One of yours". A jam you tuned and saved is a way of playing
                this vibe, so it belongs in this row and nowhere else — but it
                LOADS a jam rather than patching this one, because that is what
                it is: your jam, not a variation of the one on the stage.

                Nothing at all when you have none. It used to say "one of
                yours — none saved yet", which is a label and a denial taking
                up a row to describe something that is not there; worse, it is
                long enough to wrap onto the variations' line or off it
                depending on the vibe's name, and the whole sheet below it
                moved up or down as it did. You find out you can save a jam by
                saving one. */}
            {yours.length > 0 && (
              <span className="jam-chip-group">
                <span className="jam-chip-group-label">{t("jam.variation.yours")}</span>
                {yours.map((own) => (
                  <button
                    key={own.id}
                    type="button"
                    className="jam-chip jam-chip-own"
                    onClick={() => onLoadOwn(own)}
                  >
                    {own.name}
                  </button>
                ))}
              </span>
            )}
          </div>
        </div>
          )
        }
      </Presence>
    </>
  );
}
