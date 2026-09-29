# W15 — Live and exact: a verdict per note as it is played, and a take that knows when it began

Branch `songs-w15-live-exact`, from `songs-v1`. Size M–L. Rust first
(`timing.rs`, `score.rs`, `take.rs`, `engine.rs` read-mostly, `commands.rs`,
`lib.rs`), then the two small frontend hooks that consume it. You are the
only worker in these files. Read AGENTS.md's "What in the output callback
must not be touched" before opening `engine.rs`.

## 1. A live verdict per expected note (`SONGS.md` A7)

Today the notes light from `beat-feedback`: one verdict per beat, smeared
across the attacks inside it. Exact on quarters, a smear on sixteenths, and
corrected only when the player stops. With a `ScoreSchedule` loaded the
analyzer already knows which expected onset each played onset matched —
emit it as it happens: a `score-onset` event `{ id, pass, state,
deviationMs }` from the analyzer's own thread (never the audio callback),
provisional by nature (the banded alignment can still revise the last
bar), rate-limited to what is useful on screen, and absent entirely when
no schedule is loaded. The end-of-attempt results stay the authority.
`useLiveNoteLights` takes the event when it exists and falls back to
`beat-feedback` when it does not. **Gate:** a live-path test (the real
analyzer thread, as W11's tests drive it) showing sixteenths each get
their own verdict within one beat of being played; free play emits none;
the final results are unchanged by the event existing.

## 2. A take that knows when it began (W14's stated gap)

Pitch needs the instant the analysed buffer starts, relative to the song's
transport. W14 measures it from the frontend with `performance.now()`
either side of `start_take`, which is tens of milliseconds optimistic. The
writer thread knows exactly: it takes the band as its clock and begins on
the first chunk after the ring hand-over. Record, in the take's sidecar,
the transport position (song bar, tick and pass, or jam bar) of the first
sample written, captured on the writer side from what the callback already
publishes — **nothing new on the callback's hot path beyond a relaxed
store of values it already has**, and the probe re-run to prove it
(`--song-loop --song-take` and `--jam-swap --jam-move --jam-take`: zero
allocations, frees and dropped notifications). `useSongTakePitch` reads
the sidecar's position and drops the `performance.now()` estimate, keeping
it only as the fallback for takes recorded before this. **Gate:** an
offline render test placing a click at a known tick and asserting the
sidecar's position puts it within one output buffer of where it is in the
file.

## 3. If there is road left

A song that survives a device change: today `set_device` drops the song
and the frontend reloads once. Re-send the compiled transport the way a
jam re-sends its bar, so playback resumes at the next bar line.

## Gates

`npm run test:rust`, `test:dsp`, `test:highbpm`, build, vitest. No golden
moves; say so explicitly.
