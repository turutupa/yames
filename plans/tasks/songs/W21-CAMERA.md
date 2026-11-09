# W21 — The camera: record yourself playing the pass, and watch it back beside the notes

Branch `songs-w21-camera`, from `songs-v1`. Size L. Owner's decisions:
`plans/SONGS.md` A9 (video is in, Songs only for the first iteration, and
the review must work exactly the same with sound alone so the camera never
blocks a release) and A10 (the proposed default for what a video is on
disk, which this task adopts), `plans/ECHORA.md` E0.7 (seeing yourself play
is the reward; the review shows your take with the notes coloured beside
it). Nothing is uploaded, ever; this is a local recording under the take's
own opt-in.

**W18 is rebuilding the Songs stage and moving the review into the tab's
frame right now; W19 is adding the import offer and the library's recent
order.** Build everything in NEW files and leave the mounting to a handful
of clearly marked lines, listed in your report: `src/songs/camera/**`
(model and hooks), `src/containers/songs/camera/**` (components), Rust in
`src-tauri/src/take_video.rs` (new) plus sidecar fields in `take.rs` and
registration lines. If a shared file has moved under you when you finish,
`git merge songs-v1` and re-mount.

## What to build

1. **Camera on, by choice.** A camera switch beside the record control
   (W14's, in `src/containers/songs/`): off by default, per song like
   takes. First use shows the same kind of plain promise Jam's takes intro
   does — what is recorded, where it is kept, that nothing leaves the
   machine, how to delete it (reuse the takes wording where it fits; the
   audience rule in `plans/WEBSITE_DECISIONS.md` applies). A device picker
   when there is more than one camera, a small mirrored preview on the
   stage while armed, resolution capped (720p, 30 fps) so a laptop does
   not cook while the engine is playing.
2. **Recording.** `getUserMedia({ video })` — **video only; the webview
   never opens the microphone**, the sound is the engine's take (mix and
   dry stem), which is already sample-exact. `MediaRecorder` with the best
   supported of `video/mp4;codecs=avc1`, `video/webm;codecs=vp9`, `vp8`
   (WebView2 is Chromium, WKWebView wants mp4, WebKitGTK varies: detect, do
   not assume), timeslice chunks streamed to disk through Rust commands
   (`take_video_begin` / `take_video_append` / `take_video_finish` /
   `take_video_discard`) so a long take never sits in memory. The file
   lives beside the take (`<takeId>.video.<ext>`), is listed, sized and
   deleted with it, and is refused as an addressable take id exactly as
   the dry stem is. Starts with the take, stops with it; a camera that
   fails mid-take costs the picture, never the take.
3. **Lining the picture up with the sound** (A10). The take's sidecar now
   knows the transport position of its first sample (W15). Record when the
   first video frame was captured on the webview's clock, and map that
   clock to the transport with the beat events the webview already
   receives (song bar/tick/pass with their arrival times; fit a line, do
   not trust one event). Store `videoOffsetMs` in the sidecar. It will be
   good to a few tens of milliseconds and no better — so the review has a
   **nudge** ("picture earlier / later", 10 ms steps, remembered per
   camera), and a **clap to line up** helper is left documented for the
   owner's hardware session (spike K3): this task cannot measure a real
   camera's latency and must not pretend to.
4. **Watching it back.** In the review, when the take has a picture: the
   video beside the coloured excerpt, playing the take's MIX through the
   existing take playback with the picture slaved to it (seek the video to
   the audio's clock plus the offset; never play the video's own audio,
   it has none), a moving mark on the excerpt following playback, loop the
   reviewed bars, half speed (pitch-preserved if the platform gives it,
   otherwise say so), and the pass stepper choosing which pass plays. With
   no picture the review is exactly what it is today. Build it as a
   `take`-block slot component for the coach's catalogue
   (`src/coach/blocks/slots.tsx`) as well, so "play that back" works from
   a block.
5. **Platforms.** WebView2 asks permission per origin: handle the
   permission request so the prompt is ours and appears once. macOS needs
   `NSCameraUsageDescription` in the bundle's Info.plist. WebKitGTK needs
   media stream enabled and may lack `MediaRecorder` for video entirely:
   detect and hide the switch with a sentence, do not crash. Tauri
   capabilities/CSP as needed. Say in the report what you could verify on
   this Windows machine and what is reasoning about the other two.

## Addendum, 2026-09-20 — the owner: "make it very very cool and very well integrated"

Items 1–5 above are the floor. This is what makes it the feature people
show a friend. It is the player watching their own hands with a teacher's
marks on the tape, so every idea below ties the picture to what Yames
already knows about the pass. In priority order; stop cleanly at a
boundary and say where.

6. **The tape has the verdict painted on it.** Under the video, a
   timeline the width of the take: every expected note a tick in its
   verdict's colour and glyph (the review's own `marks.ts`), extras
   between them, bar lines and section names above, passes separated.
   Click or drag to scrub; **"next slip" / "previous slip"** jumps the
   picture to half a bar before each mistake; hovering a tick shows the
   note and how early or late. The coloured excerpt beside the video has
   a moving mark and the note being played lifts as it passes. Picture,
   excerpt and timeline are one clock.
7. **The coach points at the tape.** The verdict's button row gains
   "Watch it" when the attempt has a picture: it plays the finding's
   bars, looped, at 70 %, with the offending notes marked — a teacher
   rewinding to the spot. Implement it as the catalogue's `take` block
   (bars + attempt id) so any future answer can do the same.
8. **Selecting bars selects the tape.** The portion selected on the
   excerpt (W18's selection model, the same one the tab uses) is the
   loop of the video. Half speed and 70 % keep pitch where the platform
   allows (`preservesPitch`), and say so where it does not.
9. **While recording it feels like a studio, not a webcam test.** The
   preview is small, mirrored, draggable to any corner of the stage and
   remembered; when the transport runs it shrinks to a quiet red ring
   with the elapsed time so the player looks at the tab, not themselves;
   the count-in shows on it. A one-time framing guide (a faint neck-shaped
   outline: "get both hands in") with a left-handed flip. The camera is
   opened only while armed and released the moment it is not; the app
   says "camera on" in words wherever the system's own light might not
   be visible.
10. **Takes look like takes.** Each take row under the song shows a
   thumbnail (a frame grabbed at the first downbeat, stored as a small
   JPEG beside the take), its bars, tempo, passes, the attempt's score
   and date; a filter for "with picture"; delete removes picture, mix,
   dry stem, thumbnail and sidecar together.
11. **Then and now.** Two takes of the same bars side by side, locked to
   the same bar positions (not the same seconds: the tempos may differ),
   each with its own timeline — the catalogue's `compare` block gets its
   real component, and an `improved` finding offers "See the
   difference". This is the single-player progress reel from
   `plans/ECHORA.md` A2 and needs no server.
12. **A take you can send to someone** (`plans/ECHORA.md` D4, and the
   growth loop: every shared clip shows Yames). "Save as a video":
   composite, in the webview, the picture + the scrolling coloured
   excerpt + bar, chord or section and tempo + a small Yames mark onto a
   canvas while the take plays back; `canvas.captureStream()` for the
   picture and a `MediaStreamAudioDestinationNode` fed by the take's MIX
   for the sound; `MediaRecorder` to one ordinary file (mp4/H.264+AAC
   where the webview can, WebM otherwise, and say which the player got
   and that some sites only take mp4); saved through a Rust save dialog.
   No encoder dependency, no licence question, real-time (a 40-second
   take takes 40 seconds, with a progress ring and cancel). Choose the
   bars, 16:9 or 9:16, with or without the marks. Nothing is uploaded:
   the player saves a file and decides where it goes.
13. **Hands on the instrument.** Actions in `useActionDispatcher` for
   record/stop the take and camera on/off, bindable to a footswitch;
   a recording can be started from the count-in without touching the
   mouse.

Engineering notes that matter here: send chunks to Rust as raw bytes
(Tauri's binary IPC body), never base64 of a video stream; write through
a buffered file on a thread that is not the UI's; throttle the preview
to 15 fps while the transport runs; measure dropped frames and encoder
time with the fake device and report them; and re-run the layout suite —
the review with a picture must fit the same frame W18 gives the review,
at the minimum window size, without a scroll.

## Testing without a camera or a person

Chromium's fake device (`--use-fake-device-for-media-stream
--use-fake-ui-for-media-stream`) gives Playwright a synthetic camera: use
it for a harness scene that arms the camera, records three seconds,
finishes, and shows the review with a picture. Vitest with a mocked
`MediaRecorder` for the chunking, the failure paths and the offset fit
(synthetic beat events with jitter: the fitted offset must be within 5 ms
of the truth). Rust tests for the file commands in a temp directory:
appends in order, discard leaves nothing, delete takes the video with the
take, a path outside the takes directory is refused.

## Gates

build, vitest, layout (the armed stage and the review with a picture, at
the minimum window size, in Ember, Ivory and Manuscript), `npm run
test:rust`. The jitter probe is not needed if nothing on the engine's
threads changed — say so explicitly. Bundle: the camera code is lazy with
the rest of Songs; report the main bundle before and after.

## Not yours

The stage layout and the review's placement (W18), import and library
order (W19), any upload or sharing, the microphone.
