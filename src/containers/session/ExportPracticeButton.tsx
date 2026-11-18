/**
 * "Export my practice data": a button and the sentence that says what it does.
 *
 * In Settings > Support, under Send feedback (it moved there from Progress:
 * it is something a tester attaches to an issue, not a thing to practise
 * with). The file is written where the player picks (`exportPracticeFile`);
 * nothing is sent.
 *
 * `layout="row"` draws it as a Settings row: the name and the sentence on the
 * left, a short action on the right.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import { exportPracticeFile } from "../../session/exportData";

type Status = { kind: "idle" } | { kind: "done"; path: string } | { kind: "failed" };

export function ExportPracticeButton({
  appVersion,
  className = "session-secondary",
  layout = "stack",
}: {
  /** Known to Settings; read from the app when absent. */
  appVersion?: string;
  className?: string;
  layout?: "stack" | "row";
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
  const said = (
    <>
      {status.kind === "done" && (
        <span className="setting-hint export-practice-status" role="status">
          {t("session.export.done", { path: status.path })}
        </span>
      )}
      {status.kind === "failed" && (
        <span className="setting-hint export-practice-status" role="alert">
          {t("session.export.failed")}
        </span>
      )}
    </>
  );
  if (layout === "row") {
    return (
      <div className="setting-row" data-testid="export-practice">
        <div className="setting-label">
          <label>{t("session.export.button")}</label>
          <span className="setting-hint">{t("session.export.note")}</span>
          {said}
        </div>
        <button
          className={className}
          onClick={() => void run()}
          disabled={busy}
          data-testid="export-practice-button"
        >
          {t("settings.support.exportAction")}
        </button>
      </div>
    );
  }
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
