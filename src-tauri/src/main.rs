#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// Counts allocations inside the output callback for the in-app click probe
/// (`app_probe`). Only in a build with `--features callback-probe-alloc`; the
/// shipping app has no global allocator of its own.
#[cfg(feature = "callback-probe-alloc")]
#[global_allocator]
static ALLOCATOR: yames_lib::alloc_probe::CountingAlloc = yames_lib::alloc_probe::CountingAlloc;

fn main() {
    yames_lib::run();
}
