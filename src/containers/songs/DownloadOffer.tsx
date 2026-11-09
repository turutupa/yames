/**
 * "You just downloaded *Wish You Were Here.gp5*. Open it?"
 *
 * `plans/SONGS.md` S0.9, and the shape of it is the whole decision: a quiet
 * strip at the top of the Songs screen with two buttons, not a modal, not a
 * system notification, and not a thing that happens by itself. The file in
 * Downloads is untouched whichever button is pressed.
 *
 * Its own component and its own stylesheet (`songs-import.css`) because W18 is
 * rebuilding `songs.css` and the stage around it; this mounts in one line and
 * brings its own paint.
 */
import { useTranslation } from "react-i18next";
import { offerSize } from "../../songs/downloadWatch";
import type { DownloadWatch } from "./useDownloadWatch";
import "../../styles/songs-import.css";

export function DownloadOffer({ watch }: { watch: DownloadWatch }) {
  const { t } = useTranslation();
  if (watch.error) {
    return (
      <div className="songs-offer songs-offer-trouble" role="alert">
        <span className="songs-offer-text">{t("songs.offer.failed")}</span>
        <button type="button" className="songs-offer-btn" onClick={watch.dismissError}>
          {t("songs.dismiss")}
        </button>
      </div>
    );
  }
  if (!watch.offer) return null;

  const size = offerSize(watch.offer.sizeBytes);
  return (
    // `status`, not `alert`: a file finishing its download is news, not an
    // emergency, and a screen reader should hear about it when it is not in
    // the middle of something else.
    <div className="songs-offer" role="status" aria-live="polite">
      <div className="songs-offer-text">
        <span className="songs-offer-name">{watch.offer.fileName}</span>
        <span className="songs-offer-note">
          {size ? t("songs.offer.justArrivedSized", { size }) : t("songs.offer.justArrived")}
          {watch.queued > 0 ? ` ${t("songs.offer.more", { count: watch.queued })}` : ""}
        </span>
      </div>
      <div className="songs-offer-actions">
        <button
          type="button"
          className="songs-offer-btn songs-offer-btn-primary"
          onClick={watch.accept}
          disabled={watch.opening}
        >
          {watch.opening ? t("songs.offer.opening") : t("songs.offer.open")}
        </button>
        <button type="button" className="songs-offer-btn" onClick={watch.dismiss}>
          {t("songs.offer.notThisOne")}
        </button>
      </div>
    </div>
  );
}
