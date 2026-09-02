import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { storeSave } from "../../ipc";
import { THEMES } from "../../themes";

type ViewTransitions = "off" | "subtle" | "smooth" | "expressive";
type AnimationStyle = "fade" | "scale" | "blur" | "slide" | "reveal";

/**
 * Appearance settings — theme picker grid and view-transition controls
 * (level + animation style). Pure UI; state lives in the parent.
 */
export function AppearanceSettingsSection({
  themeId,
  setTheme,
  viewTransitions,
  setViewTransitions,
  animationStyle,
  setAnimationStyle,
}: {
  themeId: string;
  setTheme: (id: string) => void;
  viewTransitions: ViewTransitions;
  setViewTransitions: Dispatch<SetStateAction<ViewTransitions>>;
  animationStyle: AnimationStyle;
  setAnimationStyle: Dispatch<SetStateAction<AnimationStyle>>;
}) {
  const { t } = useTranslation();
  // `id` is the anchor the wizard's W2 "More themes in Settings" link scrolls
  // to (O2).
  return (
    <section className="settings-section" id="settings-appearance">
      <h2>{t("settings.appearance.title")}</h2>
      <div className="theme-grid">
        {THEMES.map((theme) => (
          <button
            key={theme.id}
            className={`theme-card ${themeId === theme.id ? "active" : ""}`}
            onClick={() => setTheme(theme.id)}
            title={theme.name}
          >
            <div className="theme-card-preview">
              {theme.preview.map((color, i) => (
                <div
                  key={i}
                  className="theme-card-swatch"
                  style={{ background: color }}
                />
              ))}
            </div>
            <span className="theme-card-name">{theme.name}</span>
          </button>
        ))}
      </div>
      <div className="setting-row">
        <div className="setting-label">
          <label>{t("settings.appearance.viewAnimations")}</label>
          <span className="setting-hint">
            {t("settings.appearance.viewAnimationsHint")}
          </span>
        </div>
        <div className="toggle-group">
          {(["off", "subtle", "smooth", "expressive"] as const).map((level) => (
            <button
              key={level}
              className={`toggle-btn ${viewTransitions === level ? "active" : ""}`}
              onClick={() => {
                setViewTransitions(level);
                storeSave("viewTransitions", level);
              }}
            >
              {t(`settings.appearance.transitions.${level}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="setting-row">
        <div className="setting-label">
          <label>{t("settings.appearance.animationStyle")}</label>
          <span className="setting-hint">
            {t("settings.appearance.animationStyleHint")}
          </span>
        </div>
        <div className="toggle-group">
          {(["fade", "scale", "blur", "slide", "reveal"] as const).map((style) => (
            <button
              key={style}
              className={`toggle-btn ${animationStyle === style ? "active" : ""}`}
              disabled={viewTransitions === "off"}
              onClick={() => {
                setAnimationStyle(style);
                storeSave("animationStyle", style);
              }}
            >
              {t(`settings.appearance.style.${style}`)}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
