import { useTranslation } from "react-i18next";
import type { MainView } from "./MainHeader";
import type { PlayTab } from "./hooks/useTabRouting";

interface MobileTabBarProps {
  view: MainView;
  setView: (v: MainView) => void;
  /** Where Settings returns you to, exactly as the rail's own button does. */
  prevTab: { current: PlayTab };
  libraryOpen: boolean;
  onToggleLibrary: () => void;
  onZen: () => void;
}

/**
 * The phone's navigation: the four screens along the bottom, where a thumb is.
 *
 * It replaces the 252px rail, which on a 360px screen was 68px of icons with
 * no labels and an expand button that slid a drawer over 70% of the app
 * (`plans/tasks/mobile/M03-GAPS.md`, ranked #1). Those 68px come back to every
 * screen, which is most of what was wrong with the meter row and all of what
 * was wrong with the subdivision buttons.
 *
 * The rail is not restyled into this. It stays exactly as it is for desktop —
 * this is a separate component chosen by `IS_MOBILE` in `MainWindow`, so
 * nothing here can reach a desktop pixel, and the rail's tests keep testing
 * the rail.
 *
 * Six buttons, in two groups. The four on the left are destinations and behave
 * like tabs: one is current, pressing one goes there. The two on the right are
 * not places — the library opens a sheet over whatever you are on, and Zen is
 * a mode of the screen you are already looking at — so a hairline separates
 * them and neither ever carries `aria-current`.
 *
 * Zen is here because the rail was the only way into it on a phone: the other
 * two are a keyboard shortcut and a double-click, and `M03-GAPS` is explicit
 * that double-tap is the zoom gesture. Fullscreen ships in mobile v1
 * (plan §1), so it needs a door.
 */

const beatIcon = (
  <>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </>
);

const drillIcon = <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />;

const setlistIcon = (
  <>
    <path d="M9.5 14.5a4 4 0 0 1 0-5l2-2a4 4 0 0 1 5.7 5.7l-1 1" />
    <path d="M14.5 9.5a4 4 0 0 1 0 5l-2 2a4 4 0 0 1-5.7-5.7l1-1" />
  </>
);

/* The band's four lanes, the same glyph the rail uses for Jam and the same
   one the jam boards draw. Uneven heights on purpose: four equal bars are a
   level meter. */
const jamIcon = (
  <>
    <path d="M5 9v6" />
    <path d="M10 5v14" />
    <path d="M15 8v8" />
    <path d="M20 11v2" />
  </>
);

const settingsIcon = (
  <>
    <line x1="4" y1="8" x2="20" y2="8" />
    <line x1="4" y1="16" x2="20" y2="16" />
    <circle cx="10" cy="8" r="2.4" />
    <circle cx="15" cy="16" r="2.4" />
  </>
);

/* A stack of cards — the same thing the library holds, and distinct from the
   setlist tab's linked rings beside it. */
const libraryIcon = (
  <>
    <rect x="3" y="4" width="18" height="7" rx="2" />
    <line x1="6" y1="15" x2="18" y2="15" />
    <line x1="6" y1="19" x2="18" y2="19" />
  </>
);

const zenIcon = (
  <>
    <path d="M12 22c4-4 8-7.5 8-12a8 8 0 1 0-16 0c0 4.5 4 8 8 12z" />
    <path d="M12 2v20" />
    <path d="M4.5 10c2.5 1 5 1 7.5 0s5-1 7.5 0" />
  </>
);

// `labelKey` is the short text painted on the tab (`mobileTabs.*` — chosen to
// fit ~56px at 0.58rem in all 15 locales, M03d). `fullLabelKey` is the same
// screen's existing full name, kept as the button's `aria-label` so a screen
// reader still hears "Metronome" rather than the abbreviation a sighted user
// reads off the bar.
const TABS = [
  { id: "beat" as const, labelKey: "mobileTabs.metronome", fullLabelKey: "nav.metronome", icon: beatIcon },
  { id: "drill" as const, labelKey: "mobileTabs.drill", fullLabelKey: "nav.drill", icon: drillIcon },
  { id: "setlist" as const, labelKey: "mobileTabs.setlist", fullLabelKey: "nav.setlist", icon: setlistIcon },
  // The band. Fifth, after the three the metronome was already about, and
  // before Settings — a destination, not a tool (M08).
  { id: "jam" as const, labelKey: "mobileTabs.jam", fullLabelKey: "nav.jam", icon: jamIcon },
  { id: "settings" as const, labelKey: "mobileTabs.settings", fullLabelKey: "tooltip.settings", icon: settingsIcon },
];

function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function MobileTabBar({
  view,
  setView,
  prevTab,
  libraryOpen,
  onToggleLibrary,
  onZen,
}: MobileTabBarProps) {
  const { t } = useTranslation();

  return (
    // The rail's own name, deliberately: this bar carries the same three
    // things it did — the modes, the library, and Zen — so a second string
    // saying the same thing in fifteen languages would only be a second thing
    // to keep in step.
    <nav className="mobile-tabs" aria-label={t("rail.label")}>
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`mobile-tab ${view === tab.id ? "active" : ""}`}
          data-tab={tab.id}
          aria-label={t(tab.fullLabelKey)}
          aria-current={view === tab.id ? "page" : undefined}
          onClick={() => {
            if (tab.id === "settings") {
              // Settings is an overlay, not a fifth place: pressing it again
              // puts you back where you were, exactly as the rail does.
              if (view === "settings") return setView(prevTab.current);
              prevTab.current = view;
              return setView("settings");
            }
            setView(tab.id);
          }}
        >
          <Glyph>{tab.icon}</Glyph>
          <span className="mobile-tab-label">{t(tab.labelKey)}</span>
        </button>
      ))}

      <span className="mobile-tabs-split" aria-hidden="true" />

      <button
        type="button"
        className={`mobile-tab mobile-tab-library ${libraryOpen ? "active" : ""}`}
        aria-label={t("tabs.library")}
        aria-expanded={libraryOpen}
        onClick={onToggleLibrary}
      >
        <Glyph>{libraryIcon}</Glyph>
        <span className="mobile-tab-label">{t("mobileTabs.library")}</span>
      </button>

      <button
        type="button"
        className="mobile-tab mobile-tab-zen"
        aria-label={t("tooltip.zen")}
        onClick={onZen}
      >
        <Glyph>{zenIcon}</Glyph>
        <span className="mobile-tab-label">{t("mobileTabs.zen")}</span>
      </button>
    </nav>
  );
}
