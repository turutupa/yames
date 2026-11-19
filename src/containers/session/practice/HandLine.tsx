/**
 * Small lines for the practice screens: where the hand goes before the first
 * note, and the one-time "Switch views any time" hint.
 */
import { useTranslation } from "react-i18next";
import type { Exercise, HandPosition } from "../../../paths/format";

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
 * The hand position the line speaks of. An Exercise that strums open chords
 * and names them bar by bar (`chords`) starts in its first chord's shape:
 * "index finger at fret 1, one finger per fret" is a scale's hand, and wrong
 * for E minor to A minor to C (card #74). Everything else: its own position.
 */
export function handOf(exercise: Pick<Exercise, "position" | "chords" | "notes">): HandPosition | undefined {
  const position = exercise.position;
  const first = exercise.chords?.[0];
  if (!position || position.chord || !first) return position;
  const strings = new Map<number, Set<number>>();
  let open = false;
  for (const n of exercise.notes) {
    if (n.fret > 3) return position;
    if (n.fret === 0) open = true;
    if (!strings.has(n.tick)) strings.set(n.tick, new Set());
    strings.get(n.tick)!.add(n.string);
  }
  const strummed = [...strings.values()].some((set) => set.size >= 3);
  return open && strummed ? { ...position, chord: first } : position;
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
