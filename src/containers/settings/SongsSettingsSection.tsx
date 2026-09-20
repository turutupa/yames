/**
 * Songs — the one thing about it that is a setting.
 *
 * Catching a download (`plans/SONGS.md` S0.9) is the only part of Songs that
 * happens without the player asking for it, so it is the only part that needs
 * a switch somewhere they would think to look. Off means no watcher thread
 * exists at all — not a thread that stays quiet — and the folder is the one
 * their browser actually writes to, which is theirs to change if it is not
 * the one this machine calls Downloads.
 *
 * Self-contained, the way `GeneralSettingsSection` handles `buttonFlash`: it
 * reads and writes `settings.json` itself and takes no props, so mounting it
 * is one line in `SettingsView`. The window event it fires is how the Songs
 * screen learns the switch moved — `storeSave` tells nobody, and a watcher
 * left running after the player turned the offer off would be exactly the
 * kind of thing this switch is supposed to rule out.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  defaultDownloadsDir,
  pickKitFolder,
  stopDownloadWatch,
  storeLoad,
  storeSave,
} from "../../ipc";
import {
  DEFAULT_DOWNLOAD_WATCH,
  DOWNLOAD_WATCH_KEY,
  readDownloadWatch,
} from "../../songs/downloadWatch";
import type { DownloadWatchSetting } from "../../songs/downloadWatch";

/** Tell the Songs screen the switch moved. Read by `useDownloadWatch`. */
function announce() {
  window.dispatchEvent(new Event("yames:songs-download-setting"));
}

export function SongsSettingsSection() {
  const { t } = useTranslation();
  const [setting, setSetting] = useState<DownloadWatchSetting>(DEFAULT_DOWNLOAD_WATCH);
  /** What the OS calls Downloads, shown when the player has chosen nothing. */
  const [fallback, setFallback] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void storeLoad<unknown>(DOWNLOAD_WATCH_KEY).then((stored) => {
      if (!cancelled) setSetting(readDownloadWatch(stored));
    });
    void defaultDownloadsDir()
      .then((dir) => {
        if (!cancelled) setFallback(dir);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const write = (next: DownloadWatchSetting) => {
    setSetting(next);
    void storeSave(DOWNLOAD_WATCH_KEY, next).catch(() => {});
    announce();
  };

  return (
    <section className="settings-section">
      <h2>{t("settings.songs.title")}</h2>
      <div className="setting-row">
        <div className="setting-label">
          <label>{t("settings.songs.catchDownloads")}</label>
          <span className="setting-hint">{t("settings.songs.catchDownloadsHint")}</span>
        </div>
        <button
          className={`toggle-btn ${setting.enabled ? "active" : ""}`}
          onClick={() => {
            const next = { ...setting, enabled: !setting.enabled };
            // Stopped here as well as by the Songs screen's own effect: the
            // player may well be in Settings with Songs behind it, and "off"
            // should mean off the moment they press it.
            if (!next.enabled) void stopDownloadWatch().catch(() => {});
            write(next);
          }}
        >
          {setting.enabled ? t("common.on") : t("common.off")}
        </button>
      </div>
      {setting.enabled && (
        <div className="setting-row">
          <div className="setting-label">
            <label>{t("settings.songs.folder")}</label>
            <span className="setting-hint">
              {setting.folder ?? fallback ?? t("settings.songs.folderUnknown")}
            </span>
          </div>
          <div className="setting-control">
            <button
              className="toggle-btn"
              onClick={() => {
                // The same native folder picker the drum-kit setting uses.
                // Only Rust ever sees a path; the webview cannot read one.
                void pickKitFolder().then((dir) => {
                  if (dir) write({ ...setting, folder: dir });
                });
              }}
            >
              {t("settings.songs.chooseFolder")}
            </button>
            {setting.folder && (
              <button className="toggle-btn" onClick={() => write({ ...setting, folder: null })}>
                {t("settings.songs.useDownloads")}
              </button>
            )}
          </div>
        </div>
      )}
      {setting.dismissed.length > 0 && (
        <div className="setting-row">
          <div className="setting-label">
            <label>{t("settings.songs.turnedDown")}</label>
            <span className="setting-hint">
              {t("settings.songs.turnedDownHint", { count: setting.dismissed.length })}
            </span>
          </div>
          <button
            className="toggle-btn"
            onClick={() => write({ ...setting, dismissed: [] })}
          >
            {t("settings.songs.forgetTurnedDown")}
          </button>
        </div>
      )}
    </section>
  );
}
