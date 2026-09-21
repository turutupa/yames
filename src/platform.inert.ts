/**
 * What the desktop hooks are, on a phone: nothing, in the exact shape the
 * screens already expect.
 *
 * The mobile build has no practice coach, no mic evaluation, no voice, no
 * MIDI and no hotkeys (`plans/MOBILE_IMPLEMENTATION_PLAN.md` §1), so
 * `MainWindow` calls those hooks as `IS_MOBILE ? INERT_X : useX()`. The
 * condition is a build-time constant, so the hook order never varies at
 * runtime and Rollup drops both the hook and everything it imported.
 *
 * These objects exist so that ONE line changes per hook instead of forty at
 * the call sites: every screen keeps the same prop types, and the UI that
 * would read them is behind its own `!IS_MOBILE` gate. Nothing here has
 * behaviour — a setter that discards, a promise that resolves, a list that is
 * empty. If a mobile screen ever visibly depends on one of these values, that
 * is a missing gate, and the mobile composition tests are what catch it.
 *
 * Every type below comes from `import type`, which is erased at compile time,
 * so importing this module pulls no desktop code into the graph.
 */
import type { useEvaluation } from "./hooks/useEvaluation";
import type { useKeybindings } from "./hooks/useKeybindings";
import type { useSession } from "./hooks/useSession";
import type { UseMidiReturn } from "./hooks/useMidi";
import type { InputTester } from "./containers/main-window/hooks/useInputTester";
import type { JamTakesState } from "./containers/main-window/hooks/useJamTakes";

const noop = () => {};
const asyncNoop = async () => {};

/** The microphone, the onset detector and everything downstream of them. */
export const INERT_EVALUATION: ReturnType<typeof useEvaluation> = {
  enabled: false,
  toggle: asyncNoop,
  setListening: asyncNoop,
  devices: [],
  refreshDevices: async () => [],
  selectedDevice: undefined,
  selectDevice: asyncNoop,
  selectedChannel: 0,
  selectChannel: asyncNoop,
  spectrum: null,
  hasSignal: false,
  showRealtime: false,
  toggleRealtime: asyncNoop,
  lastFeedback: null,
  dotFeedback: new Map(),
  recentDeviations: [],
  avgDeviation: 0,
  inferredGrid: null,
};

/** A practice session the coach narrates. */
export const INERT_SESSION: ReturnType<typeof useSession> = {
  active: false,
  messages: [],
  startedAt: null,
  cardOpen: false,
  startSession: asyncNoop,
  endSession: asyncNoop,
  sendChat: noop,
  clearMessages: noop,
  toggleCard: noop,
  handleChipAction: noop,
  registerChatFocus: noop,
  playMode: undefined,
};

/** MIDI footswitches and the devices they arrive on. */
export const INERT_MIDI: UseMidiReturn = {
  devices: [],
  bindings: [],
  connectedDevice: null,
  lastActivity: null,
  learnMode: null,
  pendingConflict: null,
  connect: asyncNoop,
  disconnect: asyncNoop,
  refreshDevices: asyncNoop,
  startLearn: noop,
  cancelLearn: noop,
  removeBinding: asyncNoop,
  acceptConflict: asyncNoop,
  rejectConflict: noop,
};

/** Keyboard, global and footswitch bindings, and the capture modals. */
export const INERT_KEYBINDINGS: ReturnType<typeof useKeybindings> = {
  keyBindings: {},
  setKeyBindings: noop,
  footBindings: {},
  setFootBindings: noop,
  globalBindings: {},
  setGlobalBindings: noop,
  bindingFor: null,
  setBindingFor: noop,
  pendingKeys: "",
  setPendingKeys: noop,
  pendingKeyConflict: null,
  setPendingKeyConflict: noop,
  showResetConfirm: false,
  setShowResetConfirm: noop,
  resetAllBindings: noop,
  handleResetBinding: noop,
  handleRemoveBinding: noop,
  acceptKeyConflict: noop,
  rejectKeyConflict: noop,
};

/** The keyboard / MIDI / footswitch tester modal in Settings. */
export const INERT_INPUT_TESTER: InputTester = {
  inputTestMode: false,
  setInputTestMode: noop,
  inputTestLog: [],
  inputTestLogRef: { current: null },
  inputTestModeRef: { current: false },
  appendLog: noop,
  clearLog: noop,
};

/**
 * Recording a take. The band plays on a phone; recording yourself over it
 * does not, because a take mixes the MIC in and the mic path is cut
 * (plan §1). `available: false` is the shape the Jam sheet already knows —
 * it is what a build whose engine rejects the commands looks like — and the
 * section is gated out on top of it, so a phone shows no takes row at all.
 */
export const INERT_JAM_TAKES: JamTakesState = {
  available: false,
  takes: [],
  recording: false,
  recordedSeconds: 0,
  playingId: null,
  dirBytes: 0,
  play: noop,
  stopPlayback: noop,
  remove: noop,
  requestTakes: noop,
  introOpen: false,
  confirmIntro: noop,
  cancelIntro: noop,
};
