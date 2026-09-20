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
import { useTranslation } from "react-i18next";
import type { SongCameraState } from "./useSongCamera";

export function SongCameraControl({
  camera,
  disabled,
}: {
  camera: SongCameraState;
  /** The song cannot record at all — no take, so no picture. */
  disabled?: boolean;
}) {
  const { t } = useTranslation();

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
    <>
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
    </>
  );
}
