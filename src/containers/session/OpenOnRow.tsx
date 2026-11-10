/**
 * Settings: "Open on my last tool".
 *
 * Its own small component with its own read of the store, like the other switches
 * in the General section. It takes effect at the next launch, which is the only
 * moment "open on" means anything.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { storeLoad, storeSave } from "../../ipc";
import { OPEN_ON_KEY } from "../main-window/hooks/useTabRouting";
import type { OpenOn } from "../main-window/hooks/useTabRouting";

export function OpenOnRow() {
  const { t } = useTranslation();
  const [lastTool, setLastTool] = useState(false);
  useEffect(() => {
    void storeLoad<OpenOn>(OPEN_ON_KEY)
      .then((value) => setLastTool(value === "lastTool"))
      .catch(() => {});
  }, []);
  return (
    <div className="setting-row">
      <div className="setting-label">
        <label>{t("session.settings.openOnLastTool")}</label>
        <span className="setting-hint">{t("session.settings.openOnLastToolHint")}</span>
      </div>
      <button
        className={`toggle-btn ${lastTool ? "active" : ""}`}
        data-testid="open-on-last-tool"
        onClick={() => {
          const next = !lastTool;
          setLastTool(next);
          void storeSave(OPEN_ON_KEY, (next ? "lastTool" : "today") satisfies OpenOn);
        }}
      >
        {lastTool ? t("common.on") : t("common.off")}
      </button>
    </div>
  );
}
