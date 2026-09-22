# W3 — The beat queue: nothing allocates where the click lives

Branch `songs-w3-queue`. Size S–M. Your spec is
`plans/tasks/phase-0/T06b-callback-queue.md`, written 2026-09-02 and
carried since. Read it whole, then read this, because two things have
changed.

## What has changed since that brief

1. **Jam landed.** `engine.rs` is far larger than when T06b was written:
   the output callback now also hands rings and tables across with
   generation counters and retires `Arc`s off the audio thread
   (`take.rs`, the jam table). Audit the WHOLE callback for allocation,
   locking and blocking as it stands today, not just the one channel the
   old brief names. List every finding in your report even if you fix
   only the channel.
2. **A dropped `BeatNotification` is not cosmetic.** `beat_log` is the
   `TimingAnalyzer`'s only source of where beats fell, so dropping one
   degrades the player's score (learned 2026-09-04, recorded in the code).
   The old brief's "on a full queue, drop and count" stays as the
   mechanism of last resort, but size the queue so that it cannot happen
   in practice (seconds of headroom at 300 BPM sextuplets), make the
   probe FAIL on any non-zero `dropped_notifications`, and surface the
   counter in diagnostics.

## Also

The probe measures callback entry-to-entry gaps, so it cannot see an
in-callback stall or an allocation. Add what it takes to see them in the
probe build only: a counting global allocator armed for the callback
thread (assert zero allocations over the run) is the honest gate for the
AGENTS.md rule. Decide, with numbers, whether the event loop's real-time
promotion stays; the old brief explains why it is suspect.

## Gates

The T06b brief's, plus: zero allocations on the callback thread over a
60 s probe run with a jam playing and a take recording; zero dropped
notifications; `npm run test:rust` green. Run the probe with the machine
otherwise idle and say what else was running.

## Not yours

Scoring, the store, anything in `src/`. After you, `engine.rs` goes to the
worker who gives the engine a tempo map and imported-track playback;
leave them a note on what in the callback must not be touched.
