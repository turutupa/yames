/**
 * "Sound is about to start": called by `ipc.ts` the moment anything asks the
 * engine to play (`setPlaying(true)`, `togglePlayback`), right AFTER the
 * request has left for Rust: the voice's `tts_stop` may wait on a process
 * kill on the main thread, and the Start must not queue behind it.
 *
 * The coach's voice listens here so that a Start pressed while it is talking
 * cuts it at the count-in's start, not after the engine reports it is
 * playing (DESIGN section 8, Voice: "Start stops it"). A module of its own,
 * with no imports, so a test that mocks `ipc.ts` whole still has it.
 *
 * Listeners run synchronously and must be cheap: one of them sits in front of
 * every Start in the app. One that throws is logged and the others still run;
 * the caller never sees it.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

/** Hear every "sound is about to start". Returns the unsubscribe. */
export function onSoundStarting(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Something is about to sound. `ipc.ts` calls this; nothing else should. */
export function soundStarting(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch (err) {
      console.warn("[yames] a sound-starting listener failed", err);
    }
  }
}
