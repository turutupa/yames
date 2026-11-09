//! Where the cpal output callback says "I am the audio thread, and I am
//! inside the part of it that may not allocate".
//!
//! ROADMAP §1 principle 1 and AGENTS.md both say nothing on the callback may
//! allocate, lock or block. Until now that was a rule enforced by reading:
//! `click-jitter-probe` measures callback ENTRY-TO-ENTRY gaps, so a `malloc`
//! inside a buffer is invisible to it unless it is slow enough to push the
//! next callback late — and the allocator is fast on a warm heap, which is
//! exactly when a rule stops being tested.
//!
//! This is the half of the gate that lives in the library: a thread-local
//! flag the callback raises on the way in and lowers on the way out.
//! `click-jitter-probe` installs a counting `#[global_allocator]` that reads
//! it and counts every allocation and every free made while it is up, and
//! fails the run on any. The app installs no such allocator, so in a shipping
//! build this whole module is one `Cell<bool>` that is never read.
//!
//! **The span, not the thread.** cpal's WASAPI/CoreAudio stream thread does
//! work of its own around each callback, and a `malloc` in the backend is not
//! a Yames defect and must not be reported as one. So the flag covers the
//! body of our closure and nothing else: [`Span::new`] on entry, `Drop` on
//! every exit, including the three early `return`s.
//!
//! Nothing here costs the app anything. The callback only builds a `Span`
//! when `MetronomeEngine::new_with_probe` gave it a `CallbackProbe`, which is
//! `None` everywhere but the probe.

use std::cell::Cell;

thread_local! {
    /// Raised for the span of the output callback body, on the audio thread
    /// and nowhere else.
    ///
    /// `const` initialised and holding a type with no destructor, so this is
    /// a plain `#[thread_local]` slot: reading it allocates nothing and runs
    /// no lazy initialiser, which it must not, because the reader is the
    /// allocator itself.
    static IN_CALLBACK: Cell<bool> = const { Cell::new(false) };
}

/// Is the calling thread inside the output callback right now?
///
/// Called from a `GlobalAlloc`, so it must never allocate and never recurse.
/// `try_with` rather than `with` because a thread tearing down is allowed to
/// allocate and must get `false` rather than a panic.
#[inline]
pub fn in_callback() -> bool {
    IN_CALLBACK.try_with(Cell::get).unwrap_or(false)
}

/// Raises the flag for as long as it is alive.
///
/// Built once per buffer by the probe-built callback and dropped at every
/// exit from it. Not `Send` (a `Cell` is not `Sync`, and this is a claim
/// about one thread anyway), which is what stops it being parked somewhere
/// and leaving the flag up.
pub struct Span {
    _not_send: std::marker::PhantomData<*const ()>,
}

impl Span {
    /// Enter the span. One thread-local store.
    #[inline]
    pub fn new() -> Self {
        IN_CALLBACK.with(|f| f.set(true));
        Self {
            _not_send: std::marker::PhantomData,
        }
    }
}

impl Drop for Span {
    #[inline]
    fn drop(&mut self) {
        IN_CALLBACK.with(|f| f.set(false));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_thread_that_has_never_been_a_callback_is_not_one() {
        assert!(!in_callback());
    }

    #[test]
    fn the_span_covers_itself_and_nothing_after_it() {
        assert!(!in_callback());
        {
            let _span = Span::new();
            assert!(in_callback(), "inside the callback body");
        }
        assert!(!in_callback(), "and lowered on the way out");
    }

    #[test]
    fn the_flag_belongs_to_one_thread() {
        let _span = Span::new();
        assert!(in_callback());
        // Another thread is not the audio thread, whatever this one is doing.
        let elsewhere = std::thread::spawn(|| in_callback()).join().unwrap();
        assert!(!elsewhere);
    }
}
