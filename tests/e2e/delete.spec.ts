/**
 * Deleting a photo or video on a writer iPad (owner request after Phase 5):
 * every saved item on show carries the word "Delete", underlined, just above
 * its top right — on the leaf, never over the picture; it asks "Delete this photo?" — Yes or No; Yes takes it out of the
 * album. Nothing is erased on the server (tests/removals.spec.ts).
 */
import { expect, test, type Page } from '@playwright/test';
import { addTo, cameraReady, seedEntry, serverEntries, signIn } from './helpers';

const spread = (page: Page, id: string) => page.locator(`[data-spread-id="${id}"]`);
const del = (page: Page, id: string) => spread(page, id).locator('.mount__delete');
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

test('"Delete" sits at the top right of every saved item; No keeps it, Yes deletes it', async ({ page }) => {
  const entryId = await seedEntry(page, 3);
  await reloadWriter(page);
  await spread(page, entryId).scrollIntoViewIfNeeded();

  // There from the start — no number needs tapping.
  await expect(del(page, entryId)).toBeVisible();
  await expect(del(page, entryId)).toHaveText('Delete');
  await expect(del(page, entryId)).toHaveAccessibleName('Delete this photo');
  await expect(del(page, entryId)).toHaveCSS('text-decoration-line', 'underline');
  // Above the print's top right — not over the picture — with no plate behind it, and a full-size target.
  const print = (await spread(page, entryId).locator('.mount__frame').boundingBox())!;
  const button = (await del(page, entryId).boundingBox())!;
  expect(button.y + button.height).toBeLessThanOrEqual(print.y);
  expect(Math.abs(button.x + button.width - (print.x + print.width))).toBeLessThan(2);
  await expect(del(page, entryId)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  expect(button.width).toBeGreaterThanOrEqual(44);
  expect(button.height).toBeGreaterThanOrEqual(44);

  // No: nothing changes.
  await numbers(page, entryId).nth(1).click();
  await del(page, entryId).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).locator('.confirm__question')).toHaveText('Delete this photo?');
  await expect(dialog(page).locator('.confirm__no')).toBeFocused();
  await expect(dialog(page).locator('img.confirm__item')).toBeVisible();
  await dialog(page).locator('.confirm__no').click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(numbers(page, entryId)).toHaveCount(3);
  expect(await mediaCount(page, entryId)).toBe(3);

  // Escape is No too.
  await del(page, entryId).click();
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  expect(await mediaCount(page, entryId)).toBe(3);

  // Yes: the photo on show (number 2) leaves the album.
  const shown = (await serverEntries(page)).find((e) => e.id === entryId)!.media[1].id;
  await del(page, entryId).click();
  await dialog(page).locator('.confirm__yes').click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(numbers(page, entryId)).toHaveText(['1', '2']);
  await expect.poll(() => mediaCount(page, entryId)).toBe(2);
  expect((await serverEntries(page)).find((e) => e.id === entryId)!.media.map((m) => m.id)).not.toContain(shown);
  await reloadWriter(page);
  await expect(numbers(page, entryId)).toHaveCount(2);
});

test('the live camera has no "Delete"; it comes back with the item', async ({ page }) => {
  const entryId = await seedEntry(page, 2);
  await reloadWriter(page);
  await addTo(page, entryId);
  await cameraReady(page);
  await expect(del(page, entryId)).toHaveCount(0);

  await numbers(page, entryId).first().click();
  await expect(del(page, entryId)).toBeVisible();
});

test('a video asks about the video, and a full spread gets its "+" back after a delete', async ({ page }) => {
  const entryId = await seedEntry(page, 5, { videos: 1 });
  await reloadWriter(page);
  await expect(spread(page, entryId).locator('.numbers__add')).toHaveCount(0); // six: full

  await numbers(page, entryId).nth(5).click();
  await expect(del(page, entryId)).toHaveAccessibleName('Delete this video');
  await del(page, entryId).click();
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

  await del(page, entryId).click();
  await dialog(page).locator('.confirm__yes').click();
  await expect(page.locator('.writer__notices')).toContainText("That didn't delete. Check the wifi and try again.");
  await expect(numbers(page, entryId)).toHaveCount(2);
  expect(await mediaCount(page, entryId)).toBe(2);
});

test('when the server answers with a problem, the notice says what the server said — not "check the wifi"', async ({ page }) => {
  const entryId = await seedEntry(page, 1);
  await reloadWriter(page);
  const message = "Deleting isn't set up on this database yet. The owner needs to apply migration 0002_media_removals.";
  await page.route('**/api/media/*', (route) =>
    route.request().method() === 'DELETE'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'migration_missing', message }) })
      : route.continue(),
  );
  await del(page, entryId).click();
  await dialog(page).locator('.confirm__yes').click();
  await expect(page.locator('.writer__notices')).toContainText(message);
  await expect(page.locator('.writer__notices')).not.toContainText('wifi');
  await expect(numbers(page, entryId)).toHaveCount(1);
});

test('the public album: no "Delete", and a spread with everything deleted is not shown', async ({ page }) => {
  const entryId = await seedEntry(page, 1);
  await reloadWriter(page);
  await del(page, entryId).click();
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
  await expect(page.locator('.mount__delete')).toHaveCount(0);
});
