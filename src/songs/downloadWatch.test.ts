import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOWNLOAD_WATCH,
  MAX_DISMISSED,
  isDismissed,
  offerSize,
  readDownloadWatch,
  withDismissed,
} from "./downloadWatch";

const offer = { fileName: "riff.gp5", sizeBytes: 9_000, modifiedMs: 1_700_000_000_000 };

describe("what Yames remembers about catching a download", () => {
  it("is on by default, watching this machine's own downloads", () => {
    const setting = readDownloadWatch(undefined);
    expect(setting).toEqual(DEFAULT_DOWNLOAD_WATCH);
    expect(setting.enabled).toBe(true);
    // `null` and not a path: where downloads go is the OS's answer, and
    // writing one down would be wrong the day the player moves the folder.
    expect(setting.folder).toBeNull();
  });

  it("only an explicit false turns it off", () => {
    expect(readDownloadWatch({ enabled: false }).enabled).toBe(false);
    // A hand-edited file, and an older build that never wrote the key.
    for (const junk of [{ enabled: "no" }, { enabled: 0 }, {}, null, "off"]) {
      expect(readDownloadWatch(junk).enabled, JSON.stringify(junk)).toBe(true);
    }
  });

  it("mistrusts every field it reads back", () => {
    const setting = readDownloadWatch({
      enabled: true,
      folder: "   ",
      dismissed: [
        offer,
        { fileName: "no size" },
        { sizeBytes: 1, modifiedMs: 2 },
        "not an object",
        null,
      ],
    });
    expect(setting.folder).toBeNull();
    expect(setting.dismissed).toEqual([offer]);
  });

  it("a dismissed file stays dismissed", () => {
    const after = withDismissed(DEFAULT_DOWNLOAD_WATCH, offer);
    expect(isDismissed(after, offer)).toBe(true);
    // And through a save and a load, which is the whole point of the key.
    expect(isDismissed(readDownloadWatch(JSON.parse(JSON.stringify(after))), offer)).toBe(true);
  });

  it("dismissing the same file twice does not grow the list", () => {
    const once = withDismissed(DEFAULT_DOWNLOAD_WATCH, offer);
    expect(withDismissed(once, offer)).toBe(once);
  });

  it("a new version of a file you turned down is offered again", () => {
    const after = withDismissed(DEFAULT_DOWNLOAD_WATCH, offer);
    // Same name, downloaded again: a different file as far as this is
    // concerned, because either number moving means new bytes arrived.
    expect(isDismissed(after, { ...offer, sizeBytes: 9_400 })).toBe(false);
    expect(isDismissed(after, { ...offer, modifiedMs: offer.modifiedMs + 1 })).toBe(false);
    expect(isDismissed(after, { ...offer, fileName: "riff (1).gp5" })).toBe(false);
  });

  it("the list of dismissals does not grow for ever", () => {
    let setting = DEFAULT_DOWNLOAD_WATCH;
    for (let i = 0; i < MAX_DISMISSED + 50; i++) {
      setting = withDismissed(setting, { ...offer, fileName: `riff-${i}.gp5` });
    }
    expect(setting.dismissed).toHaveLength(MAX_DISMISSED);
    // Newest first: the one just added is at the top, the oldest is gone.
    expect(setting.dismissed[0].fileName).toBe(`riff-${MAX_DISMISSED + 49}.gp5`);
    expect(isDismissed(setting, { ...offer, fileName: "riff-0.gp5" })).toBe(false);
  });

  it("says a size the way a person reads one", () => {
    expect(offerSize(512)).toBe("512 B");
    expect(offerSize(9_000)).toBe("9 KB");
    expect(offerSize(2_600_000)).toBe("2.5 MB");
    expect(offerSize(Number.NaN)).toBe("");
  });
});
