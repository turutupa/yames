/**
 * "Recording session" (card #109): a test session's switch, and what to do
 * with the folder afterwards. Off by default; it records the raw input and
 * keeps it on this machine (`src/settings/recordingSession.ts`).
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { IS_MOBILE } from "../../platform";
import { shareFileNative } from "../../mobile/native";
import {
  captureNow,
  clampCapGb,
  formatBytes,
  onCapture,
  refreshCapture,
  revealSession,
  setRecordingSession,
  storeCapGb,
  storedCapGb,
  zipSession,
} from "../../settings/recordingSession";
import { SwitchFace } from "./SwitchFace";

export function RecordingSessionRow() {
  const { t } = useTranslation();
  const [status, setStatus] = useState(captureNow);
  const [busy, setBusy] = useState(false);
  const [cap, setCap] = useState(storedCapGb);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    const off = onCapture(setStatus);
    void refreshCapture();
    return () => {
      off();
    };
  }, []);
  const on = status.active;
  const toggle = () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    void setRecordingSession(!on)
      .then(setStatus)
      .catch(() => setNote(t("settings.recordingSession.failed")))
      .finally(() => setBusy(false));
  };
  const zip = () => {
    setNote(null);
    void zipSession()
      .then(async (path) => {
        if (IS_MOBILE) await shareFileNative(path);
        else setNote(t("settings.recordingSession.zipped", { path }));
      })
      .catch(() => setNote(t("settings.recordingSession.noSession")));
  };
  const reveal = () => {
    void revealSession().catch(() => setNote(t("settings.recordingSession.noSession")));
  };
  return (
    <div className="recording-session" data-testid="settings-recording-session">
      <div className="setting-row">
        <div className="setting-label">
          <label>{t("settings.recordingSession.title")}</label>
          <span className="setting-hint">{t("settings.recordingSession.hint")}</span>
          {on && (
            <span className="setting-hint recording-session-status" data-testid="recording-session-status">
              {t("settings.recordingSession.status", {
                takes: status.takes,
                size: formatBytes(status.bytes),
                folder: status.dir ?? "",
              })}
              {status.stopped
                ? ` ${t("settings.recordingSession.stopped")}`
                : status.warn
                  ? ` ${t("settings.recordingSession.warn", { size: formatBytes(status.warnBytes) })}`
                  : ""}
            </span>
          )}
        </div>
        <button
          className={`toggle-btn setting-switch ${on ? "active" : ""}`}
          aria-pressed={on}
          disabled={busy}
          onClick={toggle}
        >
          <SwitchFace label={on ? t("common.on") : t("common.off")} />
        </button>
      </div>
      <div className="setting-row">
        <div className="setting-label">
          <label htmlFor="recording-session-cap">{t("settings.recordingSession.cap")}</label>
          <span className="setting-hint">{t("settings.recordingSession.capHint")}</span>
        </div>
        <input
          id="recording-session-cap"
          className="recording-session-cap"
          type="number"
          min={1}
          max={200}
          step={1}
          value={cap}
          disabled={on}
          onChange={(e) => setCap(clampCapGb(Number(e.target.value)))}
          onBlur={() => setCap(storeCapGb(cap))}
        />
      </div>
      <div className="recording-session-actions">
        {!IS_MOBILE && (
          <button className="toggle-btn" data-testid="recording-session-open" onClick={reveal}>
            {t("settings.recordingSession.open")}
          </button>
        )}
        <button className="toggle-btn" data-testid="recording-session-zip" onClick={zip}>
          {IS_MOBILE ? t("settings.recordingSession.share") : t("settings.recordingSession.zip")}
        </button>
      </div>
      {note && <p className="setting-hint recording-session-note">{note}</p>}
    </div>
  );
}
