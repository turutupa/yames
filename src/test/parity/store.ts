/**
 * A settings store with memory, for tests that care what was saved.
 *
 * `src/test/mocks.ts` gives every test a store that forgets everything. This
 * replaces the methods on that same object (`ipc.ts` holds on to it once it has
 * been loaded), so `storeSave` and `storeLoad` become real reads and writes
 * against the map returned here. `setup.ts` clears the mocks after each test,
 * so call this once per test.
 */
import { load } from "@tauri-apps/plugin-store";
import { mockListen } from "../mocks";

export interface FakeStore {
  values: Map<string, unknown>;
  /** Keys written since the store was installed, in order, with their values. */
  writes: Array<[string, unknown]>;
}

export async function installSettings(initial: Record<string, unknown> = {}): Promise<FakeStore> {
  const values = new Map(Object.entries(initial));
  const writes: Array<[string, unknown]> = [];
  const store = (await load("settings.json")) as unknown as Record<string, unknown>;
  store.get = async (key: string) => values.get(key);
  store.set = async (key: string, value: unknown) => {
    values.set(key, value);
    writes.push([key, value]);
  };
  store.save = async () => {};
  return { values, writes };
}

/** Deliver a Tauri event to everything currently listening for it. */
export function emitEvent(name: string, payload: unknown): void {
  for (const [event, handler] of mockListen.mock.calls) {
    if (event === name) (handler as (e: { payload: unknown }) => void)({ payload });
  }
}
