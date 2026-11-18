/**
 * Turning the input on for a Session, and saying why it would not come on.
 *
 * Beta 6 (owner, Windows): the Take's Start did nothing, because the input was
 * off and nothing said so where the player was looking. A Session used to get
 * its input only as a side effect of the coach session starting, which logged a
 * failure to the console and carried on. Now the Session asks for the input
 * itself, with this, and a failure comes back as one of a few kinds the ready
 * screen can put into words.
 *
 * One recovery is automatic: a selected device that is no longer there (on
 * Windows a USB interface's name changes with the port it is plugged into,
 * "2- Scarlett 2i2 USB") is not a reason to stay deaf. The system's default
 * input is opened instead, this once, without changing the player's choice;
 * the ready screen says which device it is listening to.
 */
import type { AudioInputDevice } from "../types";

/** What went wrong, in the words the ready screen has for it. */
export type InputFailure =
  /** No input device at all, or none by the selected name and no default either. */
  | "noDevice"
  /** The system, or the player, refused the microphone. */
  | "permission"
  /** Asked and never answered: Android's permission dialog left open, a driver that hangs. */
  | "noAnswer"
  /** Another app holds the device. */
  | "busy"
  | "other";

/** How long a start may take before the ready screen says it got no answer. */
export const INPUT_ANSWER_MS = 10_000;

/** The kind of a start's failure, from the message the engine gave. */
export function classifyInputError(err: unknown): InputFailure {
  if (err instanceof InputTimeout) return "noAnswer";
  const text = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  // Android's dialog dismissed or hidden (`MIC_PERMISSION_UNANSWERED`): not a refusal.
  if (/not answered|unanswered/.test(text)) return "noAnswer";
  if (/permission|denied|not allowed|notallowed|refused|access/.test(text)) return "permission";
  if (/busy|in use|exclusive|already/.test(text)) return "busy";
  if (/no default input|not found|no input|no device|unavailable/.test(text)) return "noDevice";
  return "other";
}

/** A start that got no answer in time. */
export class InputTimeout extends Error {
  constructor() {
    super("the input did not answer");
  }
}

/** The selected device is not in the list the system gave (it was unplugged, or renamed). */
function isMissing(selected: string | undefined, devices: readonly AudioInputDevice[]): boolean {
  return !!selected && devices.length > 0 && !devices.some((d) => d.name === selected);
}

function isNotFound(err: unknown): boolean {
  const text = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  return text.includes("not found");
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new InputTimeout()), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export type InputStartDeps = {
  /** `useEvaluation.setListening`: `device` opens that device this once (`null`: the default). */
  setListening: (on: true, device?: string | null) => Promise<unknown>;
  selectedDevice: string | undefined;
  /** The devices as last listed. */
  devices: readonly AudioInputDevice[];
  timeoutMs?: number;
};

/** What came on: the device's name (null: the system default), and whether it was a stand-in. */
export type InputStarted = { device: string | null; fellBack: boolean };

/**
 * Turn the input on, falling back to the system default when the selected
 * device is gone. Rejects with an error `classifyInputError` reads.
 */
export async function startSessionInput(deps: InputStartDeps): Promise<InputStarted> {
  const ms = deps.timeoutMs ?? INPUT_ANSWER_MS;
  const selected = deps.selectedDevice;
  if (isMissing(selected, deps.devices)) {
    await withTimeout(deps.setListening(true, null), ms);
    return { device: null, fellBack: true };
  }
  try {
    await withTimeout(deps.setListening(true), ms);
    return { device: selected ?? null, fellBack: false };
  } catch (err) {
    if (!selected || !isNotFound(err)) throw err;
    await withTimeout(deps.setListening(true, null), ms);
    return { device: null, fellBack: true };
  }
}
