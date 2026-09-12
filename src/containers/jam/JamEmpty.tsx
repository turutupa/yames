import { useTranslation } from "react-i18next";

/**
 * The Jam tab with nothing open.
 *
 * A mode in the rail can be clicked cold, and a tab that goes blank when
 * clicked reads as broken — the same lesson `SetlistEmpty` learned. It says
 * what a jam IS before offering to make one, because this is a word a player
 * knows from a garage and not from a metronome, and the two meanings are not
 * quite the same thing.
 */
export function JamEmpty({ onNew }: { onNew: () => void }) {
  const { t } = useTranslation();
  return (
    <section className="setlist-blank jam-blank" aria-label={t("jam.noneOpenTitle")}>
      <h2 className="setlist-blank-title">{t("jam.noneOpenTitle")}</h2>
      <p className="setlist-blank-lead">{t("jam.noneOpenLead")}</p>
      <button type="button" className="setlist-blank-new" onClick={onNew}>
        {t("jam.newJam")}
      </button>
    </section>
  );
}
