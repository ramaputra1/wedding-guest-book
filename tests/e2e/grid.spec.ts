/**
 * How a writer iPad aims the camera and opens a page (owner requests after
 * Phase 5): the camera is aimed only with a spread's "+", numbers replace the
 * carousel dots, a spread holds at most six photos and videos, a page opens
 * only by tapping it, and the preview is never mirrored.
 */
import { expect, test, type Page } from '@playwright/test';
import { addTo, cameraReady, openPage, serverEntries, shootAndWaitSaved, signIn, seedEntry } from './helpers';

const live = (page: Page) => page.locator('video.mount__live');
const plus = (page: Page, spreadId: string) => page.locator(`[data-spread-id="${spreadId}"] .numbers__add`);
const numbers = (page: Page, spreadId: string) => page.locator(`[data-spread-id="${spreadId}"] .numbers__item`);

/** Reloads and signs nothing in again: the session cookie is still there. */
async function reloadWriter(page: Page) {
  await page.reload();
  await expect(page.locator('.rail')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test('nothing is aimed until a "+" is pressed; tapping a mount does nothing', async ({ page }) => {
  await expect(live(page)).toHaveCount(0);
  await expect(page.locator('.shutter')).toBeDisabled();
  await expect(page.locator('.rail__destination')).toHaveText('Tap + on a spread');
  await expect(page.locator('.writing-page--live')).toHaveCount(0);

  // The mount is no longer a control.
  await expect(page.locator('button.mount')).toHaveCount(0);
  await page.locator('[data-spread-id="new-spread"] .mount').click();
  await expect(live(page)).toHaveCount(0);

  await addTo(page);
  await cameraReady(page);
  await expect(page.locator('.rail__destination')).toHaveText(/→\s*New spread/);
  await expect(page.locator('[data-spread-id="new-spread"] .mount')).toHaveAttribute('data-selected', 'true');
  await expect(plus(page, 'new-spread')).toHaveAccessibleName('Add a photo or video to New spread');

  // Pressed again, the "+" lets go: the camera turns off.
  await plus(page, 'new-spread').click();
  await expect(plus(page, 'new-spread')).toHaveAttribute('aria-pressed', 'false');
  await expect(live(page)).toHaveCount(0);
  await expect(page.locator('.shutter')).toBeDisabled();
});

test('the preview is never mirrored: it shows what will be saved', async ({ page }) => {
  await addTo(page);
  await cameraReady(page);
  await expect(live(page)).toHaveCSS('transform', 'none');
  await expect(live(page)).not.toHaveClass(/mirrored/);
});

test('numbers replace the dots; choosing one shows that item and turns the camera away', async ({ page }) => {
  const entryId = await seedEntry(page, 2);
  await reloadWriter(page);
  await expect(numbers(page, entryId)).toHaveText(['1', '2']);
  await expect(page.locator(`[data-spread-id="${entryId}"] .numbers`)).toHaveAccessibleName(/2 items$/);

  await addTo(page, entryId);
  await cameraReady(page);
  // While the viewfinder shows, no number is underlined.
  await expect(page.locator(`[data-spread-id="${entryId}"] .numbers__item[aria-current="true"]`)).toHaveCount(0);

  await numbers(page, entryId).first().click();
  await expect(live(page)).toHaveCount(0);
  await expect(plus(page, entryId)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator(`[data-spread-id="${entryId}"] .numbers__item[aria-current="true"]`)).toHaveText('1');
  await expect(page.locator(`[data-spread-id="${entryId}"] img.mount__media`)).toBeVisible();
  await expect(page.locator('.shutter')).toBeDisabled();

  // Every target is at least 44 × 44, and the current number is underlined in brass.
  for (const control of await page.locator(`[data-spread-id="${entryId}"] .numbers button`).all()) {
    const box = (await control.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  const underline = await page
    .locator(`[data-spread-id="${entryId}"] .numbers__item[aria-current="true"]`)
    .evaluate((el) => getComputedStyle(el, '::after').backgroundColor);
  expect(underline).toBe('rgb(160, 138, 82)'); // --brass

  // "+" again brings the camera back to the same spread.
  await addTo(page, entryId);
  await cameraReady(page);
});

test('a spread holds six photos and videos: at six the "+" goes and the camera turns away', async ({ page }) => {
  const entryId = await seedEntry(page, 5);
  await reloadWriter(page);
  await addTo(page, entryId);
  await cameraReady(page);
  await shootAndWaitSaved(page);

  await expect(numbers(page, entryId)).toHaveText(['1', '2', '3', '4', '5', '6']);
  await expect(plus(page, entryId)).toHaveCount(0);
  await expect(live(page)).toHaveCount(0);
  await expect(page.locator('.rail__destination')).toHaveText('Tap + on a spread');
  expect((await serverEntries(page)).find((e) => e.id === entryId)!.media).toHaveLength(6);

  // Still full after a reload: the "+" is not offered.
  await reloadWriter(page);
  await expect(numbers(page, entryId)).toHaveCount(6);
  await expect(plus(page, entryId)).toHaveCount(0);
});

test('a page opens only when it is tapped, whatever the camera is aimed at', async ({ page }) => {
  const first = await seedEntry(page, 1);
  const second = await seedEntry(page, 1);
  await reloadWriter(page);

  await addTo(page, first);
  await cameraReady(page);
  // Aiming the camera opens no page.
  await expect(page.locator('.writing-page--live')).toHaveCount(0);

  await openPage(page, second);
  await expect(page.locator('.writing-page--live')).toHaveCount(1);
  // The camera stays where it was.
  await expect(page.locator(`[data-spread-id="${first}"] .mount`)).toHaveAttribute('data-selected', 'true');
  await expect(page.locator(`[data-spread-id="${first}"] video.mount__live`)).toHaveCount(1);

  // Tapping another page moves the pen there; the first goes back to paper.
  await openPage(page, first);
  await expect(page.locator(`[data-spread-id="${second}"] .writing-page--live`)).toHaveCount(0);
  await expect(page.locator('.writing-page--live')).toHaveCount(1);
});

test('a photo and a page both started on "New spread" end up on the same spread', async ({ page }) => {
  await openPage(page);
  const box = (await page.locator('.writing-page--live canvas.writing-page__pen').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.4, { steps: 10 });
  await page.mouse.up();

  await addTo(page);
  await cameraReady(page);
  await shootAndWaitSaved(page);

  const entryId = (await serverEntries(page)).at(-1)!.id;
  // The camera followed the new spread, and so did the unsaved page, strokes and all.
  await expect(page.locator(`[data-spread-id="${entryId}"] .mount`)).toHaveAttribute('data-selected', 'true');
  await expect(page.locator(`[data-spread-id="${entryId}"] .writing-page--live canvas.writing-page__pen`)).toHaveAttribute(
    'aria-label',
    /1 stroke\./,
  );
  await expect(page.locator('[data-spread-id="new-spread"] .writing-page--live')).toHaveCount(0);
});

test('the public album uses numbers too, and has no "+"', async ({ page }) => {
  const entryId = await seedEntry(page, 3);
  await page.goto('/');
  await page.locator('#album').scrollIntoViewIfNeeded();
  const spread = page.locator(`[data-spread-id="${entryId}"]`);
  await expect(spread.locator('.numbers__item')).toHaveText(['1', '2', '3']);
  await expect(page.locator('.numbers__add')).toHaveCount(0);
  await expect(spread.locator('.numbers__item[aria-current="true"]')).toHaveText('1');
  await spread.locator('.numbers__item').nth(2).click();
  await expect(spread.locator('.numbers__item[aria-current="true"]')).toHaveText('3');
});
