import { useTranslation } from "react-i18next";
import type { WidgetMode } from "../../types";

/**
 * Widget settings — layout mode (compact/comfortable) and always-on-top
 * toggle for the floating widget window. Pure UI; state is owned by the
 * parent, mutations go through IPC setters.
 */
export function WidgetSettingsSection({
  widgetMode,
  setWidgetMode,
  widgetAlwaysOnTop,
  setWidgetAlwaysOnTop,
}: {
  widgetMode: WidgetMode;
  setWidgetMode: (mode: WidgetMode) => void;
  widgetAlwaysOnTop: boolean;
  setWidgetAlwaysOnTop: (next: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="settings-section">
      <h2>{t("settings.widget.title")}</h2>
      <div className="setting-row">
        <div className="setting-label">
          <label>{t("settings.widget.mode")}</label>
          <span className="setting-hint">{t("settings.widget.modeHint")}</span>
        </div>
        <div className="toggle-group">
          {(["compact", "comfortable"] as WidgetMode[]).map((mode) => (
            <button
              key={mode}
              className={`toggle-btn ${widgetMode === mode ? "active" : ""}`}
              onClick={() => setWidgetMode(mode)}
            >
              {t(`settings.widget.modes.${mode}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="setting-row">
        <div className="setting-label">
          <label>{t("settings.widget.alwaysOnTop")}</label>
          <span className="setting-hint">
            {t("settings.widget.alwaysOnTopHint")}
          </span>
        </div>
        <button
          className={`toggle-btn ${widgetAlwaysOnTop ? "active" : ""}`}
          onClick={() => setWidgetAlwaysOnTop(!widgetAlwaysOnTop)}
        >
          {widgetAlwaysOnTop ? t("common.on") : t("common.off")}
        </button>
      </div>
    </section>
  );
}
