import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { inspectKitFolder, pickKitFolder } from "../../ipc";

/**
 * The kits that ship. `raw` is the rock one the second pass added (B2) and it
 * is first, because it is what a vibe reaches for and what "a drum kit" means
 * to most people who open this app.
 */
export const JAM_KITS = ["raw", "tight", "room", "brushes", "electronic"] as const;

/** What a folder of your own samples turned out to hold. */
export type KitFolder = { dir: string; name: string };

interface KitPickerProps {
  kit: string;
  onKit: (kit: string) => void;
  /** The folder of your own samples in use, or null for a built-in kit. */
  customKit: KitFolder | null;
  onCustomKit: (kit: KitFolder | null) => void;
  /**
   * Play two bars of the current groove on a kit, through the normal engine
   * path (B7). Null on a build that cannot.
   */
  onPreview: ((kit: string) => void) | null;
  /** The kit a preview is currently sounding, so its button can say Stop. */
  previewing: string | null;
}

/** The last path segment, which is what a person calls the folder. */
export function folderName(dir: string): string {
  const parts = dir.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? dir;
}

function PlayGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 4.5v15l13-7.5z" />
    </svg>
  );
}

function StopGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </svg>
  );
}

function FolderGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

/**
 * The kit, as a dropdown with a preview on every row (JAM_UX_DECISIONS B7).
 *
 * It used to be four cards in the middle of the playing screen, which is a
 * browsing tool sitting where you read. The vibe sets it now; this is where
 * you override it, and the Preview button is what makes an override possible
 * at all — the first four kits were measured and never heard, and picking
 * between "Room" and "Tight" from two words is guessing.
 *
 * Under BUILT IN comes YOURS: a folder of WAVs on this machine (B3). Loaded
 * from disk, never shipped and never uploaded, so a player with a good sample
 * pack gets a real drummer and the licence rule still holds.
 */
export function KitPicker({
  kit,
  onKit,
  customKit,
  onCustomKit,
  onPreview,
  previewing,
}: KitPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  /**
   * What the last folder turned out to hold, or the reason there was none.
   *
   * `unavailable` is the build with no `pick_kit_folder` behind it: the
   * command rejects, and the row says so rather than looking like a dead
   * button (which is exactly the bug the updater had).
   */
  const [found, setFound] = useState<{ voices: string[]; missing: string[] } | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  /**
   * Ask for a folder, then say what is in it.
   *
   * Two calls rather than one, because they answer two questions and the
   * second one is the useful one: the dialog says WHERE, and the inspection
   * says which of the eight voices were found and which will fall back to the
   * built-in kit. A folder with a kick and a snare in it is a perfectly good
   * kit, and the user should be able to see that it is.
   */
  const chooseFolder = async () => {
    setBusy(true);
    try {
      const dir = await pickKitFolder();
      if (!dir) return;
      const inspection = await inspectKitFolder(dir).catch(() => null);
      setFound(inspection);
      setUnavailable(false);
      onCustomKit({ dir, name: folderName(dir) });
      setOpen(false);
    } catch {
      // No such command in this build. Not an error the user caused, so it is
      // a state on the row and not a dialog.
      setUnavailable(true);
    } finally {
      setBusy(false);
    }
  };

  const currentLabel = customKit
    ? customKit.name
    : t(`jam.kit.${kit}`, { defaultValue: kit });

  const previewButton = (id: string) =>
    onPreview && (
      <button
        type="button"
        className={`jam-kit-preview${previewing === id ? " active" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          onPreview(id);
        }}
      >
        {previewing === id ? <StopGlyph /> : <PlayGlyph />}
        {previewing === id ? t("jam.kit.previewStop") : t("jam.kit.preview")}
      </button>
    );

  return (
    <div className="jam-kit-picker" ref={wrapRef}>
      <button
        type="button"
        className={`jam-dropdown${open ? " open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="jam-dropdown-label">{t("jam.kit.label")}</span>
        <span className="jam-dropdown-value">{currentLabel}</span>
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="jam-dropdown-menu" role="listbox" aria-label={t("jam.kit.label")}>
          <div className="jam-dropdown-section">{t("jam.kit.builtIn")}</div>
          {JAM_KITS.map((id) => {
            const on = !customKit && kit === id;
            return (
              <div
                key={id}
                role="option"
                aria-selected={on}
                tabIndex={0}
                className={`jam-dropdown-item${on ? " active" : ""}`}
                onClick={() => {
                  onKit(id);
                  onCustomKit(null);
                  setOpen(false);
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  onKit(id);
                  onCustomKit(null);
                  setOpen(false);
                }}
              >
                <span className="jam-dropdown-item-text">
                  <span className="jam-dropdown-item-name">{t(`jam.kit.${id}`)}</span>
                  <span className="jam-dropdown-item-hint">{t(`jam.kit.${id}Hint`)}</span>
                </span>
                {previewButton(id)}
              </div>
            );
          })}

          <div className="jam-dropdown-rule" aria-hidden="true" />
          <div className="jam-dropdown-section">{t("jam.kit.yours")}</div>

          {customKit && (
            <div
              role="option"
              aria-selected
              tabIndex={0}
              className="jam-dropdown-item active"
              onClick={() => setOpen(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setOpen(false);
              }}
            >
              <span className="jam-dropdown-item-text">
                <span className="jam-dropdown-item-name">{customKit.name}</span>
                <span className="jam-dropdown-item-hint">{customKit.dir}</span>
              </span>
              <button
                type="button"
                className="jam-kit-forget"
                onClick={(e) => {
                  e.stopPropagation();
                  onCustomKit(null);
                  setFound(null);
                }}
              >
                {t("jam.kit.forget")}
              </button>
            </div>
          )}

          <button
            type="button"
            className="jam-dropdown-item jam-dropdown-item-action"
            disabled={busy}
            onClick={() => void chooseFolder()}
          >
            <FolderGlyph />
            <span className="jam-dropdown-item-text">
              <span className="jam-dropdown-item-name">{t("jam.kit.chooseFolder")}</span>
              <span className="jam-dropdown-item-hint">
                {unavailable ? t("jam.kit.folderUnavailable") : t("jam.kit.folderHint")}
              </span>
            </span>
          </button>
        </div>
      )}

      {/* What the folder turned out to hold. Said once, under the control,
          because "seven of the eight, the ride comes from Raw" is the whole
          answer and it is not worth a dialog. */}
      {customKit && found && (
        <p className="jam-kit-found">
          {t("jam.kit.foundVoices", {
            voices: found.voices.map((v) => t(`jam.kit.voice.${v}`, { defaultValue: v })).join(", "),
          })}
          {found.missing.length > 0 && (
            <>
              {" "}
              {t("jam.kit.fallbackVoices", {
                voices: found.missing
                  .map((v) => t(`jam.kit.voice.${v}`, { defaultValue: v }))
                  .join(", "),
                kit: t(`jam.kit.${kit}`, { defaultValue: kit }),
              })}
            </>
          )}
        </p>
      )}
      {unavailable && !customKit && (
        <p className="jam-kit-found">{t("jam.kit.folderUnavailable")}</p>
      )}
    </div>
  );
}
