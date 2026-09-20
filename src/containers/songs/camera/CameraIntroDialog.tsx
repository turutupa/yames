/**
 * "What the camera does", asked once, the first time you turn it on.
 *
 * The same card, the same shape and the same rules as `TakesIntroDialog` —
 * deliberately, and not by importing it: a take is a WAV of you and the band,
 * and a camera is a picture of your kitchen, your hands and your face. Those
 * are different promises and each has to be made in its own words. What is
 * shared is the form of the promise: what is recorded, where it is kept, that
 * nothing leaves the machine, and how to stop.
 *
 * Focus lands on "Not now", Escape is the same answer, and the switch is not
 * on until the card comes back — consent that a stray Return can give is not
 * consent. `Presence` plays the fold, so a dialog asking to point a camera at
 * somebody does not blink out of existence the instant they agree.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Presence } from "../../../components/Presence";

export function CameraIntroDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(true);
  const answerRef = useRef<(() => void) | null>(null);
  const leave = useCallback((answer: () => void) => {
    answerRef.current = answer;
    setOpen(false);
  }, []);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      leave(onCancel);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel, leave]);

  return (
    <Presence open={open} onExited={() => answerRef.current?.()}>
      {(state, motion) => (
        <div className="unsaved-overlay motion-scrim" onClick={() => leave(onCancel)} {...motion}>
          <div
            className="unsaved-card jam-takes-card motion-unfold"
            data-state={state}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="camera-intro-title"
            aria-describedby="camera-intro-body"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="unsaved-head">
              <span className="unsaved-glyph" aria-hidden="true">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h9A1.5 1.5 0 0 1 15 7.5v9A1.5 1.5 0 0 1 13.5 18h-9A1.5 1.5 0 0 1 3 16.5z" />
                  <path d="m15 11 6-3.5v9L15 13z" />
                </svg>
              </span>
              <span className="unsaved-title" id="camera-intro-title">
                {t("songs.camera.introTitle")}
              </span>
            </div>

            <div className="unsaved-body" id="camera-intro-body">
              <p>{t("songs.camera.introWhat")}</p>
              <p>{t("songs.camera.introWhere")}</p>
              <p>{t("songs.camera.introPrivate")}</p>
            </div>

            <div className="unsaved-actions">
              <span className="unsaved-spacer" />
              <button ref={cancelRef} className="unsaved-cancel" onClick={() => leave(onCancel)}>
                {t("songs.camera.introNotNow")}
              </button>
              <button className="unsaved-save" onClick={() => leave(onConfirm)}>
                {t("songs.camera.introStart")}
              </button>
            </div>
          </div>
        </div>
      )}
    </Presence>
  );
}
