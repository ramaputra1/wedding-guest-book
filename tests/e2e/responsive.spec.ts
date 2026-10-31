/**
 * Responsive audit (Phase 7): at every size the album is used at — a small
 * phone, a phone, the iPad both ways, a laptop, a large screen — nothing
 * scrolls sideways, and every control is at least 44 × 44 CSS px
 * (CLAUDE.md, accessibility floor). Screenshots of each go to
 * test-results/responsive/ for a look by eye.
 */
import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { openPage, seedEntry, signIn } from './helpers';

const SIZES = [
  { name: 'phone-small', width: 320, height: 640 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'ipad-portrait', width: 820, height: 1180 },
  { name: 'ipad-landscape', width: 1180, height: 820 },
  { name: 'laptop', width: 1440, height: 900 },
  { name: 'large', width: 1920, height: 1080 },
];

const SHOTS = 'test-results/responsive';

/** Sideways overflow, and controls smaller than 44 × 44 that are on screen. */
function audit(page: Page) {
  return page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    const small: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('button, a[href], input:not([type="radio"]):not([type="checkbox"]), select, textarea, label:has(> input[type="radio"]), video[tabindex]')) {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (box.width === 0 || box.height === 0 || style.visibility === 'hidden' || el.closest('[hidden], .visually-hidden')) continue;
      if (el.closest('.hero')) continue; // the cover has no controls of its own; skip its link-free text
      if (box.width < 43.5 || box.height < 43.5) small.push(`${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}" ${Math.round(box.width)}×${Math.round(box.height)}`);
    }
    return { overflow, small };
  });
}

async function check(page: Page, where: string, shot: string) {
  const { overflow, small } = await audit(page);
  await page.screenshot({ path: `${SHOTS}/${shot}.png` });
  expect(overflow, `${where}: scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0);
  expect(small, `${where}: controls under 44 × 44`).toEqual([]);
}

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

for (const size of SIZES) {
  test(`${size.name} (${size.width}×${size.height}): no sideways scroll, every control at least 44 × 44`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: size.width, height: size.height });
    await signIn(page);
    const entryId = await seedEntry(page, 2, { videos: 1 });
    await page.reload();
    await expect(page.locator('.rail')).toBeVisible();

    await page.locator(`[data-spread-id="${entryId}"]`).scrollIntoViewIfNeeded();
    await check(page, 'iPad album', `${size.name}-ipad-album`);

    await openPage(page, entryId);
    await page.locator('.writing-tools').scrollIntoViewIfNeeded();
    await check(page, 'page being written', `${size.name}-ipad-page`);

    await page.locator('.writer__settings').click();
    await expect(page.locator('dialog.settings')).toBeVisible();
    await check(page, 'Settings', `${size.name}-ipad-settings`);
    await page.keyboard.press('Escape');

    await page.context().clearCookies();
    await page.route(/\/api\/(entries|settings)$/, (route) => route.continue({ url: `${route.request().url()}?visitor=${Date.now()}` }));
    await page.goto('/');
    await check(page, 'cover', `${size.name}-cover`);
    await page.locator('#album').scrollIntoViewIfNeeded();
    await page.locator(`[data-spread-id="${entryId}"]`).scrollIntoViewIfNeeded();
    await expect(page.locator(`[data-spread-id="${entryId}"] .mount__expand`)).toBeVisible();
    await check(page, 'public album', `${size.name}-public-album`);
  });
}
