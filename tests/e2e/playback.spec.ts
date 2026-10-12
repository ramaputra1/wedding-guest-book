/**
 * Recording shows itself, and saved videos play by themselves (owner
 * requests after Phase 5): the shutter turns recording red; on the writer
 * iPads a saved video plays in its mount with sound, looping, one at a time,
 * and pauses while another video is recorded or the pen is on a page.
 *
 * Chrome runs with --autoplay-policy=no-user-gesture-required (playwright
 * config), so sound is allowed here as it would be after a tap; the test
 * "if the browser refuses sound…" stands in for a stricter iOS Safari.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { addTo, allSaved, cameraReady, openPage, seedEntry, serverEntries, signIn } from './helpers';

const inline = (page: Page, entryId: string) => page.locator(`[data-spread-id="${entryId}"] video.mount__media`);

/** Playing for real: not paused, and the clock moving. */
async function expectPlaying(video: Locator) {
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0.2), { timeout: 15_000 }).toBe(true);
}

async function expectPaused(video: Locator) {
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
}

async function reloadWriter(page: Page) {
  await page.reload();
  await expect(page.locator('.rail')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test('while a video records, the shutter is recording red; the saved file has sound', async ({ page }) => {
  test.setTimeout(90_000);
  await addTo(page);
  await page.locator('.rail__mode-option').nth(1).click();
  await cameraReady(page);
  const face = page.locator('.shutter__face');
  await expect(face).toHaveCSS('background-color', 'rgb(251, 250, 247)'); // --photo-paper at rest

  await page.locator('.shutter').click();
  await expect(page.locator('.shutter')).toHaveAttribute('data-recording', 'true');
  await expect(face).toHaveCSS('background-color', 'rgb(214, 75, 62)'); // --recording
  await expect(page.locator('.shutter__ring-time')).toHaveCSS('stroke', 'rgb(214, 75, 62)');

  await page.waitForTimeout(2_000);
  await page.locator('.shutter').click(); // stop
  await expect(page.locator('.shutter')).not.toHaveAttribute('data-recording', 'true');
  await expect(face).toHaveCSS('background-color', 'rgb(251, 250, 247)');

  // The recording kept its sound: the stored MP4 has an audio track.
  await expect.poll(async () => (await serverEntries(page)).flatMap((e) => e.media).some((m) => m.kind === 'video'), { timeout: 60_000 }).toBe(true);
  await allSaved(page);
  const url = (await serverEntries(page)).flatMap((e) => e.media).filter((m) => m.kind === 'video').at(-1)!.url;
  const tracks = await page.evaluate(async (src) => {
    const bytes = new Uint8Array(await (await fetch(src)).arrayBuffer());
    const text = new TextDecoder('latin1').decode(bytes);
    return { sound: text.includes('hdlrsoun') || /hdlr[\s\S]{8}soun/.test(text), video: /hdlr[\s\S]{8}vide/.test(text) };
  }, url);
  expect(tracks).toEqual({ sound: true, video: true });
});

test('a saved video plays by itself in its mount: with sound, looping', async ({ page }) => {
  const entryId = await seedEntry(page, 0, { videos: 1 });
  await reloadWriter(page);
  await page.locator(`[data-spread-id="${entryId}"]`).scrollIntoViewIfNeeded();
  const video = inline(page, entryId);
  await expectPlaying(video);
  expect(await video.evaluate((v: HTMLVideoElement) => ({ muted: v.muted, volume: v.volume, loop: v.loop }))).toEqual({
    muted: false,
    volume: 1,
    loop: true,
  });
  // No Play / Pause or "Sound on" plate on the video (owner request): nothing but the video.
  await expect(page.locator(`[data-spread-id="${entryId}"] .mount__print button`)).toHaveCount(0);
  await expect(video).toHaveAttribute('aria-label', /\. Pause$/);

  // A tap pauses, and it stays paused even in view; another tap plays.
  await video.click();
  await expectPaused(video);
  await page.waitForTimeout(1_000);
  await expectPaused(video);
  await expect(video).toHaveAttribute('aria-label', /\. Play$/);
  await video.click();
  await expectPlaying(video);

  // Keyboard: the video takes focus, and Space or Enter pauses and plays it.
  await video.focus();
  await page.keyboard.press('Space');
  await expectPaused(video);
  await page.keyboard.press('Enter');
  await expectPlaying(video);

});

test('the public album: a tap plays and pauses a video in place, with sound, looping; the expand icon opens it full screen', async ({ page }) => {
  const entryId = await seedEntry(page, 0, { videos: 1 });
  await page.context().clearCookies();
  // Past the shared 30-second cache, as a visitor arriving later would be.
  await page.route('**/api/entries', (route) => route.continue({ url: `${new URL(route.request().url()).origin}/api/entries?visitor=${Date.now()}` }));
  await page.goto('/');
  await page.locator('#album').scrollIntoViewIfNeeded();
  await page.locator(`[data-spread-id="${entryId}"]`).scrollIntoViewIfNeeded();
  const video = inline(page, entryId);

  // Waits for a tap: nothing starts by itself for a visitor.
  await page.waitForTimeout(1_500);
  await expectPaused(video);
  await video.click();
  await expectPlaying(video);
  expect(await video.evaluate((v: HTMLVideoElement) => ({ muted: v.muted, loop: v.loop }))).toEqual({ muted: false, loop: true });
  // Past the end of the 3-second clip, it is still playing: it went round again.
  await page.waitForTimeout(4_000);
  await expectPlaying(video);
  await video.click();
  await expectPaused(video);

  // The expand icon, bottom right: full screen, looping; the copy in the mount waits.
  await video.click();
  await expectPlaying(video);
  const expand = page.locator(`[data-spread-id="${entryId}"] .mount__expand`);
  await expect(expand).toHaveAccessibleName(/^View full screen, /);
  const print = (await page.locator(`[data-spread-id="${entryId}"] .mount__frame`).boundingBox())!;
  const icon = (await expand.boundingBox())!;
  expect(icon.x + icon.width).toBeGreaterThan(print.x + print.width * 0.75);
  expect(icon.y + icon.height).toBeGreaterThan(print.y + print.height * 0.75);
  await expand.click();
  const viewer = page.locator('dialog.viewer video');
  await expectPlaying(viewer);
  expect(await viewer.evaluate((v: HTMLVideoElement) => v.loop)).toBe(true);
  await expectPaused(video);
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.viewer')).toHaveCount(0);
});

test('one voice at a time: only one video plays, and a tapped one takes over', async ({ page }) => {
  const first = await seedEntry(page, 0, { videos: 1 });
  const second = await seedEntry(page, 0, { videos: 1 });
  await page.setViewportSize({ width: 1180, height: 1150 }); // landscape: two spreads on screen
  await reloadWriter(page);
  await page.locator(`[data-spread-id="${first}"]`).evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await expect(inline(page, first)).toBeInViewport({ ratio: 0.9 });
  await expect(inline(page, second)).toBeInViewport({ ratio: 0.9 });

  const playing = () => page.locator('video.mount__media').evaluateAll((all: HTMLVideoElement[]) => all.filter((v) => !v.paused).length);
  await expect.poll(playing, { timeout: 15_000 }).toBe(1);
  await page.waitForTimeout(1_000);
  expect(await playing()).toBe(1);

  const quiet = (await inline(page, first).evaluate((v: HTMLVideoElement) => v.paused)) ? first : second;
  const loud = quiet === first ? second : first;
  await inline(page, quiet).click();
  await expectPlaying(inline(page, quiet));
  await expectPaused(inline(page, loud));
});

test('videos pause while another video is recorded, and while the pen is on a page', async ({ page }) => {
  test.setTimeout(90_000);
  const entryId = await seedEntry(page, 0, { videos: 1 });
  await page.setViewportSize({ width: 1180, height: 1150 }); // landscape: this spread and "New spread" both on screen
  await reloadWriter(page);
  await page.locator(`[data-spread-id="${entryId}"]`).evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
  const video = inline(page, entryId);
  await expectPlaying(video);

  // The pen: down on this spread's page, the video beside it stops; up, it plays on.
  await openPage(page, entryId);
  const pen = (await page.locator('.writing-page--live canvas.writing-page__pen').boundingBox())!;
  await page.mouse.move(pen.x + 40, pen.y + 40);
  await page.mouse.down();
  await page.mouse.move(pen.x + 120, pen.y + 60, { steps: 5 });
  await expectPaused(video);
  await page.mouse.up();
  await expectPlaying(video);

  // Recording another video: its microphone must not hear this one.
  await addTo(page);
  await page.locator('.rail__mode-option').nth(1).click();
  await cameraReady(page);
  await expect(video).toBeInViewport({ ratio: 0.6 });
  await expectPlaying(video);
  await page.locator('.shutter').click();
  await expect(page.locator('.shutter')).toHaveAttribute('data-recording', 'true');
  await expectPaused(video);
  // Not even a tap plays it while recording.
  await video.click();
  await page.waitForTimeout(500);
  await expectPaused(video);
  await page.locator('.shutter').click(); // stop
  await expect(page.locator('.shutter')).not.toHaveAttribute('data-recording', 'true');
  // Released: playback resumes (this video, or the new recording once it is saved and newer).
  await expect
    .poll(() => page.locator('video.mount__media').evaluateAll((all: HTMLVideoElement[]) => all.some((v) => !v.paused)), { timeout: 15_000 })
    .toBe(true);
});

test('if the browser refuses sound without a tap, the video waits on its poster — never silent — and a tap plays it with sound', async ({ page }) => {
  // iOS Safari's rule: sound only from a tap. Stand-in: refuse unmuted play()
  // unless it is called while a click is being handled.
  await page.addInitScript(() => {
    let tapping = false;
    addEventListener(
      'click',
      () => {
        tapping = true;
        setTimeout(() => (tapping = false));
      },
      true,
    );
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if (!this.muted && !tapping) return Promise.reject(new DOMException('Sound needs a tap', 'NotAllowedError'));
      return play.call(this);
    };
  });
  const entryId = await seedEntry(page, 0, { videos: 1 });
  await reloadWriter(page);
  await page.locator(`[data-spread-id="${entryId}"]`).scrollIntoViewIfNeeded();
  const video = inline(page, entryId);
  await page.waitForTimeout(1_500);
  await expectPaused(video);
  expect(await video.evaluate((v: HTMLVideoElement) => v.muted)).toBe(false);
  await expect(page.locator(`[data-spread-id="${entryId}"] .mount__print button`)).toHaveCount(0);

  await video.click();
  await expectPlaying(video);
  expect(await video.evaluate((v: HTMLVideoElement) => v.muted)).toBe(false);
});

test('with reduced motion nothing plays by itself; Play still works', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const entryId = await seedEntry(page, 0, { videos: 1 });
  await reloadWriter(page);
  await page.locator(`[data-spread-id="${entryId}"]`).scrollIntoViewIfNeeded();
  const video = inline(page, entryId);
  await page.waitForTimeout(1_500);
  await expectPaused(video);
  await expect(video).toHaveAttribute('aria-label', /\. Play$/);
  await video.click();
  await expectPlaying(video);
});
