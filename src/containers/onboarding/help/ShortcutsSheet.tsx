/**
 * Help → Keyboard shortcuts. A scrollable sheet around the *same*
 * `HotkeysSettingsSection` that Settings renders, in `readOnly` mode — no
 * second list of shortcuts to drift out of date.
 *
 * The always-on-top line at the bottom is the ONBOARDING_PLAN §6 promise that
 * the default is stated somewhere reachable. W7 already shows it with a
 * toggle, but the "Just give me the click" path never reaches W7, so Help is
 * the other place it has to appear.
 */
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { HotkeysSettingsSection } from "../../settings/HotkeysSettingsSection";
import type { UseMidiReturn } from "../../../hooks/useMidi";
import "../../../styles/help.css";

type Bindings = Record<string, string>;

export type ShortcutsSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Back to the Help menu. Omit to show only "Close". */
  onBack?: () => void;
  keyBindings: Bindings;
  globalBindings: Bindings;
  footBindings: Bindings;
  midi: UseMidiReturn;
  /** False suppresses the entrance animation. */
  animate?: boolean;
};

export function ShortcutsSheet({
  open,
  onClose,
  onBack,
  keyBindings,
  globalBindings,
  footBindings,
  midi,
  animate = true,
}: ShortcutsSheetProps) {
  const { t } = useTranslation();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={`help-overlay${animate ? "" : " no-motion"}`}
      data-testid="shortcuts-sheet"
      onClick={onClose}
    >
      <div
        className="help-card help-shortcuts-card"
        role="dialog"
        aria-modal="true"
        aria-label={t("onboarding.help.shortcuts")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="help-shortcuts-body">
          <HotkeysSettingsSection
            keyBindings={keyBindings}
            globalBindings={globalBindings}
            footBindings={footBindings}
            midi={midi}
            readOnly
          />
          <p className="help-shortcuts-note">{t("onboarding.help.alwaysOnTopNote")}</p>
        </div>
        <div className="help-card-actions">
          {onBack && (
            <button type="button" className="help-btn help-btn-ghost" onClick={onBack}>
              {t("onboarding.help.back")}
            </button>
          )}
          <button
            ref={closeRef}
            type="button"
            className="help-btn help-btn-primary"
            onClick={onClose}
          >
            {t("onboarding.help.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
