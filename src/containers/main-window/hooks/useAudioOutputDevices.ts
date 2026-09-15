import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  listAudioOutputDevices,
  onAudioDevicesChanged,
  onAudioOutputPairFallback,
  setAudioOutputDevice,
  setAudioOutputPair,
  storeLoad,
} from "../../../ipc";
import type { AudioOutputDevice } from "../../../types";

/**
 * Owns the audio-output device list, the user's currently-selected
 * device, and which pair of that device's outputs the app plays on. On
 * mount, hydrates all three from the OS + the persisted store; while
 * mounted, listens for hot-plug / removal events and keeps the list fresh.
 *
 * When the currently-selected device disappears (e.g. user unplugs USB
 * audio while the app is running), the selection clears and the backend is
 * told to fall back to the system default — this avoids a silent metronome
 * on a stale device handle. The pair goes back to outputs 1-2 with it: the
 * device that had a pair is gone.
 *
 * The pair is remembered per device (`audioOutputPairs` in the store), so
 * switching back to an interface brings its outputs back. The backend is
 * the one that applies the stored pair on a device change — this hook only
 * mirrors it, so the screen agrees with the engine.
 *
 * The save side of the device selection is handled by
 * `DevicesSettingsSection` (which calls `setAudioOutputDevice` directly
 * when the user picks a new one); the pair goes through `selectOutputPair`
 * here, because the backend answers with the pair actually in effect and
 * somebody has to believe it.
 */

/** The map `audioOutputPairs` is stored as: device name → 0-based pair. */
type StoredPairs = Record<string, number>;

/** The pair stored for a device, or 0. The system default device is the
 *  empty name, so a musician with a laptop and an interface keeps one
 *  pair for each. Mirrors `commands::stored_output_pair`.
 *
 *  A whole non-negative number or nothing: the store is a JSON file a user
 *  can open, and half a pair is not a pair. `Number.isInteger` also
 *  rejects NaN and Infinity, which a bare `>= 0` would let through as an
 *  index into the options list. */
export function storedPairFor(
  pairs: StoredPairs | null | undefined,
  deviceName: string,
): number {
  const stored = pairs?.[deviceName];
  return typeof stored === "number" && Number.isInteger(stored) && stored >= 0
    ? stored
    : 0;
}

export interface AudioOutputDevicesState {
  audioOutputDevices: AudioOutputDevice[];
  setAudioOutputDevices: Dispatch<SetStateAction<AudioOutputDevice[]>>;
  selectedOutputDevice: string;
  /** 0-based: 0 is "Outputs 1-2", 1 is "Outputs 3-4". */
  outputPair: number;
  /** Move the click, the band, takes and the coach to another pair. */
  selectOutputPair: (pair: number) => void;
  /** Pick a device AND bring its remembered pair back with it. */
  selectOutputDevice: (deviceName: string) => void;
  /** The device turned out to have only two outputs after all. Shown as a
   *  one-line note under the picker; cleared as soon as anything changes. */
  outputPairFellBack: boolean;
}

export function useAudioOutputDevices(): AudioOutputDevicesState {
  const [audioOutputDevices, setAudioOutputDevices] = useState<
    AudioOutputDevice[]
  >([]);
  const [selectedOutputDevice, setSelectedOutputDevice] = useState<string>("");
  const [outputPair, setOutputPair] = useState<number>(0);
  const [outputPairFellBack, setOutputPairFellBack] = useState(false);
  // The whole per-device map, so switching devices does not need a round
  // trip to the store for a number the backend has already applied.
  const storedPairs = useRef<StoredPairs>({});

  // Mount: hydrate device list + persisted selection + its pair.
  useEffect(() => {
    (async () => {
      const devices = await listAudioOutputDevices();
      setAudioOutputDevices(devices);
      const savedDevice = await storeLoad<string>("audioOutputDevice");
      const savedPairs = await storeLoad<StoredPairs>("audioOutputPairs");
      if (savedPairs) storedPairs.current = savedPairs;
      if (savedDevice) setSelectedOutputDevice(savedDevice);
      setOutputPair(storedPairFor(savedPairs, savedDevice ?? ""));
    })();
  }, []);

  // The engine could not give the musician the outputs they asked for —
  // the device advertised more than it delivered. It is playing on the
  // pair in the payload; the picker follows it and says why.
  useEffect(() => {
    const unlisten = onAudioOutputPairFallback((pair) => {
      setOutputPair(pair);
      setOutputPairFellBack(true);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Listen for device hot-plug / removal. If the selected device vanishes,
  // clear the selection and reset the backend to the system default so the
  // user doesn't end up routing to a stale handle.
  useEffect(() => {
    const unlisten = onAudioDevicesChanged((devices) => {
      setAudioOutputDevices(devices);
      if (
        selectedOutputDevice &&
        !devices.some((d) => d.name === selectedOutputDevice)
      ) {
        setSelectedOutputDevice("");
        setAudioOutputDevice(null);
        // The device that had a pair is gone. Back to the default device's
        // own pair, and the note about a device that under-delivered is
        // about a device nobody is using any more.
        setOutputPair(storedPairFor(storedPairs.current, ""));
        setOutputPairFellBack(false);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [selectedOutputDevice]);

  const selectOutputPair = useCallback(
    (pair: number) => {
      // Optimistic, then corrected: the backend answers with the pair
      // actually in effect, and a device that cannot carry the one asked
      // for says 0. Nothing stops while this happens — a pair the open
      // stream already holds is one atomic store away.
      setOutputPair(pair);
      setOutputPairFellBack(false);
      storedPairs.current = {
        ...storedPairs.current,
        [selectedOutputDevice]: pair,
      };
      setAudioOutputPair(pair).then((inEffect) => {
        setOutputPair(inEffect);
        if (inEffect !== pair) setOutputPairFellBack(true);
      });
    },
    [selectedOutputDevice],
  );

  const selectOutputDevice = useCallback((deviceName: string) => {
    setSelectedOutputDevice(deviceName);
    setAudioOutputDevice(deviceName || null);
    // The backend applies the stored pair for the new device itself; this
    // is the screen agreeing with it rather than a second decision.
    setOutputPair(storedPairFor(storedPairs.current, deviceName));
    setOutputPairFellBack(false);
  }, []);

  return {
    audioOutputDevices,
    setAudioOutputDevices,
    selectedOutputDevice,
    outputPair,
    selectOutputPair,
    selectOutputDevice,
    outputPairFellBack,
  };
}
