/**
 * viewer.html, the archive's offline album (Phase 6): exported from this
 * run's real D1 + R2, then opened from file:// with every network request
 * refused — no server, no internet — and it shows the album and plays a video.
 */
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';
import { seedEntry, signIn } from './helpers';

const run = promisify(execFile);

test('viewer.html opens from file:// with no network, shows the album, and plays a video', async ({ page, context }) => {
  test.setTimeout(240_000);
  await signIn(page);
  const entryId = await seedEntry(page, 2, { videos: 1 });

  const archive = mkdtempSync(join(tmpdir(), 'guestbook-viewer-'));
  try {
    await run(
      process.execPath,
      ['--experimental-strip-types', '--no-warnings', 'scripts/export-archive.ts', '--target', 'local', '--persist-to', process.env.E2E_STATE_DIR!, '--out', archive],
      { maxBuffer: 64 * 1024 * 1024 },
    );

    // Offline: anything that is not a file on disk is refused.
    const asked: string[] = [];
    await context.route(/^(?!file:)/, (route) => {
      asked.push(route.request().url());
      return route.abort('internetdisconnected');
    });
    await page.goto(pathToFileURL(join(archive, 'viewer.html')).href);

    await expect(page.locator('h1')).toHaveText('Rama & Assela');
    await expect(page.locator('.spread').first()).toBeVisible();

    // The seeded spread: two photos then the video; step to the video and play it.
    const spread = page.locator('.spread').last();
    await expect(spread.locator('.numbers button')).toHaveCount(3);
    await spread.locator('.numbers button').nth(2).click();
    const video = spread.locator('video');
    await expect(video).toHaveAttribute('loop', '');
    await video.evaluate((v: HTMLVideoElement) => v.play());
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 15_000 }).toBeGreaterThan(0.5);
    expect(await video.evaluate((v: HTMLVideoElement) => v.error)).toBeNull();

    // A photo opens full size.
    await spread.locator('.numbers button').first().click();
    await spread.locator('.print img').click();
    await expect(page.locator('dialog#full')).toBeVisible();
    await expect(page.locator('dialog#full img')).toHaveJSProperty('complete', true);
    expect(await page.locator('dialog#full img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

    // Nothing was fetched from anywhere but the folder.
    expect(asked).toEqual([]);
    void entryId;
  } finally {
    rmSync(archive, { recursive: true, force: true });
  }
});
