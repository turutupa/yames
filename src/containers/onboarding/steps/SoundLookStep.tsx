/**
 * W2 — Sound & look (ONBOARDING_PLAN §3, decision 2).
 *
 * The step where the app demonstrates itself (principle 3): hovering or
 * focusing a sound card switches the softly playing click to it, hovering a
 * theme card restyles the whole window behind the overlay. Both go through the
 * app's normal setters (`setSoundType` / `setTheme`), so a *pick* persists
 * exactly like the header dropdown and the Settings theme grid do — there is
 * no wizard-only copy of this state.
 *
 * Preview vs. pick:
 *   - hover / focus  → transient preview (debounced, `PREVIEW_DEBOUNCE_MS`);
 *                      leaving the card reverts to the confirmed value.
 *   - click / Enter / Space → confirms: persisted immediately, and what Esc,
 *                      Back or Skip restore to when the step goes away.
 * The shell owns the footer, so the step cannot tell Next from Esc; it does
 * not need to — a confirmed value is already persisted and a preview is always
 * rolled back on unmount.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SOUND_TYPES } from "../../../constants/metronome";
import { setSoundType, setTheme } from "../../../ipc";
import { getThemeById } from "../../../themes";
import { useWizardEnv } from "../WizardContext";
import type { WizardStepProps } from "./types";

/** The three themes W2 offers; the other eight live in Settings → Appearance. */
export const CURATED_THEME_IDS = ["obsidian", "aurora", "ivory"] as const;

/** Decision 2: Obsidian is the wizard's preselection. */
export const WIZARD_DEFAULT_THEME = "obsidian";

/**
 * The engine's own default (`AppState::default()` in `src-tauri/src/state.rs`).
 * A theme still sitting on it means the user has never chosen one, which is
 * the only case where W2 may preselect Obsidian for them — someone who
 * already picked Lavender does not get their window hijacked by a step they
 * only walked past.
 */
const UNCHOSEN_THEME = "mono";

/**
 * Preview delay. Short enough that the click changes well inside one beat at
 * 80 BPM (750 ms), long enough that sweeping the mouse across four cards does
 * not fire four engine calls.
 */
export const PREVIEW_DEBOUNCE_MS = 60;

type Choice = { sound: string; theme: string | null };

export function SoundLookStep({ isActive }: WizardStepProps) {
  const { t } = useTranslation();
  const { soundType, themeId, startSoftClick, openThemeSettings } = useWizardEnv();

  // What the app was set to on the way in, and what a pick has confirmed
  // since. Captured once: `soundType` / `themeId` follow every preview, so
  // reading them later would make the baseline drift with the mouse.
  const [confirmed, setConfirmed] = useState<Choice>(() => ({
    sound: soundType,
    theme: (CURATED_THEME_IDS as readonly string[]).includes(themeId)
      ? themeId
      : themeId === UNCHOSEN_THEME
        ? WIZARD_DEFAULT_THEME
        : null,
  }));
  const confirmedRef = useRef(confirmed);
  confirmedRef.current = confirmed;

  // What the engine is actually set to right now (preview included), so a
  // revert only fires when something really changed.
  const appliedRef = useRef({ sound: soundType, theme: themeId });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The shell focuses a step's first control when it opens. That programmatic
  // focus must not preview a sound the user never asked for.
  const skipAutoFocusRef = useRef(true);

  const cancelPending = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const pushSound = useCallback((id: string) => {
    if (appliedRef.current.sound === id) return;
    appliedRef.current.sound = id;
    void setSoundType(id);
  }, []);

  const pushTheme = useCallback((id: string) => {
    if (appliedRef.current.theme === id) return;
    appliedRef.current.theme = id;
    void setTheme(id);
  }, []);

  const schedule = useCallback(
    (run: () => void) => {
      cancelPending();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        run();
      }, PREVIEW_DEBOUNCE_MS);
    },
    [cancelPending],
  );

  // The click has to be audible for a sound preview to mean anything. The
  // wizard can be entered at W1 from the "Finish setup" chip, in which case W0
  // never started it; `startSoftClick` is idempotent.
  useEffect(() => {
    if (isActive) startSoftClick();
  }, [isActive, startSoftClick]);

  // Decision 2: land on Obsidian when no theme was ever chosen. Applied, not
  // just highlighted — a card marked selected while the window shows something
  // else is a lie (same reasoning as W1's "no pre-highlight on first run").
  useEffect(() => {
    // Mount only: later changes go through the preview/pick handlers.
    if (confirmedRef.current.theme) pushTheme(confirmedRef.current.theme);
  }, [pushTheme]);

  // Leaving the step (Esc, Back, Skip, Next, or the Settings detour) drops any
  // hover preview still in flight and puts the confirmed choice back.
  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
      const { sound, theme } = confirmedRef.current;
      if (appliedRef.current.sound !== sound) {
        appliedRef.current.sound = sound;
        void setSoundType(sound);
      }
      if (theme && appliedRef.current.theme !== theme) {
        appliedRef.current.theme = theme;
        void setTheme(theme);
      }
    },
    [],
  );

  const previewSound = useCallback(
    (id: string) => schedule(() => pushSound(id)),
    [schedule, pushSound],
  );
  const previewTheme = useCallback(
    (id: string) => schedule(() => pushTheme(id)),
    [schedule, pushTheme],
  );
  const revertSound = useCallback(
    () => schedule(() => pushSound(confirmedRef.current.sound)),
    [schedule, pushSound],
  );
  const revertTheme = useCallback(
    () =>
      schedule(() => {
        const theme = confirmedRef.current.theme;
        if (theme) pushTheme(theme);
      }),
    [schedule, pushTheme],
  );

  const pickSound = useCallback(
    (id: string) => {
      cancelPending();
      pushSound(id);
      setConfirmed((c) => ({ ...c, sound: id }));
    },
    [cancelPending, pushSound],
  );
  const pickTheme = useCallback(
    (id: string) => {
      cancelPending();
      pushTheme(id);
      setConfirmed((c) => ({ ...c, theme: id }));
    },
    [cancelPending, pushTheme],
  );

  /** Swallow the shell's opening focus, preview every focus after it. */
  const onCardFocus = useCallback(
    (preview: () => void) => {
      if (skipAutoFocusRef.current) {
        skipAutoFocusRef.current = false;
        return;
      }
      preview();
    },
    [],
  );

  return (
    <div className="onboarding-step">
      <h2 className="onboarding-step-title" id="onboarding-title">
        {t("onboarding.soundLook.title")}
      </h2>
      <p className="onboarding-step-subtitle">
        {t("onboarding.soundLook.subtitle")}
      </p>

      <div className="onboarding-sound-look">
        <div className="onboarding-choice-col">
          <h3 className="onboarding-choice-heading">
            {t("onboarding.soundLook.soundHeading")}
          </h3>
          <div className="onboarding-sound-grid" data-testid="onboarding-sound-grid">
            {SOUND_TYPES.map((sound) => (
              <button
                key={sound.id}
                type="button"
                className={`onboarding-sound-card${
                  confirmed.sound === sound.id ? " selected" : ""
                }`}
                aria-pressed={confirmed.sound === sound.id}
                onMouseEnter={() => previewSound(sound.id)}
                onMouseLeave={revertSound}
                onFocus={() => onCardFocus(() => previewSound(sound.id))}
                onBlur={revertSound}
                onClick={() => pickSound(sound.id)}
              >
                <span className="onboarding-sound-icon" aria-hidden="true">
                  {sound.icon}
                </span>
                <span className="onboarding-sound-name">
                  {t(`sound.${sound.id}`)}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="onboarding-choice-col">
          <h3 className="onboarding-choice-heading">
            {t("onboarding.soundLook.themeHeading")}
          </h3>
          <div className="onboarding-theme-grid" data-testid="onboarding-theme-grid">
            {CURATED_THEME_IDS.map((id) => {
              const theme = getThemeById(id);
              return (
                <button
                  key={id}
                  type="button"
                  className={`theme-card onboarding-theme-card${
                    confirmed.theme === id ? " active" : ""
                  }`}
                  aria-pressed={confirmed.theme === id}
                  onMouseEnter={() => previewTheme(id)}
                  onMouseLeave={revertTheme}
                  onFocus={() => onCardFocus(() => previewTheme(id))}
                  onBlur={revertTheme}
                  onClick={() => pickTheme(id)}
                >
                  <span className="theme-card-preview" aria-hidden="true">
                    {theme.preview.map((color, i) => (
                      <span
                        key={i}
                        className="theme-card-swatch"
                        style={{ background: color }}
                      />
                    ))}
                  </span>
                  <span className="theme-card-name">{theme.name}</span>
                </button>
              );
            })}
          </div>
          {openThemeSettings && (
            <button
              type="button"
              className="onboarding-more-themes"
              onClick={openThemeSettings}
            >
              {t("onboarding.soundLook.moreThemes")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
