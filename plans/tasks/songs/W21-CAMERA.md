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
