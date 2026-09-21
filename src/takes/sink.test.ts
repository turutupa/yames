/**
 * Which speaker the review plays out of.
 *
 * Two namespaces describe one box — cpal's name and the webview's opaque
 * `deviceId` — and the only thing they share is a label an operating system
 * wrote. So the whole of the risk is in the match, and the whole of the
 * requirement is: find it where it is really there, and say NOTHING where it
 * is not. A wrong match means the review plays out of a speaker the player did
 * not choose while believing it followed them, which is worse than admitting
 * it could not.
 */
import { describe, expect, it, vi } from "vitest";
import { canSetSink, followChosenOutput, matchSink } from "./sink";
import type { SinkDevice } from "./sink";

function out(deviceId: string, label: string): SinkDevice {
  return { deviceId, kind: "audiooutput", label };
}

const DEVICES: SinkDevice[] = [
  { deviceId: "mic1", kind: "audioinput", label: "Microphone (UMC204HD 192k)" },
  out("default", "Default - Speakers (2- Realtek(R) Audio)"),
  out("d1", "Speakers (2- Realtek(R) Audio)"),
  out("d2", "Speakers (UMC204HD 192k)"),
  out("d3", "Headphones (Realtek)"),
];

describe("finding the player's chosen output", () => {
  it("matches the OS's long form of cpal's short name", () => {
    expect(matchSink(DEVICES, "UMC204HD 192k")?.deviceId).toBe("d2");
  });

  it("ignores case, brackets and the enumeration prefix", () => {
    expect(matchSink(DEVICES, "Realtek(R) Audio")?.deviceId).toBe("default");
    expect(matchSink(DEVICES, "realtek(r) audio")?.deviceId).toBe("default");
  });

  it("never matches an input, whatever it is called", () => {
    // The microphone's label contains the interface's name. A review pointed
    // at an input is a review that plays nothing.
    const onlyInput = [DEVICES[0]];
    expect(matchSink(onlyInput, "UMC204HD 192k")).toBeNull();
  });

  it("gives up rather than guessing", () => {
    expect(matchSink(DEVICES, "Focusrite Scarlett 2i2")).toBeNull();
    expect(matchSink(DEVICES, "")).toBeNull();
    // Labels are empty until the page has been given a camera or a
    // microphone, and a list of blanks matches nothing.
    expect(matchSink([out("x", ""), out("y", "")], "Realtek")).toBeNull();
  });

  it("prefers the longer label where two contain the name", () => {
    // "Realtek" is a prefix of two boxes. The fuller name is the one an OS
    // gives the device somebody actually picked.
    const both = [out("short", "Realtek"), out("long", "Realtek(R) Audio 2nd")];
    expect(matchSink(both, "Realtek(R) Audio 2nd")?.deviceId).toBe("long");
  });
});

describe("pointing the review at it", () => {
  const element = (withSink: boolean) => {
    const setSinkId = vi.fn(async () => {});
    return {
      el: (withSink ? { setSinkId } : {}) as unknown as HTMLMediaElement,
      setSinkId,
    };
  };

  it("moves the element and says which speaker it moved to", async () => {
    const { el, setSinkId } = element(true);
    const state = await followChosenOutput({
      element: el,
      wanted: "UMC204HD 192k",
      enumerate: async () => DEVICES,
    });
    expect(setSinkId).toHaveBeenCalledWith("d2");
    expect(state).toEqual({ kind: "following", label: "Speakers (UMC204HD 192k)" });
  });

  it("says nothing when the player chose nothing", async () => {
    const { el, setSinkId } = element(true);
    // The system default IS their choice; there is nothing to move and
    // nothing to tell them.
    expect(
      await followChosenOutput({ element: el, wanted: null, enumerate: async () => DEVICES }),
    ).toEqual({ kind: "systemDefault" });
    expect(setSinkId).not.toHaveBeenCalled();
  });

  it("tells a webview with no setSinkId apart from a name it cannot find", async () => {
    // Two different sentences, because they are two different facts: one is
    // about this build and one is about this machine.
    expect(
      await followChosenOutput({
        element: element(false).el,
        wanted: "UMC204HD 192k",
        enumerate: async () => DEVICES,
      }),
    ).toEqual({ kind: "unsupported", wanted: "UMC204HD 192k" });

    expect(
      await followChosenOutput({
        element: element(true).el,
        wanted: "Focusrite Scarlett 2i2",
        enumerate: async () => DEVICES,
      }),
    ).toEqual({ kind: "unmatched", wanted: "Focusrite Scarlett 2i2" });
  });

  it("survives an enumeration or a setSinkId that throws", async () => {
    expect(
      await followChosenOutput({
        element: element(true).el,
        wanted: "UMC204HD 192k",
        enumerate: () => Promise.reject(new Error("no")),
      }),
    ).toEqual({ kind: "unmatched", wanted: "UMC204HD 192k" });

    const refuses = {
      setSinkId: vi.fn(() => Promise.reject(new Error("gone"))),
    } as unknown as HTMLMediaElement;
    expect(
      await followChosenOutput({
        element: refuses,
        wanted: "UMC204HD 192k",
        enumerate: async () => DEVICES,
      }),
    ).toEqual({ kind: "unmatched", wanted: "UMC204HD 192k" });
  });

  it("knows an element that can take one from an element that cannot", () => {
    expect(canSetSink({ setSinkId: () => {} })).toBe(true);
    expect(canSetSink({})).toBe(false);
    expect(canSetSink(null)).toBe(false);
  });
});
