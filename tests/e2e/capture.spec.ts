/**
 * Capture, end to end: Chrome's fake camera → the island → IndexedDB → the
 * real Functions → D1 + R2 → the album. Phase 4 acceptance criteria.
 */
import { expect, test } from '@playwright/test';
import { addTo, allSaved, cameraReady, savedMediaCount, serverEntries, serverStats, shootAndWaitSaved, shutter, signIn } from './helpers';

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await addTo(page);
  await cameraReady(page);
});

test('a photo is captured, resized, saved, and lands in the selected spread', async ({ page }) => {
  const before = (await serverEntries(page)).length;

  // 1st photo → a new spread, which becomes the destination.
  await shootAndWaitSaved(page);
  const afterFirst = await serverEntries(page);
  expect(afterFirst.length).toBe(before + 1);
  const first = afterFirst.at(-1)!;
  expect(first.media).toHaveLength(1);
  const photo = first.media[0];
  expect(photo.kind).toBe('photo');
  expect(Math.max(photo.width!, photo.height!)).toBeLessThanOrEqual(2560);

  // 2nd: choose "New spread" explicitly → a second spread.
  await addTo(page, 'new-spread');
  await cameraReady(page);
  await shootAndWaitSaved(page);
  const second = (await serverEntries(page)).at(-1)!;
  expect(second.id).not.toBe(first.id);

  // 3rd: select the FIRST spread, capture → it must land there, not in the latest.
  await addTo(page, first.id);
  await expect(page.locator(`[data-spread-id="${first.id}"] .mount`)).toHaveAttribute('data-selected', 'true');
  await cameraReady(page);
  await shootAndWaitSaved(page);
  const after = await serverEntries(page);
  expect(after.find((e) => e.id === first.id)!.media).toHaveLength(2);
  expect(after.find((e) => e.id === second.id)!.media).toHaveLength(1);
});

test('video stops by itself at 15 seconds, is H.264 MP4, and has a real poster frame', async ({ page }) => {
  test.setTimeout(150_000);
  await page.locator('.rail__mode-option').nth(1).click();
  await cameraReady(page);
  const before = await savedMediaCount(page);

  await shutter(page);
  await expect(page.locator('.shutter')).toHaveAttribute('data-recording', 'true');
  const started = Date.now();
  // Nobody presses stop.
  await expect(page.locator('.shutter')).not.toHaveAttribute('data-recording', 'true', { timeout: 25_000 });
  const elapsed = Date.now() - started;
  expect(elapsed).toBeGreaterThan(14_000);
  expect(elapsed).toBeLessThan(17_000);

  await expect.poll(() => savedMediaCount(page), { timeout: 60_000 }).toBe(before + 1);
  await allSaved(page);
  const video = (await serverEntries(page)).flatMap((e) => e.media).filter((m) => m.kind === 'video').at(-1)!;
  // The server stored the duration it read from the file.
  expect(video.durationMs).toBeGreaterThan(14_000);
  expect(video.durationMs).toBeLessThanOrEqual(15_500);

  // MP4 container, H.264 video ('avc1'), served as video/mp4.
  const file = await page.evaluate(async (url) => {
    const response = await fetch(url);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const text = new TextDecoder('latin1').decode(bytes.slice(0, 4096));
    return { type: response.headers.get('content-type'), ftyp: text.slice(4, 8), brand: text.slice(8, 12), avc1: text.includes('avc1'), size: bytes.length };
  }, video.url);
  expect(file).toMatchObject({ type: 'video/mp4', ftyp: 'ftyp', avc1: true });
  expect(file.brand).not.toBe('qt  ');

  // The poster is a real frame: Chrome's fake camera is bright green, never black.
  const brightness = await page.evaluate(async (url) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 18;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0, 32, 18);
    const { data } = context.getImageData(0, 0, 32, 18);
    let total = 0;
    for (let i = 0; i < data.length; i += 4) total += (data[i] + data[i + 1] + data[i + 2]) / 3;
    return total / (data.length / 4);
  }, video.posterUrl!);
  expect(brightness).toBeGreaterThan(40);
});

test('the storage gauge shows what /api/stats reports', async ({ page }) => {
  const stats = await serverStats(page);
  const used = stats.bytesUsed / 1e9;
  const expected = `${used < 10 ? used.toFixed(1) : Math.round(used)} of ${Math.round(stats.bytesAllowance / 1e9)} GB used`;
  await expect(page.locator('.rail__gauge')).toHaveText(expected);
});

test('a saved video plays from the public album (Chrome)', async ({ page }) => {
  const entry = (await serverEntries(page)).find((e) => e.media[0]?.kind === 'video');
  test.skip(!entry, 'needs the 15-second video from the test above');
  await page.goto('/');
  await page.locator('#album').scrollIntoViewIfNeeded();
  // On the public album the mount opens the full item; this spread's first item is the video.
  await page.locator(`[data-spread-id="${entry!.id}"] button.mount--open`).click();
  const player = page.locator('dialog.viewer video');
  await expect(player).toBeVisible();
  await expect.poll(() => player.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 15_000 }).toBeGreaterThan(0.5);
  expect(await player.evaluate((v: HTMLVideoElement) => ({ width: v.videoWidth, error: v.error?.code ?? null }))).toEqual({ width: 1280, error: null });
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.viewer')).toHaveCount(0);
});

test('a photo waits for its self-timer: 3 s by default, 5 s when chosen; a second tap cancels', async ({ page }) => {
  test.setTimeout(90_000);
  const firstUpload = () => page.waitForRequest((r) => r.method() === 'PUT' && /\/api\/media\/[^/]+\/original/.test(r.url()), { timeout: 20_000 });

  // Default: 3 s, counted down on the viewfinder, shot no earlier.
  await expect(page.locator('.rail__timer-option input[value="3"]')).toBeChecked();
  let upload = firstUpload();
  let pressed = Date.now();
  await shutter(page);
  await expect(page.locator('.mount__countdown')).toHaveText('3');
  await expect(page.locator('.shutter')).toHaveAttribute('aria-label', 'Cancel timer');
  await upload;
  expect(Date.now() - pressed).toBeGreaterThanOrEqual(2_900);
  await expect(page.locator('.mount__countdown')).toHaveCount(0);
  await allSaved(page);

  // 5 s when chosen.
  await page.locator('.rail__timer-option', { hasText: '5' }).click();
  await expect(page.locator('.shutter')).toHaveAttribute('aria-label', 'Take photo in 5 seconds');
  await page.waitForTimeout(3_000); // let the last capture's landing moment pass
  await cameraReady(page);
  upload = firstUpload();
  pressed = Date.now();
  await shutter(page);
  await expect(page.locator('.mount__countdown')).toHaveText('5');
  await upload;
  expect(Date.now() - pressed).toBeGreaterThanOrEqual(4_900);
  await allSaved(page);

  // A second tap during the countdown cancels it: no photo is taken at all.
  await page.waitForTimeout(3_000);
  await cameraReady(page);
  const before = await savedMediaCount(page);
  let uploads = 0;
  page.on('request', (r) => {
    if (r.method() === 'PUT' && r.url().includes('/api/media/')) uploads++;
  });
  await shutter(page);
  await expect(page.locator('.mount__countdown')).toBeVisible();
  await page.waitForTimeout(1_000);
  await shutter(page);
  await expect(page.locator('.mount__countdown')).toHaveCount(0);
  await expect(page.locator('.shutter')).toHaveAttribute('aria-label', 'Take photo in 5 seconds');
  await page.waitForTimeout(6_000);
  expect(uploads).toBe(0);
  expect(await savedMediaCount(page)).toBe(before);
});
