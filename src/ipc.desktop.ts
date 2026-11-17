/**
 * The desktop half of the IPC, as the `mobile` branch split it.
 *
 * The revamp grades from the guitar on every platform (plans/tasks/mvp/
 * ANDROID.md), so the evaluation, timing and session commands exist on a
 * phone too and the split no longer draws a line anyone relies on: this is a
 * re-export of `ipc.ts`, kept so that modules written on the `mobile` branch
 * against `./ipc.desktop` still resolve. Commands a phone does not have (MIDI,
 * the window manager, the updater, the coach's model) answer there with an
 * error from `src-tauri/src/commands/mobile.rs`, and the UI that calls them
 * is behind `IS_MOBILE`.
 */
export * from "./ipc";
