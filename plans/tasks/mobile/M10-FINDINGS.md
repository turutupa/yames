# M10 findings — 2026-09-20, the band on a phone's memory

> Branch `mob/m10-band-memory`, from the tip of `mobile`. Every number below
> is the **R8-minified signed release APK on the `yames_phone` AVD** (Pixel 6,
> API 34, x86_64), `adb shell dumpsys meminfo com.yames.metronome`, the same
> instrument M08 used. The machine was carrying other workers throughout, so
> the timings are relative, not absolute; the memory numbers are not.

---

## The table M08 made, made again

M08's "before" is the first two rows, from `M08-JAM-GAPS.md`. The rest is
this branch. The jam library is the shipped starter set — over forty jams —
on both sides.

| Moment | Native heap | Total PSS |
|---|---|---|
| **Before (M08)** — 6 s in, before the library warms | 22.7 MB | 87.5 MB |
| **Before (M08)** — 26 s in, after the library warm | **364.7 MB** | **455.4 MB** |
| **After** — 6 s after launch | 27.4 MB | 79.2 MB |
| **After** — 30 s in, metronome tab, Jam never opened | **27.2 MB** | **81.6 MB** |
| **After** — Jam tab, one jam loaded, stopped | 150.3 MB | 225.1 MB |
| **After** — the band playing | 179.9 MB | 255.6 MB |
| **After** — a second jam loaded, a different kit | 179.3 MB | 260.3 MB |
| **After** — five minutes of the band, the last two screen-off | 180.1 MB | 258.7 MB |
| **After** — put down, 38 s, the band let go | **26.3 MB** | **93.9 MB** |
| **After** — put down, 2 min 38 s | 26.3 MB | 94.5 MB |
| **After** — picked up again, the band re-sent | 146.0 MB | 213.9 MB |

The gate row — 30 s on the metronome tab without ever opening Jam — is
**81.6 MB PSS against a ~110 MB ceiling**, and it is what a musician who
opened the app for a metronome now pays: nothing for the band.

Five minutes of the band costs 25 kB, which is nothing. M08's reading that
playing leaks nothing still holds.

## What the numbers are made of

Two costs are worth naming, because neither is the band and both look like it:

* **The first Play costs 34 MB, band or no band.** The plain metronome on the
  metronome tab: 27.3 MB native stopped, **61.3 MB after the first Play**, and
  it stays after Stop. That is the click's own `SoundBank`, decoded at the
  device's rate when the transport first starts. It is the whole of the
  difference between the "one jam loaded" row and the "band playing" row.
* **The first-run wizard's demo click** puts the app at 61 MB / 115 MB while
  the wizard is up, for the same reason. It is gone on the next launch.

So **one loaded jam is 122 MB** (150.3 − 27.3), and the drum kit is between a
few MB and 53 MB of it depending on which kit: with Raw the whole app sits at
142.8 MB, with Studio at 195.2 MB. The rest is the percussion set and the
recorded bass and keys.

## How long a decode takes

Measured from the tap to the loading spinner coming down, on the release
build:

| Kit | Cold decode |
|---|---|
| Club (stereo, 39 MB) | 587 ms / 831 ms |
| Studio (stereo, 39 MB) | 365 ms / 397 ms |
| Raw, Room, Brushes (mono sources) | under 150 ms — no spinner ever appears |

`JAM_LOADING_AFTER_MS` is 150 ms, so the small kits finish before the spinner
is due and the musician sees nothing at all. The two big kits are well over
it, and the spinner the setup sheet already draws on the row you touched goes
up at ~180–210 ms and comes down when the band is back. **A spinner is needed
and the app already has one**; no new UI was added.

Once warm, `set_playing` returns in **6–10 ms**.

## Play pressed before the band is ready

From a cold cache, tapping Jam and pressing Play 172 ms later: the transport
takes (`Stop` on screen by +500 ms), **the click plays on its own**, the
spinner is up from about a second to somewhere under four, and the band joins
when the table lands. Nothing in the log, no freeze.

That is the desktop's behaviour unchanged, and the rule is in
`jam::swap_defers`: a table arriving when **no table is loaded** applies
immediately rather than waiting for a bar line — "a band held back from a bar
that never comes is a band that never arrives". So the race resolves the same
way on both platforms; a phone just meets it more often, because a phone no
longer warms the library at launch.

## Where the frees happen, and why none is on the audio thread

Three owners let go of a band, and all three do it on a thread that is
allowed to:

1. **The command thread**, in `JamHandoff::set` — assigning the slot drops
   the table the command side was holding.
2. **The command thread again**, in `drain_retired` — the audio thread never
   drops a table it has been told to stop reading; it hands it back through
   the retirement slot (`JamRetirement::retire`) and the command side frees
   it. `JamHandoff::set` drains on its way in, so while the band is playing
   that is one bar away. **Stopped, the next send may never come** — that was
   a real leak on a phone (loading a second jam kept the first band, 150 MB)
   and `commands::schedule_retired_drain` now frees it a fifth of a second
   later on a thread of its own, mobile only.
3. **A blocking thread**, in `release_jam_sounds` — the table first, then a
   wait for the callback to hand its copy back, then the two caches.

Proved rather than read off the source: `click-jitter-probe` now installs a
counting `#[global_allocator]` and the engine enters an `AllocScope` for the
length of each callback **only when a `CallbackProbe` exists**, which is never
in a shipping build. Over `--jam-swap` — the table replaced from another
thread 176 times while the stream ran — the run reported:

```
--- allocator, inside the callback ---
allocations       32
frees             0
--- gate (ROADMAP §4) ---
p99 < 1.00 ms      PASS      (p50 0.107, p95 0.191, p99 0.223, max 0.625 ms)
missed beats = 0  PASS
callback frees=0  PASS
```

**Zero frees**, and 176 table swaps produced none of them. The 32 allocations
are pre-existing and are not the band: they scale with the TICK count and not
with time or with swaps (50 ticks → 2, 400 ticks → 14, 960 ticks → 32–33,
i.e. one per ~31 ticks), which is `std::sync::mpsc`'s block allocation on the
beat notification the callback posts to the event thread. Freed on the
receiving thread, which is why the free counter stays at zero.

## Two bugs found while measuring

* **A phone decoded the whole band twice.** `probe_output_rate` — the "ask the
  device what it will open at so the first build is the one that plays" fix
  from 932c32b — still asked **cpal**, and a phone's output has not gone
  through cpal since M04. So a jam opened before Play was built at cpal's
  44 100 and the first Play built all of it again at the Oboe stream's 48 000:
  134 MB → 245 MB on pressing Play, for a band nobody had changed. Fixed;
  a phone asks Oboe, once per session.
* **Loading a second jam kept the first band.** See (2) above.

## Item 4 — one loaded jam is still 122 MB. What would be next

Not done here, as the brief says; this is the proposal, with numbers.

1. **Store the decoded samples as `i16`, convert in the voice.** Exactly half
   of every buffer: 122 MB → ~61 MB for a loaded jam, and the same halving on
   every kit and voice in the caches. The mixer already multiplies each sample
   by a gain, so the added work is one `i16 as f32` before a multiply that is
   already there — but it IS a change to the audio callback and would need the
   jitter gate and the new free/alloc counters re-run, plus a decision about
   where the scale lives (`KitBank` and `MelodicBank` would carry it).
   Lossless for the shipped content, which is 16-bit FLAC to begin with.
2. **Keep mono sources mono.** Five of the seven shipped kits declare
   `"channels": 1` in their manifest (brushes, electronic, raw, room, tight);
   `kit::decode_capped` writes each sample to **both** sides, so those five
   are stored at exactly twice the size they carry information. The mixer
   already has a per-drum `pan`, so a mono buffer with a pan is the same
   sound for half the bytes. Club and Studio are genuinely 2-channel and
   would not change — which is why this is second: it does not touch the two
   39 MB kits, and it does not touch the voices, which are already mono.
3. **Shorter tails**, last and smallest: the decode cap trims a cymbal's wash,
   and it is the longest buffer in a kit. Audible, so it needs an ear.

Do 1, then 2. 1 alone brings a loaded jam under 70 MB.

## The desktop, untouched

* `IS_MOBILE` is false, so Rollup folds every mobile branch out: `dist/` from
  a plain `npm run build` contains no `release_jam_sounds`, no `memory_trim`
  and no `bandMemory.ts` (grepped — 0 occurrences; the `YAMES_MOBILE=1`
  bundle has 1 each).
* The Rust budget, the release command's body, the retirement drain and the
  Oboe rate probe are all `cfg(mobile)` / `cfg(target_os = "android")`. The
  desktop `probe_output_rate` still asks cpal, which is what it plays through.
* Every desktop gate green on the final tree: `npm run build`, 4 425 frontend
  tests, 622 Rust tests, `test:dsp`, `test:highbpm`, 29 layout tests, and the
  jitter probe above.

## Two things a later brief may want

* **The desktop would benefit from the same launch warm being narrower.** A
  fifty-jam library on an 8 GB laptop pays 342 MB two and a half seconds after
  launch for jams nobody opened. Not done — the brief says say so and stop.
* **The `.apk mmap` line is 27–46 MB of PSS on its own.** The APK is 44.7 MB
  because it carries 29.6 MiB of FLAC. Nothing to do about it here, but it is
  a third of the "metronome tab" PSS figure and worth knowing before anyone
  reads 81.6 MB as "the app's own memory".
