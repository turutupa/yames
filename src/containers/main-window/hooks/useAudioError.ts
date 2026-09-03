/**
 * Subscribes to the `audio-error` event PR #47 added to the audio thread.
 *
 * Before this, a failed `build_output_stream` was reported on stderr and
 * nowhere else: the user pressed Play, the button snapped back, and the app
 * said nothing at all. The engine half made the failure survivable; this is
 * the half that admits it happened.
 *
 * `isPlaying` clears the notice on its own. Once a later Play actually opens
 * a stream, the message stops being true — leaving a red pill over working
 * audio would be its own small lie — so the transport coming up retires it
 * without the user having to.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { onAudioError } from "../../../ipc";
import { classifyAudioError } from "../audioError";
import type { AudioErrorNotice } from "../audioError";

export type UseAudioErrorReturn = {
  /** The failure to show, or null when there is nothing to say. */
  notice: AudioErrorNotice | null;
  dismiss: () => void;
};

export function useAudioError(isPlaying: boolean): UseAudioErrorReturn {
  const [notice, setNotice] = useState<AudioErrorNotice | null>(null);
  // The event and the `state-changed` that clears the transport are emitted
  // back to back, so `isPlaying` can still be true for the render in which
  // the error arrives. Clear only on a rising edge — a real, later start.
  const wasPlaying = useRef(isPlaying);

  useEffect(() => {
    let cancelled = false;
    const unlisten = onAudioError((reason) => {
      if (cancelled) return;
      setNotice(classifyAudioError(reason));
    });
    return () => {
      cancelled = true;
      unlisten.then((u) => u());
    };
  }, []);

  useEffect(() => {
    const rising = isPlaying && !wasPlaying.current;
    wasPlaying.current = isPlaying;
    if (rising) setNotice(null);
  }, [isPlaying]);

  const dismiss = useCallback(() => setNotice(null), []);

  return { notice, dismiss };
}
