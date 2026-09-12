import { forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { showFloating } from "../../ipc";
import { markWidgetOpened } from "../onboarding/hints/hintRuntime";
import { PresetSidebar } from "../../components/presets/PresetSidebar";
import type { PresetSidebarHandle } from "../../components/presets/PresetSidebar";
import type { AppState, Setlist, Preset } from "../../types";
import type { Jam } from "../../jam/types";
import type { MainView } from "./MainHeader";
import type { PlayTab } from "./hooks/useTabRouting";

interface RailProps {
  state: AppState;
  view: MainView;
  setView: (v: MainView) => void;
  prevTab: { current: PlayTab };
  /** The library section — the rail itself is always visible. */
  libraryOpen: boolean;
  onToggleLibrary: () => void;
  onLoadPreset: (preset: Preset) => void;
  onActivePresetChange: (preset: Preset | null, dirty: boolean) => void;
  presetShortcut?: string;
  /** The library lists setlists beside presets (U9.4); the parent owns them. */
  setlists: Setlist[];
  activeSetlistId: string | null;
  onLoadSetlist: (setlist: Setlist) => void;
  onNewSetlist: () => void;
  onDeleteSetlist: (id: string) => void;
  onRenameSetlist: (id: string, name: string) => void;
  /** The jam library, on the jam tab — the same deal setlists get (U9.4). */
  jams: Jam[];
  activeJamId: string | null;
  onLoadJam: (jam: Jam) => void;
  onNewJam: () => void;
  onDeleteJam: (id: string) => void;
  onRenameJam: (id: string, name: string) => void;
  onDuplicateJam: (id: string) => void;
  onReorderJams: (from: number, to: number) => void;
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
    id: "setlist" as const,
    labelKey: "nav.setlist",
    /**
     * Lines with a play head: a list that runs in order.
     *
     * It was two chain links, from when the feature was called a chain of
     * presets. The name went and the picture stayed — and a chain says
     * "joined", which is the one thing a setlist is not about. What it is
     * about is the order and the fact that it plays itself, and the queue
     * glyph is the one every player already taught everybody to read.
     *
     * The lower two lines are short so the play head has its own space:
     * sized up until it read at 12px in a library row, and no further,
     * because past that its left edge starts touching the line ends and
     * the whole glyph smears into one shape.
     */
    icon: (
      <>
        <path d="M4 6.5h11" />
        <path d="M4 12h7" />
        <path d="M4 17.5h7" />
        <path d="m14 10.75 7 4-7 4z" />
      </>
    ),
  },
  {
    id: "drill" as const,
    labelKey: "nav.drill",
    icon: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  },
  {
    id: "jam" as const,
    labelKey: "nav.jam",
    /**
     * Four bars of different heights — the band's lanes, and the same glyph
     * the jam boards use.
     *
     * Redrawn at the rail's 18px on stroke-2 round caps rather than lifted
     * from the board, because every other icon in this list is a stroke and a
     * filled block here would read as the selected one at a glance. The
     * heights are deliberately uneven: four equal bars are a level meter, and
     * a level meter is what the coach's row means.
     */
    icon: (
      <>
        <path d="M5 9v6" />
        <path d="M10 5v14" />
        <path d="M15 8v8" />
        <path d="M20 11v2" />
      </>
    ),
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
    setlists,
    activeSetlistId,
    onLoadSetlist,
    onNewSetlist,
    onDeleteSetlist,
    onRenameSetlist,
    jams,
    activeJamId,
    onLoadJam,
    onNewJam,
    onDeleteJam,
    onRenameJam,
    onDuplicateJam,
    onReorderJams,
    coachOpen,
    coachActive,
    coachListening,
    onToggleCoach,
    onZen,
  },
  sidebarRef,
) {
  const { t } = useTranslation();
  // Settings is an overlay, not a library: it keeps whatever list was
  // behind it, and "beat" is the one to fall back to.
  const playView: PlayTab = view === "settings" ? "beat" : view;

  // The mockup writes "Ready" at the right of the coach's row. Three words
  // rather than one, because the row already knows more than that: a session
  // is either running with the input open, running without it, or not running
  // at all, and "Ready" for all three would be the least informative of the
  // three states pretending to be the only one.
  const coachStatus = coachActive
    ? coachListening
      ? t("transport.listening")
      : t("rail.coachInSession")
    : t("rail.coachReady");

  return (
    <nav
      className="rail"
      data-library-open={libraryOpen ? "" : undefined}
      data-collapsed={libraryOpen ? undefined : ""}
      aria-label={t("rail.label")}
    >
      <div className="rail-modes">
        {MODES.map((mode) => (
          <button
            key={mode.id}
            className={`rail-mode ${view === mode.id ? "active" : ""}`}
            // Below 620px the rail is icons only and the label is display:
            // none, which leaves the button with no accessible name at all.
            // The label is named here so it survives being hidden.
            aria-label={t(mode.labelKey)}
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
        {libraryOpen && (
          <PresetSidebar
            ref={sidebarRef}
            state={state}
            view={playView}
            isOpen
            onLoadPreset={onLoadPreset}
            onActiveChange={onActivePresetChange}
            shortcut={presetShortcut}
            setlists={setlists}
            activeSetlistId={activeSetlistId}
            onLoadSetlist={onLoadSetlist}
            onNewSetlist={onNewSetlist}
            onDeleteSetlist={onDeleteSetlist}
            onRenameSetlist={onRenameSetlist}
            jams={jams}
            activeJamId={activeJamId}
            onLoadJam={onLoadJam}
            onNewJam={onNewJam}
            onDeleteJam={onDeleteJam}
            onRenameJam={onRenameJam}
            onDuplicateJam={onDuplicateJam}
            onReorderJams={onReorderJams}
          />
        )}
      </div>

      <div className="rail-footer">
        <button
          className={`rail-action ${coachOpen ? "active" : ""}`}
          // The status is in the name, not only beside it: below 620px the
          // rail is icons and every label here is `display: none`, which
          // would take the status with it.
          aria-label={`${t("settings.coach.title")} — ${coachStatus}`}
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
          <span className="rail-action-status" aria-hidden="true">
            {coachStatus}
          </span>
          {coachActive && (
            <span
              className={`rail-action-dot ${coachListening ? "listening" : ""}`}
              aria-hidden="true"
            />
          )}
        </button>

        <button
          className="rail-action"
          aria-label={t("tooltip.zen")}
          onClick={onZen}
          data-tour="zen-widget"
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
              <path d="M12 22c4-4 8-7.5 8-12a8 8 0 1 0-16 0c0 4.5 4 8 8 12z" />
              <path d="M12 2v20" />
              <path d="M4.5 10c2.5 1 5 1 7.5 0s5-1 7.5 0" />
            </svg>
          </span>
          <span className="rail-action-label">{t("tooltip.zen")}</span>
        </button>

        <button
          className="rail-action"
          aria-label={t("tooltip.openWidget")}
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
          aria-label={t("tooltip.settings")}
          data-hint="midi-plugged"
          onClick={() => {
            if (view === "settings") {
              setView(prevTab.current);
            } else {
              // Every play tab, not two of them: this said `drill : beat`,
              // which quietly sent anyone who opened Settings from the setlist
              // or the jam back to the metronome.
              prevTab.current = view;
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
        {/* The sidebar's own control, at the sidebar's level.

            It used to sit in the PRESETS header, where it collapsed the whole
            rail but read as though it collapsed the preset list — the owner
            called that out. A control belongs beside the thing it acts on, and
            what this acts on is all of it. */}
        <button
          className="rail-action rail-collapse"
          aria-label={t(libraryOpen ? "rail.collapse" : "rail.expand")}
          title={
            presetShortcut
              ? t(libraryOpen ? "rail.collapseWithShortcut" : "rail.expandWithShortcut", {
                  shortcut: presetShortcut,
                })
              : t(libraryOpen ? "rail.collapse" : "rail.expand")
          }
          aria-expanded={libraryOpen}
          onClick={onToggleLibrary}
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
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <line x1="9.5" y1="4" x2="9.5" y2="20" />
              <polyline points={libraryOpen ? "15.5 9.5 13 12 15.5 14.5" : "13 9.5 15.5 12 13 14.5"} />
            </svg>
          </span>
          <span className="rail-action-label">{t("rail.collapse")}</span>
        </button>
      </div>
    </nav>
  );
});
