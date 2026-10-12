/**
 * Nothing is ever lost (docs/TESTING.md §3). The network is cut for real —
 * requests aborted, the browser taken offline, the browser closed — and the
 * capture must stay queued, never be called saved, and save exactly once
 * when things recover.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test } from '@playwright/test';
import { addTo, allSaved, cameraReady, queued, serverEntries, shutter, signIn } from './helpers';

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await addTo(page);
  await cameraReady(page);
});

const mediaIds = async (page: import('@playwright/test').Page) => (await serverEntries(page)).flatMap((e) => e.media.map((m) => m.id));

test('the network dies mid-upload: not saved, still queued, saved on recovery', async ({ page }) => {
  // The original arrives; the thumbnail's upload dies.
  await page.route('**/api/media/*/thumb*', (route) => route.abort('connectionreset'));
  await shutter(page);

  await expect.poll(async () => (await queued(page))[0]?.attempts ?? 0).toBeGreaterThan(0);
  const [stuck] = await queued(page);
  expect(stuck.stored).toEqual(['original']);
  expect(await mediaIds(page)).not.toContain(stuck.mediaId);
  await expect(page.locator('.mount-status').first()).toBeVisible();

  await page.unroute('**/api/media/*/thumb*');
  await allSaved(page);
  expect((await mediaIds(page)).filter((id) => id === stuck.mediaId)).toHaveLength(1);
});

test('offline, then back online: the queue sends itself', async ({ page, context }) => {
  await context.setOffline(true);
  await shutter(page);
  await expect.poll(async () => (await queued(page)).length).toBe(1);
  const [waiting] = await queued(page);
  await expect(page.locator('.rail__waiting')).toContainText('1');

  await context.setOffline(false);
  await allSaved(page);
  expect(await mediaIds(page)).toContain(waiting.mediaId);
});

test('files stored but the database write fails: not saved until it really is, and saved once', async ({ page }) => {
  let failures = 2;
  await page.route('**/api/media', async (route) => {
    if (route.request().method() === 'POST' && failures-- > 0) {
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{"code":"server_error","message":"D1 is unavailable."}' });
    }
    return route.continue();
  });
  await shutter(page);
  await expect.poll(async () => (await queued(page))[0]?.attempts ?? 0).toBeGreaterThan(0);
  const [item] = await queued(page);
  expect(item.stored.sort()).toEqual(['original', 'thumb']);
  expect(await mediaIds(page)).not.toContain(item.mediaId);

  await allSaved(page);
  expect((await mediaIds(page)).filter((id) => id === item.mediaId)).toHaveLength(1);
});

test('the server saved it but the reply was lost: the retry adds no duplicate', async ({ page }) => {
  let lose = true;
  await page.route('**/api/media', async (route) => {
    if (route.request().method() === 'POST' && lose) {
      lose = false;
      await route.fetch(); // the commit reaches the server and succeeds…
      return route.abort('connectionreset'); // …but the iPad never hears back
    }
    return route.continue();
  });
  await shutter(page);
  await expect.poll(async () => (await queued(page))[0]?.attempts ?? 0).toBeGreaterThan(0);
  const [item] = await queued(page);
  await allSaved(page);
  expect((await mediaIds(page)).filter((id) => id === item.mediaId)).toHaveLength(1);
});

test('the browser is closed with captures queued: they survive and finish after reopening', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'guestbook-profile-'));
  const options = {
    channel: 'chrome' as const,
    baseURL: process.env.E2E_BASE_URL,
    viewport: { width: 1180, height: 820 },
    permissions: ['camera', 'microphone'],
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  };
  try {
    let context = await chromium.launchPersistentContext(profile, options);
    let page = context.pages()[0] ?? (await context.newPage());
    await signIn(page);
    await addTo(page);
    await cameraReady(page);
    await context.setOffline(true);
    await shutter(page);
    await expect.poll(async () => (await queued(page)).length).toBe(1);
    await page.waitForTimeout(3_000); // the review pause, then the viewfinder again
    await shutter(page);
    await expect.poll(async () => (await queued(page)).length).toBe(2);
    const ids = (await queued(page)).map((i) => i.mediaId);
    await context.close();

    // Reopen the same browser profile, online.
    context = await chromium.launchPersistentContext(profile, options);
    page = context.pages()[0] ?? (await context.newPage());
    await page.goto('/ipad1');
    await expect(page.locator('.rail')).toBeVisible(); // still signed in: the cookie survived too
    await allSaved(page);
    const saved = await mediaIds(page);
    for (const id of ids) expect(saved.filter((s) => s === id)).toHaveLength(1);
    await context.close();
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
});
