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
 *   how a Start pressed mid-sentence cuts it before the count-in, not after.
 *
 * A cut is `ttsStop()`, and only for speech this module started: the voice
 * preview in Settings is not the coach's to stop.
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
  /** Our own speech in flight, by token; 0 when none. */
  speaking: number;
  token: number;
};

const state: State = {
  out: null,
  enabled: false,
  sounding: false,
  inTake: false,
  armed: null,
  speaking: 0,
  token: 0,
};

/** Stop our own speech, if any is in flight. */
export function hushCoachVoice(): void {
  state.armed = null;
  if (state.speaking === 0) return;
  state.speaking = 0;
  stopOut(state.out);
}

function canSpeak(): boolean {
  return state.enabled && !state.sounding && !state.inTake && state.out !== null;
}

function speak(text: string): void {
  const out = state.out;
  const said = text.trim();
  if (!out || !said) return;
  // A new line replaces the one being said: one voice, one sentence at a time.
  if (state.speaking !== 0) stopOut(out);
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
  if (state.enabled && state.out && !state.inTake && state.sounding) {
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

/** The engine is playing (or stopped). Playing stops our speech at once. */
export function setVoiceSounding(on: boolean): void {
  if (state.sounding === on) return;
  state.sounding = on;
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
  const offSound = onSoundStarting(hushCoachVoice);
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
}
