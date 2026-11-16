/**
 * One footswitch, three gestures, from whichever input it arrives on.
 *
 * Only `session-pedal` goes through this. Every other action is bound one signal
 * to one action as it always was, and a player with three switches has no use
 * for any of it.
 *
 * A pedal reaches the app three ways, and each tells us about the release
 * differently: a MIDI pedal's release is a `midi-activity` with a low value on
 * the same signal, a keyboard-style pedal's is `keyup`, and a gamepad's is the
 * button coming up. Which of those a given pedal really sends can only be found
 * out with the pedal, which is why a pedal that sends no release at all still
 * works: it gets taps (`pedalPollNoRelease`).
 */
import { useCallback, useEffect, useRef } from "react";
import { onMidiActivity } from "../../../ipc";
import type { MidiBinding } from "../../../types";
import { eventToCombo } from "../../../hotkeys";
import {
  PEDAL_UP,
  pedalPoll,
  pedalPollNoRelease,
  pedalPress,
  pedalRelease,
} from "../../../session/pedalGesture";
import type { PedalGesture, PedalStep } from "../../../session/pedalGesture";

const POLL_MS = 50;
export const PEDAL_ACTION = "session-pedal";

export function useSessionPedal(args: {
  active: boolean;
  onGesture: (gesture: PedalGesture) => void;
  midiBindings: readonly MidiBinding[];
  keyBinding?: string;
}) {
  const { active, midiBindings, keyBinding } = args;
  const onGesture = useRef(args.onGesture);
  onGesture.current = args.onGesture;
  const state = useRef(PEDAL_UP);
  /** Has this pedal ever sent a release? Decides how a long press reads. */
  const sawRelease = useRef(false);

  const apply = useCallback((step: PedalStep) => {
    state.current = step.state;
    if (step.gesture) onGesture.current(step.gesture);
  }, []);

  const press = useCallback(() => apply(pedalPress(state.current, performance.now())), [apply]);

  const release = useCallback(() => {
    sawRelease.current = true;
    apply(pedalRelease(state.current, performance.now()));
  }, [apply]);

  useEffect(() => {
    if (!active) {
      state.current = PEDAL_UP;
      return;
    }
    const timer = setInterval(() => {
      const poll = sawRelease.current ? pedalPoll : pedalPollNoRelease;
      apply(poll(state.current, performance.now()));
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [active, apply]);

  useEffect(() => {
    if (!active) return;
    const binding = midiBindings.find((b) => b.action === PEDAL_ACTION);
    if (!binding) return;
    const off = onMidiActivity((activity) => {
      if (
        activity.type === binding.msgType &&
        activity.number === binding.number &&
        (binding.channel === null || activity.channel === binding.channel) &&
        activity.value <= 63
      ) {
        release();
      }
    });
    return () => {
      void off.then((fn) => fn()).catch(() => {});
    };
  }, [active, midiBindings, release]);

  useEffect(() => {
    if (!active || !keyBinding) return;
    const onUp = (e: KeyboardEvent) => {
      if (eventToCombo(e) === keyBinding) release();
    };
    document.addEventListener("keyup", onUp);
    return () => document.removeEventListener("keyup", onUp);
  }, [active, keyBinding, release]);

  return { press, release };
}
