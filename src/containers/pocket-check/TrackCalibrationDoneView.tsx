/** Calibration completion view — shows the saved offset and a Done button. */
import { useTranslation } from "react-i18next";

export function TrackCalibrationDoneView({
  savedOffset,
  onDone,
}: {
  savedOffset: number | null;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="track-view">
      <div className="track-intro">
        <div className="track-intro-icon">✅</div>
        <h3>{t("pocketCheck.calibratedTitle")}</h3>
        <p>
          {t("pocketCheck.systemOffset")}{" "}
          <strong>
            {savedOffset !== null
              ? `${savedOffset >= 0 ? "+" : ""}${savedOffset.toFixed(1)}ms`
              : "0ms"}
          </strong>
        </p>
        <p className="track-config-hint">
          {t("pocketCheck.offsetNote")}
        </p>
      </div>
      <button className="play-btn full-width" onClick={onDone}>
        {t("pocketCheck.done")}
      </button>
    </div>
  );
}
