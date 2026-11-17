import { useCallback, useEffect, useRef, useState } from "react";
import { WHATS_NEW_NOTES_KEY } from "../containers/onboarding/whats-new/whatsNew";
import {
  androidBetaDownload,
  androidBetaInstall,
  androidBetaProbe,
  storeLoad,
  storeSave,
} from "../ipc";
import {
  ANDROID_BETA_FEED_URL,
  BETA_CHECKED_AT_KEY,
  BETA_FEED_KEY,
  betaVersionCode,
  dayIsUp,
  offerable,
  type AndroidBetaFeed,
} from "./feed";

export type AndroidBetaStatus =
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "installing"
  /** Sent to "Install unknown apps" for Yames; Update again once allowed. */
  | "needs-permission"
  /** A check the player asked for could not reach the feed (offline, most often). */
  | "check-failed"
  | "failed";

export interface AndroidBetaUpdate {
  status: AndroidBetaStatus;
  /** The version on offer, or "". */
  version: string;
  /** 0..1 while downloading, null when the size is not known. */
  progress: number | null;
  /** Whatever the phone said, for a failed check or update. */
  error: string | null;
  /** Ask the feed now (About's "Check for updates"). */
  check: () => void;
  /** Download (unless already done), verify, open the installer. */
  update: () => void;
}

/** What a build that is not an Android beta reports: the same object every render. */
export const NO_ANDROID_BETA: AndroidBetaUpdate = Object.freeze({
  status: "idle" as const,
  version: "",
  progress: null,
  error: null,
  check: () => {},
  update: () => {},
});

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * The Android test build's in-app update.
 *
 * Asks the feed once a day, when the app opens and never while the click is
 * running (the same manners as `useNewerVersion`), and on demand from About.
 * Between checks the last answer is kept, so "a newer build is ready" is still
 * known on the fifth launch of the day without asking GitHub again.
 *
 * Gated at the CALL site (`IS_BETA && IS_MOBILE ? useAndroidBetaUpdate(…) :
 * NO_ANDROID_BETA`), so a stable build has neither this module nor the feed's
 * address.
 */
export function useAndroidBetaUpdate({
  appVersion,
  isPlaying,
}: {
  appVersion: string;
  isPlaying: boolean;
}): AndroidBetaUpdate {
  const [status, setStatus] = useState<AndroidBetaStatus>("idle");
  const [feed, setFeed] = useState<AndroidBetaFeed | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoAsked = useRef(false);
  /** The versionCode whose APK is already downloaded and verified. */
  const downloaded = useRef<number | null>(null);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const installed = appVersion === "0.0.0" ? null : betaVersionCode(appVersion);

  const ask = useCallback(
    async (manual: boolean) => {
      if (manual) setStatus("checking");
      try {
        const probe = await androidBetaProbe(ANDROID_BETA_FEED_URL);
        await storeSave(BETA_CHECKED_AT_KEY, Date.now());
        const answer: AndroidBetaFeed = {
          version: probe.version,
          versionCode: probe.versionCode,
          url: probe.url,
          sha256: probe.sha256,
          size: probe.size,
          notes: probe.notes,
        };
        await storeSave(BETA_FEED_KEY, answer);
        if (!live.current) return;
        if (offerable(answer, probe.installedVersionCode)) {
          setFeed(answer);
          setStatus("available");
        } else {
          setFeed(null);
          setStatus(manual ? "up-to-date" : "idle");
        }
      } catch (e) {
        if (!live.current) return;
        // A failed automatic check says nothing; a failed manual one says so.
        if (manual) {
          setError(messageOf(e));
          setStatus("check-failed");
        }
      }
    },
    [],
  );

  // Once a day, on open, never over the click.
  useEffect(() => {
    if (installed === null || isPlaying || autoAsked.current) return;
    autoAsked.current = true;
    (async () => {
      const [checkedAt, remembered] = await Promise.all([
        storeLoad<number>(BETA_CHECKED_AT_KEY),
        storeLoad<AndroidBetaFeed>(BETA_FEED_KEY),
      ]);
      if (dayIsUp(checkedAt, Date.now())) {
        await ask(false);
        return;
      }
      if (live.current && offerable(remembered, installed)) {
        setFeed(remembered);
        setStatus("available");
      }
    })().catch(() => {});
  }, [installed, isPlaying, ask]);

  const check = useCallback(() => {
    setError(null);
    void ask(true);
  }, [ask]);

  const update = useCallback(() => {
    const target = feed;
    if (!target) return;
    setError(null);
    (async () => {
      if (downloaded.current !== target.versionCode) {
        setStatus("downloading");
        setProgress(target.size > 0 ? 0 : null);
        await androidBetaDownload(target, ({ received, total }) => {
          if (live.current) setProgress(total > 0 ? Math.min(1, received / total) : null);
        });
        downloaded.current = target.versionCode;
      }
      if (!live.current) return;
      setStatus("installing");
      // What the new build says it changed, for its What's new on first open
      // (the desktop updater does the same in useAppUpdates).
      if (target.notes) {
        await storeSave(WHATS_NEW_NOTES_KEY, { version: target.version, notes: target.notes }).catch(() => {});
      }
      const result = await androidBetaInstall();
      if (!live.current) return;
      // The installer is on screen now, or Android's "Install unknown apps"
      // page is. Either way the next step is the user's; Update stays
      // available for when they come back.
      setStatus(result.needsPermission ? "needs-permission" : "available");
    })().catch((e: unknown) => {
      if (!live.current) return;
      setError(messageOf(e));
      setStatus("failed");
    });
  }, [feed]);

  return { status, version: feed?.version ?? "", progress, error, check, update };
}
