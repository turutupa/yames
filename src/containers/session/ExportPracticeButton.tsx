/**
 * "Export my practice data": a button and the sentence that says what it does.
 *
 * In Settings > Support beside Send feedback, and on Progress. The file is
 * written where the player picks (`exportPracticeFile`); nothing is sent.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import { exportPracticeFile } from "../../session/exportData";

type Status = { kind: "idle" } | { kind: "done"; path: string } | { kind: "failed" };

export function ExportPracticeButton({
  appVersion,
  className = "session-secondary",
}: {
  /** Known to Settings; read from the app when absent. */
  appVersion?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const version = appVersion || (await getVersion().catch(() => ""));
      const path = await exportPracticeFile(version);
      setStatus(path ? { kind: "done", path } : { kind: "idle" });
    } catch {
      setStatus({ kind: "failed" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="session-col" style={{ gap: 4 }} data-testid="export-practice">
      <div>
        <button className={className} onClick={() => void run()} disabled={busy} data-testid="export-practice-button">
          {t("session.export.button")}
        </button>
      </div>
      <p className="about-text session-why">{t("session.export.note")}</p>
      {status.kind === "done" && (
        <p className="about-text session-why" role="status">
          {t("session.export.done", { path: status.path })}
        </p>
      )}
      {status.kind === "failed" && (
        <p className="about-text session-why" role="alert">
          {t("session.export.failed")}
        </p>
      )}
    </div>
  );
}
