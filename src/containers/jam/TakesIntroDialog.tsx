import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Presence } from "../../components/Presence";

/**
 * "What a take is", asked once, the first time you turn recording on.
 *
 * A microphone that starts writing files is the one thing in this app that
 * a person is entitled to be told about before it happens, so the switch
 * does not simply flip: the first time, it stops and says what it is going
 * to do — your playing with the band mixed in, one WAV in this app's folder
 * on this machine, and nothing sent anywhere. Three sentences, and then it
 * never asks again.
 *
 * It is a dialog rather than a hint card because a hint can be missed and
 * this cannot: it is the moment consent is given, and the switch is not on
 * until it comes back.
 *
 * The `.unsaved-*` shape is borrowed rather than reinvented — the app has one
 * modal card and this is it, and a second one an eyelash different would read
 * as a different app talking.
 *
 * It arrives and it leaves (JAM_UX_DECISIONS A11), and it owns that itself:
 * the answer is not handed back until the card has finished folding away, so
 * a dialog asking for consent does not blink out of existence the instant it
 * is given. The scrim fades with it.
 */
export function TakesIntroDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const cancelRef = useRef<HTMLButtonElement>(null);

  /**
   * The answer, held until the card has gone.
   *
   * Dismissing closes the dialog and remembers what to do; `Presence` plays
   * the fold, and only then is the answer passed on — which is also what
   * takes the dialog off the screen for good, since the caller stops
   * rendering it once it has been answered.
   */
  const [open, setOpen] = useState(true);
  const answerRef = useRef<(() => void) | null>(null);
  const leave = useCallback((answer: () => void) => {
    answerRef.current = answer;
    setOpen(false);
  }, []);

  // Focus lands on "Not now", not on the button that starts recording:
  // consent that a stray Return can give is not consent. Escape is the same
  // answer, for the same reason.
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
    <div
      className="unsaved-overlay motion-scrim"
      onClick={() => leave(onCancel)}
      {...motion}
    >
      <div
        className="unsaved-card jam-takes-card motion-unfold"
        data-state={state}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="takes-intro-title"
        aria-describedby="takes-intro-body"
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
              <circle cx="12" cy="12" r="8" />
              <circle cx="12" cy="12" r="3" fill="currentColor" />
            </svg>
          </span>
          <span className="unsaved-title" id="takes-intro-title">
            {t("jam.takes.introTitle")}
          </span>
        </div>

        <div className="unsaved-body" id="takes-intro-body">
          <p>{t("jam.takes.introWhat")}</p>
          <p>{t("jam.takes.introWhere")}</p>
          <p>{t("jam.takes.introPrivate")}</p>
        </div>

        <div className="unsaved-actions">
          <span className="unsaved-spacer" />
          <button ref={cancelRef} className="unsaved-cancel" onClick={() => leave(onCancel)}>
            {t("jam.takes.introNotNow")}
          </button>
          <button className="unsaved-save" onClick={() => leave(onConfirm)}>
            {t("jam.takes.introStart")}
          </button>
        </div>
      </div>
    </div>
      )}
    </Presence>
  );
}
