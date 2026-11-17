import { useEffect, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { storeSave } from "../../ipc";
import { setForceFlat, setNeck3d, stagePrefsReady, useStagePrefs } from "../../stage3d/prefs";
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
      <Neck3dRow />
    </section>
  );
}

/**
 * "3D fretboard: Auto / Off" (`stage3d/prefs.ts`). When the frame-time guard
 * found this machine too slow, Auto says so and offers to measure again.
 */
function Neck3dRow() {
  const { t } = useTranslation();
  const prefs = useStagePrefs();
  useEffect(() => {
    void stagePrefsReady();
  }, []);
  const slow = prefs.neck3d === "auto" && prefs.forceFlat;
  return (
    <div className="setting-row" data-testid="setting-neck3d">
      <div className="setting-label">
        <label>{t("settings.appearance.neck3d")}</label>
        <span className="setting-hint">
          {slow ? t("settings.appearance.neck3dSlow") : t("settings.appearance.neck3dHint")}
        </span>
      </div>
      <div className="toggle-group">
        {(["auto", "off"] as const).map((mode) => (
          <button
            key={mode}
            className={`toggle-btn ${prefs.neck3d === mode ? "active" : ""}`}
            aria-pressed={prefs.neck3d === mode}
            onClick={() => setNeck3d(mode)}
          >
            {t(`settings.appearance.neck3dModes.${mode}`)}
          </button>
        ))}
        {slow && (
          <button className="toggle-btn" data-testid="neck3d-retry" onClick={() => setForceFlat(false)}>
            {t("settings.appearance.neck3dRetry")}
          </button>
        )}
      </div>
    </div>
  );
}
