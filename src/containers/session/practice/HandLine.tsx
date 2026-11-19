/**
 * Small lines for the practice screens: where the hand goes before the first
 * note, and the one-time "Switch views any time" hint.
 */
import { useTranslation } from "react-i18next";
import type { HandPosition } from "../../../paths/format";

/** "Index finger at fret 5", or "open E chord shape", from the Exercise's own hand position. Nothing when it has none. */
export function HandLine({ position }: { position: HandPosition | undefined }) {
  const { t } = useTranslation();
  if (!position) return null;
  if (position.chord) {
    const chordKey = position.shifts === "allowed" ? "session.practice.handChordShifts" : "session.practice.handChord";
    return (
      <span className="session-why practice-hand" data-testid="practice-hand">
        {t(chordKey, { chord: position.chord })}
      </span>
    );
  }
  const key =
    position.fret <= 0
      ? "session.practice.handOpen"
      : position.shifts === "allowed"
        ? "session.practice.handShifts"
        : "session.practice.hand";
  return (
    <span className="session-why practice-hand" data-testid="practice-hand">
      {t(key, { fret: position.fret })}
    </span>
  );
}

/**
 * "Switch views any time · V", once. Shown on a screen where switching is
 * live; it counts as seen when the player switches, or when the first
 * warm-up it was shown on is over (`useSessionRun`).
 */
export function ViewHint({ seen, keyLabel }: { seen: boolean; keyLabel: string }) {
  const { t } = useTranslation();
  if (seen) return null;
  return (
    <span className="session-why practice-viewhint" role="note" data-testid="practice-viewhint">
      {t("session.practice.viewHint")}
      {keyLabel && <kbd>{keyLabel}</kbd>}
    </span>
  );
}
