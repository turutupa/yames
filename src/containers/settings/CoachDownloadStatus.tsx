import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { DownloadProgress, ModelStatus } from "../../ipc";
import { brainTierLabelKey } from "../../coach/brainTiers";
import { formatBytes } from "./formatBytes";

/**
 * Tier-selection dialog shown when the user wants to install or switch the
 * Practice Coach AI model. Lets them choose between Standard (Qwen3-4B) and
 * Studio (Qwen3-8B), showing which is already installed if any.
 *
 * `studioAvailable` is the ROADMAP §3 RAM gate (>= 16 GB). When it is
 * false the Studio card still renders — hiding it would leave the user
 * wondering what happened to the tier they read about — but its button is
 * disabled and explains why.
 *
 * The dialog deliberately does NOT pre-highlight the tier whose Settings
 * button opened it. Nothing has been chosen yet: each card carries its own
 * "Download <tier>" / "Use <tier>" button, so the choice is still open and
 * an accent border on one card reads as "this one is selected". Hover is
 * the only accent, which keeps exactly one card highlighted — the one under
 * the pointer. The only persistent per-card state left is "Installed",
 * carried by the green badge and the dimmed card, which is a fact about the
 * disk rather than a guess about intent.
 */
export function CoachDownloadConfirmDialog({
  modelStatus,
  studioAvailable,
  onCancel,
  onUseInstalled,
  onStartDownload,
}: {
  modelStatus: ModelStatus | null;
  studioAvailable: boolean;
  onCancel: () => void;
  onUseInstalled: (tier: "standard" | "full") => void;
  onStartDownload: (tier: "standard" | "full") => void;
}) {
  const { t } = useTranslation();

  // Escape closes this dialog and nothing else. MainWindow's unified hotkey
  // dispatcher listens on `document` in the bubble phase and maps Escape in
  // the settings view to "leave settings", so without this the dialog stayed
  // up while the page behind it navigated away. Capture phase + a
  // stopPropagation is the convention the other modals in this app already
  // use (AudioInputTestModal right next door, WhatsNewModal, HelpMenu): the
  // capture listener on `document` runs before any bubble listener on
  // `document`, so the ancestor never sees the key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      onCancel();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  // `full` on the wire, "Studio" on screen — the mapping lives in
  // `brainTiers.ts` so every display site agrees.
  const tierLabel = (tier: "standard" | "full") => t(brainTierLabelKey(tier));
  return (
    <div className="download-confirm-overlay" onClick={onCancel}>
      <div
        className="download-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("coachDownload.title")}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="download-confirm-title">{t("coachDownload.title")}</h3>
        <div className="download-confirm-models">
          {(["standard", "full"] as const).map((tier) => {
            const isInstalled = modelStatus?.brainReady && modelStatus.brainTier === tier;
            return (
              <div
                key={tier}
                className={`download-confirm-model${isInstalled ? " download-confirm-model-installed" : ""}`}
              >
                {isInstalled && <span className="download-confirm-installed-badge">{t("coachDownload.installedBadge")}</span>}
                <div className="download-confirm-model-name">{tierLabel(tier)}</div>
                <div className="download-confirm-model-name" style={{ fontWeight: 400, fontSize: 13 }}>
                  {tier === "standard" ? "Qwen3 4B" : "Qwen3 8B"}
                </div>
                <div className="download-confirm-model-size">
                  {tier === "standard" ? t("coachDownload.stdSpec") : t("coachDownload.studioSpec")}
                </div>
                <p className="download-confirm-model-detail">
                  {tier === "standard"
                    ? t("coachDownload.stdDesc")
                    : t("coachDownload.studioDesc")}
                </p>
                {tier === "full" && !studioAvailable ? (
                  <button className="download-confirm-go" disabled>
                    {t("coachDownload.studioNeedsRam")}
                  </button>
                ) : isInstalled ? (
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
  const tierLabel = downloadingTier === null ? "" : t(brainTierLabelKey(downloadingTier));
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
