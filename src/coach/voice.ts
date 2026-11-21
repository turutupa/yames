/**
 * The coach's voice (DESIGN section 8, Voice; 3.4): only with Voice on, only at
 * a boundary, never over sound.
 *
 * What it says is what the screen shows. Nothing here words anything: the
 * Session's notes hand over their own headline (`sayAtBoundary`) when they
 * draw it, and the coach's keys hand over the line they put in the coach's
 * slot (`sayNow`). Two boundaries speak, each once:
 *
 * - **a ready screen**: the order, the ready note's headline. Not one that
 *   goes straight into the count-in ("Go again", `stepReady.straight`): the
 *   order would be cut by the first click, or worse, run over it.
 * - **a result**: the finding, the result note's headline (or, ungraded, the
 *   question the Take listened for).
 *
 * And it is quiet:
 *
 * - from `takeStarted` until that Take's result (the count-in, the Take, the
 *   listening after it);
 * - whenever anything sounds (`setSounding`, the engine's own state: a Take, a
 *   warm-up, a jam, a loop, the demo of "Hear it first");
 * - from the moment anything asks the engine to play (`soundGate`), which is
 *   how a Start pressed mid-sentence cuts it at the count-in's start, not
 *   after the engine reports it; and until that report, the coach keys do
 *   nothing either (`soundIsStarting`);
 * - outside the Session (`setVoiceInSession`).
 *
 * A cut is `ttsStop()`, and only for speech this module started: the voice
 * preview in Settings is not the coach's to stop. It is sent again on every
 * later cut until the speak settles, since one that reached Rust before the
 * line had begun cancels nothing. The speech never dims the click
 * (`ttsSpeak(text, { dim: false })` in `useCoachVoice`).
 *
 * It subscribes to the coach's bus (Session events, never the beat) and holds
 * no React state: nothing renders because of it.
 */
import { subscribe, type Delivered } from "./bus";
import { onSoundStarting } from "../soundGate";

export type VoiceBoundary = "ready" | "result";

/** How speech leaves the app: `ttsSpeak` / `ttsStop` from `ipc.ts`, injected so tests can listen. */
export type VoiceOut = {
  speak: (text: string) => Promise<void>;
  stop: () => Promise<void>;
};

type State = {
  out: VoiceOut | null;
  /** Voice on in Settings (`coachVoiceMode === "voice"`). */
  enabled: boolean;
  /** The engine is playing. */
  sounding: boolean;
  /** Between `takeStarted` and its result. */
  inTake: boolean;
  /** The boundary that may still speak once: its kind and the bus `seq` that opened it. */
  armed: { kind: VoiceBoundary; seq: number; text?: string } | null;
  /**
   * Our own speech that may still be sounding, by token; 0 when none. Held
   * until the speak call settles, not until the first cut: a stop that Rust
   * received before the line had begun cancels nothing, so a later cut sends
   * it again.
   */
  speaking: number;
  token: number;
  /** The Session is the view (`useCoachVoice`). Leaving it hushes and forgets. */
  inSession: boolean;
  /**
   * When a Start was last asked for (`soundGate`), until the engine reports
   * sound, playback stops or a Session boundary passes; null when none. Read
   * against `STARTING_MS` so a Start the engine never honoured cannot keep
   * the voice and the keys shut for good.
   */
  startingAt: number | null;
};

/** How long a Start the engine has not yet reported keeps the voice and the coach keys shut. */
const STARTING_MS = 2_000;

const state: State = {
  out: null,
  enabled: false,
  sounding: false,
  inTake: false,
  armed: null,
  speaking: 0,
  token: 0,
  inSession: true,
  startingAt: null,
};

/** Stop our own speech, if any may still be sounding. Sent again on every cut until the speak settles. */
export function hushCoachVoice(): void {
  state.armed = null;
  if (state.speaking === 0) return;
  stopOut(state.out);
}

/**
 * A Start has been asked for and the engine has not yet reported sound: the
 * voice is quiet and the coach keys do nothing (finding 6 of the c1b2b review).
 */
export function soundIsStarting(): boolean {
  if (state.startingAt === null) return false;
  if (Date.now() - state.startingAt < STARTING_MS) return true;
  state.startingAt = null;
  return false;
}

function startingHeard(): void {
  state.startingAt = Date.now();
  hushCoachVoice();
}

function canSpeak(): boolean {
  return (
    state.enabled &&
    state.inSession &&
    !state.sounding &&
    !state.inTake &&
    !soundIsStarting() &&
    state.out !== null
  );
}

function speak(text: string): void {
  const out = state.out;
  const said = text.trim();
  if (!out || !said) return;
  // A new line replaces the one being said: `tts_speak` cancels whatever is
  // speaking itself. No stop of our own first: one that reached Rust after
  // the new line had begun would cut the new line instead.
  const token = ++state.token;
  state.speaking = token;
  const done = () => {
    if (state.speaking === token) state.speaking = 0;
  };
  try {
    out.speak(said).then(done, done);
  } catch {
    done();
  }
}

function stopOut(out: VoiceOut | null): void {
  try {
    void out?.stop().catch(() => {});
  } catch {
    // Nothing to stop with: nothing was said either.
  }
}

function heard(event: Delivered): void {
  switch (event.type) {
    case "takeStarted":
      state.inTake = true;
      state.startingAt = null;
      hushCoachVoice();
      return;
    case "takeResult":
      state.inTake = false;
      hushCoachVoice();
      state.armed = { kind: "result", seq: event.seq };
      return;
    case "stepReady":
      state.inTake = false;
      hushCoachVoice();
      // A timed block's ready screen has no order to say; "Go again" goes
      // straight into the count-in.
      state.armed = event.timed || event.straight ? null : { kind: "ready", seq: event.seq };
      return;
    case "timedEnded":
    case "sessionRecap":
      state.inTake = false;
      hushCoachVoice();
      return;
    default:
      return;
  }
}

/**
 * A note drew its headline at a boundary. Said once, the first time the note
 * of the boundary just opened reports it, and only if nothing has sounded or
 * started since.
 */
export function sayAtBoundary(kind: VoiceBoundary, text: string): void {
  const armed = state.armed;
  if (!armed || armed.kind !== kind || armed.text !== undefined) return;
  // The engine still winding down from what came before (a warm-up's last
  // bar, a loop): kept, and said when it stops, if nothing else happens first.
  if (state.enabled && state.inSession && state.out && !state.inTake && state.sounding) {
    state.armed = { ...armed, text };
    return;
  }
  state.armed = null;
  if (!canSpeak()) return;
  speak(text);
}

/**
 * Say a line now (a coach key's answer), under the same rules: Voice on,
 * nothing sounding, no Take running. Returns whether it was spoken.
 */
export function sayNow(text: string): boolean {
  if (!canSpeak()) return false;
  speak(text);
  return true;
}

/** Voice on or off. Off stops our speech at once. */
export function setVoiceEnabled(on: boolean): void {
  state.enabled = on;
  if (!on) hushCoachVoice();
}

/**
 * The Session is the view, or not. Leaving it drops a line waiting for the
 * engine to stop and cuts one being said: the Session's order is not heard
 * on Today or the Metronome.
 */
export function setVoiceInSession(on: boolean): void {
  state.inSession = on;
  if (!on) hushCoachVoice();
}

/**
 * The engine is playing (or stopped). Playing stops our speech at once, and
 * again if a first stop was lost (the speak still unsettled). Either report
 * ends the "starting" window.
 */
export function setVoiceSounding(on: boolean): void {
  if (state.sounding === on) return;
  state.sounding = on;
  state.startingAt = null;
  if (on) {
    hushCoachVoice();
    return;
  }
  // Sound stopped with a boundary's line waiting on it.
  const armed = state.armed;
  if (armed?.text !== undefined) {
    state.armed = null;
    if (canSpeak()) speak(armed.text);
  }
}

/**
 * Start listening: the bus and the sound gate. Returns the uninstall. One
 * install at a time; a second replaces the first's output.
 */
export function installCoachVoice(out: VoiceOut): () => void {
  state.out = out;
  const offBus = subscribe(heard);
  const offSound = onSoundStarting(startingHeard);
  return () => {
    offBus();
    offSound();
    hushCoachVoice();
    if (state.out === out) state.out = null;
  };
}

/** Forget everything. Tests only. */
export function resetCoachVoice(): void {
  state.out = null;
  state.enabled = false;
  state.sounding = false;
  state.inTake = false;
  state.armed = null;
  state.speaking = 0;
  state.token = 0;
  state.inSession = true;
  state.startingAt = null;
}
