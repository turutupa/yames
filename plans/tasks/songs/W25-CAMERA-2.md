# W25 — The camera, second pass: the parts people will show a friend

Branch `songs-w25-camera-2`, from `songs-v1` as it stands (it must contain
`merge(songs-w21-camera)`). Size L. W21 built the floor and addendum items
6, 7 and 9 of `plans/tasks/songs/W21-CAMERA.md`, and stopped cleanly. Read
that brief's addendum, W21's six commit bodies
(`git log songs-w21-camera -7 --format=%B`) and `plans/SONGS.md` A10 first.
In priority order; one commit per item; stop cleanly at a boundary.

1. **The review must be usable at the minimum window** (W21's finding, not
   the camera's fault): at 480×780 the stage's header and strip leave the
   review a 139 px panel with a 15 px body, so nothing — the coach's own
   sentence included — is above the fold. While a review is showing, the
   strip collapses to a single row (or the review takes the strip's room
   too), and the layout test W21 had to skip at that size asserts the
   sentence, the action button and, when there is one, the picture's top
   are on screen. Do this first; everything below lives in that frame.
2. **Save as a video** (addendum 12 — the growth loop: every shared clip
   shows Yames). Composite on a canvas while the take plays back: the
   picture, the scrolling coloured excerpt, bar / section / tempo, a small
   Yames mark; `canvas.captureStream()` for the picture and a
   `MediaStreamAudioDestinationNode` fed by the take's MIX for the sound;
   `MediaRecorder` to one file — mp4 (H.264 + AAC) where the webview can,
   WebM otherwise, and tell the player which they got and that some sites
   only take mp4. Choose the bars (defaults to the selection), 16:9 or
   9:16, marks on or off. Real time, with a progress ring and cancel; saved
   through a Rust save dialog (the webview cannot write where it likes),
   streamed as raw bytes like the recording. Nothing is uploaded. Works for
   a take with NO picture too: the excerpt and the marks over a plain
   ground — a player without a camera still gets something to share.
3. **Then and now** (addendum 11). Two takes of the same bars side by side,
   locked to BAR POSITIONS not seconds (their tempos may differ: drive each
   from its own clock and re-sync at every bar line), each with its own
   tape; the catalogue's `compare` block gets its real component; an
   `improved` finding offers "See the difference". Picks the earliest take
   of those bars with a picture (or sound only) against the latest.
4. **Takes look like takes** (addendum 10). A thumbnail grabbed at the
   first downbeat, stored as a small JPEG beside the take and deleted with
   it; bars, tempo, passes, score and date on each row; a "with picture"
   filter; the popover stays ≤ 320 px wide (`useMenuPlacement`'s cap).
5. **Hands on the instrument** (addendum 13). Dispatcher actions for
   record/stop the take and camera on/off, view-aware like W18's portion
   actions, bindable to keys and a MIDI footswitch, with
   `settings.hotkeys.actions/descs` in all 15 locales (W24 is sweeping the
   untranslated ones W18 left; translate yours).
6. **The review's sound follows the player's chosen output.** W21 plays a
   take in the review through an `<audio>` element (the engine's
   `play_take` cannot seek, loop, change rate or report position), so it
   comes out of the SYSTEM default device, not the output chosen in
   settings. Use `setSinkId` with the chosen device where the webview
   supports it and the labels can be matched; where it cannot, say once in
   the review which speaker it is using.

Everything W21's brief says about testing without a camera, raw-byte IPC,
the microphone (never), uploads (never), locale keys appended at the END
of their namespace with the forms each language's plural rules need, and
the fake-device Playwright flags still holds.

## Gates

build, vitest, layout (Ember, Ivory, Manuscript at 480, 1100 and 1400),
`npm run test:rust`. Report the main bundle before and after: the
compositor and the compare view belong in the review's lazy chunk.
