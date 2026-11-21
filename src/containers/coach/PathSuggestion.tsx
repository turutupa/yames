/**
 * The Path suggestion on Paths (DESIGN 6.4, leg c4b3): last on the page, only
 * after the last Session finished a Level (`pathSuggestionNow`), and not at
 * all with Suggestions on "Only when I ask". One line of the curriculum's
 * reason and a chip-sized button that opens the Path's page: it never
 * subscribes, and nothing is written by showing it or by the press.
 */
import { useMemo, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import type { PathDoc } from "../../paths/format";
import { pathSuggestionNow, suggestionLines } from "../../coach/pathSuggest";
import { coachKeyStates, coachStored, subscribeCoachStored } from "../../coach/store";
import type { SessionRun } from "../session/hooks/useSessionRun";
import { CoachGlyph } from "./CoachLine";
import "../../styles/coach.css";

export function PathSuggestion({ session, onOpen }: { session: SessionRun; onOpen: (path: PathDoc) => void }) {
  const { t } = useTranslation();
  const stored = useSyncExternalStore(subscribeCoachStored, coachStored, coachStored);
  const states = useSyncExternalStore(subscribeCoachStored, coachKeyStates, coachKeyStates);
  const graded = session.grading !== "off";
  const suggestion = useMemo(
    () => pathSuggestionNow(session.progress, session.paths, stored.goal, Date.now(), graded),
    [session.progress, session.paths, stored.goal, graded],
  );
  // Unasked: off with "Only when I ask", and while that choice is not read.
  if (!suggestion || states.suggestions !== "read" || stored.suggestions === "asked") return null;
  // Never during a Take (review c4b3 L5). The rail and the tab bar are hidden
  // in a Session, so Paths should not be on screen then; this holds it anyway.
  const phase = session.run.phase;
  if (phase === "playing" || phase === "listening") return null;
  return (
    <section className="coach-note companion-card path-suggestion" data-testid="path-suggestion" aria-label={t("companion.pathSuggest.label")}>
      <div className="companion-head">
        <CoachGlyph size={17} />
        <span className="companion-kick">{t("companion.pathSuggest.kick")}</span>
      </div>
      {suggestionLines(suggestion).map((line) => (
        <p className="companion-say" key={line.key}>
          {t(line.key, line.values)}
        </p>
      ))}
      <div>
        <button type="button" className="coach-chip" data-testid="path-suggestion-open" onClick={() => onOpen(suggestion.path)}>
          {t("companion.pathSuggest.open", { path: suggestion.path.title })}
        </button>
      </div>
    </section>
  );
}
