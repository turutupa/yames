import { useTranslation } from "react-i18next";

/**
 * The Setlist tab with nothing open.
 *
 * This screen exists only because setlists became a mode. As a corner of the
 * metronome there was no such state — you got here by loading a setlist, so
 * one was always loaded. A tab in the rail can be clicked cold, and a tab
 * that goes blank when clicked reads as broken.
 *
 * It says what a setlist is before offering to make one: this is the one
 * place in the app a player might arrive without knowing.
 */
export function SetlistEmpty({ onNew }: { onNew: () => void }) {
  const { t } = useTranslation();
  return (
    <section className="setlist-blank" aria-label={t("setlist.noneOpenTitle")}>
      <h2 className="setlist-blank-title">{t("setlist.noneOpenTitle")}</h2>
      <p className="setlist-blank-lead">{t("setlist.noneOpenLead")}</p>
      <button type="button" className="setlist-blank-new" onClick={onNew}>
        {t("setlist.newSetlist")}
      </button>
    </section>
  );
}
