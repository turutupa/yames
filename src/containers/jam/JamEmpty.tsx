import { useTranslation } from "react-i18next";

/**
 * The Jam tab with nothing open.
 *
 * A mode in the rail can be clicked cold, and a tab that goes blank when
 * clicked reads as broken — the same lesson `SetlistEmpty` learned. It says
 * what a jam IS before offering to make one, because this is a word a player
 * knows from a garage and not from a metronome, and the two meanings are not
 * quite the same thing.
 *
 * And then it offers to just play (JAM_KILLER §2 A4). **Jam now** is the
 * first button because it is the only one that costs nothing to press: it
 * picks the vibe for your instrument, makes the jam, and counts the band in.
 * "New jam" is underneath it and does what it always did — opens the library
 * with a name field under the caret — which is the right second step for
 * somebody who came here to build something, and the wrong first step for
 * everybody else.
 */
export function JamEmpty({ onNew, onJamNow }: { onNew: () => void; onJamNow?: () => void }) {
  const { t } = useTranslation();
  return (
    <section className="setlist-blank jam-blank" aria-label={t("jam.noneOpenTitle")}>
      <h2 className="setlist-blank-title">{t("jam.noneOpenTitle")}</h2>
      <p className="setlist-blank-lead">{t("jam.noneOpenLead")}</p>
      {onJamNow && (
        <>
          <button type="button" className="setlist-blank-new jam-blank-now" onClick={onJamNow}>
            {t("jam.jamNow")}
          </button>
          <p className="jam-blank-now-lead">{t("jam.jamNowLead")}</p>
        </>
      )}
      <button type="button" className="setlist-blank-new" onClick={onNew}>
        {t("jam.newJam")}
      </button>
    </section>
  );
}
