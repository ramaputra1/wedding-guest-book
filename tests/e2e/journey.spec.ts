/**
 * The core journey (docs/TESTING.md §4; Phase 7), end to end, on both iPads:
 *
 *   load → scroll past the hero → album → sign in → select a slot → capture
 *   → save a canvas → reload → everything persists — and the public album
 *   shows it.
 *
 * Plus both iPads at once, writing into the album side by side.
 */
import { expect, test, type Page } from '@playwright/test';
import { addTo, allSaved, cameraReady, openPage, savedMediaCount, serverEntries, shootAndWaitSaved, shutter } from './helpers';

const DEVICES = ['ipad1', 'ipad2'] as const;

/** A short stroke across the open page. */
async function write(page: Page) {
  const pen = page.locator('.writing-page--live canvas.writing-page__pen');
  await pen.scrollIntoViewIfNeeded();
  const box = (await pen.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.45, { steps: 12 });
  await page.mouse.up();
  await expect(pen).toHaveAttribute('aria-label', /1 stroke\./);
}

async function savePageAndWait(page: Page, entryId: string) {
  await page.locator('.writing-tool--save').click();
  await expect(page.locator('.writing-page--live')).toHaveCount(0);
  await expect
    .poll(async () => (await serverEntries(page)).find((e) => e.id === entryId)?.canvas?.version ?? 0, { timeout: 60_000 })
    .toBe(1);
}

for (const device of DEVICES) {
  test(`${device}: load → sign in → select a slot → capture → save a page → reload → everything persists`, async ({ page }) => {
    test.setTimeout(180_000);

    // Load: the iPad's page names the device and asks for the passphrase.
    await page.goto(`/${device}`);
    await expect(page).toHaveTitle(new RegExp(device === 'ipad1' ? 'iPad 1' : 'iPad 2'));
    await page.locator('#passphrase').fill(process.env.E2E_PASSPHRASE!);
    await page.keyboard.press('Enter');
    await expect(page.locator('.rail')).toBeVisible();

    // Select a slot: the new spread's "+", then capture a photo into it.
    await addTo(page, 'new-spread');
    await cameraReady(page);
    await shootAndWaitSaved(page);
    const entry = (await serverEntries(page)).at(-1)!;
    expect(entry.deviceId).toBe(device);
    expect(entry.media).toHaveLength(1);
    expect(entry.media[0].id.startsWith(`${device}-`)).toBe(true);

    // Write on that spread's page and save it.
    await openPage(page, entry.id);
    await write(page);
    await savePageAndWait(page, entry.id);

    // Reload: the photo and the handwriting are still there.
    await page.reload();
    await expect(page.locator('.rail')).toBeVisible();
    const spread = page.locator(`[data-spread-id="${entry.id}"]`);
    await spread.scrollIntoViewIfNeeded();
    await expect(spread.locator('img.mount__media')).toBeVisible();
    await expect(spread.locator('img.writing-page__ink')).toBeVisible();
    await openPage(page, entry.id);
    await expect(page.locator('.writing-page--live canvas.writing-page__pen')).toHaveAttribute('aria-label', /1 stroke\./);

    // The public album: load, scroll past the hero, and it is there for everyone.
    await page.context().clearCookies();
    await page.route(/\/api\/(entries|settings)$/, (route) => route.continue({ url: `${route.request().url()}?visitor=${Date.now()}` }));
    await page.goto('/');
    await expect(page.locator('.hero')).toBeVisible();
    await page.locator('#album').scrollIntoViewIfNeeded();
    const publicSpread = page.locator(`[data-spread-id="${entry.id}"]`);
    await publicSpread.scrollIntoViewIfNeeded();
    await expect(publicSpread.locator('img.mount__media')).toBeVisible();
    await expect(publicSpread.locator('img.writing-page__ink')).toBeVisible();
    // Read-only: no write control is reachable.
    await expect(page.locator('.rail, .numbers__add, .mount__delete, .writing-page__choose, .writer__settings')).toHaveCount(0);
  });
}

test('both iPads at once: each captures into its own spread, and each sees the other\'s', async ({ browser }) => {
  test.setTimeout(240_000);
  const pages = await Promise.all(
    DEVICES.map(async (device) => {
      const context = await browser.newContext({ permissions: ['camera', 'microphone'], baseURL: process.env.E2E_BASE_URL });
      const page = await context.newPage();
      await page.goto(`/${device}`);
      await page.locator('#passphrase').fill(process.env.E2E_PASSPHRASE!);
      await page.keyboard.press('Enter');
      await expect(page.locator('.rail')).toBeVisible();
      await addTo(page, 'new-spread');
      await cameraReady(page);
      return page;
    }),
  );
  // Both shutters together: two new items, one from each iPad.
  const before = await savedMediaCount(pages[0]);
  await Promise.all(pages.map((page) => shutter(page)));
  await expect.poll(() => savedMediaCount(pages[0]), { timeout: 60_000 }).toBe(before + 2);
  await Promise.all(pages.map((page) => allSaved(page)));

  const entries = await serverEntries(pages[0]);
  const ipad1 = entries.filter((e) => e.deviceId === 'ipad1').at(-1)!;
  const ipad2 = entries.filter((e) => e.deviceId === 'ipad2').at(-1)!;
  expect(ipad1.id).not.toBe(ipad2.id);
  expect(ipad1.media).toHaveLength(1);
  expect(ipad2.media).toHaveLength(1);

  // Each iPad sees the other's spread after its album refreshes.
  for (const [page, other] of [
    [pages[0], ipad2],
    [pages[1], ipad1],
  ] as const) {
    await page.reload();
    await expect(page.locator(`[data-spread-id="${other.id}"] img.mount__media`)).toBeVisible();
  }
  await Promise.all(pages.map((page) => page.context().close()));
});
