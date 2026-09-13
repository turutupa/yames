import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { GrooveEditor, fromGroove } from "./editor";
import type { GrooveEditorPage } from "./editor";
import { grooveById } from "../../jam/grooves";
import type { Jam, JamCustomGroove } from "../../jam/types";
import type { BeatEvent } from "../../types";

interface GrooveEditorDrawerProps {
  jam: Jam;
  onEdit: (patch: Partial<Omit<Jam, "id" | "createdAt">>) => void;
  open: boolean;
  onClose: () => void;
  page: GrooveEditorPage;
  onPageChange: (page: GrooveEditorPage) => void;
  currentBeat: BeatEvent | null;
  isPlaying: boolean;
}

/**
 * The groove editor, docked to the bottom of the stage.
 *
 * A drawer rather than a screen, for one reason: **the band keeps playing
 * while you edit.** You move the snare, you hear the snare move on the next
 * bar, and the column you are looking at lights up as the drummer passes
 * through it. An editor you had to leave the jam to reach would be a
 * sequencer; this one is a rehearsal.
 *
 * Opening it on a preset COPIES that preset (`fromGroove`) rather than
 * editing it — the eight that ship are the eight that ship, and a jam that
 * quietly rewrote one of them would change every other jam that used it.
 * Reset puts the preset back, which is why the record keeps `grooveId` beside
 * `customGroove` instead of replacing it.
 */
export function GrooveEditorDrawer({
  jam,
  onEdit,
  open,
  onClose,
  page,
  onPageChange,
  currentBeat,
  isPlaying,
}: GrooveEditorDrawerProps) {
  const { t } = useTranslation();

  /**
   * Copy the preset on the way in, once.
   *
   * Done in an effect rather than at the click so that every way of opening
   * the drawer — the EDIT link, the "make your own" card, a hotkey later —
   * lands on the same copy, and so that re-opening a jam that already has a
   * custom groove edits that one rather than starting again from the preset.
   */
  useEffect(() => {
    if (!open || jam.customGroove) return;
    const preset = grooveById(jam.grooveId);
    onEdit({
      customGroove: fromGroove({
        ...preset,
        name: t(`jam.groove.${preset.id}`, { defaultValue: preset.id }),
      }),
    });
    // `t` and `onEdit` are stable enough; what must not re-run this is the jam
    // changing under an open drawer, which would copy the preset over the
    // edits the user just made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, !!jam.customGroove]);

  const change = useCallback(
    (next: JamCustomGroove) => onEdit({ customGroove: next }),
    [onEdit],
  );

  const reset = useCallback(() => {
    // Back to the preset, and out: there is nothing left to edit.
    onEdit({ customGroove: undefined });
    onClose();
  }, [onEdit, onClose]);

  if (!open || !jam.customGroove) return null;

  /**
   * Which column is lit.
   *
   * The editor draws one bar in the groove's OWN subdivision, and the engine
   * reports the beat and the subdivision it is on, so the tick is the two
   * multiplied. Null while stopped — an editor with a column lit and nothing
   * playing reads as a cursor.
   */
  const ticksPerBeat = jam.customGroove.ticksPerBeat;
  const playingTick =
    isPlaying && currentBeat
      ? (currentBeat.measureBeat * ticksPerBeat + currentBeat.subdivision) %
        (jam.customGroove.beatsPerBar * ticksPerBeat)
      : null;

  return (
    <div className="jam-editor-drawer" role="group" aria-label={t("jam.editor.label")}>
      <GrooveEditor
        value={jam.customGroove}
        onChange={change}
        playingTick={playingTick}
        page={page}
        onPageChange={onPageChange}
        onDone={onClose}
        onReset={reset}
      />
    </div>
  );
}
