/**
 * The camera switch, on the strip, beside Record the take.
 *
 * `JAM_UX_DECISIONS` A13 — the strip holds what you are DOING — and W18's rule
 * on top of it: the stage is ONE SCREEN and everything on the strip has to be
 * on it while the transport runs. That is why this is a single chip and not a
 * control with a label and a note of its own: the first version of it was a
 * `.songs-strip-group` with three lines, and at 480px it pushed the strip a
 * row taller and took the height out of the tab — the layout suite said so, in
 * `songs.spec.ts`, which measures the engraving rather than this.
 *
 * So the chip carries the whole of it. The word says which state it is in
 * ("Camera on" / "Record the picture"), the dot says whether the camera is
 * actually open, and the sentence about what it is for lives in the promise
 * the first press shows.
 *
 * Three things it still says that a plain toggle would not:
 *
 * * **"Camera on", in words.** A laptop's own light is a two-millimetre dot
 *   that half the people who own one have a sticker over. The app says it.
 * * **Which camera**, but only when there is more than one and only once the
 *   labels exist — before permission is given every camera on the machine is
 *   called "", and a picker of three blanks is worse than no picker.
 * * **Why it is not there**, when it is not. A webview with no `MediaRecorder`
 *   for video (some WebKitGTK builds) gets a sentence rather than a switch
 *   that throws when it is pressed.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useMenuPlacement } from "../containers/jam/useMenuPlacement";
import type { TakeCameraState } from "./useTakeCamera";

export function CameraControl({
  camera,
  disabled,
  canPeek = false,
  playing = false,
}: {
  camera: TakeCameraState;
  /** This mode cannot record at all — no take, so no picture. */
  disabled?: boolean;
  /**
   * Offer "see yourself" beside the switch, once the camera is open (W33 §3).
   *
   * For the screen that does NOT draw a mirror of its own at every size.
   * Jam's stage stops drawing one below 900px (`jam.css` says why: at 480 the
   * form's bar grid is the whole stage and there is no rectangle left for a
   * picture), and a player at a small window was then filming something they
   * could not see. This is the way to look, once, before you play.
   *
   * It is a second control rather than a second meaning for the first, and
   * that is deliberate: the chip's press turns the camera OFF, and a chip
   * that sometimes did that and sometimes opened a picture is a chip nobody
   * can press with a guitar on.
   */
  canPeek?: boolean;
  /** The band is going. The picture shuts rather than covering the form. */
  playing?: boolean;
}) {
  const { t } = useTranslation();
  const [peeking, setPeeking] = useState(false);
  const peekVideo = useRef<HTMLVideoElement>(null);
  // Portalled and placed by the jam screen's own hook, for the reason every
  // menu on this screen is: the takes group is deep in a drawer that scrolls,
  // and a panel drawn as its child opens off the bottom of the window.
  const { wrapRef, menuRef, style } = useMenuPlacement(peeking, { prefer: "above" });

  /** The live stream, attached while the picture is up and dropped after. */
  useEffect(() => {
    const video = peekVideo.current;
    if (!video) return;
    video.srcObject = camera.stream;
    return () => {
      video.srcObject = null;
    };
  }, [peeking, camera.stream]);

  /*
   * It shuts on play, when the camera goes, and the two ways every menu here
   * shuts. Checking the framing is something you do BEFORE you play; a
   * picture of your own face over the bar grid while the band is going is the
   * thing the mirror was taken away at 480px to avoid.
   */
  useEffect(() => {
    if (playing || !camera.armed) setPeeking(false);
  }, [playing, camera.armed]);

  useEffect(() => {
    if (!peeking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPeeking(false);
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setPeeking(false);
    };
    // Both in the CAPTURE phase: the jam screen binds a keyboard of its own
    // (space, R, C, the footswitch actions) and a picture that would not shut
    // because something downstream ate the key is a picture over the form.
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [peeking, wrapRef, menuRef]);

  /*
   * A build that cannot record a picture says so ONCE, quietly, and only where
   * a person is already looking for the control — not as a strip group of its
   * own, which would cost the tab a row of height to explain something that is
   * not there.
   */
  if (!camera.support.ok) {
    return (
      <span className="songs-camera-absent" title={t("songs.camera.unavailable")}>
        {camera.support.reason === "noDevices"
          ? t("songs.camera.noCamera")
          : t("songs.camera.unavailable")}
      </span>
    );
  }

  return (
    <span className="songs-camera-group" ref={wrapRef}>
      <button
        type="button"
        className="songs-chip songs-chip-wide songs-camera-switch"
        data-active={camera.enabled ? "" : undefined}
        data-live={camera.armed ? "" : undefined}
        aria-pressed={camera.enabled}
        disabled={disabled}
        title={camera.trouble ? t(`songs.camera.${camera.trouble}`) : t("songs.camera.lead")}
        onClick={() => camera.request(!camera.enabled)}
      >
        <span
          className="songs-camera-dot"
          data-live={camera.armed ? "" : undefined}
          aria-hidden="true"
        />
        {camera.enabled ? t("songs.camera.on") : t("songs.camera.off")}
      </button>

      {/* W33 §3 — a look at what you are about to film, on the screens that
          do not draw a mirror at every size. Only once the camera is actually
          OPEN: before that there is nothing to show, and a button that opened
          a black rectangle would be a button people stop pressing. */}
      {canPeek && camera.armed && (
        <button
          type="button"
          className="songs-chip songs-camera-peek"
          aria-expanded={peeking}
          aria-haspopup="dialog"
          onClick={() => setPeeking((was) => !was)}
        >
          {t("songs.camera.peek")}
        </button>
      )}

      {peeking &&
        createPortal(
          <div
            className="songs-camera-peek-pop"
            role="dialog"
            aria-label={t("songs.camera.peek")}
            ref={menuRef}
            style={style}
          >
            {/* Mirrored, like the stage's own preview and for the same reason:
                a mirror is how a person knows which hand is which. The FILE is
                never mirrored — `transform` reaches no recorder. */}
            <video ref={peekVideo} autoPlay playsInline muted />
            <p>{t("songs.camera.peekNote")}</p>
          </div>,
          document.body,
        )}

      {/* The picker only exists once there is a choice AND the machine will
          name what the choice is between. */}
      {camera.enabled && camera.devices.length > 1 && (
        <select
          className="songs-camera-device"
          aria-label={t("songs.camera.device")}
          value={camera.deviceId ?? camera.devices[0].deviceId}
          onChange={(e) => camera.chooseDevice(e.target.value)}
        >
          {camera.devices.map((device, i) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || t("songs.camera.deviceNumbered", { n: i + 1 })}
            </option>
          ))}
        </select>
      )}

      {/*
       * Trouble is a chip, in the row, and it goes when it is pressed.
       *
       * Said out loud rather than left to the title above, because "the camera
       * was not allowed" is something a person has to act on in their system
       * settings — and taken away by a press, because a line that cannot be
       * dismissed is a line that costs the tab a row for ever.
       */}
      {camera.trouble && (
        <button
          type="button"
          className="songs-chip songs-camera-trouble"
          onClick={camera.dismissTrouble}
        >
          {t(`songs.camera.${camera.trouble}`)}
        </button>
      )}
    </span>
  );
}
