/**
 * The handwritten page, end to end: pointer input → strokes → PNG + stroke
 * JSON → the queue → the real Functions → D1 + R2. Phase 5 acceptance
 * criteria. Pen and touch input go through Chrome's DevTools protocol, which
 * produces real PointerEvents with pointerType "pen" (with pressure) and
 * "touch". What only a real iPad can show — Pencil feel, latency, a real
 * palm — is listed in the phase report as NEEDS DEVICE TEST.
 */
import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { addTo, cameraReady, openPage, queued, serverEntries, serverStats, signIn } from './helpers';

const PEN = '.writing-page--live canvas.writing-page__pen';
const INK = '.writing-page--live canvas.writing-page__ink';

type Fraction = [number, number];

/**
 * Waits for any smooth scroll of the album (the camera brings its spread into view) to end,
 * then brings the whole page on screen: input aimed at a page still moving,
 * or below the fold, would land somewhere else.
 */
async function deskInView(page: Page) {
  let last = -1;
  await expect
    .poll(async () => {
      const now = await page.evaluate(() => window.scrollY);
      const still = now === last;
      last = now;
      return still;
    }, { intervals: [250] })
    .toBe(true);
  await page.locator('.writing-page--live').evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const box = (await page.locator(PEN).boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

async function pagePoint(page: Page, [fx, fy]: Fraction) {
  const box = (await page.locator(PEN).boundingBox())!;
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

/** A stroke with the mouse, from one point of the page to another (fractions of its size). */
async function drawWithMouse(page: Page, from: Fraction, to: Fraction, steps = 12) {
  const start = await pagePoint(page, from);
  const end = await pagePoint(page, to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps });
  await page.mouse.up();
}

/** Pen input: real PointerEvents with pointerType "pen" and changing pressure. */
async function penDown(cdp: CDPSession, page: Page, at: Fraction, force = 0.3) {
  const { x, y } = await pagePoint(page, at);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen', force });
}

async function penMove(cdp: CDPSession, page: Page, at: Fraction, force: number) {
  const { x, y } = await pagePoint(page, at);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1, pointerType: 'pen', force });
}

async function penUp(cdp: CDPSession, page: Page, at: Fraction) {
  const { x, y } = await pagePoint(page, at);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen' });
}

async function drawWithPen(cdp: CDPSession, page: Page, from: Fraction, to: Fraction, steps = 10) {
  await penDown(cdp, page, from);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await penMove(cdp, page, [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t], 0.2 + 0.7 * t);
  }
  await penUp(cdp, page, to);
}

async function touch(cdp: CDPSession, page: Page, type: 'touchStart' | 'touchMove' | 'touchEnd', at?: Fraction) {
  const touchPoints = at ? [await pagePoint(page, at)] : [];
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
}

/** Strokes on the page right now, as the canvas's text alternative counts them. */
async function strokeCount(page: Page): Promise<number> {
  const label = (await page.locator(PEN).getAttribute('aria-label')) ?? '';
  return Number(/(\d+) strokes?/.exec(label)?.[1] ?? NaN);
}

/** How many pixels of the finished-strokes canvas carry ink. */
function inkedPixels(page: Page): Promise<number> {
  return page.locator(INK).evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) count++;
    return count;
  });
}

/** The draft this iPad keeps for a page, or null. */
function draft(page: Page, pageId: string) {
  return page.evaluate((key) => localStorage.getItem(key), `guestbook-page:${pageId}`);
}

async function latestStrokes(page: Page, entryId: string) {
  return page.evaluate(async (id) => {
    const response = await fetch(`/api/canvas?entryId=${id}`, { cache: 'no-store' });
    return response.ok ? response.json() : null;
  }, entryId);
}

/**
 * Saves the page and waits until the server has the new version and the
 * queue is empty. Saving closes the page (owner request), so it is opened
 * again — on its new spread, if it started on "New spread" — to carry on.
 */
async function saveAndWait(page: Page) {
  const before = (await serverStats(page)).canvasVersions;
  const spreadsBefore = new Set((await serverEntries(page)).map((e) => e.id));
  const spreadId = await page.locator('.writing-page--live').evaluate((el) => el.closest('[data-spread-id]')!.getAttribute('data-spread-id')!);
  await page.locator('.writing-tool--save').click();
  await expect(page.locator('.writing-page--live')).toHaveCount(0);
  await expect.poll(async () => (await serverStats(page)).canvasVersions, { timeout: 60_000 }).toBe(before + 1);
  await expect.poll(async () => (await queued(page)).length, { timeout: 60_000 }).toBe(0);
  const entryId = spreadId === 'new-spread' ? (await serverEntries(page)).find((e) => !spreadsBefore.has(e.id))!.id : spreadId;
  await openPage(page, entryId);
  await expect(page.locator('.writing-tool--save')).toHaveText('Saved');
  await deskInView(page);
}

/** The entry whose page is on the desk now. */
async function deskEntryId(page: Page): Promise<string> {
  const id = await page.locator('.writing-page--live').evaluate((el) => el.closest('[data-spread-id]')!.getAttribute('data-spread-id')!);
  expect(id).not.toBe('new-spread');
  return id;
}

function pngSize(page: Page, url: string) {
  return page.evaluate(async (src) => {
    const response = await fetch(src);
    const bitmap = await createImageBitmap(await response.blob());
    return { status: response.status, type: response.headers.get('content-type'), width: bitmap.width, height: bitmap.height };
  }, url);
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await openPage(page);
  await deskInView(page);
});

test('the page takes the pen: touch-action none, a text alternative, and tools below the paper', async ({ page }) => {
  await expect(page.locator(PEN)).toHaveCSS('touch-action', 'none');
  await expect(page.locator('.writing-page--live')).toHaveCSS('touch-action', 'none');
  await expect(page.locator(PEN)).toHaveAttribute('role', 'img');

  // Backed at 2× its CSS size (or the screen's ratio, if higher), so strokes are never soft.
  const backing = await page.locator(INK).evaluate((c: HTMLCanvasElement) => ({ width: c.width, css: c.getBoundingClientRect().width, ratio: devicePixelRatio }));
  expect(backing.width).toBe(Math.round(backing.css * Math.max(2, backing.ratio)));
  await expect(page.locator(PEN)).toHaveAttribute('aria-label', /^Writing page, New spread\. 0 strokes\. Write with Apple Pencil or a finger\.$/);

  const paper = (await page.locator('.writing-page--live').boundingBox())!;
  const tools = (await page.locator('.writing-tools').boundingBox())!;
  expect(tools.y).toBeGreaterThanOrEqual(paper.y + paper.height);

  // Every control is at least 44 × 44 and labelled.
  for (const control of await page.locator('.writing-tools button').all()) {
    const box = (await control.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(((await control.getAttribute('aria-label')) ?? (await control.textContent()) ?? '').trim()).not.toBe('');
  }
  await expect(page.locator('.writing-tools [aria-pressed="true"]')).toHaveCount(2); // the pen, and its ink
});

test('a stroke is drawn, saved as a new version with PNG and JSON, and every earlier version stays', async ({ page }) => {
  await drawWithMouse(page, [0.1, 0.2], [0.6, 0.3]);
  await expect.poll(() => strokeCount(page)).toBe(1);
  await expect.poll(() => inkedPixels(page)).toBeGreaterThan(100);
  await expect(page.locator('.writing-tool--save')).toHaveText('Save');

  await saveAndWait(page);
  const entryId = await deskEntryId(page);
  const first = await latestStrokes(page, entryId);
  expect(first).toMatchObject({ version: 1, strokes: { format: 'guestbook-strokes', version: 1, width: 1000, height: 750 } });
  expect(first.strokes.strokes).toHaveLength(1);
  // Confirmed: the iPad's own copy is released.
  await expect.poll(() => draft(page, entryId)).toBeNull();

  // The PNG is 2000 × 1500, a real PNG.
  const entry = (await serverEntries(page)).find((e) => e.id === entryId)!;
  expect(await pngSize(page, entry.canvas!.url)).toEqual({ status: 200, type: 'image/png', width: 2000, height: 1500 });

  // Keep writing, save again: version 2, and version 1's image is still there.
  await drawWithMouse(page, [0.2, 0.6], [0.8, 0.7]);
  await saveAndWait(page);
  const second = await latestStrokes(page, entryId);
  expect(second.version).toBe(2);
  expect(second.strokes.strokes).toHaveLength(2);
  expect((await pngSize(page, `/api/files/canvases/${entryId}/${first.id}.png`)).status).toBe(200);
});

test('clearing after a save empties the screen only: the saved version stays, and saving the cleared page adds a version', async ({ page }) => {
  await drawWithMouse(page, [0.1, 0.1], [0.5, 0.5]);
  await saveAndWait(page);
  const entryId = await deskEntryId(page);
  const saved = await latestStrokes(page, entryId);

  // Clear asks first: dismissing it changes nothing.
  page.once('dialog', (dialog) => void dialog.dismiss());
  await page.locator('.writing-tool', { hasText: 'Clear' }).click();
  expect(await strokeCount(page)).toBe(1);

  page.once('dialog', (dialog) => void dialog.accept());
  await page.locator('.writing-tool', { hasText: 'Clear' }).click();
  await expect.poll(() => strokeCount(page)).toBe(0);
  expect(await inkedPixels(page)).toBe(0);
  expect((await latestStrokes(page, entryId)).id).toBe(saved.id);

  await saveAndWait(page);
  const cleared = await latestStrokes(page, entryId);
  expect(cleared.version).toBe(2);
  expect(cleared.strokes.strokes).toHaveLength(0);
  expect((await pngSize(page, `/api/files/canvases/${entryId}/${saved.id}.png`)).status).toBe(200);
});

test('undo survives a resize, and strokes redraw at the new size', async ({ page }) => {
  await drawWithMouse(page, [0.1, 0.2], [0.4, 0.2]);
  await drawWithMouse(page, [0.1, 0.5], [0.4, 0.5]);
  await drawWithMouse(page, [0.1, 0.8], [0.4, 0.8]);
  await expect.poll(() => strokeCount(page)).toBe(3);
  await page.locator('.writing-tool', { hasText: 'Undo' }).click();
  await expect.poll(() => strokeCount(page)).toBe(2);

  const before = await page.locator(INK).evaluate((c: HTMLCanvasElement) => c.width);
  await page.setViewportSize({ width: 820, height: 1180 }); // the iPad turned to portrait
  await expect.poll(() => page.locator(INK).evaluate((c: HTMLCanvasElement) => c.width)).not.toBe(before);
  await deskInView(page);
  expect(await strokeCount(page)).toBe(2);
  expect(await inkedPixels(page)).toBeGreaterThan(100);

  await page.locator('.writing-tool', { hasText: 'Undo' }).click();
  await page.locator('.writing-tool', { hasText: 'Undo' }).click();
  await expect.poll(() => strokeCount(page)).toBe(0);
  expect(await inkedPixels(page)).toBe(0);
});

test('unsaved strokes survive a reload', async ({ page }) => {
  await drawWithMouse(page, [0.3, 0.3], [0.7, 0.4]);
  await expect.poll(() => strokeCount(page)).toBe(1);
  await page.reload();
  await openPage(page);
  await deskInView(page);
  await expect.poll(() => strokeCount(page)).toBe(1);
  await expect(page.locator('.writing-tool--save')).toBeEnabled();
});

test('the saved stroke JSON redraws the same page the PNG shows', async ({ page }) => {
  await drawWithMouse(page, [0.1, 0.2], [0.9, 0.25], 20);
  await drawWithMouse(page, [0.5, 0.1], [0.45, 0.9], 20);
  await page.locator('.ink-swatch--oxblood').click();
  await drawWithMouse(page, [0.2, 0.8], [0.8, 0.5], 20);
  await saveAndWait(page);
  const entryId = await deskEntryId(page);
  await expect.poll(() => draft(page, entryId)).toBeNull();
  const url = (await serverEntries(page)).find((e) => e.id === entryId)!.canvas!.url;

  // A fresh load draws the page from the server's stroke JSON alone.
  await page.reload();
  await openPage(page, entryId);
  await deskInView(page);
  await expect.poll(() => strokeCount(page)).toBe(3);

  // Compare it with the saved PNG, pixel by pixel, at the canvas's size.
  const difference = await page.locator(INK).evaluate(async (canvas: HTMLCanvasElement, src) => {
    const bitmap = await createImageBitmap(await (await fetch(src)).blob());
    const scratch = document.createElement('canvas');
    scratch.width = canvas.width;
    scratch.height = canvas.height;
    scratch.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const a = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    const b = scratch.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let inked = 0;
    let mismatched = 0;
    for (let i = 3; i < a.length; i += 4) {
      if (a[i] > 0 || b[i] > 0) inked++;
      if (Math.abs(a[i] - b[i]) > 128) mismatched++;
    }
    return { inked, mismatched };
  }, url);
  expect(difference.inked).toBeGreaterThan(1000);
  // Only anti-aliased edges may differ after rescaling.
  expect(difference.mismatched / difference.inked).toBeLessThan(0.05);
});

test('the pen writes with pressure, the camera preview holds still while it is down', async ({ page }) => {
  await addTo(page);
  await cameraReady(page);
  await deskInView(page);
  const cdp = await page.context().newCDPSession(page);
  const video = page.locator('video.mount__live');
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);

  await penDown(cdp, page, [0.2, 0.3], 0.2);
  await penMove(cdp, page, [0.3, 0.35], 0.5);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await penMove(cdp, page, [0.5, 0.4], 0.9);
  await penUp(cdp, page, [0.5, 0.4]);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);

  await saveAndWait(page);
  const { strokes } = await latestStrokes(page, await deskEntryId(page));
  const [stroke] = strokes.strokes;
  expect(stroke).toMatchObject({ tool: 'pen', ink: 'ink', pressure: true, options: { simulatePressure: false } });
  const pressures = stroke.points.map((p: number[]) => p[2]);
  expect(Math.max(...pressures) - Math.min(...pressures)).toBeGreaterThan(0.3);
});

test('coalesced pointer events are used: every sample between frames becomes a point', async ({ page }) => {
  // Stand in for the Pencil's 240 Hz: each pointermove reports three samples.
  await page.addInitScript(() => {
    const original = PointerEvent.prototype.getCoalescedEvents;
    (window as unknown as { coalescedCalls: number }).coalescedCalls = 0;
    PointerEvent.prototype.getCoalescedEvents = function (this: PointerEvent) {
      (window as unknown as { coalescedCalls: number }).coalescedCalls++;
      // A different pointerId on purpose: iOS has returned wrong ids here, and they must not matter.
      return [-2, -1, 0].map(
        (dx) => new PointerEvent('pointermove', { clientX: this.clientX + dx, clientY: this.clientY, pressure: this.pressure, pointerId: 999, pointerType: this.pointerType }),
      );
    };
    void original;
  });
  await page.reload();
  await openPage(page);
  await deskInView(page);
  const cdp = await page.context().newCDPSession(page);
  await drawWithPen(cdp, page, [0.1, 0.5], [0.6, 0.5], 10);
  await expect.poll(() => strokeCount(page)).toBe(1);
  expect(await page.evaluate(() => (window as unknown as { coalescedCalls: number }).coalescedCalls)).toBeGreaterThanOrEqual(10);
  const points = await page.evaluate(() => {
    const raw = Object.keys(localStorage).filter((k) => k.startsWith('guestbook-page:')).map((k) => JSON.parse(localStorage.getItem(k)!));
    return raw[0].strokes[0].points.length as number;
  });
  // 1 for the touch-down, then three per move.
  expect(points).toBeGreaterThanOrEqual(1 + 3 * 10);
});

test.describe('fingers and palms', () => {
  test.use({ hasTouch: true });

  test('a finger writes without scrolling the page', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    // Room above and below, so a scroll in either direction would show.
    await page.evaluate(() => (document.body.style.paddingBlock = '150vh'));
    await deskInView(page);
    const scrollBefore = await page.evaluate(() => window.scrollY);
    expect(scrollBefore).toBeGreaterThan(0);
    expect(scrollBefore).toBeLessThan(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight));
    for (const [from, to] of [[0.9, 0.1], [0.1, 0.9]]) {
      await touch(cdp, page, 'touchStart', [0.5, from]);
      for (let i = 1; i <= 10; i++) await touch(cdp, page, 'touchMove', [0.5, from + ((to - from) * i) / 10]);
      await touch(cdp, page, 'touchEnd');
    }
    await expect.poll(() => strokeCount(page)).toBe(2);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  });

  test('palm rejection: a palm already down is dropped when the pen arrives, and touches never draw after a pen', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await page.locator(PEN).scrollIntoViewIfNeeded();

    // The palm lands first and "draws"…
    await touch(cdp, page, 'touchStart', [0.8, 0.8]);
    await touch(cdp, page, 'touchMove', [0.82, 0.82]);
    // …then the pen touches down: the palm's stroke vanishes, the pen's is kept.
    await drawWithPen(cdp, page, [0.1, 0.2], [0.4, 0.3]);
    await touch(cdp, page, 'touchMove', [0.85, 0.85]);
    await touch(cdp, page, 'touchEnd');
    await expect.poll(() => strokeCount(page)).toBe(1);

    // From now on a touch is a palm, never ink.
    await touch(cdp, page, 'touchStart', [0.6, 0.6]);
    await touch(cdp, page, 'touchMove', [0.7, 0.7]);
    await touch(cdp, page, 'touchEnd');
    expect(await strokeCount(page)).toBe(1);

    await saveAndWait(page);
    const { strokes } = await latestStrokes(page, await deskEntryId(page));
    expect(strokes.strokes).toHaveLength(1);
    expect(strokes.strokes[0]).toMatchObject({ tool: 'pen', pressure: true });
  });
});

test('the eraser removes ink and is saved as an eraser stroke', async ({ page }) => {
  await drawWithMouse(page, [0.1, 0.5], [0.9, 0.5], 20);
  const inked = await inkedPixels(page);
  await page.locator('.writing-tool', { hasText: 'Eraser' }).click();
  await drawWithMouse(page, [0.5, 0.2], [0.5, 0.8], 20);
  await expect.poll(() => strokeCount(page)).toBe(2);
  expect(await inkedPixels(page)).toBeLessThan(inked);
  await saveAndWait(page);
  const { strokes } = await latestStrokes(page, await deskEntryId(page));
  expect(strokes.strokes.map((s: { tool: string }) => s.tool)).toEqual(['pen', 'eraser']);
});

test('offline: a saved page waits in the queue as "Saving…", survives a reload, and saves when the wifi returns', async ({ page }) => {
  await page.route('**/api/canvas**', (route) => route.abort('internetdisconnected'));
  await drawWithMouse(page, [0.2, 0.3], [0.7, 0.6]);
  await page.locator('.writing-tool--save').click();
  // Saved, the page closes; "Saving…" shows on the paper until the server has it.
  await expect(page.locator('.writing-page--live')).toHaveCount(0);
  await expect.poll(async () => (await queued(page)).length).toBe(1);
  const entryId = (await queued(page))[0].entryId;
  await expect(page.locator(`[data-spread-id="${entryId}"] .writing-page .mount-status--saving`)).toHaveText('Saving…');
  expect(JSON.parse((await draft(page, entryId))!)).toMatchObject({ unsaved: false });

  // A reload while still offline: the page comes back from the iPad's own copy.
  await page.reload();
  await openPage(page, entryId);
  await expect.poll(() => strokeCount(page)).toBe(1);

  const before = (await serverStats(page)).canvasVersions;
  await page.unroute('**/api/canvas**');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(async () => (await serverStats(page)).canvasVersions, { timeout: 60_000 }).toBe(before + 1);
  await expect.poll(async () => (await queued(page)).length, { timeout: 60_000 }).toBe(0);
  await expect.poll(() => draft(page, entryId)).toBeNull();
  await expect(page.locator('.writing-page--live .mount-status')).toHaveCount(0);
});

test('on a narrow screen the tools wrap; nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await expect(page.locator(PEN)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const page_ = (await page.locator('.writing-page--live').boundingBox())!;
  for (const control of await page.locator('.writing-tools button').all()) {
    const box = (await control.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(page_.x - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(page_.x + page_.width + 1);
  }
});
