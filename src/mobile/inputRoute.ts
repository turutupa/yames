/**
 * The input after a route change, on a phone (M7, from the review).
 *
 * Pulling a USB interface or a jack adapter, or plugging one in, can make
 * Android close the input stream under the app (`android_route.rs` hears it
 * and says `audio-route-changed` / `input`). The stream cannot be reopened in
 * Rust alone: the onset detector's sample rate is fixed when it starts, and a
 * USB interface may run at another rate than the phone's mic. So this does
 * what a device switch in Settings does — stop and start the evaluation —
 * on the same device if it is still there, or on the one Android would route
 * to now (USB, then the jack, then the phone's mic), and says so.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { listAudioInputDevices, onAudioRouteChanged } from "../ipc";

export interface InputRouteEvaluation {
  enabled: boolean;
  selectedDevice?: string | null;
  setListening: (on: boolean) => Promise<void>;
  selectDevice: (deviceName: string) => Promise<void>;
}

export interface InputRoute {
  /** The input now listened through, after a route change; null when nothing to say. */
  changedTo: string | null;
  dismiss: () => void;
}

/** How long the "input changed" line stays, unless dismissed. */
export const INPUT_ROUTE_NOTICE_MS = 6000;

export function useInputRoute(evaluation: InputRouteEvaluation): InputRoute {
  const [changedTo, setChangedTo] = useState<string | null>(null);
  const evalRef = useRef(evaluation);
  evalRef.current = evaluation;

  useEffect(() => {
    let alive = true;
    const unlisten = onAudioRouteChanged(async (kind) => {
      if (kind !== "input" || !alive) return;
      const ev = evalRef.current;
      if (!ev.enabled) return;
      const devices = await listAudioInputDevices().catch(() => []);
      const current = ev.selectedDevice ?? "";
      const stillThere = current !== "" && devices.some((d) => d.name === current);
      try {
        if (stillThere || current === "") {
          await ev.setListening(false);
          await ev.setListening(true);
          if (alive) setChangedTo(current || (devices.find((d) => d.isDefault)?.name ?? ""));
        } else {
          const next = devices.find((d) => d.isDefault) ?? devices[0];
          if (!next) return;
          await ev.selectDevice(next.name);
          if (alive) setChangedTo(next.name);
        }
      } catch {
        // The restart's own error (startError) is what the screens show.
      }
    });
    return () => {
      alive = false;
      void unlisten.then((u) => u());
    };
  }, []);

  useEffect(() => {
    if (changedTo === null) return;
    const id = window.setTimeout(() => setChangedTo(null), INPUT_ROUTE_NOTICE_MS);
    return () => window.clearTimeout(id);
  }, [changedTo]);

  const dismiss = useCallback(() => setChangedTo(null), []);
  return { changedTo, dismiss };
}
