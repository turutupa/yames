import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { storeLoad, storeSave } from "../../ipc";
import { getLanguages } from "../../i18n";

/**
 * General settings — auto-update, always-on-top, button flash, active border,
 * drill auto-collapse. Pure UI; state lives in the parent.
 */
export function GeneralSettingsSection({
  autoCheckUpdates,
  setAutoCheckUpdates,
  alwaysOnTop,
  setAlwaysOnTop,
  buttonFlash,
  setButtonFlash,
  activeBorder,
  setActiveBorder,
  drillAutoCollapse,
  setDrillAutoCollapse,
  onRunSetupAgain,
}: {
  autoCheckUpdates: boolean;
  setAutoCheckUpdates: Dispatch<SetStateAction<boolean>>;
  alwaysOnTop: boolean;
  setAlwaysOnTop: (next: boolean) => void;
  buttonFlash: boolean;
  setButtonFlash: Dispatch<SetStateAction<boolean>>;
  activeBorder: boolean;
  setActiveBorder: Dispatch<SetStateAction<boolean>>;
  drillAutoCollapse: boolean;
  setDrillAutoCollapse: Dispatch<SetStateAction<boolean>>;
  /** Re-opens the first-run wizard at W0. Optional so existing tests and
   *  any other mount of this section keep working without it. */
  onRunSetupAgain?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [language, setLanguage] = useState("en");
  const [languageOpen, setLanguageOpen] = useState(false);
  const languages = getLanguages();
  const langWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    storeLoad<string>("language").then((l) => {
      if (l && i18n.hasResourceBundle(l, "translation")) {
        setLanguage(l);
        i18n.changeLanguage(l);
      }
    });
  }, [i18n]);

  // Close the language dropdown on outside click / Escape.
  useEffect(() => {
    if (!languageOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (langWrapRef.current && !langWrapRef.current.contains(e.target as Node)) {
        setLanguageOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLanguageOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [languageOpen]);

  function applyLanguage(l: string) {
    setLanguage(l);
    i18n.changeLanguage(l);
    storeSave("language", l);
  }

  const currentLang = languages.find((l) => l.code === language) ?? languages[0];

  return (
    <section className="settings-section">
      <h2>{t("settings.general.title")}</h2>
      <div className="setting-row">
        <div className="setting-label">
          <label>{t("common.language")}</label>
          <span className="setting-hint">
            {t("common.languageHint")}
          </span>
        </div>
        <div className="lang-select-wrap" ref={langWrapRef}>
          <button
            className={`toggle-btn lang-select-btn ${languageOpen ? "open" : ""}`}
            aria-haspopup="listbox"
            aria-expanded={languageOpen}
            onClick={() => setLanguageOpen((open) => !open)}
          >
            <span>{currentLang?.name ?? language}</span>
            <svg
              className="lang-select-chevron"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {languageOpen && (
            <div className="lang-options" role="listbox">
              {languages.map(({ code, name }) => (
                <button
                  key={code}
                  role="option"
                  aria-selected={code === language}
                  className={`lang-option ${code === language ? "selected" : ""}`}
                  onClick={() => {
                    applyLanguage(code);
                    setLanguageOpen(false);
                  }}
                >
                  <span>{name}</span>
                  {code === language && (
                    <span className="lang-option-check" aria-hidden>
                      ✓
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="setting-row">
        <div className="setting-label">
          <label>{t("settings.general.checkUpdates")}</label>
          <span className="setting-hint">
            {t("settings.general.checkUpdatesHint")}
          </span>
        </div>
        <button
          className={`toggle-btn ${autoCheckUpdates ? "active" : ""}`}
          onClick={() => {
            const next = !autoCheckUpdates;
            setAutoCheckUpdates(next);
            storeSave("autoCheckUpdates", next);
          }}
        >
          {autoCheckUpdates ? t("common.on") : t("common.off")}
        </button>
      </div>
      <div className="setting-row">
        <div className="setting-label">
          <label>{t("settings.general.alwaysOnTop")}</label>
          <span className="setting-hint">
            {t("settings.general.alwaysOnTopHint")}
          </span>
        </div>
        <button
          className={`toggle-btn ${alwaysOnTop ? "active" : ""}`}
          onClick={() => setAlwaysOnTop(!alwaysOnTop)}
        >
          {alwaysOnTop ? t("common.on") : t("common.off")}
        </button>
      </div>
      <div className="setting-row">
        <div className="setting-label">
          <label>{t("settings.general.buttonFlash")}</label>
          <span className="setting-hint">
            {t("settings.general.buttonFlashHint")}
          </span>
        </div>
        <button
          className={`toggle-btn ${buttonFlash ? "active" : ""}`}
          onClick={() => {
            const next = !buttonFlash;
            setButtonFlash(next);
            storeSave("buttonFlash", next);
          }}
        >
          {buttonFlash ? t("common.on") : t("common.off")}
        </button>
      </div>
      <div className="setting-row">
        <div className="setting-label">
          <label>{t("settings.general.activeBorder")}</label>
          <span className="setting-hint">
            {t("settings.general.activeBorderHint")}
          </span>
        </div>
        <button
          className={`toggle-btn ${activeBorder ? "active" : ""}`}
          onClick={() => {
            const next = !activeBorder;
            setActiveBorder(next);
            storeSave("activeBorder", next);
          }}
        >
          {activeBorder ? t("common.on") : t("common.off")}
        </button>
      </div>
      <div className="setting-row">
        <div className="setting-label">
          <label>{t("settings.general.drillAutoCollapse")}</label>
          <span className="setting-hint">
            {t("settings.general.drillAutoCollapseHint")}
          </span>
        </div>
        <button
          className={`toggle-btn ${drillAutoCollapse ? "active" : ""}`}
          onClick={() => {
            const next = !drillAutoCollapse;
            setDrillAutoCollapse(next);
            storeSave("drillAutoCollapse", next);
          }}
        >
          {drillAutoCollapse ? t("common.on") : t("common.off")}
        </button>
      </div>
      {onRunSetupAgain && (
        <div className="setting-row">
          <div className="setting-label">
            <label>{t("settings.general.runSetupAgain")}</label>
            <span className="setting-hint">
              {t("settings.general.runSetupAgainHint")}
            </span>
          </div>
          <button className="toggle-btn" onClick={onRunSetupAgain}>
            {t("settings.general.runSetupAgainAction")}
          </button>
        </div>
      )}
    </section>
  );
}
