import { useTranslation } from "react-i18next";
import type { Jam } from "../../jam/types";

interface JamSaveBarProps {
  jam: Jam;
  dirty: boolean;
  /**
   * True while this jam has never reached the library — the tab put it on the
   * stage and nothing has filed it yet. Save is live; "Edited" is not,
   * because there is no stored version for it to differ from.
   */
  unsaved?: boolean;
  saveFeedback: boolean;
  onRename: () => void;
  onSave: () => void;
  onRevert: () => void;
  /**
   * The two sheets (plans/JAM_UX_DECISIONS.md A1, A8).
   *
   * Their buttons live here rather than on the stage because the stage IS the
   * playing screen now, and a button that opens a sheet over it is not one of
   * the five things a player reads while playing. The context bar is where the
   * app already answers "what am I looking at, and what can I do to it".
   */
  setupOpen?: boolean;
  onSetup?: () => void;
  chordsOpen?: boolean;
  onChords?: () => void;
}

/**
 * The context bar when a jam is loaded — the jam's half of what
 * `PresetSaveBar` does for a preset and `SetlistSaveBar` does for a setlist.
 *
 * A third component rather than a mode of either, for the reason the setlist
 * one gives: the badge and the vocabulary are this object's, and folding them
 * in would run an `if (jam)` through every line of a file whose job is
 * something else. What the three share is the shape, and the shape lives in
 * the stylesheet.
 *
 * Reading order, left to right, after the owner's first session with it
 * ("the top bar has so many things one doesn't see it… setup, I missed
 * this"): what this is (name, badge, the vibe it started from), then the two
 * doors (Set up, Chords) — always in the same place, drawn as buttons — and
 * only then the save cluster, which comes and goes. Save is the one filled
 * button in the bar, because it is the one thing that wants pressing;
 * "Edited" is a dot and a word, not a badge that outshines it.
 */
export function JamSaveBar({
  jam,
  dirty,
  unsaved = false,
  saveFeedback,
  onRename,
  onSave,
  onRevert,
  setupOpen = false,
  onSetup,
  chordsOpen = false,
  onChords,
}: JamSaveBarProps) {
  const { t } = useTranslation();

  /**
   * "Rock · Hard": the style the jam started from, and the way into changing
   * it. The owner could not tell how to make the band sound like a style
   * because the only thing that says "rock" lived behind a button they had
   * not found; now the word is in the bar, and pressing it opens Set up on
   * the vibes.
   */
  const vibeName = jam.vibe ? t(`jam.vibe.${jam.vibe}`, { defaultValue: jam.vibe }) : null;
  const variationName =
    jam.vibe && jam.variation
      ? t(`jam.variation.${jam.variation}`, { defaultValue: jam.variation })
      : null;
  const vibeLabel = vibeName ? (variationName ? `${vibeName} · ${variationName}` : vibeName) : null;

  return (
    <div className="preset-save-area setlist-save-area jam-save-area">
      <button className="preset-active-name" onClick={onRename} title={t("jam.renameTooltip")}>
        {jam.name}
      </button>
      <span className="setlist-badge jam-badge">{t("jam.badge")}</span>

      {vibeLabel &&
        (onSetup ? (
          <button
            type="button"
            className="jam-vibe-chip"
            title={t("jam.vibe.startedFrom", { vibe: vibeName })}
            onClick={onSetup}
          >
            <span className="jam-vibe-chip-dot" aria-hidden="true" />
            {vibeLabel}
          </button>
        ) : (
          <span className="jam-vibe-chip" title={t("jam.vibe.startedFrom", { vibe: vibeName })}>
            <span className="jam-vibe-chip-dot" aria-hidden="true" />
            {vibeLabel}
          </span>
        ))}

      {(onSetup || onChords) && <span className="jam-bar-divider" aria-hidden="true" />}

      {onSetup && (
        <button
          type="button"
          className={`jam-sheet-btn jam-door${setupOpen ? " active" : ""}`}
          aria-pressed={setupOpen}
          onClick={onSetup}
        >
          <SlidersGlyph />
          {t("jam.sheet.setUp")}
        </button>
      )}
      {onChords && (
        <button
          type="button"
          className={`jam-sheet-btn jam-door${chordsOpen ? " active" : ""}`}
          aria-pressed={chordsOpen}
          onClick={onChords}
        >
          <ChordGlyph />
          {/* "Cheat sheet", not "Chords": the page behind this button is a
              tab of chords and a tab of scales, and the neck was invisible
              for as long as the door only promised the chords. */}
          {t("jam.cheat.label")}
        </button>
      )}

      {(dirty || unsaved || saveFeedback) && (
        <span className="jam-bar-divider" aria-hidden="true" />
      )}

      {dirty && (
        <span className="preset-edited">
          <span className="preset-edited-dot" aria-hidden="true" />
          <span className="preset-edited-label">{t("jam.edited")}</span>
        </span>
      )}

      <button
        className={`preset-text-btn preset-text-btn--save ${
          saveFeedback ? "preset-text-btn--feedback" : ""
        }`}
        onClick={onSave}
        disabled={!dirty && !unsaved && !saveFeedback}
        title={dirty || unsaved ? t("jam.saveTooltip") : t("jam.noChanges")}
      >
        <span className="preset-save-btn-label">
          {saveFeedback ? t("jam.saved") : dirty || unsaved ? t("jam.save") : t("jam.noChanges")}
        </span>
      </button>

      {dirty && (
        <button
          className="preset-text-btn preset-text-btn--revert"
          onClick={onRevert}
          title={t("jam.revertTooltip")}
        >
          <span className="preset-save-btn-label">{t("jam.revert")}</span>
        </button>
      )}
    </div>
  );
}

/** Three sliders: the setup sheet is where the controls are. */
function SlidersGlyph() {
  return (
    <svg
      className="jam-door-glyph"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="9" cy="6" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="7" cy="18" r="2.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** A chord box: four strings, a fret, two fingers. */
function ChordGlyph() {
  return (
    <svg
      className="jam-door-glyph"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="5" y1="4" x2="19" y2="4" strokeWidth="2.6" />
      <line x1="6" y1="4" x2="6" y2="20" />
      <line x1="10.5" y1="4" x2="10.5" y2="20" />
      <line x1="15" y1="4" x2="15" y2="20" />
      <line x1="19" y1="4" x2="19" y2="20" />
      <circle cx="10.5" cy="10" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="15" r="2.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
