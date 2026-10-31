/**
 * prefers-reduced-motion genuinely removes motion (docs/TESTING.md §5;
 * Phase 7), verified by toggling it: the cover lift does not run, no
 * element on either page keeps a transition or animation longer than a
 * frame, the camera's spread is brought into view without smooth scrolling,
 * and no video starts by itself. The shutter's ring is the one thing that
 * still moves: it is a clock drawn from elapsed time, not an animation.
 */
import { expect, test, type Page } from '@playwright/test';
import { addTo, cameraReady, seedEntry, signIn } from './helpers';

/** Elements still set to move for longer than ~a frame. */
function moving(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const seconds = (value: string) => Math.max(...value.split(',').map((v) => (v.trim().endsWith('ms') ? parseFloat(v) / 1000 : parseFloat(v)) || 0));
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      for (const pseudo of [null, '::before', '::after'] as const) {
        const s = getComputedStyle(el, pseudo);
        const transition = seconds(s.transitionDuration);
        const animation = s.animationName !== 'none' ? seconds(s.animationDuration) : 0;
        if (transition > 0.02 || animation > 0.02) out.push(`${el.tagName.toLowerCase()}.${el.className}${pseudo ?? ''} (transition ${transition}s, animation ${animation}s)`);
      }
    }
    return out;
  });
}

test.use({ colorScheme: 'dark' });

test('with reduced motion, the public site does not move', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.locator('#album').scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  // The cover lift is off: neither the cover nor the album is transformed.
  const transforms = await page.evaluate(() => [document.querySelector('.hero__cover'), document.querySelector('.album')].map((el) => (el ? getComputedStyle(el).transform : 'none')));
  expect(transforms.every((t) => t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)')).toBe(true);
  expect(await page.evaluate(() => document.documentElement.classList.contains('lift-ready'))).toBe(false);
  expect(await moving(page)).toEqual([]);
});

test('with reduced motion, the iPad does not move — except the shutter ring, which is a clock', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signIn(page);
  const entryId = await seedEntry(page, 1, { videos: 1 });
  await page.reload();
  expect(await moving(page)).toEqual([]);

  // Aiming the camera scrolls instantly, not smoothly.
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
  await addTo(page, entryId);
  await cameraReady(page);
  expect(await moving(page)).toEqual([]);

  // No video plays by itself.
  await page.locator(`[data-spread-id="${entryId}"] .numbers__item`).nth(1).click();
  const video = page.locator(`[data-spread-id="${entryId}"] video.mount__media`);
  await page.waitForTimeout(1_000);
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);

  // The self-timer ring still counts down: it is drawn from elapsed time.
  await addTo(page, entryId);
  await cameraReady(page);
  await page.locator('.shutter').click();
  const offset = () => page.locator('.shutter__ring-time').getAttribute('stroke-dashoffset');
  const first = await offset();
  await page.waitForTimeout(600);
  expect(await offset()).not.toBe(first);
  await page.locator('.shutter').click(); // cancel
});

test('without reduced motion, the cover lift is there to be turned off (the check above is not vacuous)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.classList.contains('lift-ready'))).toBe(true);
  expect((await moving(page)).length).toBeGreaterThan(0);
});
