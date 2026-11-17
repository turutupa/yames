import { useCallback, useEffect, useRef, useState } from "react";
import { listMidiDevices, connectMidiDevice, disconnectMidiDevice, getMidiBindings, setMidiBinding, clearMidiBinding, onMidiAction, onMidiActivity, onMidiDevicesChanged } from "../ipc.desktop";
import type { MidiDeviceInfo, MidiBinding, MidiActivity } from "../types";

export interface MidiConflict {
  /** The action the user is trying to bind */
  targetAction: string;
  /** The incoming MIDI signal */
  activity: MidiActivity;
  /** The existing binding that conflicts */
  existingBinding: MidiBinding;
}

export interface UseMidiReturn {
  devices: MidiDeviceInfo[];
  bindings: MidiBinding[];
  connectedDevice: string | null;
  lastActivity: MidiActivity | null;
  learnMode: string | null; // action being learned, or null
  pendingConflict: MidiConflict | null;
  connect: (deviceName: string) => Promise<void>;
  disconnect: () => Promise<void>;
  refreshDevices: () => Promise<void>;
  startLearn: (action: string) => void;
  cancelLearn: () => void;
  removeBinding: (action: string) => Promise<void>;
  acceptConflict: () => Promise<void>;
  rejectConflict: () => void;
}

export function useMidi(
  dispatchAction: (action: string) => void,
  autoAcceptConflicts?: boolean,
  suppressDispatch?: boolean,
): UseMidiReturn {
  const [devices, setDevices] = useState<MidiDeviceInfo[]>([]);
  const [bindings, setBindings] = useState<MidiBinding[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<string | null>(null);
  const [lastActivity, setLastActivity] = useState<MidiActivity | null>(null);
  const [learnMode, setLearnMode] = useState<string | null>(null);
  const [pendingConflict, setPendingConflict] = useState<MidiConflict | null>(null);
  const learnModeRef = useRef<string | null>(null);
  const dispatchRef = useRef(dispatchAction);
  const bindingsRef = useRef<MidiBinding[]>([]);
  const autoAcceptRef = useRef(autoAcceptConflicts ?? false);

  const suppressRef = useRef(suppressDispatch ?? false);

  // Keep refs in sync
  useEffect(() => {
    learnModeRef.current = learnMode;
  }, [learnMode]);

  useEffect(() => {
    dispatchRef.current = dispatchAction;
  }, [dispatchAction]);

  useEffect(() => {
    bindingsRef.current = bindings;
  }, [bindings]);

  useEffect(() => {
    autoAcceptRef.current = autoAcceptConflicts ?? false;
  }, [autoAcceptConflicts]);

  useEffect(() => {
    suppressRef.current = suppressDispatch ?? false;
  }, [suppressDispatch]);

  const applyBinding = useCallback(async (action: string, activity: MidiActivity) => {
    await setMidiBinding(action, activity.channel, activity.type, activity.number);
    const b = await getMidiBindings();
    setBindings(b);
  }, []);

  // Load initial state
  useEffect(() => {
    listMidiDevices().then((d) => {
      setDevices(d);
      const connected = d.find((dev) => dev.isConnected);
      if (connected) setConnectedDevice(connected.name);
    });
    getMidiBindings().then(setBindings);
  }, []);

  // Listen for MIDI action events → dispatch to app (stable listener, never re-created)
  useEffect(() => {
    const unlisten = onMidiAction((action) => {
      if (suppressRef.current) return;
      dispatchRef.current(action);
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  // Listen for MIDI activity → update last activity + handle learn mode
  useEffect(() => {
    const unlisten = onMidiActivity((activity) => {
      setLastActivity(activity);
      const learning = learnModeRef.current;
      if (learning) {
        // Check for conflict: same signal bound to a different action
        const conflict = bindingsRef.current.find(
          (b) =>
            b.msgType === activity.type &&
            b.number === activity.number &&
            b.channel === activity.channel &&
            b.action !== learning,
        );
        if (conflict && !autoAcceptRef.current) {
          // Show confirmation dialog
          setPendingConflict({
            targetAction: learning,
            activity,
            existingBinding: conflict,
          });
          setLearnMode(null);
        } else {
          // No conflict or auto-accept — bind immediately
          applyBinding(learning, activity);
          setLearnMode(null);
        }
      }
    });
    return () => { unlisten.then((f) => f()); };
  }, [applyBinding]);

  // Listen for device changes
  useEffect(() => {
    const unlisten = onMidiDevicesChanged((newDevices) => {
      setDevices(newDevices);
      const connected = newDevices.find((d) => d.isConnected);
      setConnectedDevice(connected?.name ?? null);
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  const connect = useCallback(async (deviceName: string) => {
    await connectMidiDevice(deviceName);
    setConnectedDevice(deviceName);
    const d = await listMidiDevices();
    setDevices(d);
  }, []);

  const disconnect = useCallback(async () => {
    await disconnectMidiDevice();
    setConnectedDevice(null);
    const d = await listMidiDevices();
    setDevices(d);
  }, []);

  const refreshDevices = useCallback(async () => {
    const d = await listMidiDevices();
    setDevices(d);
    const connected = d.find((dev) => dev.isConnected);
    setConnectedDevice(connected?.name ?? null);
  }, []);

  const startLearn = useCallback((action: string) => {
    setLearnMode(action);
  }, []);

  const cancelLearn = useCallback(() => {
    setLearnMode(null);
  }, []);

  const removeBinding = useCallback(async (action: string) => {
    await clearMidiBinding(action);
    const b = await getMidiBindings();
    setBindings(b);
  }, []);

  const acceptConflict = useCallback(async () => {
    if (!pendingConflict) return;
    await applyBinding(pendingConflict.targetAction, pendingConflict.activity);
    setPendingConflict(null);
  }, [pendingConflict, applyBinding]);

  const rejectConflict = useCallback(() => {
    setPendingConflict(null);
  }, []);

  return {
    devices,
    bindings,
    connectedDevice,
    lastActivity,
    learnMode,
    pendingConflict,
    connect,
    disconnect,
    refreshDevices,
    startLearn,
    cancelLearn,
    removeBinding,
    acceptConflict,
    rejectConflict,
  };
}
