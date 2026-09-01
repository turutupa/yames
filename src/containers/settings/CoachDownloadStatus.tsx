import { useTranslation } from "react-i18next";
import type { DownloadProgress, ModelStatus } from "../../ipc";
import { formatBytes } from "./formatBytes";

/**
 * Tier-selection dialog shown when the user wants to install or switch the
 * Practice Coach AI model. Lets them choose between Standard (Qwen 1.5B) and
 * Full (Phi 3.5 Mini), showing which is already installed if any.
 */
export function CoachDownloadConfirmDialog({
  pendingTier,
  modelStatus,
  onCancel,
  onUseInstalled,
  onStartDownload,
}: {
  pendingTier: "standard" | "full";
  modelStatus: ModelStatus | null;
  onCancel: () => void;
  onUseInstalled: (tier: "standard" | "full") => void;
  onStartDownload: (tier: "standard" | "full") => void;
}) {
  const { t } = useTranslation();
  const tierLabel = (tier: "standard" | "full") =>
    tier === "standard" ? t("settings.coach.brainStandard") : t("settings.coach.brainFull");
  return (
    <div className="download-confirm-overlay" onClick={onCancel}>
      <div className="download-confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="download-confirm-title">{t("coachDownload.title")}</h3>
        <div className="download-confirm-models">
          {(["standard", "full"] as const).map((tier) => {
            const isInstalled = modelStatus?.brainReady && modelStatus.brainTier === tier;
            const isTarget = pendingTier === tier;
            return (
              <div
                key={tier}
                className={`download-confirm-model${isTarget ? " download-confirm-model-selected" : ""}${isInstalled ? " download-confirm-model-installed" : ""}`}
              >
                {isInstalled && <span className="download-confirm-installed-badge">{t("coachDownload.installedBadge")}</span>}
                <div className="download-confirm-model-name">{tierLabel(tier)}</div>
                <div className="download-confirm-model-name" style={{ fontWeight: 400, fontSize: 13 }}>
                  {tier === "standard" ? "Qwen 2.5 1.5B" : "Phi 3.5 Mini"}
                </div>
                <div className="download-confirm-model-size">
                  {tier === "standard" ? t("coachDownload.stdSpec") : t("coachDownload.fullSpec")}
                </div>
                <p className="download-confirm-model-detail">
                  {tier === "standard"
                    ? t("coachDownload.stdDesc")
                    : t("coachDownload.fullDesc")}
                </p>
                {isInstalled ? (
                  <button
                    className="download-confirm-go download-confirm-go-installed"
                    onClick={() => onUseInstalled(tier)}
                  >
                    {t("coachDownload.use", { tier: tierLabel(tier) })}
                  </button>
                ) : (
                  <button className="download-confirm-go" onClick={() => onStartDownload(tier)}>
                    {t("coachDownload.download", { tier: tierLabel(tier) })}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <button className="download-confirm-cancel" onClick={onCancel}>
          {t("coachDownload.cancel")}
        </button>
      </div>
    </div>
  );
}

/** Sticky bottom bar showing live model download progress with a cancel button. */
export function DownloadProgressBar({
  downloadProgress,
  downloadingTier,
  onCancel,
}: {
  downloadProgress: DownloadProgress | null;
  downloadingTier: "standard" | "full" | null;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const pct = downloadProgress ? Math.round(downloadProgress.fraction * 100) : 0;
  const tierLabel =
    downloadingTier === null
      ? ""
      : downloadingTier === "full"
        ? t("settings.coach.brainFull")
        : t("settings.coach.brainStandard");
  const modelName = downloadProgress?.component ?? "model";
  const bytesInfo =
    downloadProgress && downloadProgress.downloadedBytes > 0
      ? ` · ${formatBytes(downloadProgress.downloadedBytes)}${downloadProgress.totalBytes > 0 ? ` / ${formatBytes(downloadProgress.totalBytes)}` : ""}`
      : "";
  const label = t("coachDownload.progress", { tier: tierLabel, model: modelName, bytes: bytesInfo, pct });

  return (
    <div className="global-download-bar">
      <div className="global-download-bar-fill" style={{ width: `${pct}%` }} />
      <span className="global-download-bar-label global-download-bar-label-base">{label}</span>
      <span
        className="global-download-bar-label global-download-bar-label-filled"
        style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}
      >
        {label}
      </span>
      <button className="global-download-bar-cancel" onClick={onCancel} title={t("coachDownload.cancelHint")}>
        {t("coachDownload.cancel")}
      </button>
    </div>
  );
}

/** Sticky bottom bar shown when a model download fails. */
export function DownloadErrorBar({
  error,
  onDismiss,
}: {
  error: string;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="global-download-bar global-download-bar-error">
      <span className="global-download-bar-label">{t("coachDownload.failed", { error })}</span>
      <button className="global-download-bar-close" onClick={onDismiss} title={t("coachDownload.dismiss")}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

/** Sticky bottom bar shown when a model finishes downloading. */
export function DownloadSuccessBar({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="global-download-bar global-download-bar-success">
      <span className="global-download-bar-label">{t("coachDownload.success")}</span>
      <button className="global-download-bar-close" onClick={onDismiss} title={t("coachDownload.dismiss")}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
