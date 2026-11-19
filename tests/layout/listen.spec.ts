/*
 * Listen first (card #28): Watch with Sound on a Take's ready screen. The
 * Sound switch sits beside Watch and fits; Watch plays one pass (a bar of
 * count-in, then the notes, lit from the engine's position) and stops by
 * itself, offering "Watch again"; nothing runs a Take meanwhile.
 *
 * `LISTEN_SHOTS=<dir>` also writes the two pictures the card asks for.
 */
import { test, expect } from "@playwright/test";
import { openShot, insideViewport, notHitTestable } from "./fits";

const SHOTS = process.env.LISTEN_SHOTS;

for (const size of [
  { width: 1400, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`Watch with Sound plays one pass and stops by itself, at ${size.width}px`, async ({ page }) => {
    test.setTimeout(60_000);
    await openShot(page, "session-neck-sweep", size);
    await page.waitForTimeout(1600);
    const watch = page.locator('[data-testid="practice-watch"]');
    const sound = page.locator('[data-testid="practice-sound"]');
    await expect(sound).toHaveAttribute("aria-pressed", "true");
    await expect(watch).toHaveAttribute("data-sound", "");
    await insideViewport(page, '[data-testid="practice-sound"]', `Sound at ${size.width}px`, size);
    expect(await notHitTestable(page, '[data-testid="practice-sound"]')).toEqual([]);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/ready-watch-sound-${size.width}.png` });

    await watch.click();
    await expect(watch).toHaveAttribute("aria-pressed", "true");
    // Past the count-in: a note is NOW, the dots count, and it is still the ready screen.
    await expect(page.locator('[data-testid="practice-beats"] i[data-on]')).toHaveCount(1, { timeout: 5000 });
    await page.waitForTimeout(4200);
    await expect(watch).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-testid="session-live"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="session-take"]')).toHaveAttribute("data-phase", "ready");
    // The input line says the app is playing it, not "Play a note to check."
    await expect(page.locator('[data-testid="session-listen-note"]')).toContainText("Playing it for you");
    await expect(page.locator('[data-testid="session-input-on"]')).toHaveCount(0);
        // Start take stays pressable while it plays: it stops the demo, then starts the Take.
    await expect(page.locator('[data-testid="session-big"]')).toBeEnabled();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/mid-listen-${size.width}.png` });

    // One pass, then it stops itself and offers it again.
    await expect(watch).toHaveAttribute("aria-pressed", "false", { timeout: 40_000 });
    await expect(watch).toContainText("Watch again");
    await expect(page.locator('[data-testid="session-listen-note"]')).toHaveCount(0);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/after-listen-${size.width}.png` });
    await expect(page.locator('[data-testid="practice-now-tag"]')).toBeVisible();
    await expect(page.locator('[data-testid="session-take"]')).toHaveAttribute("data-phase", "ready");
  });
}

test("Start take during the demo stops it and starts the Take", async ({ page }) => {
  await openShot(page, "session-neck-sweep", { width: 1400, height: 900 });
  const watch = page.locator('[data-testid="practice-watch"]');
  await watch.click();
  await expect(watch).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(1500);
  await page.locator('[data-testid="session-big"]').click();
  await expect(page.locator('[data-testid="session-live"]')).toBeVisible({ timeout: 10_000 });
  await expect(watch).toHaveCount(0);
});

test("Sound off: Watch is the silent preview again, and loops until stopped", async ({ page }) => {
  await openShot(page, "session-neck-sweep", { width: 1400, height: 900 });
  const sound = page.locator('[data-testid="practice-sound"]');
  await sound.click();
  await expect(sound).toHaveAttribute("aria-pressed", "false");
  const watch = page.locator('[data-testid="practice-watch"]');
  await expect(watch).not.toHaveAttribute("data-sound", "");
  await watch.click();
  await expect(watch).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-testid="practice-beats"] i[data-on]')).toHaveCount(1, { timeout: 3000 });
  await watch.click();
  await expect(watch).toHaveAttribute("aria-pressed", "false");
});
