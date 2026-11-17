/**
 * Tools: the door to the five tools.
 *
 * Each card opens its tool exactly as the tool's hotkey does (`setView` with the
 * same id), so the tool behind it is the one it always was. Their order is the
 * order `tab-1` to `tab-5` count, and that is not an accident.
 */
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { MODES } from "../main-window/Rail";
import type { PlayTab } from "../main-window/hooks/useTabRouting";
import "../../styles/session.css";

export function ToolsView({ onOpen }: { onOpen: (tool: PlayTab) => void }) {
  const { t } = useTranslation();
  return (
    <div className="session-page session-tools" data-testid="tools">
      <div className="session-rise">
        <h1 className="session-h1 session-serif">{t("session.nav.tools")}</h1>
        <div className="session-why">{t("session.tools.intro")}</div>
      </div>
      <div className="session-toolgrid">
        {MODES.map((mode, i) => (
          <button
            key={mode.id}
            className="session-tool session-glass session-rise"
            style={{ "--i": i } as CSSProperties}
            onClick={() => onOpen(mode.id)}
            data-testid={`tool-card-${mode.id}`}
          >
            <span className="session-tool-view" aria-hidden="true">
              <svg
                width="56"
                height="56"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {mode.icon}
              </svg>
            </span>
            <span className="session-tool-meta">
              <b>
                {t(mode.labelKey)}
                {mode.id === "jam" && <span className="session-tag">{t("rail.beta")}</span>}
              </b>
              <span>{t(`session.tools.${mode.id}`)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
