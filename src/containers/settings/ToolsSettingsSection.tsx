import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { storeSave } from "../../ipc";
import { SwitchFace } from "./SwitchFace";

/**
 * The tools' own switches: button flash, the active border and Drill's
 * auto-collapse. They lived in General, between the language and "Open on my
 * last tool", where a player looking for anything about their practice had to
 * read past three rows about the metronome's chrome. Same rows, same keys,
 * same handlers; only the section they sit in moved (settings revamp,
 * 2026-11-17). Songs, the widget and the hotkeys follow this panel.
 */
export function ToolsSettingsSection({
  buttonFlash,
  setButtonFlash,
  activeBorder,
  setActiveBorder,
  drillAutoCollapse,
  setDrillAutoCollapse,
}: {
  buttonFlash: boolean;
  setButtonFlash: Dispatch<SetStateAction<boolean>>;
  activeBorder: boolean;
  setActiveBorder: Dispatch<SetStateAction<boolean>>;
  drillAutoCollapse: boolean;
  setDrillAutoCollapse: Dispatch<SetStateAction<boolean>>;
}) {
  const { t } = useTranslation();
  const onOff = (on: boolean) => (on ? t("common.on") : t("common.off"));
  return (
    <section className="settings-section" id="settings-tools">
      <h2>{t("settings.tools.title")}</h2>
      <div className="setting-row">
        <div className="setting-label">
          <label>{t("settings.general.buttonFlash")}</label>
          <span className="setting-hint">{t("settings.general.buttonFlashHint")}</span>
        </div>
        <button
          className={`toggle-btn setting-switch ${buttonFlash ? "active" : ""}`}
          onClick={() => {
            const next = !buttonFlash;
            setButtonFlash(next);
            storeSave("buttonFlash", next);
          }}
        >
          <SwitchFace label={onOff(buttonFlash)} />
        </button>
      </div>
      <div className="setting-row">
        <div className="setting-label">
          <label>{t("settings.general.activeBorder")}</label>
          <span className="setting-hint">{t("settings.general.activeBorderHint")}</span>
        </div>
        <button
          className={`toggle-btn setting-switch ${activeBorder ? "active" : ""}`}
          onClick={() => {
            const next = !activeBorder;
            setActiveBorder(next);
            storeSave("activeBorder", next);
          }}
        >
          <SwitchFace label={onOff(activeBorder)} />
        </button>
      </div>
      <div className="setting-row">
        <div className="setting-label">
          <label>{t("settings.general.drillAutoCollapse")}</label>
          <span className="setting-hint">{t("settings.general.drillAutoCollapseHint")}</span>
        </div>
        <button
          className={`toggle-btn setting-switch ${drillAutoCollapse ? "active" : ""}`}
          onClick={() => {
            const next = !drillAutoCollapse;
            setDrillAutoCollapse(next);
            storeSave("drillAutoCollapse", next);
          }}
        >
          <SwitchFace label={onOff(drillAutoCollapse)} />
        </button>
      </div>
    </section>
  );
}
