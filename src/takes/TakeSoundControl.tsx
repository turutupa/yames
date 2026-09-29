import { useTranslation } from "react-i18next";
import { Segmented } from "../containers/jam/Segmented";
import { meterLevel } from "./useTakeSound";
import type { TakeSoundState } from "./useTakeSound";
import type { TakeSound } from "../jam/types";

/**
 * What a take is made of, where takes are switched on
 * (`plans/SONGS.md` A12, `src-tauri/src/loopback.rs`).
 *
 * **The honesty of this control is the feature.** The owner's first question
 * when the second option was proposed was "so you'll record ALL the audio
 * coming from the pc?", and that is exactly right: it does. So the control
 * says what it does in a plain sentence, names the speaker it will listen to,
 * and offers a button that listens for a fifth of a second and shows the
 * level — because on Windows the mute and the volume slider sit before the
 * tap, and a musician who finds that out after a four-minute take has been
 * let down by the screen rather than by the machine.
 *
 * When the machine cannot do it at all — a Mac, a Linux box with no monitor
 * source — there is no switch, just one sentence saying why. A control that
 * would record silence is worse than no control.
 */
export function TakeSoundControl({
  state,
  disabled,
}: {
  /**
   * Optional, and that is not defensiveness for its own sake: this control
   * hangs off a takes state that older callers (and every test harness that
   * builds one by hand) do not carry. A missing answer is the same picture as
   * an answer that has not arrived — nothing — and a screen that throws
   * because one prop is young is a worse bug than the one it would catch.
   */
  state?: TakeSoundState;
  /** Recording is off, or this build has no takes at all. */
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const check = state?.check ?? null;

  // Nothing is known yet: draw nothing rather than a switch that may be about
  // to vanish.
  if (!state || !check) return null;
  const { sound, setSound, recheck, checking, canRecordEverything } = state;

  if (!canRecordEverything) {
    // One honest sentence — and only where there was a feature to be absent.
    // A build whose engine has no such command at all says nothing: there is
    // nothing here to explain the absence of. `check.trouble` is the engine's
    // own reason, in English, and it goes to the console rather than to the
    // screen; the screen gets the translated sentence.
    if (!check.trouble) return null;
    return <p className="takes-sound-absent stage-note">{t("jam.takeSound.notHere")}</p>;
  }

  const everything = sound === "everything";
  const level = check.peak > 0 ? meterLevel(check.peak) : 0;

  return (
    <div className="takes-sound">
      <Segmented<TakeSound>
        label={t("jam.takeSound.label")}
        value={sound}
        onChange={setSound}
        options={[
          { id: "yamesAndInput", label: t("jam.takeSound.yames"), disabled },
          { id: "everything", label: t("jam.takeSound.everything"), disabled },
        ]}
      />
      {everything && (
        <div className="takes-sound-detail">
          <p className="takes-sound-warning">{t("jam.takeSound.warning")}</p>
          {check.device && (
            <p className="takes-sound-device">
              {t("jam.takeSound.listensTo", { device: check.device })}
            </p>
          )}
          <div className="takes-sound-check">
            <button
              type="button"
              className="stage-button takes-sound-listen"
              onClick={recheck}
              disabled={checking}
            >
              {checking ? t("jam.takeSound.listening") : t("jam.takeSound.check")}
            </button>
            {/* The meter is a picture of one number, so it is drawn rather
                than animated: the button listens, the bar moves once, and the
                musician strums and presses it again. A meter that ran
                continuously would mean the speakers were being listened to
                continuously, which is the one thing this feature promises not
                to do. */}
            <div
              className="takes-sound-meter"
              role="meter"
              aria-valuemin={0}
              aria-valuemax={1}
              aria-valuenow={Number(level.toFixed(2))}
              aria-label={t("jam.takeSound.level")}
            >
              <span className="takes-sound-meter-fill" style={{ width: `${level * 100}%` }} />
            </div>
          </div>
          {check.peak === 0 && !checking && (
            <p className="takes-sound-silent">{t("jam.takeSound.silent")}</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * What the recording indicator says for the whole length of a take.
 *
 * Separate from the control because it appears where the take is RUNNING —
 * on the transport, not in the drawer — and because it says what this take
 * IS, not what the next one will be.
 */
export function takeSoundLabel(sound: TakeSound, t: (key: string) => string): string {
  return sound === "everything"
    ? t("jam.takeSound.recordingEverything")
    : t("jam.takeSound.recordingYames");
}
