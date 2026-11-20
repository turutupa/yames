import { test, expect, type Page } from "@playwright/test";
import { openShot } from "./fits";

/**
 * The coach's voice and keys in the real app (leg c1b2b; DESIGN section 8,
 * Voice; 3.4; 5.1, last row). The harness's speech engine writes every
 * `tts_speak` and `tts_stop` to `window.__yamesSpeech`, beside every
 * `set_playing` ("play" / "halt"), and a line "plays" for three seconds unless
 * stopped. `?voice=1` turns Voice on; `?coachKeys=1` binds the keys to J, U, Y.
 *
 * - With Voice on, a ready screen says its note's headline and a result its
 *   finding: the same string the screen shows.
 * - Nothing is said while anything sounds, and a Start stops a line still
 *   being said before the engine is asked to play.
 * - With Voice off nothing reaches the speech engine at all.
 */

const WIDE = { width: 1440, height: 900 };

type Entry = { op: "speak" | "stop" | "play" | "halt"; text: string; at: number };

async function speech(page: Page): Promise<Entry[]> {
  return page.evaluate(() => (window as unknown as { __yamesSpeech?: Entry[] }).__yamesSpeech ?? []);
}

const spoken = (log: Entry[]) => log.filter((e) => e.op === "speak").map((e) => e.text);

async function headline(page: Page): Promise<string> {
  return (await page.locator('[data-testid="coach-note"] .coach-note-head').first().innerText()).trim();
}

/** The rules every log must keep: no line starts while the engine plays; a Start cuts a line still playing. */
function expectQuietOverSound(log: Entry[]) {
  let playing = false;
  let speakingSince: number | null = null;
  for (const e of log) {
    if (e.op === "play") {
      // A line said in the last three seconds and not stopped would be playing now.
      expect(speakingSince === null || e.at - speakingSince >= 3_000, `a Start at ${e.at} ran over speech`).toBe(true);
      playing = true;
    } else if (e.op === "halt") playing = false;
    else if (e.op === "stop") speakingSince = null;
    else if (e.op === "speak") {
      expect(playing, `"${e.text}" was said while the engine played`).toBe(false);
      speakingSince = e.at;
    }
  }
}

test("Voice on, a ready screen: the order the note shows, said once", async ({ page }) => {
  await openShot(page, "session-ready", WIDE, "ember", { voice: "1" });
  const shown = await headline(page);
  await expect.poll(async () => spoken(await speech(page))).toEqual([shown]);
});

test("Voice on, a result: the finding the note shows; nothing during the Take, and the Start cut the order", async ({ page }) => {
  await openShot(page, "session-between", WIDE, "ember", { voice: "1" });
  const shown = await headline(page);
  await expect.poll(async () => spoken(await speech(page)).includes(shown)).toBe(true);
  const log = await speech(page);
  expectQuietOverSound(log);
  // The order, cut by the Start, then nothing until the finding.
  const firstPlay = log.findIndex((e) => e.op === "play");
  expect(firstPlay).toBeGreaterThan(0);
  expect(log.slice(0, firstPlay).map((e) => e.op)).toEqual(["speak", "stop"]);
  expect(spoken(log)).toHaveLength(2);
  expect(spoken(log)[1]).toBe(shown);
});

test("Voice on, during a Take: the order on screen is not said", async ({ page }) => {
  await openShot(page, "coach-take-order", WIDE, "ember", { voice: "1" });
  await expect(page.locator('[data-testid="coach-order"]')).toBeVisible();
  await page.waitForTimeout(1_000);
  const log = await speech(page);
  expectQuietOverSound(log);
  const lastPlay = log.map((e) => e.op).lastIndexOf("play");
  expect(lastPlay).toBeGreaterThan(-1);
  expect(log.slice(lastPlay).filter((e) => e.op === "speak")).toEqual([]);
});

test("Go again: no order said over the count-in", async ({ page }) => {
  await openShot(page, "coach-next-order", WIDE, "ember", { voice: "1" });
  await expect(page.locator('[data-testid="coach-order"]')).toBeVisible();
  await page.waitForTimeout(500);
  const log = await speech(page);
  expectQuietOverSound(log);
  const order = (await page.locator('[data-testid="coach-order"]').innerText()).trim();
  // Between the first Take's end and the second Take's Start: at most the
  // finding, never the order the second Take shows.
  const plays = log.flatMap((e, i) => (e.op === "play" ? [i] : []));
  expect(plays.length).toBeGreaterThanOrEqual(2);
  const between = spoken(log.slice(plays[0] + 1, plays[plays.length - 1]));
  expect(between).not.toContain(order);
  expect(between.length).toBeLessThanOrEqual(1);
});

test("Voice off: nothing reaches the speech engine, through a whole Take", async ({ page }) => {
  await openShot(page, "session-between", WIDE);
  await page.waitForTimeout(500);
  expect((await speech(page)).filter((e) => e.op === "speak" || e.op === "stop")).toEqual([]);
});

test("the coach's keys: one line in the coach's slot, no panel, spoken with Voice on", async ({ page }) => {
  await openShot(page, "session-between", WIDE, "ember", { voice: "1", coachKeys: "1" });
  const finding = await headline(page);
  await expect.poll(async () => spoken(await speech(page)).length).toBe(2);
  await page.keyboard.press("j");
  const answer = page.locator('[data-testid="coach-answer"]');
  await expect(answer).toHaveText(finding);
  await expect.poll(async () => spoken(await speech(page)).at(-1)).toBe(finding);
  await page.keyboard.press("u");
  await expect(answer).toContainText(/Go again|Next|Start|See how it went/);
  const said = (await answer.innerText()).trim();
  await expect.poll(async () => spoken(await speech(page)).at(-1)).toBe(said);
  // No panel opened.
  await expect(page.locator("[data-testid='ask-panel']")).toHaveCount(0);
});
