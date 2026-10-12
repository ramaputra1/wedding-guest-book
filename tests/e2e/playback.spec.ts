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
const control = (page: Page, entryId: string) => page.locator(`[data-spread-id="${entryId}"] .mount__playback`);

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
  await expect(control(page, entryId)).toHaveText('Pause');

  // Pause stays paused, even in view; Play brings it back.
  await control(page, entryId).click();
  await expectPaused(video);
  await page.waitForTimeout(1_000);
  await expectPaused(video);
  await expect(control(page, entryId)).toHaveText('Play');
  await control(page, entryId).click();
  await expectPlaying(video);

  // The public album does not autoplay: there the visitor opens the video.
  await page.goto('/');
  await page.locator('#album').scrollIntoViewIfNeeded();
  await expect(page.locator(`[data-spread-id="${entryId}"] video`)).toHaveCount(0);
  await expect(page.locator(`[data-spread-id="${entryId}"] button.mount--open`)).toBeVisible();
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
  await control(page, quiet).click();
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
  await control(page, entryId).click();
  await page.waitForTimeout(500);
  await expectPaused(video);
  await page.locator('.shutter').click(); // stop
  await expect(page.locator('.shutter')).not.toHaveAttribute('data-recording', 'true');
  // Released: playback resumes (this video, or the new recording once it is saved and newer).
  await expect
    .poll(() => page.locator('video.mount__media').evaluateAll((all: HTMLVideoElement[]) => all.some((v) => !v.paused)), { timeout: 15_000 })
    .toBe(true);
});

test('if the browser refuses sound without a tap, the video plays silently and "Sound on" turns it on', async ({ page }) => {
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
  await expectPlaying(video);
  expect(await video.evaluate((v: HTMLVideoElement) => v.muted)).toBe(true);
  await expect(control(page, entryId)).toHaveText('Sound on');

  await control(page, entryId).click();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.muted)).toBe(false);
  await expectPlaying(video);
  await expect(control(page, entryId)).toHaveText('Pause');
});

test('with reduced motion nothing plays by itself; Play still works', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const entryId = await seedEntry(page, 0, { videos: 1 });
  await reloadWriter(page);
  await page.locator(`[data-spread-id="${entryId}"]`).scrollIntoViewIfNeeded();
  const video = inline(page, entryId);
  await page.waitForTimeout(1_500);
  await expectPaused(video);
  await expect(control(page, entryId)).toHaveText('Play');
  await control(page, entryId).click();
  await expectPlaying(video);
});
