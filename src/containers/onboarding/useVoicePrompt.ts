/**
 * "Pick a voice" prompt (O4, ONBOARDING_PLAN §3 W4).
 *
 * W4 deliberately does not ask about the voice: the user has just been asked
 * to make one hardware-shaped decision and the voices are not even on disk
 * yet. The honest moment to offer the choice is when the download that W4
 * started actually finishes — the same `model-download-complete` event the
 * coach hook already listens to (a Tauri event fans out to every listener, so
 * this subscribes alongside `useCoachDownload` rather than changing it).
 *
 * It fires once per completed install, and never for someone who has already
 * chosen a voice — that user has nothing to pick.
 */
import { useCallback, useEffect, useState } from "react";
import { onDownloadComplete, storeLoad } from "../../ipc";

export type VoicePrompt = {
  visible: boolean;
  /** The user wants to choose — the caller deep-links to Settings → Coach. */
  accept: () => void;
  dismiss: () => void;
};

export function useVoicePrompt(): VoicePrompt {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const unlisten = onDownloadComplete((result) => {
      // `tier` is only present on the full brain+voices install; the
      // per-voice repair path omits it, and repairing a voice is not a
      // moment to ask someone to pick one.
      if (cancelled || !result.success || !result.tier) return;
      storeLoad<string>("coachVoiceName")
        .then((chosen) => {
          if (!cancelled && !chosen) setVisible(true);
        })
        .catch(() => {
          if (!cancelled) setVisible(true);
        });
    });
    return () => {
      cancelled = true;
      unlisten.then((u) => u());
    };
  }, []);

  const accept = useCallback(() => setVisible(false), []);
  const dismiss = useCallback(() => setVisible(false), []);

  return { visible, accept, dismiss };
}
