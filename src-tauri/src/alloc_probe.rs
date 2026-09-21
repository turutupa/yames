//! Audio-safety gate — the allocation probe.
//!
//! The click-jitter probe measures whether the output callback was LATE. This
//! measures whether it did the one thing that makes it late: talk to the
//! allocator. A `malloc` can take a lock, walk a free list, or ask the kernel
//! for a page, and none of those has a bound the audio thread can afford.
//!
//! **`free` is the one that matters here.** The callback holds the band —
//! `Arc<JamTable>`, and inside it the decoded drums, bass and keys, which on
//! a phone is tens of megabytes. Dropping the last `Arc` to that frees every
//! buffer in it, and the whole handoff in `engine.rs` exists so that the drop
//! happens on the command thread instead: the callback hands a replaced table
//! back through [`crate::engine`]'s retirement slot and never lets go of it
//! itself. M10 made that matter more — a phone now takes the band away and
//! clears the caches when the app has been out of sight and stopped — so it
//! is measured rather than read off the source.
//!
//! ## How it works
//!
//! Three pieces, and only the probe binary has all three:
//!
//! 1. A thread-local flag, set for the length of one callback by
//!    [`AllocScope`]. The engine enters one only when it was built with a
//!    [`crate::engine::CallbackProbe`] — `None` in the app, which is the same
//!    null check the timing probe already costs and nothing more.
//! 2. `note_alloc` / `note_free`, called by a counting `#[global_allocator]`
//!    that lives in `src/bin/click-jitter-probe.rs`. A binary with no such
//!    allocator never calls them at all.
//! 3. Two process-wide counters, read after the stream is torn down.
//!
//! The flag is a `const`-initialised `Cell`, which is what makes it safe to
//! read from inside the allocator: it neither allocates on first touch nor
//! registers a destructor, so there is no way for the counting to recurse
//! into itself. `try_with` rather than `with` for the same care at the other
//! end, during thread teardown.

use std::cell::Cell;
use std::sync::atomic::{AtomicU64, Ordering};

thread_local! {
    /// Is this thread inside an output callback right now?
    static INSIDE_CALLBACK: Cell<bool> = const { Cell::new(false) };
}

/// Allocations made inside an output callback since the process started.
pub static CALLBACK_ALLOCS: AtomicU64 = AtomicU64::new(0);

/// Frees made inside an output callback. **The gate: this must stay zero.**
pub static CALLBACK_FREES: AtomicU64 = AtomicU64::new(0);

#[inline]
fn inside() -> bool {
    INSIDE_CALLBACK.try_with(Cell::get).unwrap_or(false)
}

/// Called by the probe binary's global allocator, before it allocates.
#[inline]
pub fn note_alloc() {
    if inside() {
        CALLBACK_ALLOCS.fetch_add(1, Ordering::Relaxed);
    }
}

/// Called by the probe binary's global allocator, before it frees.
#[inline]
pub fn note_free() {
    if inside() {
        CALLBACK_FREES.fetch_add(1, Ordering::Relaxed);
    }
}

/// What the counters say. `(allocs, frees)`.
pub fn callback_allocations() -> (u64, u64) {
    (
        CALLBACK_ALLOCS.load(Ordering::Relaxed),
        CALLBACK_FREES.load(Ordering::Relaxed),
    )
}

/// "Everything this thread allocates or frees from here until I go out of
/// scope belongs to the audio callback."
///
/// RAII rather than a pair of calls because the callback body has more than
/// one way out, and a flag left set would attribute the next thing this
/// thread does — which is nothing, but a probe that can lie is not a probe.
pub struct AllocScope(());

impl AllocScope {
    /// Only the engine calls this, and only when a `CallbackProbe` exists.
    pub(crate) fn enter() -> Self {
        INSIDE_CALLBACK.with(|c| c.set(true));
        AllocScope(())
    }
}

impl Drop for AllocScope {
    fn drop(&mut self) {
        // `with` cannot fail here: the scope was created on this same thread
        // and a `Cell<bool>` has no destructor to have run in between.
        let _ = INSIDE_CALLBACK.try_with(|c| c.set(false));
    }
}
