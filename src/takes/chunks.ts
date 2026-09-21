/**
 * The pipe from `MediaRecorder` to the disk.
 *
 * `MediaRecorder` hands over a `Blob` every timeslice and does not wait for
 * anybody. Three things follow, and this file is all three:
 *
 * 1. **Nothing is held.** A chunk crosses to Rust as soon as it can and is
 *    forgotten, so a twenty-minute take is a flat few hundred kilobytes of
 *    renderer memory rather than a few hundred megabytes of it.
 * 2. **Nothing overtakes.** Only one append is in flight at a time, and each
 *    carries the number of the chunk it is, so the file on disk is the
 *    recording in the order it was made. (`take_video.rs` holds an early
 *    chunk back rather than writing it in the wrong place; this is the half
 *    that makes that a belt as well as braces.)
 * 3. **A failure stops the picture and nothing else.** The first append that
 *    fails ends the pipe. Every later chunk is dropped rather than written
 *    into a gap, the failure is reported once, and the take — which is the
 *    engine's and knows nothing about any of this — carries on.
 *
 * No React, no IPC, no timers: the sink is handed in, which is what makes the
 * whole of this testable with a function that counts.
 */

/** Where a chunk goes. Resolves when it is on disk; rejects when it is not. */
export type ChunkSink = (seq: number, bytes: Uint8Array) => Promise<unknown>;

export type ChunkPipe = {
  /** Queue one chunk. Returns at once; the writing happens behind it. */
  push: (chunk: Blob) => void;
  /** Wait for everything pushed so far to have been written (or to have failed). */
  drain: () => Promise<void>;
  /** How many chunks have been written. */
  readonly written: number;
  /** The failure that ended the pipe, if one did. */
  readonly error: unknown;
};

export function createChunkPipe(sink: ChunkSink): ChunkPipe {
  /** Chunks queued but not yet crossed. */
  const queue: Blob[] = [];
  let seq = 0;
  let written = 0;
  let error: unknown = null;
  let running: Promise<void> | null = null;

  async function run(): Promise<void> {
    while (queue.length > 0) {
      const chunk = queue.shift() as Blob;
      if (error !== null) continue;
      try {
        // `arrayBuffer()` is where a Blob stops being a handle and starts
        // being bytes, so it happens here — one chunk at a time — rather than
        // when the recorder hands it over.
        const buffer = await chunk.arrayBuffer();
        if (buffer.byteLength === 0) continue;
        await sink(seq, new Uint8Array(buffer));
        seq += 1;
        written += 1;
      } catch (e) {
        error = e ?? new Error("the video could not be written");
      }
    }
    running = null;
  }

  return {
    push(chunk: Blob) {
      if (error !== null) return;
      queue.push(chunk);
      if (running === null) {
        running = run();
        // The drain loop owns its own failures; nothing above it awaits this
        // one, and an unhandled rejection in a recording is not a reason to
        // take a console down with it.
        void running.catch(() => {});
      }
    },
    async drain() {
      // Not a single await: `run` finishing can leave work queued behind it
      // if a chunk arrived while the last one was crossing.
      while (running !== null) await running.catch(() => {});
      if (queue.length > 0 && error === null) {
        running = run();
        await running.catch(() => {});
      }
    },
    get written() {
      return written;
    },
    get error() {
      return error;
    },
  };
}
