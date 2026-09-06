import { forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { showFloating } from "../../ipc";
import { markWidgetOpened } from "../onboarding/hints/hintRuntime";
import { PresetSidebar } from "../../components/presets/PresetSidebar";
import type { PresetSidebarHandle } from "../../components/presets/PresetSidebar";
import type { AppState, Preset } from "../../types";
import type { MainView } from "./MainHeader";

interface RailProps {
  state: AppState;
  view: MainView;
  setView: (v: MainView) => void;
  prevTab: { current: "beat" | "drill" };
  /** The library section — the rail itself is always visible. */
  libraryOpen: boolean;
  onToggleLibrary: () => void;
  onLoadPreset: (preset: Preset) => void;
  onActivePresetChange: (preset: Preset | null, dirty: boolean) => void;
  presetShortcut?: string;
  coachOpen: boolean;
  coachActive: boolean;
  coachListening: boolean;
  onToggleCoach: () => void;
  onZen: () => void;
}

const MODES = [
  {
    id: "beat" as const,
    labelKey: "nav.metronome",
    icon: (
      <>
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </>
    ),
  },
  {
    id: "drill" as const,
    labelKey: "nav.drill",
    icon: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  },
];

/**
 * The left rail — modes at the top, the library beneath them, and the things
 * that are not modes pinned at the bottom.
 *
 * This is the shell's one navigation surface (UI_DECISIONS U1.1). It replaces
 * the top tab strip and the sliding preset drawer, and it is what lets a third
 * mode arrive later without the header having to grow. Its width is fixed, so
 * the stage keeps a constant offset from the window's left edge no matter what
 * else is open (U1.3).
 *
 * Settings is not a mode: it opens as a sheet over the whole window (U1.5), so
 * its row is a button here rather than a fourth entry in the mode list.
 */
export const Rail = forwardRef<PresetSidebarHandle, RailProps>(function Rail(
  {
    state,
    view,
    setView,
    prevTab,
    libraryOpen,
    onToggleLibrary,
    onLoadPreset,
    onActivePresetChange,
    presetShortcut,
    coachOpen,
    coachActive,
    coachListening,
    onToggleCoach,
    onZen,
  },
  sidebarRef,
) {
  const { t } = useTranslation();
  const playView = view === "beat" || view === "drill" ? view : "beat";

  return (
    <nav className="rail" data-library-open={libraryOpen ? "" : undefined} aria-label={t("rail.label")}>
      <div className="rail-modes">
        {MODES.map((mode) => (
          <button
            key={mode.id}
            className={`rail-mode ${view === mode.id ? "active" : ""}`}
            data-tour={mode.id === "drill" ? "drill-tab" : undefined}
            onClick={() => setView(mode.id)}
            aria-current={view === mode.id ? "page" : undefined}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {mode.icon}
            </svg>
            <span className="rail-mode-label">{t(mode.labelKey)}</span>
          </button>
        ))}
      </div>

      <div className="rail-library" data-open={libraryOpen ? "" : undefined}>
        {libraryOpen ? (
          <PresetSidebar
            ref={sidebarRef}
            state={state}
            view={playView}
            isOpen
            onToggle={onToggleLibrary}
            onLoadPreset={onLoadPreset}
            onActiveChange={onActivePresetChange}
            shortcut={presetShortcut}
          />
        ) : (
          <button
            className="rail-library-reopen"
            onClick={onToggleLibrary}
            title={
              presetShortcut
                ? t("presets.openWithShortcut", { shortcut: presetShortcut })
                : t("presets.open")
            }
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 6 15 12 9 18" />
            </svg>
            <span>{t("presets.title")}</span>
          </button>
        )}
      </div>

      <div className="rail-footer">
        <button
          className={`rail-action ${coachOpen ? "active" : ""}`}
          onClick={onToggleCoach}
        >
          <span className="rail-action-icon rail-action-coach">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12a8 8 0 1 0-3.1 6.3L21 19z" />
              <line x1="9" y1="10" x2="9" y2="14" />
              <line x1="12.5" y1="8.5" x2="12.5" y2="15.5" />
              <line x1="16" y1="11" x2="16" y2="13" />
            </svg>
          </span>
          <span className="rail-action-label">{t("settings.coach.title")}</span>
          {coachActive && (
            <span
              className={`rail-action-dot ${coachListening ? "listening" : ""}`}
              aria-hidden="true"
            />
          )}
        </button>

        <button className="rail-action" onClick={onZen} data-tour="zen-widget">
          <span className="rail-action-icon">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22c4-4 8-7.5 8-12a8 8 0 1 0-16 0c0 4.5 4 8 8 12z" />
              <path d="M12 2v20" />
              <path d="M4.5 10c2.5 1 5 1 7.5 0s5-1 7.5 0" />
            </svg>
          </span>
          <span className="rail-action-label">{t("tooltip.zen")}</span>
        </button>

        <button
          className="rail-action"
          data-hint="widget-discover"
          data-tour="zen-widget"
          onClick={() => {
            // The `widget-discover` hint stops offering itself once the user
            // has found the widget on their own.
            void markWidgetOpened();
            showFloating();
          }}
        >
          <span className="rail-action-icon">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="2" width="20" height="20" rx="2" />
              <rect x="10" y="10" width="10" height="10" rx="1" />
            </svg>
          </span>
          <span className="rail-action-label">{t("tooltip.openWidget")}</span>
        </button>

        <button
          className={`rail-action ${view === "settings" ? "active" : ""}`}
          data-hint="midi-plugged"
          onClick={() => {
            if (view === "settings") {
              setView(prevTab.current);
            } else {
              prevTab.current = view === "drill" ? "drill" : "beat";
              setView("settings");
            }
          }}
        >
          <span className="rail-action-icon">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="4" y1="8" x2="20" y2="8" />
              <line x1="4" y1="16" x2="20" y2="16" />
              <circle cx="10" cy="8" r="2.4" />
              <circle cx="15" cy="16" r="2.4" />
            </svg>
          </span>
          <span className="rail-action-label">{t("tooltip.settings")}</span>
        </button>
      </div>
    </nav>
  );
});
