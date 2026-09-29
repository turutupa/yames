# W38 — audio path fixes before Songs reaches main

Read `CLAUDE.md`, `AGENTS.md` (the audio-safety gate and the latency tiers),
then `BRIEF.md` in this folder. Branch `songs-w38-audio-fixes` from
`songs-v1`. Nothing on the output or loopback callback may allocate, free,
lock (other than the existing `try_lock`s), block, log or do I/O — the
review found the callback clean; keep it that way.

## 1. BLOCKER — the song goes silent after a seek (`synth.rs`)

`SynthRing::ready` (~283-293), `drained_for` (~357-360), `begin` (~363).
Sequence: the renderer reads the epoch, starts rendering a chunk; a seek
bumps the epoch; the callback sees `drained != epoch`, sets `read = write`,
`drained = epoch`; the renderer then `push`es its old chunk, so
`write > read`. From then on `drained_for` is false forever (it needs
`read >= write`), the renderer parks and retries; the callback never drains
again (`drained == epoch`) and `ready` returns 0 because `live != epoch`.
The file's parts (every guitar) stay silent until the next seek or a
Stop/Play. Likely whenever the renderer is busy; clicking along the tab
makes it likelier.

Fix so that stale frames pushed after a drain can never wedge the ring and
can never be played (either keep discarding `read = write` while
`live != epoch`, or drop the `read >= write` condition and let `begin` /
`ready`'s skip-forward handle it — your call, argue it in the commit). Test:
drive the ring by hand through exactly that interleaving (drain, stale
push, then the renderer's next loop) and assert frames flow again for the
new epoch and none of the stale chunk is offered.

Then close the probe's blind spot: `click-jitter-probe.rs` ~1485-1535 seeks
but never checks synth frames come back afterwards. Make it count synth
frames mixed after each seek and fail (exit 1) if a seek is followed by a
run of silence longer than, say, 100 ms of audio while the song has notes
there. Run it once (`--song-loop` or whatever drives seeks) to prove it
works; the timing numbers do not matter on a busy machine.

## 2. SHOULD-FIX — changing audio device mid-song (`engine.rs`, `commands.rs`)

`engine.rs` ~5342-5364, `commands.rs` ~3574-3582, frontend
`useSongEngine.ts` ~388.
(a) The reload after `song-dropped` reads `output_sample_rate()` before the
new stream thread stores its rate, so the song and synth are rebuilt at the
old device's rate (48k→44.1k plays ~9 % sharp and fast), and the frontend
refuses another reload for 4 s. Fix: clear the stored rate in `shutdown`
(set to 0) so `jam_rate` probes the new device — or make the reload wait
for the new rate; whichever is smaller and cannot block the callback.
(b) `playing` is carried across the device change with no song loaded, so
the plain metronome plays (and logs beats) until the reload lands, then the
song restarts with a count-in under a running transport. Fix: do not carry
`was_playing` across when a song was dropped.
Tests for both at the engine level, without a real device if the existing
headless helpers allow.

## 3. SHOULD-FIX — a seek left pending across Stop (`engine.rs` ~6682-6698)

`take_seek` only runs on the playing path. A seek posted as playback stops
survives; on the next Play `song_from_the_top!` (~6553) runs, then the old
seek applies, sets `song_counting_in = false`: no count-in, and playback
starts at the old spot, not the playhead on screen. Fix: discard
`take_seek()` on the stopped path and clear `seek` in `SongHandoff::set`.
Test it.

## 4. SHOULD-FIX (low) — the synth thread outlives its song

`engine.rs` ~5343, `commands.rs` ~3694. `SynthPlayer` is only replaced by
`load_song` / `clear_song`; `song-dropped` (device change, a jam taking
over) never clears it, so its thread wakes every 2 ms for the rest of the
session beside a running jam. Drop / stop the player wherever the song is
taken away. Test: after each of those paths the renderer thread has
stopped.

## 5. NOTE — the pick attack lost after every seek (`synth.rs` ~303-315)

The renderer cannot start until the callback has drained, and the next
buffer skips forward, so the first 10–20 ms at the landing point (the
attack) is never heard. The comment at `commands.rs` ~3796-3803 says the
ring "already has its lead" — false for a song installed while stopped.
Fix the comment. If, after item 1, there is a small fix inside `synth.rs`
that keeps the attack (e.g. `begin` anchoring the stream at the seek target
rather than one buffer later) and keeps the callback as it is, do it with a
test; if it needs more than that, stop and describe it instead.

## 6. NOTE — capture lifetime and window-thread work (`take.rs`, `commands.rs`)

- When the take writer ends a take itself (length cap `take.rs` ~1706, rate
  change ~2097), the "everything this computer plays" capture stays open
  until the user presses Stop. Close it when the take ends. Test it.
- `check_take_sound` (`commands.rs` ~4464: 200 ms sleep + device open/close)
  and the capture open in `start_take` run on the window's thread. Make
  them `async` / `spawn_blocking` so the UI never freezes on them.
- A same-rate device change is missed by a loopback take (keeps recording
  the old device, no band). Report what the fix would be; implement only if
  it is small and inside `loopback.rs`/`take.rs`.

Stop and report if any item turns out to need more than its files, or if
item 1's fix cannot be proven by a hand-driven test.
