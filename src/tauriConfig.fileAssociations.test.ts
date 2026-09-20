import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * YAMES IS OFFERED IN "OPEN WITH". IT IS NEVER THE DEFAULT.
 *
 * `plans/tasks/songs/W19-FRICTION.md`: a guitarist who installs a metronome
 * must not find that double-clicking their tabs has stopped opening Guitar
 * Pro. The claim is easy to make and easy to lose, because on Windows the
 * thing that would lose it is a macro inside Tauri's own installer template:
 * `APP_ASSOCIATE` writes our ProgID as the DEFAULT value of `.gp5` and backs
 * up whatever was there.
 *
 * So the promise is kept in two files that have to agree, and this is what
 * makes them agree:
 *
 *   `tauri.conf.json`        declares the extensions, with `rank: Alternate`
 *                            (macOS `LSHandlerRank`) and `role: Viewer`
 *   `installer-hooks.nsh`    puts the Windows default back and registers the
 *                            ProgID under `OpenWithProgids` instead
 *
 * Adding an extension to one and not the other is exactly the mistake this
 * catches, and it would ship as "Yames stole my file type".
 */
const ROOT = process.cwd();

type Association = {
  ext: string[];
  name: string;
  description?: string;
  role?: string;
  rank?: string;
  mimeType?: string;
};

function conf(): {
  bundle: {
    fileAssociations?: Association[];
    windows?: { nsis?: { installerHooks?: string } };
  };
} {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "src-tauri/tauri.conf.json"), "utf8"));
}

function hooks(): string {
  return fs.readFileSync(path.join(ROOT, "src-tauri/installer-hooks.nsh"), "utf8");
}

describe("the file types Yames opens", () => {
  it("claims the Guitar Pro and MusicXML extensions and nothing else", () => {
    const associations = conf().bundle.fileAssociations ?? [];
    const exts = associations.flatMap((a) => a.ext).sort();
    // `.xml` is deliberately absent: a Downloads folder is full of `.xml`
    // that is a bank statement, and putting Yames in the "Open with" list of
    // every XML file on the machine would be rude. A player can still open
    // one through the file picker, where they chose it themselves.
    expect(exts).toEqual(["gp", "gp3", "gp4", "gp5", "gpx", "musicxml", "mxl"]);
  });

  it("is never the primary handler of anything", () => {
    for (const association of conf().bundle.fileAssociations ?? []) {
      // macOS reads both of these. `Owner` would say Yames is the app that
      // CREATES Guitar Pro files, which is false and would put it at the top
      // of the Finder's list; `Editor` would say it writes them, and it does
      // not — it never writes a note back to anybody's file.
      expect(association.rank, `${association.name} rank`).toBe("Alternate");
      expect(association.role, `${association.name} role`).toBe("Viewer");
    }
  });

  it("runs an installer hook on Windows, and it is on disk", () => {
    const configured = conf().bundle.windows?.nsis?.installerHooks;
    expect(configured, "no NSIS installer hooks configured").toBe("installer-hooks.nsh");
    expect(fs.existsSync(path.join(ROOT, "src-tauri", configured!))).toBe(true);
  });

  it("hands every extension's Windows default back to whoever had it", () => {
    const nsh = hooks();
    const missing: string[] = [];
    for (const association of conf().bundle.fileAssociations ?? []) {
      for (const ext of association.ext) {
        // The ProgID is the association's `name` — that is what Tauri's
        // template passes to `APP_ASSOCIATE` as FILECLASS — so the hook has
        // to name the same pair, or it restores a backup that was written
        // under a different key and leaves Yames as the default.
        const line = new RegExp(
          `YAMES_OFFER_NOT_OWN\\s+"${ext}"\\s+"${association.name}"`,
        );
        if (!line.test(nsh)) missing.push(`${ext} -> ${association.name}`);
      }
    }
    expect(missing, "an extension the installer hook does not hand back").toEqual([]);
  });

  it("cleans up its Open-with entry when Yames is uninstalled", () => {
    const nsh = hooks();
    const missing: string[] = [];
    for (const association of conf().bundle.fileAssociations ?? []) {
      for (const ext of association.ext) {
        const line = new RegExp(
          `DeleteRegValue\\s+SHCTX\\s+"Software\\\\Classes\\\\\\.${ext}\\\\OpenWithProgids"\\s+"${association.name}"`,
        );
        if (!line.test(nsh)) missing.push(`${ext} -> ${association.name}`);
      }
    }
    expect(missing, "an Open-with entry the uninstaller would leave behind").toEqual([]);
  });

  it("never writes our ProgID as an extension's default value itself", () => {
    // The hook may only restore and register. A `WriteRegStr` putting a
    // Yames ProgID into the default value of a `.ext` key would be the whole
    // bug, written by hand this time.
    const offending = hooks()
      .split(/\r?\n/)
      .filter((line) => /WriteRegStr[^;]*Software\\Classes\\\.[a-z0-9]+"\s+""\s+"Yames/i.test(line));
    expect(offending, "the hook makes Yames the default for something").toEqual([]);
  });
});
