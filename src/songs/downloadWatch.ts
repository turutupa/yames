/**
 * What Yames remembers about catching a download, and nothing that touches
 * a screen or a disk.
 *
 * `plans/SONGS.md` S0.9. The Rust side (`src-tauri/src/downloads.rs`) decides
 * when a file has finished arriving; this decides what the player has already
 * said about it, and it is here rather than in the hook so that "a dismissed
 * file stays dismissed" is a test rather than a thing somebody watches happen.
 *
 * Three facts live in `settings.json` under one key:
 *
 *   `enabled`    off means the watch is never started, so no thread exists
 *   `folder`     null is "this machine's own Downloads", which is the answer
 *                the OS gives and not one we should write down: a player who
 *                moves their Downloads folder should not have to tell us
 *   `dismissed`  the files the player said "not this one" about
 *
 * A dismissal is keyed on the name, the size AND the modification time, not
 * on the name alone. Browsers write `riff.gp5`, `riff (1).gp5`, `riff (2).gp5`
 * — but they also happily overwrite, and a player who downloads a NEW version
 * of a file they once dismissed should be offered it. Same three numbers,
 * same file; any of them different, something new arrived.
 */

/** The `settings.json` key. One key, three facts. */
export const DOWNLOAD_WATCH_KEY = "songsDownloadWatch";

/** A file the player has said "not this one" about. */
export type DismissedDownload = {
  fileName: string;
  sizeBytes: number;
  modifiedMs: number;
};

export type DownloadWatchSetting = {
  enabled: boolean;
  /** The folder the player chose, or null for this machine's Downloads. */
  folder: string | null;
  dismissed: DismissedDownload[];
};

/**
 * On by default.
 *
 * The owner's decision, and it is defensible on the only ground that matters:
 * the watch reads a directory listing and nothing else, it exists only while
 * Songs is the open mode, and it never does anything but ASK. A feature whose
 * whole point is that the player does not have to go looking cannot start off.
 */
export const DEFAULT_DOWNLOAD_WATCH: DownloadWatchSetting = {
  enabled: true,
  folder: null,
  dismissed: [],
};

/**
 * How many dismissals are kept.
 *
 * Newest first, and the tail is dropped. A player who says no to two hundred
 * files has been using this for years, and the two-hundred-and-first is not
 * worth growing `settings.json` over — being offered a very old file again
 * once is a smaller failure than a settings file that only grows.
 */
export const MAX_DISMISSED = 200;

/** What the Rust side says has finished arriving. */
export type DownloadOffer = {
  /** The full path. Handed straight back to `readOfferedFile`, never parsed. */
  path: string;
  fileName: string;
  sizeBytes: number;
  modifiedMs: number;
};

/**
 * Read back what was stored, mistrusting all of it.
 *
 * `settings.json` is a file a user can open and a file an older build wrote,
 * so every field is checked — the same rule `songEngine.ts` keeps about the
 * mix, and for the same reason. A hand-edited `enabled: "yes"` must not leave
 * the watch in a state that is neither on nor off.
 */
export function readDownloadWatch(stored: unknown): DownloadWatchSetting {
  const raw = (stored ?? {}) as Partial<DownloadWatchSetting>;
  const dismissed = Array.isArray(raw.dismissed)
    ? raw.dismissed
        .filter(
          (d): d is DismissedDownload =>
            !!d &&
            typeof d === "object" &&
            typeof (d as DismissedDownload).fileName === "string" &&
            Number.isFinite((d as DismissedDownload).sizeBytes) &&
            Number.isFinite((d as DismissedDownload).modifiedMs),
        )
        .slice(0, MAX_DISMISSED)
    : [];
  return {
    // Only an explicit `false` turns it off; anything else is the default.
    enabled: raw.enabled !== false,
    folder: typeof raw.folder === "string" && raw.folder.trim() ? raw.folder : null,
    dismissed,
  };
}

/** True when this exact file has been turned down before. */
export function isDismissed(
  setting: DownloadWatchSetting,
  offer: Pick<DownloadOffer, "fileName" | "sizeBytes" | "modifiedMs">,
): boolean {
  return setting.dismissed.some(
    (d) =>
      d.fileName === offer.fileName &&
      d.sizeBytes === offer.sizeBytes &&
      d.modifiedMs === offer.modifiedMs,
  );
}

/** Remember a "not this one", newest first, without growing for ever. */
export function withDismissed(
  setting: DownloadWatchSetting,
  offer: Pick<DownloadOffer, "fileName" | "sizeBytes" | "modifiedMs">,
): DownloadWatchSetting {
  if (isDismissed(setting, offer)) return setting;
  const entry: DismissedDownload = {
    fileName: offer.fileName,
    sizeBytes: offer.sizeBytes,
    modifiedMs: offer.modifiedMs,
  };
  return { ...setting, dismissed: [entry, ...setting.dismissed].slice(0, MAX_DISMISSED) };
}

/**
 * The size, as a musician would read it.
 *
 * Kilobytes and megabytes, one decimal, because the only thing the number is
 * for is telling a five-kilobyte error page from a real Guitar Pro file.
 */
export function offerSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
