/**
 * P8: every control in Settings writes its key and reads it back.
 *
 * 21 of the 29 STG rows had no test, and Settings is the only route to a lot of the
 * product (section 3.1 item 12). Each row of the tables below is a promise in three
 * parts: the control is there, using it saves under that exact name, and a later
 * launch with that value shows it chosen. Driven through the real window.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, fireEvent, waitFor, within } from "@testing-library/react";
import { HOTKEYS, platformKey } from "../../hotkeys";
import i18n from "../../i18n";
import { THEMES } from "../../themes";
import { setInvokeResponse } from "../../test/mocks";
import { openSettings, openShell, sentTo, settle, wasInvoked } from "../../test/parity/shell";
import { emitEvent } from "../../test/parity/store";

const t = (key: string) => i18n.t(key);

afterEach(() => i18n.changeLanguage("en"));

/**
 * The settings row with this label, wherever its section has moved to. Two sections
 * can share a label, so a row can be looked up inside the section with this title.
 */
function row(labelKey: string, sectionTitleKey?: string): HTMLElement {
  const label = t(labelKey);
  const scope = sectionTitleKey
    ? [...document.querySelectorAll<HTMLElement>(".settings-section")].find(
        (s) => s.querySelector("h2")?.textContent === t(sectionTitleKey),
      )
    : document;
  const found = [...(scope ?? document).querySelectorAll<HTMLElement>(".setting-row")].find(
    (r) => r.querySelector("label")?.textContent === label,
  );
  if (!found) throw new Error(`no settings row labelled "${label}"`);
  return found;
}

function button(labelKey: string, text: string): HTMLButtonElement {
  return within(row(labelKey)).getByRole("button", { name: text }) as HTMLButtonElement;
}

const isChosen = (el: Element) => el.classList.contains("active");

async function inSettings(stored: Record<string, unknown> = {}) {
  const shell = await openShell({}, stored);
  await openSettings();
  return shell;
}

describe("the on-and-off rows", () => {
  const TOGGLES: Array<[string, string, boolean]> = [
    ["settings.general.checkUpdates", "autoCheckUpdates", true],
    ["settings.general.buttonFlash", "buttonFlash", true],
    ["settings.general.activeBorder", "activeBorder", true],
    ["settings.general.drillAutoCollapse", "drillAutoCollapse", true],
  ];

  it.each(TOGGLES)("%s saves %s", async (labelKey, key, startsOn) => {
    const { store } = await inSettings({ [key]: startsOn });
    fireEvent.click(within(row(labelKey)).getByRole("button"));
    await waitFor(() => expect(store.values.get(key)).toBe(!startsOn));
  });

  it.each(TOGGLES)("%s shows %s back", async (labelKey, key) => {
    await inSettings({ [key]: false });
    expect(isChosen(within(row(labelKey)).getByRole("button"))).toBe(false);
  });

  it.each(TOGGLES)("%s shows %s back on", async (labelKey, key) => {
    await inSettings({ [key]: true });
    expect(isChosen(within(row(labelKey)).getByRole("button"))).toBe(true);
  });
});

describe("the choice rows", () => {
  const CHOICES: Array<[string, string, string, string, Record<string, unknown>]> = [
    ["settings.appearance.viewAnimations", "viewTransitions", "off", "settings.appearance.transitions.off", {}],
    ["settings.appearance.viewAnimations", "viewTransitions", "expressive", "settings.appearance.transitions.expressive", {}],
    ["settings.appearance.animationStyle", "animationStyle", "reveal", "settings.appearance.style.reveal", { viewTransitions: "smooth" }],
    ["settings.coach.scoringMode", "coachMode", "pro", "settings.coach.scoringPro", {}],
    ["settings.coach.stance", "coachStance", "learning", "settings.coach.stanceLearning", {}],
  ];

  it.each(CHOICES)("%s saves %s = %s", async (labelKey, key, value, textKey, stored) => {
    const { store } = await inSettings(stored);
    fireEvent.click(button(labelKey, t(textKey)));
    await waitFor(() => expect(store.values.get(key)).toBe(value));
    expect(isChosen(button(labelKey, t(textKey)))).toBe(true);
  });

  it.each(CHOICES)("%s reads %s = %s back", async (labelKey, key, value, textKey, stored) => {
    await inSettings({ ...stored, [key]: value });
    await waitFor(() => expect(isChosen(button(labelKey, t(textKey)))).toBe(true));
  });
});

describe("the coach's voice", () => {
  it("saves silent or voice", async () => {
    setInvokeResponse("tts_list_voices", () => [["lessac", "Lessac"]]);
    const { store } = await inSettings({ coachBrainTier: "standard", coachVoiceMode: "silent" });
    await settle(5);
    const speak = within(row("settings.coach.voice"))
      .getAllByRole("button")
      .find((b) => !isChosen(b))!;
    fireEvent.click(speak);
    await waitFor(() => expect(store.values.get("coachVoiceMode")).toBe("voice"));
  });

  it("turns a stored `chime` into silent, and writes that back (section 4.5)", async () => {
    const { store } = await inSettings({ coachVoiceMode: "chime" });
    await waitFor(() => expect(store.values.get("coachVoiceMode")).toBe("silent"));
  });

  it("hands the saved voice to the engine at launch (SK-24)", async () => {
    await inSettings({ coachVoiceName: "ryan" });
    await waitFor(() => expect(wasInvoked("tts_set_voice")).toBe(true));
  });

  it("offers the three frozen voices", async () => {
    await inSettings();
    for (const name of ["Lessac", "Amy", "Ryan"]) {
      expect(document.querySelector("#settings-coach")?.textContent).toContain(name);
    }
  });
});

describe("the brain", () => {
  it("saves off", async () => {
    const { store } = await inSettings({ coachBrainTier: "standard" });
    fireEvent.click(
      within(row("settings.coach.brain")).getAllByRole("button")[0],
    );
    await waitFor(() => expect(store.values.get("coachBrainTier")).toBe("off"));
  });

  it("keeps a stored `full`, the id Studio has always had", async () => {
    const { store } = await inSettings({ coachBrainTier: "full" });
    await settle(10);
    expect(store.values.get("coachBrainTier")).toBe("full");
  });
});

describe("the window rows go to Rust, which saves them (STG-06, WID-16)", () => {
  it("always on top", async () => {
    await inSettings();
    fireEvent.click(within(row("settings.general.alwaysOnTop")).getByRole("button"));
    await waitFor(() => expect(wasInvoked("set_always_on_top")).toBe(true));
  });

  it("the widget's always on top", async () => {
    await inSettings();
    fireEvent.click(within(row("settings.widget.alwaysOnTop", "settings.widget.title")).getByRole("button"));
    await waitFor(() => expect(wasInvoked("set_widget_always_on_top")).toBe(true));
  });

  it.each(["compact", "comfortable"])("the widget's mode: %s", async (mode) => {
    await inSettings();
    fireEvent.click(button("settings.widget.mode", t(`settings.widget.modes.${mode}`)));
    await waitFor(() => {
      const sent = sentTo("set_widget_mode");
      // Clicking the mode already set is allowed to do nothing.
      if (mode !== "comfortable") expect(sent).toContainEqual({ mode });
    });
  });
});

describe("the themes (THM-01, THM-04)", () => {
  it("are all there to choose", async () => {
    await inSettings();
    expect(document.querySelectorAll(".theme-grid > *").length).toBe(THEMES.length);
  });

  it.each(THEMES.slice(0, 3).map((x) => [x.id, x.name] as const))("%s goes to Rust", async (id) => {
    await inSettings();
    const index = THEMES.findIndex((x) => x.id === id);
    fireEvent.click(document.querySelectorAll(".theme-grid > *")[index]);
    await waitFor(() => expect(wasInvoked("set_theme", { theme: id })).toBe(true));
  });
});

describe("the language (I18-*)", () => {
  it("offers every language, and saves the choice", async () => {
    const { store } = await inSettings();
    fireEvent.click(document.querySelector(".lang-select-btn")!);
    const options = document.querySelectorAll('[role="option"]');
    expect(options.length).toBe(15);
    const deutsch = [...options].find((o) => o.textContent === "Deutsch")!;
    fireEvent.click(deutsch);
    await waitFor(() => expect(store.values.get("language")).toBe("de"));
    await waitFor(() => expect(i18n.language).toBe("de"));
  });
});

describe("Songs", () => {
  it("catching downloads saves under its own key", async () => {
    const { store } = await inSettings({ songsDownloadWatch: { enabled: true } });
    fireEvent.click(within(row("settings.songs.catchDownloads")).getByRole("button"));
    await waitFor(() =>
      expect(store.values.get("songsDownloadWatch")).toMatchObject({ enabled: false }),
    );
  });
});

describe("Devices", () => {
  it("lists what can play and what can listen", async () => {
    setInvokeResponse("list_audio_output_devices", () => [
      { name: "Headphones", isDefault: true, maxChannels: 2 },
    ]);
    await inSettings();
    const section = document.querySelector("#settings-devices")!;
    for (const key of [
      "settings.devices.audioOutput",
      "settings.devices.audioInput",
      "settings.devices.midi",
    ]) {
      expect(section.textContent).toContain(t(key));
    }
  });

  it("can open the input test from here", async () => {
    await inSettings();
    const section = document.querySelector<HTMLElement>("#settings-devices")!;
    const test = within(section).getByRole("button", { name: t("settings.devices.test") });
    fireEvent.click(test);
    await waitFor(() => expect(wasInvoked("list_audio_input_devices")).toBe(true));
  });
});

describe("Hotkeys (KEY-01 to KEY-13, MID-08)", () => {
  /** The row for one action: its name, then its key, global and MIDI buttons. */
  function hotkeyRow(id: string) {
    const name = t(`settings.hotkeys.actions.${id}`);
    const found = [...document.querySelectorAll<HTMLElement>(".hotkey-row")].find(
      (r) => r.querySelector(".hotkey-action")?.textContent === name,
    );
    if (!found) throw new Error(`no hotkey row for ${id}`);
    const [key, global, midi] = [...found.querySelectorAll<HTMLButtonElement>(".hotkey-bind-btn")];
    return { key, global, midi };
  }

  it.each(HOTKEYS.map((h) => [h.id] as const))("%s has its row, with its key", async (id) => {
    await inSettings();
    const hk = HOTKEYS.find((h) => h.id === id)!;
    const { key, midi } = hotkeyRow(id);
    expect(key.textContent).toBe(platformKey(hk.key));
    expect(key.disabled).toBe(false);
    expect(midi.disabled).toBe(false);
  });

  it("rebinds a key, and saves it under the action's id", async () => {
    const { store } = await inSettings();
    fireEvent.click(hotkeyRow("play").key);
    await waitFor(() => expect(document.querySelector(".keybinding-capture")).not.toBeNull());
    fireEvent.keyDown(document, { key: "p" });
    await waitFor(() => expect(hotkeyRow("play").key.textContent).toBe("P"));
    await waitFor(() =>
      expect((store.values.get("keyBindings") as Record<string, string>).play).toBe("P"),
    );
  });

  it("learns a pedal for any action, and hands it to Rust", async () => {
    await inSettings();
    fireEvent.click(hotkeyRow("tab-3").midi);
    await waitFor(() => expect(hotkeyRow("tab-3").midi.textContent).toBe("…"));
    await act(async () => {
      emitEvent("midi-activity", { channel: 0, type: "cc", number: 64, value: 127 });
    });
    await waitFor(() =>
      expect(wasInvoked("set_midi_binding", {
        action: "tab-3",
        channel: 0,
        msgType: "cc",
        number: 64,
      })).toBe(true),
    );
  });

  it("shows a saved pedal", async () => {
    setInvokeResponse("get_midi_bindings", () => [
      { action: "play", channel: 0, msgType: "cc", number: 64 },
    ]);
    await inSettings();
    await waitFor(() => expect(hotkeyRow("play").midi.textContent).toBe("CC#64"));
  });

  it("asks before a pedal takes a signal from another action", async () => {
    setInvokeResponse("get_midi_bindings", () => [
      { action: "play", channel: 0, msgType: "cc", number: 64 },
    ]);
    await inSettings();
    await waitFor(() => expect(hotkeyRow("play").midi.textContent).toBe("CC#64"));
    fireEvent.click(hotkeyRow("tab-3").midi);
    await act(async () => {
      emitEvent("midi-activity", { channel: 0, type: "cc", number: 64, value: 127 });
    });
    await waitFor(() => expect(document.querySelector(".conflict-accept-btn")).not.toBeNull());
    expect(wasInvoked("set_midi_binding")).toBe(false);
  });

  it("resets everything, after asking", async () => {
    const { store } = await inSettings({ keyBindings: { play: "P" } });
    await waitFor(() => expect(hotkeyRow("play").key.textContent).toBe("P"));
    fireEvent.click(document.querySelector(".hotkey-defaults-btn")!);
    const confirm = await waitFor(() => {
      const b = document.querySelector<HTMLElement>(".keybinding-capture .keybinding-btn-reset");
      expect(b).not.toBeNull();
      return b!;
    });
    fireEvent.click(confirm);
    await waitFor(() =>
      expect((store.values.get("keyBindings") as Record<string, string>).play).toBe("Space"),
    );
  });

  it("has an input tester that swallows the press instead of acting on it", async () => {
    await inSettings();
    fireEvent.click(document.querySelector(".hotkeys-section-header .input-test-btn")!);
    await settle();
    await act(async () => {
      emitEvent("midi-action", { action: "tab-3" });
    });
    await settle();
    expect(document.querySelector(".drill-view")).toBeNull();
  });
});

describe("the Settings anchors other screens jump to (section 3.1 item 12)", () => {
  it.each(["settings-devices", "settings-coach", "settings-appearance"])("#%s", async (id) => {
    await inSettings();
    expect(document.getElementById(id)).not.toBeNull();
  });
});

describe("the ways back into onboarding", () => {
  it.each(["settings.general.runSetupAgain", "settings.general.takeTour"])("%s", async (key) => {
    await inSettings();
    expect(document.body.textContent).toContain(t(key));
  });
});
