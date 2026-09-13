import { useTranslation } from "react-i18next";
import { ChordDiagram } from "../../components/chords";
import type { PlacedShape } from "../../jam/chordShapes";

interface PinnedShapeProps {
  shape: PlacedShape;
  /** The chord's name, spelled for the key the player reads. */
  name: string;
  onUnpin: () => void;
}

/**
 * One grip, in the corner of the playing screen, that never moves
 * (JAM_UX_DECISIONS A8).
 *
 * This is the whole answer to "the chords are amazing but they shouldn't keep
 * changing". You pick a shape on the chord sheet, you pin it, and it is there
 * — the same shape, at the same fret — until you unpin it. Nothing on the
 * playing screen changes on its own except the timeline and the chord you are
 * on, and a pinned shape is neither of those.
 */
export function PinnedShape({ shape, name, onUnpin }: PinnedShapeProps) {
  const { t } = useTranslation();
  return (
    <div className="jam-pinned" aria-label={t("jam.chords.pinnedAria", { chord: name })}>
      <ChordDiagram shape={shape} size="sm" label={name} />
      <button type="button" className="jam-pinned-unpin" onClick={onUnpin}>
        {t("jam.chords.unpin")}
      </button>
    </div>
  );
}
