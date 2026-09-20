import { useSyncExternalStore } from "react";
import { isJamLoading, subscribeJamLoading } from "../ipc";

/**
 * True while the band is taking a moment to load — a kit or a voice that
 * had not been decoded yet. See `isJamLoading` in ipc.ts for when it turns on
 * and why it waits a beat first.
 */
export function useJamLoading(): boolean {
  return useSyncExternalStore(subscribeJamLoading, isJamLoading, () => false);
}
