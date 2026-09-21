import { useCallback, useEffect, useRef, useState } from "react";
import { checkTakeSound, storeLoad, storeSave } from "../ipc";
import type { TakeSoundCheck } from "../ipc";
import { TAKE_SOUND_KEY } from "../jam/takes";
import type { TakeSound } from "../jam/types";

/**
 * What a take is made of, and whether this machine can do the other one
 * (`plans/SONGS.md` A12, `src-tauri/src/loopback.rs`).
 *
 * Shared by Jam and Songs because the machinery is shared: a take is a take,
 * the switch that says what goes into one is the same switch, and the answer
 * is about this room rather than about the tune on the stage.
 *
 * **It does not listen to anything on its own.** The only call here that
 * opens the speakers is [`TakeSoundState.check`], it is the musician pressing
 * a button, and it closes again a fifth of a second later. Loading the saved
 * choice is a store read and nothing else, so a machine that never records
 * this way never has its speakers listened to at all.
 */
export type TakeSoundState = {
  /** What the next take will be made of. */
  sound: TakeSound;
  /** Change it, and remember it for this machine. */
  setSound: (next: TakeSound) => void;
  /**
   * `null` until something has asked, then whatever the engine said.
   *
   * Asked once at the top of the session — a question about what this machine
   * CAN do, which costs a fifth of a second of listening and is the only way
   * to know honestly. A build with no such command answers `can: false`,
   * which is the right picture for it too.
   */
  check: TakeSoundCheck | null;
  /** Listen again, for the meter. True while it is listening. */
  recheck: () => void;
  checking: boolean;
  /** Can this machine record what it plays? Shorthand for `check?.can`. */
  canRecordEverything: boolean;
};

export function useTakeSound(): TakeSoundState {
  const [sound, setSoundState] = useState<TakeSound>("yamesAndInput");
  const [check, setCheck] = useState<TakeSoundCheck | null>(null);
  const [checking, setChecking] = useState(false);
  /** So a store read that lands after a click does not undo the click. */
  const touched = useRef(false);

  useEffect(() => {
    let alive = true;
    void storeLoad<TakeSound>(TAKE_SOUND_KEY)
      .then((saved) => {
        if (!alive || touched.current) return;
        if (saved === "everything" || saved === "yamesAndInput") setSoundState(saved);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const ask = useCallback(async () => {
    setChecking(true);
    try {
      const result = await checkTakeSound();
      setCheck(result);
      return result;
    } catch {
      // An engine with no such command. Not an error to show — it is simply a
      // build that records the one way, and the switch is not drawn.
      const absent: TakeSoundCheck = { can: false, peak: 0 };
      setCheck(absent);
      return absent;
    } finally {
      setChecking(false);
    }
  }, []);

  /**
   * Ask once, at the top of the session.
   *
   * Two hundred milliseconds of listening, once, to answer a question the
   * screen has to draw from. Doing it lazily — only when the switch is first
   * opened — would be cheaper still, and would mean the switch appearing a
   * moment after the sheet, which reads as the app changing its mind.
   */
  useEffect(() => {
    void ask();
  }, [ask]);

  const setSound = useCallback((next: TakeSound) => {
    touched.current = true;
    setSoundState(next);
    void storeSave(TAKE_SOUND_KEY, next).catch(() => {});
  }, []);

  const recheck = useCallback(() => {
    void ask();
  }, [ask]);

  return {
    sound,
    setSound,
    check,
    recheck,
    checking,
    canRecordEverything: check?.can === true,
  };
}

/**
 * The level the meter draws, 0 to 1, from a peak in the same units.
 *
 * Decibels rather than the raw number, because the raw number is useless to
 * look at: a signal at a sensible recording level sits around 0.1 and would
 * draw a meter that looks broken. A floor of -60 dB, so silence is empty and
 * anything audible has somewhere to go.
 */
export function meterLevel(peak: number): number {
  if (!(peak > 0)) return 0;
  const db = 20 * Math.log10(Math.min(1, peak));
  return Math.max(0, Math.min(1, (db + 60) / 60));
}
