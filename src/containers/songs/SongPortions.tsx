/**
 * Keeping a portion, and coming back to it.
 *
 * A player learning a piece works the same four bars for a week. Typing 17
 * and 24 every evening is not learning, it is admin — so a portion can be
 * given a name and then it is a chip beside the sections the file came with,
 * carrying its own speed. By the third week "that run in the bridge" is more
 * use than the heading the engraver wrote, which is why the two sit together
 * rather than the saved ones being filed somewhere else.
 *
 * Both controls here are small on purpose. Saving is a press, a name and
 * Enter; changing one is a right-click away, the same as a jam in the library
 * — a menu on a chip you press forty times a session is a menu you open by
 * accident.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SavedPortion } from "../../songs/selection";

/** "Save this part", and the name field it opens. */
export function SongPortionSave({
  canSave,
  onSave,
}: {
  canSave: boolean;
  onSave: (name: string) => void;
}) {
  const { t } = useTranslation();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (naming) inputRef.current?.focus();
  }, [naming]);

  // A portion that is no longer selected cannot be saved, and a name field
  // left open over nothing is a field that saves the wrong bars.
  useEffect(() => {
    if (!canSave) setNaming(false);
  }, [canSave]);

  if (!naming) {
    return (
      /*
       * Always on the row, greyed until there is something to save.
       *
       * It used to be absent until a portion was chosen, so pressing a
       * section chip made a button appear and shoved the speed chips onto
       * the next line — the controls moving under the hand that pressed
       * them, which is the complaint the owner made about Jam's switches
       * and which `songs.spec.ts` measures on this very row. A disabled
       * chip also tells a player the naming exists before they have found
       * out by accident; nothing did before.
       */
      <button
        type="button"
        className="songs-chip songs-portion-save"
        disabled={!canSave}
        title={t("songs.stage.keepPortionNote")}
        onClick={() => {
          setName("");
          setNaming(true);
        }}
      >
        {t("songs.stage.keepPortion")}
      </button>
    );
  }

  const commit = () => {
    const trimmed = name.trim();
    if (trimmed) onSave(trimmed);
    setNaming(false);
  };

  return (
    <input
      ref={inputRef}
      className="songs-portion-name-input"
      value={name}
      maxLength={24}
      placeholder={t("songs.stage.portionPlaceholder")}
      aria-label={t("songs.stage.keepPortion")}
      onChange={(e) => setName(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setNaming(false);
        // The stage binds bare letters to actions (`[`, `]`, L, \\) and this
        // is a field somebody is typing a name into.
        e.stopPropagation();
      }}
    />
  );
}

/** One saved portion, as a chip, with rename and delete behind a press. */
export function SongPortionChip({
  portion,
  chosen,
  onChoose,
  onRename,
  onDelete,
}: {
  portion: SavedPortion;
  chosen: boolean;
  onChoose: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState(false);
  const [value, setValue] = useState(portion.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  if (renaming) {
    const commit = () => {
      onRename(value);
      setRenaming(false);
    };
    return (
      <input
        ref={inputRef}
        className="songs-portion-name-input"
        value={value}
        maxLength={24}
        aria-label={t("songs.stage.renamePortion")}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setValue(portion.name);
            setRenaming(false);
          }
          e.stopPropagation();
        }}
      />
    );
  }

  return (
    <span className="songs-portion-chip" data-active={chosen ? "" : undefined}>
      <button
        type="button"
        className="songs-chip songs-portion-chip-main"
        data-active={chosen ? "" : undefined}
        aria-pressed={chosen}
        title={t("songs.stage.portionTitle", {
          name: portion.name,
          percent: portion.tempoPercent,
        })}
        onClick={onChoose}
      >
        {portion.name}
      </button>
      {/* Two glyph buttons rather than a menu: there are exactly two things
          you can do to a saved portion, and a menu to choose between two
          things is a press nobody needed. They are quiet until the chip is
          hovered or something inside it has focus, so a row of portions reads
          as a row of portions. */}
      <button
        type="button"
        className="songs-portion-edit"
        aria-label={t("songs.stage.renamePortion")}
        title={t("songs.stage.renamePortion")}
        onClick={() => {
          setValue(portion.name);
          setRenaming(true);
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
        </svg>
      </button>
      <button
        type="button"
        className="songs-portion-edit"
        aria-label={t("songs.stage.deletePortion")}
        title={t("songs.stage.deletePortion")}
        onClick={onDelete}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </span>
  );
}
