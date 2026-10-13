/**
 * Settings (owner request after Phase 5): on a signed-in iPad, the album's
 * colour, photo frame, writing paper, watermark and decoration — one look for
 * the whole album, both iPads and the public site. Every test puts the
 * designed look back afterwards: the look is shared by every test.
 */
import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_LOOK, type AlbumLook } from '../../src/lib/settings';
import { openPage, seedEntry, signIn } from './helpers';

const sheet = (page: Page) => page.locator('dialog.settings');
const html = (page: Page) => page.locator('html');

/** Saves a look straight through the API from the signed-in page. */
function saveLookApi(page: Page, look: AlbumLook) {
  return page.evaluate(async (body) => {
    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    let time = '';
    for (let t = Date.now(), i = 0; i < 10; i++, t = Math.floor(t / 32)) time = alphabet[t % 32] + time;
    let random = '';
    for (let i = 0; i < 16; i++) random += alphabet[Math.floor(Math.random() * 32)];
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: `ipad1-${time}${random}`, look: body }),
    });
    if (!response.ok) throw new Error(`save look: ${response.status}`);
  }, look);
}

async function openSettings(page: Page) {
  await page.locator('.writer__settings').click();
  await expect(sheet(page)).toBeVisible();
}

/** The public album, past its shared 30-second cache, as a visitor arriving later would be. */
async function visitPublic(page: Page) {
  await page.context().clearCookies();
  await page.route(/\/api\/(entries|settings)$/, (route) => route.continue({ url: `${route.request().url()}?visitor=${Date.now()}` }));
  await page.goto('/');
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test.afterEach(async ({ page }) => {
  // Back to the designed album for the next test: without any stand-ins a test
  // put on the network, and signed in again if a test signed out.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  if (!(await page.evaluate(async () => (await fetch('/api/auth/session')).ok))) await signIn(page);
  await saveLookApi(page, DEFAULT_LOOK);
});

test('Settings is on signed-in iPads only, and choosing previews at once; Cancel and Escape put it back', async ({ page }) => {
  await expect(html(page)).toHaveAttribute('data-leaf', 'midnight');
  const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await openSettings(page);
  await sheet(page).getByLabel('Forest').check();
  await expect(html(page)).toHaveAttribute('data-leaf', 'forest');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(17, 26, 21)');
  await sheet(page).locator('.settings__cancel').click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(html(page)).toHaveAttribute('data-leaf', 'midnight');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(before);

  await openSettings(page);
  await sheet(page).getByLabel('Wine').check();
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toHaveCount(0);
  await expect(html(page)).toHaveAttribute('data-leaf', 'midnight');

  // Nothing was saved.
  await page.reload();
  await expect(html(page)).toHaveAttribute('data-leaf', 'midnight');

  // Visitors never see the control.
  await visitPublic(page);
  await page.locator('#album').scrollIntoViewIfNeeded();
  await expect(page.locator('.writer__settings')).toHaveCount(0);
});

test('a saved look is the album for everyone: both iPads and the public site, after a reload', async ({ page }) => {
  const entryId = await seedEntry(page, 1);
  await page.reload();
  await openSettings(page);
  await sheet(page).getByLabel('Navy').check();
  await sheet(page).getByLabel('Instant print').check();
  await sheet(page).getByLabel('White', { exact: true }).check();
  await sheet(page).getByLabel('Starlight').check();
  await sheet(page).locator('.settings__save').click();
  await expect(sheet(page)).toHaveCount(0);

  const check = async () => {
    await expect(html(page)).toHaveAttribute('data-leaf', 'navy');
    await expect(html(page)).toHaveAttribute('data-frame', 'polaroid');
    await expect(html(page)).toHaveAttribute('data-paper', 'white');
    await expect(html(page)).toHaveAttribute('data-theme', 'starlight');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(15, 26, 43)');
    const spread = page.locator(`[data-spread-id="${entryId}"]`);
    await spread.scrollIntoViewIfNeeded();
    // Instant print: no corners, a deeper foot; white paper, no ruling; ornaments on the leaf.
    await expect(spread.locator('.corner').first()).toBeHidden();
    expect(await spread.locator('.mount__print').evaluate((el) => getComputedStyle(el).paddingBottom)).toBe('32px');
    await expect(spread.locator('.writing-page').first()).toHaveCSS('background-color', 'rgb(251, 250, 247)');
    await expect(spread.locator('.writing-page__rules').first()).toBeHidden();
    // Ornaments on the album's leaf, actually painted: the leaf shows lighter pixels than its own colour.
    expect(await page.evaluate(() => {
      const before = getComputedStyle(document.querySelector('.album')!, '::before');
      return (before.maskImage || before.webkitMaskImage) + ' ' + before.backgroundColor;
    })).toMatch(/data:image\/svg\+xml.* rgba\(232, 228, 220, 0\.12\)/);
  };

  await check();
  await page.reload();
  await check();
  await visitPublic(page);
  await page.locator('#album').scrollIntoViewIfNeeded();
  await check();
});

test('the watermark: up to 24 characters, on every page, where it is put; empty means none', async ({ page }) => {
  const entryId = await seedEntry(page, 1);
  await page.reload();
  await openSettings(page);
  const input = sheet(page).getByLabel('Text on every page');
  await expect(input).toHaveAttribute('maxlength', '24');
  await input.fill('R & A · 19.12.2026 · forever and ever');
  await expect(input).toHaveValue('R & A · 19.12.2026 · for');
  await expect(sheet(page).locator('.settings__count')).toHaveText('24 of 24');
  await input.fill('R & A');
  await sheet(page).getByLabel('Top right').check();
  await sheet(page).locator('.settings__save').click();
  await expect(sheet(page)).toHaveCount(0);

  // On a saved page and on the page being written, top right, under the ink.
  const mark = page.locator(`[data-spread-id="${entryId}"] .writing-page__watermark`);
  await expect(mark).toHaveText('R & A');
  await expect(mark).toHaveAttribute('aria-hidden', 'true');
  const paper = (await page.locator(`[data-spread-id="${entryId}"] .writing-page`).boundingBox())!;
  const box = (await mark.boundingBox())!;
  expect(box.x).toBeGreaterThan(paper.x + paper.width / 2);
  expect(box.y + box.height).toBeLessThan(paper.y + paper.height / 3);
  await openPage(page, entryId);
  await expect(page.locator('.writing-page--live .writing-page__watermark')).toHaveText('R & A');
  // It never takes the pen.
  await expect(page.locator('.writing-page--live .writing-page__watermark')).toHaveCSS('pointer-events', 'none');

  // On the public album too.
  await visitPublic(page);
  await page.locator('#album').scrollIntoViewIfNeeded();
  await expect(page.locator(`[data-spread-id="${entryId}"] .writing-page__watermark`)).toHaveText('R & A');

  // Emptied, it is gone.
  await signIn(page);
  await openSettings(page);
  await sheet(page).getByLabel('Text on every page').fill('');
  await sheet(page).locator('.settings__save').click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.locator('.writing-page__watermark')).toHaveCount(0);
});

test('a returning visitor sees the last look from the first paint, before the album loads', async ({ page }) => {
  await saveLookApi(page, { ...DEFAULT_LOOK, leaf: 'walnut' });
  await visitPublic(page);
  await page.locator('#album').scrollIntoViewIfNeeded();
  await expect(html(page)).toHaveAttribute('data-leaf', 'walnut');
  // Next visit: the inline script applies it before any island code runs.
  await page.route('**/_astro/**', (route) => route.abort());
  await page.goto('/');
  await expect(html(page)).toHaveAttribute('data-leaf', 'walnut');
});

test('if the save does not go through, the sheet stays open and says why', async ({ page }) => {
  const message = "Settings aren't set up on this database yet. The owner needs to apply migration 0003_album_settings.";
  await page.route('**/api/settings', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'migration_missing', message }) })
      : route.continue(),
  );
  await openSettings(page);
  await sheet(page).getByLabel('Charcoal').check();
  await sheet(page).locator('.settings__save').click();
  await expect(sheet(page).locator('.settings__problem')).toHaveText(message);
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).locator('.settings__save')).toBeEnabled();
});
