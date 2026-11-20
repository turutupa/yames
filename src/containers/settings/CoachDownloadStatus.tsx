import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { DownloadProgress, ModelStatus } from "../../ipc.desktop";
import { brainTierLabelKey } from "../../coach/brainTiers";
import { tierOnDisk } from "../../coach/brainDisk";
import { useCoachModel } from "../../hooks/useCoachModel";
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
  // Room on disk, the same reading the selector's rows make.
  const model = useCoachModel();
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
            // Each tier on its own: both may be on disk side by side.
            const isInstalled = tierOnDisk(modelStatus, tier) !== null;
            const space = model.rows.find((r) => r.tier === tier)?.space ?? null;
            const spaceWords = space
              ? { need: formatBytes(space.needBytes), free: formatBytes(space.freeBytes) }
              : undefined;
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
                {!isInstalled && space?.state === "tight" && (
                  <p className="download-confirm-model-detail" role="note">
                    {t("coachModel.download.spaceWarn", spaceWords)}
                  </p>
                )}
                {tier === "full" && !studioAvailable ? (
                  <button className="download-confirm-go" disabled>
                    {t("coachDownload.studioNeedsRam")}
                  </button>
                ) : !isInstalled && space?.state === "short" ? (
                  // The same rule as the selector's row: a download that
                  // does not fit is not offered.
                  <button className="download-confirm-go" disabled>
                    {t("coachModel.state.noRoom", spaceWords)}
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

/**
 * Sticky bottom bar showing live model download progress, with the same two
 * actions and the same words as the model selector's row: Pause (Rust keeps
 * the bytes; the selector's Resume carries on) and Cancel (stops and removes
 * them). It used to call its pause "Cancel".
 */
export function DownloadProgressBar({
  downloadProgress,
  downloadingTier,
  onPause,
  onCancel,
}: {
  downloadProgress: DownloadProgress | null;
  downloadingTier: "standard" | "full" | null;
  onPause: () => void;
  /** Absent when there is nothing of the model left to cancel (the voices step). */
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const pct = downloadProgress ? Math.round(downloadProgress.fraction * 100) : 0;
  const tierLabel = downloadingTier === null ? "" : t(brainTierLabelKey(downloadingTier));
  const modelName = downloadProgress?.component ?? "model";
  const bytesInfo =
    downloadProgress && downloadProgress.downloadedBytes > 0
      ? ` · ${formatBytes(downloadProgress.downloadedBytes)}${downloadProgress.totalBytes > 0 ? ` / ${formatBytes(downloadProgress.totalBytes)}` : ""}`
      : "";
  const label =
    downloadProgress?.stage === "checking"
      ? `${tierLabel} — ${t("coachModel.download.checking", { percent: `${pct}%` })}`
      : t("coachDownload.progress", { tier: tierLabel, model: modelName, bytes: bytesInfo, pct });

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
      <span className="global-download-bar-actions">
        <button
          className="global-download-bar-cancel"
          onClick={onPause}
          title={t("coachModel.download.pauseHint")}
          data-testid="download-bar-pause"
        >
          {t("coachModel.download.pause")}
        </button>
        {onCancel && (
          <button
            className="global-download-bar-cancel"
            onClick={onCancel}
            title={t("coachModel.download.cancelHint")}
            data-testid="download-bar-cancel"
          >
            {t("coachModel.download.cancel")}
          </button>
        )}
      </span>
    </div>
  );
}

/**
 * The same download, out of the way: a Session is on screen.
 *
 * The full bar sits across the bottom of the window with its label and Cancel,
 * which in a Session is exactly where the big button and the tab are (owner,
 * 2026-11-17: "Studio — brain 59%" over a warm-up). Here it is a hairline on
 * the window's bottom edge that nothing can be pressed through to, with the
 * label for anyone who points at it. The download itself goes on; Cancel and
 * the label come back with the full bar when the Session ends.
 */
export function DownloadHairline({
  downloadProgress,
  downloadingTier,
}: {
  downloadProgress: DownloadProgress | null;
  downloadingTier: "standard" | "full" | null;
}) {
  const { t } = useTranslation();
  const pct = downloadProgress ? Math.round(downloadProgress.fraction * 100) : 0;
  const tierLabel = downloadingTier === null ? "" : t(brainTierLabelKey(downloadingTier));
  const label = t("coachDownload.progress", {
    tier: tierLabel,
    model: downloadProgress?.component ?? "model",
    bytes: "",
    pct,
  });
  return (
    <div
      className="global-download-hairline"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      title={label}
      data-testid="download-hairline"
    >
      <div className="global-download-hairline-fill" style={{ width: `${pct}%` }} />
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

/**
 * "Practice Coach available!" — news, not a fault, so it wears the same pill as
 * the test-build notice (`BetaUpdateNotice`): the notice slot under the
 * header, tinted with the accent, dismissed with its ×. It used to be a 22px
 * amber strip across the whole bottom edge of the window, which read as an
 * error bar (owner, settings revamp 2026-11-17).
 */
export function DownloadSuccessBar({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      className="audio-error-notice beta-update-notice coach-ready-notice"
      role="status"
      data-testid="coach-ready-notice"
    >
      <div className="audio-error-notice-body">
        <span className="audio-error-notice-text">{t("coachDownload.success")}</span>
      </div>
      <button
        type="button"
        className="audio-error-notice-dismiss"
        onClick={onDismiss}
        title={t("coachDownload.dismiss")}
        aria-label={t("coachDownload.dismiss")}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
