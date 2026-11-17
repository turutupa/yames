/**
 * Guitar first (owner, 2026-11-17): a calm note on the learning screens for a
 * player whose instrument is not a guitar.
 *
 * The Paths are tab on a six-string neck. A drummer or a pianist who chose
 * their instrument in Settings still gets Today and the Paths, untouched and
 * unblocked; this only says, once and near the top, what they are written for,
 * and points at the tools, which follow every instrument, and at the setting.
 */
import { useTranslation } from "react-i18next";
import { learningFit } from "../../constants/instruments";

export function InstrumentNote({
  instrument,
  onOpenTools,
  onChangeInstrument,
}: {
  instrument: string;
  onOpenTools: () => void;
  onChangeInstrument: () => void;
}) {
  const { t } = useTranslation();
  const fit = learningFit(instrument);
  if (fit === "guitar") return null;
  return (
    <div
      className="session-glass session-card session-instrument-note"
      role="note"
      data-testid="instrument-note"
      data-fit={fit}
    >
      <span className="session-why">
        {t(fit === "bass" ? "session.instrumentNote.bass" : "session.instrumentNote.other")}
      </span>
      <span className="session-instrument-note-links">
        <button className="session-link" onClick={onOpenTools} data-testid="instrument-note-tools">
          {t("session.instrumentNote.openTools")}
        </button>
        <button
          className="session-link"
          onClick={onChangeInstrument}
          data-testid="instrument-note-change"
        >
          {t("session.instrumentNote.change")}
        </button>
      </span>
    </div>
  );
}
