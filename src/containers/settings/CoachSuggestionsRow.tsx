/**
 * Settings → Coach: "Suggestions: On / Only when I ask" (DESIGN 6.6,
 * `coach.suggestions`; leg c4a2). One row, beside the section's other
 * choices; leg c6 regroups the section later.
 *
 * Reads the coach's stored keys (`src/coach/store.ts`) and writes only on a
 * press (`saveSuggestions`, a whole value the player chose, so it is allowed
 * before the load and over a value that could not be read). While the key is
 * being read neither button shows as chosen; when it could not be read the
 * row says so.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import {
  coachKeyStates,
  coachPressSettled,
  coachStored,
  coachStoredLoaded,
  loadCoachStored,
  saveSuggestions,
  subscribeCoachStored,
  type Suggestions,
} from "../../coach/store";

const CHOICES: readonly Suggestions[] = ["on", "asked"];

export function CoachSuggestionsRow() {
  const { t } = useTranslation();
  const stored = useSyncExternalStore(subscribeCoachStored, coachStored, coachStored);
  const states = useSyncExternalStore(subscribeCoachStored, coachKeyStates, coachKeyStates);

  useEffect(() => {
    if (!coachStoredLoaded()) void loadCoachStored().catch(() => {});
  }, []);

  // A press whose save did not land says so (c4a2b, L2); the next press that lands clears it.
  const [notSaved, setNotSaved] = useState(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const choose = (value: Suggestions) => {
    saveSuggestions(value);
    void coachPressSettled("suggestions").then((end) => {
      if (mounted.current) setNotSaved(end === "notSaved");
    });
  };

  const known = states.suggestions === "read";
  return (
    <div className="setting-row" data-testid="coach-suggestions-row">
      <div className="setting-label">
        <label>{t("notebook.suggestions.label")}</label>
        <span className="setting-hint">{t("notebook.suggestions.hint")}</span>
        {states.suggestions === "unreadable" && (
          <span className="setting-hint" style={{ marginTop: 4 }} data-testid="coach-suggestions-unreadable">
            {t("notebook.suggestions.unreadable")}
          </span>
        )}
        {notSaved && (
          <span className="setting-hint" style={{ marginTop: 4 }} role="status" data-testid="coach-suggestions-not-saved">
            {t("notebook.ui.notSaved")}
          </span>
        )}
      </div>
      <div className="toggle-group">
        {CHOICES.map((value) => (
          <button
            key={value}
            type="button"
            className={`toggle-btn ${known && stored.suggestions === value ? "active" : ""}`}
            aria-pressed={known && stored.suggestions === value}
            data-testid={`coach-suggestions-${value}`}
            onClick={() => choose(value)}
          >
            {t(`notebook.suggestions.${value}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
