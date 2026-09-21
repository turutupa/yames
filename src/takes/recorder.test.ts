/**
 * The pipe and the recorder, with a fake `MediaRecorder` and a sink that
 * counts.
 *
 * Every test here is a version of one sentence: **a camera failure costs the
 * picture and never the take** (`W21-CAMERA.md` item 2). So the interesting
 * cases are all the ones where something goes wrong — the disk refuses, the
 * camera is unplugged mid-take, `stop()` throws — and what is asserted is that
 * the recording reports it and nothing propagates out.
 */
import { describe, expect, it, vi } from "vitest";
import { createChunkPipe } from "./chunks";
import { recordVideo } from "./recorder";
import type { RecorderLike } from "./recorder";

/** A Blob whose bytes are known, without needing a real one. */
function blobOf(text: string): Blob {
  const bytes = new TextEncoder().encode(text);
  return {
    size: bytes.byteLength,
    arrayBuffer: () => Promise.resolve(bytes.buffer.slice(0) as ArrayBuffer),
  } as unknown as Blob;
}

describe("the chunk pipe", () => {
  it("sends every chunk once, numbered from zero, in order", async () => {
    const seen: { seq: number; text: string }[] = [];
    const pipe = createChunkPipe((seq, bytes) => {
      seen.push({ seq, text: new TextDecoder().decode(bytes) });
      return Promise.resolve();
    });

    pipe.push(blobOf("one"));
    pipe.push(blobOf("two"));
    pipe.push(blobOf("three"));
    await pipe.drain();

    expect(seen).toEqual([
      { seq: 0, text: "one" },
      { seq: 1, text: "two" },
      { seq: 2, text: "three" },
    ]);
    expect(pipe.written).toBe(3);
    expect(pipe.error).toBeNull();
  });

  /**
   * One append in flight at a time. If the pipe ever let two overlap, a slow
   * first write and a fast second would put the second's bytes in front of the
   * first's — a video that plays for a while and then stops.
   */
  it("never has two appends in flight", async () => {
    let inFlight = 0;
    let most = 0;
    const pipe = createChunkPipe(async () => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
    });
    for (let i = 0; i < 6; i++) pipe.push(blobOf(`chunk ${String(i)}`));
    await pipe.drain();
    expect(most).toBe(1);
    expect(pipe.written).toBe(6);
  });

  /** A chunk pushed while the previous one is crossing is still written. */
  it("picks up chunks that arrived while it was busy", async () => {
    const seen: number[] = [];
    const pipe = createChunkPipe(async (seq) => {
      seen.push(seq);
      await new Promise((r) => setTimeout(r, 2));
    });
    pipe.push(blobOf("a"));
    await new Promise((r) => setTimeout(r, 1));
    pipe.push(blobOf("b"));
    await pipe.drain();
    expect(seen).toEqual([0, 1]);
  });

  /**
   * The first failure ends it. Everything after is dropped rather than written
   * into the gap the failed chunk left, because a file with a hole in it is
   * worse than a file that stops.
   */
  it("stops at the first failure and drops the rest", async () => {
    const seen: number[] = [];
    const pipe = createChunkPipe((seq) => {
      seen.push(seq);
      return seq === 1 ? Promise.reject(new Error("the disk is full")) : Promise.resolve();
    });
    pipe.push(blobOf("a"));
    pipe.push(blobOf("b"));
    pipe.push(blobOf("c"));
    pipe.push(blobOf("d"));
    await pipe.drain();

    expect(seen).toEqual([0, 1]);
    expect(pipe.written).toBe(1);
    expect(pipe.error).toBeInstanceOf(Error);
  });

  it("does not send an empty chunk", async () => {
    const sink = vi.fn(() => Promise.resolve());
    const pipe = createChunkPipe(sink);
    pipe.push(blobOf(""));
    pipe.push(blobOf("real"));
    await pipe.drain();
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0][0]).toBe(0);
  });
});

/** A `MediaRecorder` this test drives by hand. */
function fakeRecorder(): RecorderLike & {
  emit: (text: string) => void;
  fail: (why: unknown) => void;
  started: number[];
} {
  const started: number[] = [];
  const recorder: RecorderLike & {
    emit: (text: string) => void;
    fail: (why: unknown) => void;
    started: number[];
  } = {
    started,
    ondataavailable: null,
    onerror: null,
    onstop: null,
    start(timesliceMs?: number) {
      started.push(timesliceMs ?? 0);
    },
    stop() {
      recorder.onstop?.();
    },
    emit(text: string) {
      recorder.ondataavailable?.({ data: blobOf(text) });
    },
    fail(why: unknown) {
      recorder.onerror?.(why);
    },
  };
  return recorder;
}

const noStream = { getVideoTracks: () => [] } as unknown as MediaStream;

describe("recording a pass", () => {
  it("streams what the recorder hands over and reports what landed", async () => {
    const recorder = fakeRecorder();
    const written: string[] = [];
    const recording = recordVideo({
      stream: noStream,
      mimeType: "video/webm;codecs=vp9",
      sink: (_seq, bytes) => {
        written.push(new TextDecoder().decode(bytes));
        return Promise.resolve();
      },
      makeRecorder: () => recorder,
      now: () => 1000,
      timesliceMs: 1000,
    });

    expect(recorder.started).toEqual([1000]);
    recorder.emit("first second");
    recorder.emit("second second");
    const answer = await recording.stop();

    expect(written).toEqual(["first second", "second second"]);
    expect(answer.chunks).toBe(2);
    expect(answer.error).toBeNull();
    expect(recording.live).toBe(false);
  });

  /**
   * The first frame's time is the whole of the alignment. It comes from the
   * preview's frame callback when there is one, and from the reading beside
   * `start()` when there is not — and the answer says which, so the review can
   * be honest about how well it knows.
   */
  it("takes the first frame after start, and says where the time came from", async () => {
    const recorder = fakeRecorder();
    const recording = recordVideo({
      stream: noStream,
      mimeType: "video/webm",
      sink: () => Promise.resolve(),
      makeRecorder: () => recorder,
      now: () => 1000,
    });
    // A frame stamped BEFORE the recorder started is not this recording's
    // first frame — it is the preview's, from while the player was framing up.
    recording.noteFrame(900);
    recording.noteFrame(1012);
    recording.noteFrame(1045);
    recorder.emit("x");
    const answer = await recording.stop();

    expect(answer.firstFrameAt).toBe(1012);
    expect(answer.firstFrameSource).toBe("frameCallback");
  });

  it("falls back to the clock beside start() when nothing reports a frame", async () => {
    const recorder = fakeRecorder();
    const recording = recordVideo({
      stream: noStream,
      mimeType: "video/webm",
      sink: () => Promise.resolve(),
      makeRecorder: () => recorder,
      now: () => 4242,
    });
    recorder.emit("x");
    const answer = await recording.stop();
    expect(answer.firstFrameAt).toBe(4242);
    expect(answer.firstFrameSource).toBe("recorderStart");
  });

  /**
   * The camera unplugged mid-take. The recording ends, says so, and the caller
   * — which is also stopping a take on the engine — is never thrown at.
   */
  it("ends on a camera failure without throwing at anybody", async () => {
    const recorder = fakeRecorder();
    const recording = recordVideo({
      stream: noStream,
      mimeType: "video/webm",
      sink: () => Promise.resolve(),
      makeRecorder: () => recorder,
      now: () => 1000,
    });
    recorder.emit("a bit of it");
    recorder.fail(new Error("the camera was unplugged"));

    const answer = await recording.stop();
    expect(answer.error).toBeInstanceOf(Error);
    expect(answer.chunks).toBe(1);
  });

  /** A disk that refuses is reported the same way and costs the take nothing. */
  it("reports a disk that refused a chunk", async () => {
    const recorder = fakeRecorder();
    const recording = recordVideo({
      stream: noStream,
      mimeType: "video/webm",
      sink: () => Promise.reject(new Error("no room")),
      makeRecorder: () => recorder,
      now: () => 1000,
    });
    recorder.emit("a");
    const answer = await recording.stop();
    expect(answer.error).toBeInstanceOf(Error);
    expect(answer.chunks).toBe(0);
  });

  it("survives a recorder whose stop() throws", async () => {
    const recorder = fakeRecorder();
    recorder.stop = () => {
      throw new Error("already gone");
    };
    const recording = recordVideo({
      stream: noStream,
      mimeType: "video/webm",
      sink: () => Promise.resolve(),
      makeRecorder: () => recorder,
      now: () => 1000,
    });
    const answer = await recording.stop();
    expect(answer.error).toBeInstanceOf(Error);
  });

  /**
   * "Does recording video cost the click anything" is a question spike K3 has
   * to answer with numbers, so the recording carries the track's own frame
   * counters out when the platform keeps them — and `null`, not zero, when it
   * does not. "Nothing was dropped" and "nobody is counting" are different
   * facts and only one of them is worth reporting.
   */
  it("reports what the encoder dropped, or that nobody counted", async () => {
    const counted = {
      getVideoTracks: () => [{ stats: { deliveredFrames: 100, discardedFrames: 3 } }],
    } as unknown as MediaStream;
    const recorder = fakeRecorder();
    const recording = recordVideo({
      stream: counted,
      mimeType: "video/webm",
      sink: () => Promise.resolve(),
      makeRecorder: () => recorder,
      now: () => 0,
    });
    recorder.emit("x");
    const answer = await recording.stop();
    // Before and after are the same object here, so the difference is zero —
    // which is the honest arithmetic. What matters is that it is a NUMBER.
    expect(answer.droppedFrames).toBe(0);
    expect(answer.deliveredFrames).toBe(0);

    const blind = fakeRecorder();
    const second = recordVideo({
      stream: noStream,
      mimeType: "video/webm",
      sink: () => Promise.resolve(),
      makeRecorder: () => blind,
      now: () => 0,
    });
    blind.emit("x");
    const answerTwo = await second.stop();
    expect(answerTwo.droppedFrames).toBeNull();
    expect(answerTwo.deliveredFrames).toBeNull();
  });
});
