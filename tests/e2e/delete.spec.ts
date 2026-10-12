/**
 * Deleting a photo or video on a writer iPad (owner request after Phase 5):
 * tapping an item's number shows a trash button in the middle of it; the
 * button asks "Delete this photo?" — Yes or No; Yes takes it out of the
 * album. Nothing is erased on the server (tests/removals.spec.ts).
 */
import { expect, test, type Page } from '@playwright/test';
import { addTo, cameraReady, seedEntry, serverEntries, signIn } from './helpers';

const spread = (page: Page, id: string) => page.locator(`[data-spread-id="${id}"]`);
const trash = (page: Page, id: string) => spread(page, id).locator('.mount__remove');
const numbers = (page: Page, id: string) => spread(page, id).locator('.numbers__item');
const dialog = (page: Page) => page.locator('dialog.confirm');

async function reloadWriter(page: Page) {
  await page.reload();
  await expect(page.locator('.rail')).toBeVisible();
}

async function mediaCount(page: Page, entryId: string) {
  return (await serverEntries(page)).find((e) => e.id === entryId)?.media.length ?? 0;
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test('the trash appears only after a number is tapped; No keeps the photo, Yes deletes it', async ({ page }) => {
  const entryId = await seedEntry(page, 3);
  await reloadWriter(page);
  await expect(trash(page, entryId)).toHaveCount(0);

  await numbers(page, entryId).nth(1).click();
  await expect(trash(page, entryId)).toBeVisible();
  await expect(trash(page, entryId)).toHaveAccessibleName('Delete this photo');
  // In the middle of the print, and a full-size target.
  const print = (await spread(page, entryId).locator('.mount__frame').boundingBox())!;
  const button = (await trash(page, entryId).boundingBox())!;
  expect(Math.abs(button.x + button.width / 2 - (print.x + print.width / 2))).toBeLessThan(2);
  expect(Math.abs(button.y + button.height / 2 - (print.y + print.height / 2))).toBeLessThan(2);
  expect(button.width).toBeGreaterThanOrEqual(44);

  // No: nothing changes.
  await trash(page, entryId).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).locator('.confirm__question')).toHaveText('Delete this photo?');
  await expect(dialog(page).locator('.confirm__no')).toBeFocused();
  await expect(dialog(page).locator('img.confirm__item')).toBeVisible();
  await dialog(page).locator('.confirm__no').click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(numbers(page, entryId)).toHaveCount(3);
  expect(await mediaCount(page, entryId)).toBe(3);

  // Escape is No too.
  await trash(page, entryId).click();
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  expect(await mediaCount(page, entryId)).toBe(3);

  // Yes: the photo that was showing (number 2) leaves the album.
  const shown = (await serverEntries(page)).find((e) => e.id === entryId)!.media[1].id;
  await trash(page, entryId).click();
  await dialog(page).locator('.confirm__yes').click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(numbers(page, entryId)).toHaveText(['1', '2']);
  await expect.poll(() => mediaCount(page, entryId)).toBe(2);
  expect((await serverEntries(page)).find((e) => e.id === entryId)!.media.map((m) => m.id)).not.toContain(shown);
  // Still gone after a reload, and the trash went with it.
  await reloadWriter(page);
  await expect(numbers(page, entryId)).toHaveCount(2);
  await expect(trash(page, entryId)).toHaveCount(0);
});

test('the live camera never shows the trash; "+" puts it away', async ({ page }) => {
  const entryId = await seedEntry(page, 2);
  await reloadWriter(page);
  await addTo(page, entryId);
  await cameraReady(page);
  await expect(trash(page, entryId)).toHaveCount(0);

  // A number turns the camera away and shows the trash; "+" brings the camera back and hides it.
  await numbers(page, entryId).first().click();
  await expect(trash(page, entryId)).toBeVisible();
  await addTo(page, entryId);
  await expect(trash(page, entryId)).toHaveCount(0);
});

test.describe('with a finger', () => {
  test.use({ hasTouch: true });

  test('swiping browses without the trash; tapping a number shows it', async ({ page }) => {
    const entryId = await seedEntry(page, 3);
    await reloadWriter(page);
    await spread(page, entryId).locator('.mount-wrap').scrollIntoViewIfNeeded();
    const box = (await spread(page, entryId).locator('.mount-wrap').boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const y = box.y + box.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width * 0.75, y }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width * (0.75 - i * 0.06), y }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(spread(page, entryId).locator('.numbers__item[aria-current="true"]')).toHaveText('2');
    await expect(trash(page, entryId)).toHaveCount(0);

    await numbers(page, entryId).nth(1).tap();
    await expect(trash(page, entryId)).toBeVisible();
  });
});

test('a video asks about the video, and a full spread gets its "+" back after a delete', async ({ page }) => {
  const entryId = await seedEntry(page, 5, { videos: 1 });
  await reloadWriter(page);
  await expect(spread(page, entryId).locator('.numbers__add')).toHaveCount(0); // six: full

  await numbers(page, entryId).nth(5).click();
  await expect(trash(page, entryId)).toHaveAccessibleName('Delete this video');
  await trash(page, entryId).click();
  await expect(dialog(page).locator('.confirm__question')).toHaveText('Delete this video?');
  await dialog(page).locator('.confirm__yes').click();

  await expect(numbers(page, entryId)).toHaveCount(5);
  await expect(spread(page, entryId).locator('.numbers__add')).toBeVisible();
  await expect(spread(page, entryId).locator('video.mount__media')).toHaveCount(0);
});

test('if the delete does not reach the server, the photo comes back and a notice says so', async ({ page }) => {
  const entryId = await seedEntry(page, 2);
  await reloadWriter(page);
  await page.route('**/api/media/*', (route) => (route.request().method() === 'DELETE' ? route.abort('internetdisconnected') : route.continue()));

  await numbers(page, entryId).first().click();
  await trash(page, entryId).click();
  await dialog(page).locator('.confirm__yes').click();
  await expect(page.locator('.writer__notices')).toContainText("That didn't delete. Check the wifi and try again.");
  await expect(numbers(page, entryId)).toHaveCount(2);
  expect(await mediaCount(page, entryId)).toBe(2);
});

test('the public album: no trash, and a spread with everything deleted is not shown', async ({ page }) => {
  const entryId = await seedEntry(page, 1);
  await reloadWriter(page);
  await numbers(page, entryId).first().click();
  await trash(page, entryId).click();
  await dialog(page).locator('.confirm__yes').click();
  await expect.poll(() => mediaCount(page, entryId)).toBe(0);
  // The iPad keeps the empty spread, ready to be filled again.
  await expect(spread(page, entryId)).toBeVisible();

  // Signed out, as a visitor: past the shared 30-second cache, as a visitor arriving later would be.
  await page.context().clearCookies();
  await page.route('**/api/entries', (route) => route.continue({ url: `${new URL(route.request().url()).origin}/api/entries?visitor=${Date.now()}` }));
  await page.goto('/');
  await page.locator('#album').scrollIntoViewIfNeeded();
  await expect(page.locator('.book')).toBeVisible();
  await expect(spread(page, entryId)).toHaveCount(0);
  await expect(page.locator('.mount__remove')).toHaveCount(0);
});
