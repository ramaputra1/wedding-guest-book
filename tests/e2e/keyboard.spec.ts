/**
 * The keyboard pass (Phase 7): Tab through each screen. Every stop must show
 * a visible focus indicator, every control must be reachable, and dialogs
 * must hold focus while open and give it back when closed. What a keyboard
 * cannot do is drawing on a page — handwriting is pointer-only by nature;
 * every tool around the page is reachable.
 */
import { expect, test, type Page } from '@playwright/test';
import { addTo, cameraReady, openPage, seedEntry, signIn } from './helpers';

interface Stop {
  name: string;
  /** A visible indicator: an outline or ring on the element, or on the label drawn for an invisible input. */
  indicated: boolean;
  visible: boolean;
}

/** Presses Tab until focus comes round again (or 250 stops), describing each stop. */
async function tabThrough(page: Page): Promise<Stop[]> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const stops: Stop[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 250; i++) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const path = (() => {
        const parts: string[] = [];
        for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
          parts.unshift(`${n.tagName}:${Array.prototype.indexOf.call(n.parentElement?.children ?? [], n)}`);
        }
        return parts.join('/');
      })();
      const shows = (node: Element) => {
        const s = getComputedStyle(node);
        return (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || (s.boxShadow !== 'none' && s.boxShadow !== '');
      };
      const invisible = Number(getComputedStyle(el).opacity) === 0;
      const indicated = shows(el) || (invisible && !!el.closest('label') && shows(el.closest('label')!));
      const box = (invisible ? el.closest('label') ?? el : el).getBoundingClientRect();
      const name = el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 30) || el.getAttribute('name') || el.tagName;
      return { path, name, indicated, visible: box.width > 0 && box.height > 0 };
    });
    if (!stop) continue;
    if (seen.has(stop.path)) break;
    seen.add(stop.path);
    stops.push({ name: stop.name, indicated: stop.indicated, visible: stop.visible });
  }
  return stops;
}

function expectAllIndicated(stops: Stop[], where: string) {
  const bad = stops.filter((s) => !s.indicated || !s.visible);
  expect(bad, `${where}: stops without a visible focus indicator:\n${bad.map((s) => s.name).join('\n')}`).toEqual([]);
}

test('public album: every stop shows focus; the expand icon and numbers are reachable', async ({ page }) => {
  await signIn(page);
  const entryId = await seedEntry(page, 2, { videos: 1 });
  await page.context().clearCookies();
  await page.route(/\/api\/(entries|settings)$/, (route) => route.continue({ url: `${route.request().url()}?visitor=${Date.now()}` }));
  await page.goto('/');
  await page.locator('#album').scrollIntoViewIfNeeded();
  await page.locator(`[data-spread-id="${entryId}"]`).scrollIntoViewIfNeeded();
  await expect(page.locator(`[data-spread-id="${entryId}"] .mount__expand`)).toBeVisible();

  const stops = await tabThrough(page);
  expectAllIndicated(stops, '/');
  const names = stops.map((s) => s.name);
  expect(names.some((n) => n.startsWith('View full screen'))).toBe(true);
  expect(names.some((n) => n.startsWith('Show item 2 of 3'))).toBe(true);

  // Enter on the expand icon opens the viewer; Escape closes it and focus comes back.
  const expand = page.locator(`[data-spread-id="${entryId}"] .mount__expand`);
  await expand.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('dialog.viewer')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.viewer')).toHaveCount(0);
  await expect(expand).toBeFocused();
});

test('iPad: every stop shows focus; the camera, a page and Delete all work from the keyboard', async ({ page }) => {
  await signIn(page);
  const entryId = await seedEntry(page, 2);
  await page.reload();
  await expect(page.locator('.rail')).toBeVisible();

  const stops = await tabThrough(page);
  expectAllIndicated(stops, '/ipad1');
  const names = stops.map((s) => s.name);
  for (const expected of ['Settings', 'Add a photo or video to', 'Write on this page', 'Delete (1)', 'Show item 1 of 2']) {
    expect(names.some((n) => n.startsWith(expected)), `reachable: ${expected}`).toBe(true);
  }

  // "+" by keyboard aims the camera; the shutter by keyboard starts the self-timer; Space again cancels it.
  const plus = page.locator(`[data-spread-id="${entryId}"] .numbers__add`);
  await plus.focus();
  await page.keyboard.press('Enter');
  await cameraReady(page);
  await page.locator('.shutter').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('.mount__countdown')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.locator('.mount__countdown')).toHaveCount(0);

  // A page opens by keyboard, and its tools take focus with a visible indicator.
  await page.locator(`[data-spread-id="${entryId}"] .writing-page__choose`).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.writing-page--live')).toBeVisible();
  // One stroke (by pointer — handwriting has no keyboard form), so Undo, Clear and Save are live.
  const pen = (await page.locator('.writing-page--live canvas.writing-page__pen').boundingBox())!;
  await page.mouse.move(pen.x + 30, pen.y + 30);
  await page.mouse.down();
  await page.mouse.move(pen.x + 120, pen.y + 50, { steps: 5 });
  await page.mouse.up();
  const tools = await tabThrough(page);
  expectAllIndicated(tools, 'page open');
  // Redo is disabled until something is undone; a disabled control takes no focus, as it should.
  for (const expected of ['Pen', 'Pencil', 'Eraser', 'Blue-black ink', 'Undo', 'Clear', 'Cancel', 'Save']) {
    expect(tools.map((s) => s.name).some((n) => n === expected), `tool reachable: ${expected}`).toBe(true);
  }

  // Delete by keyboard: the question opens on No; Escape is No, and focus returns.
  await page.locator(`[data-spread-id="${entryId}"] .numbers__item`).first().click();
  const del = page.locator(`[data-spread-id="${entryId}"] .mount__delete`);
  await del.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('dialog.confirm .confirm__no')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.confirm')).toHaveCount(0);
  await expect(del).toBeFocused();
});

test('Settings by keyboard: focus stays in the sheet, arrows choose, Escape cancels and returns focus', async ({ page }) => {
  await signIn(page);
  await seedEntry(page, 1);
  await page.reload();
  const open = page.locator('.writer__settings');
  await open.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('dialog.settings')).toBeVisible();

  // Every stop inside the sheet, and only inside it.
  const stops = await tabThrough(page);
  expectAllIndicated(stops, 'Settings');
  const inside = await page.evaluate(() => document.querySelector('dialog.settings')!.contains(document.activeElement));
  expect(inside).toBe(true);
  expect(stops.map((s) => s.name)).toEqual(expect.arrayContaining(['Save', 'Cancel']));

  // Arrow keys move between album colours, previewing at once.
  await page.locator('dialog.settings input[name="leaf"]:checked').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('html')).toHaveAttribute('data-leaf', 'charcoal');
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.settings')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-leaf', 'midnight');
  await expect(open).toBeFocused();
});

test('with the camera aimed, nothing traps focus and Cancel is reachable', async ({ page }) => {
  await signIn(page);
  const entryId = await seedEntry(page, 1);
  await page.reload();
  await addTo(page, entryId);
  await cameraReady(page);
  const stops = await tabThrough(page);
  expectAllIndicated(stops, 'camera aimed');
  expect(stops.map((s) => s.name).some((n) => n.startsWith('Cancel, turn the camera away from'))).toBe(true);
  await openPage(page, entryId);
});

test('on a phone and an upright iPad, nothing reached with Tab hides behind the camera bar (WCAG 2.4.11)', async ({ page }) => {
  await signIn(page);
  const entryId = await seedEntry(page, 2);
  for (const size of [{ width: 390, height: 844 }, { width: 820, height: 1180 }]) {
    await page.setViewportSize(size);
    await page.reload();
    await expect(page.locator('.rail')).toBeVisible();
    await openPage(page, entryId);
    const pen = (await page.locator('.writing-page--live canvas.writing-page__pen').boundingBox())!;
    await page.mouse.move(pen.x + 30, pen.y + 30);
    await page.mouse.down();
    await page.mouse.move(pen.x + 120, pen.y + 50, { steps: 5 });
    await page.mouse.up();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    const hidden: string[] = [];
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press('Tab');
      const covered = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body || el.closest('.rail, dialog')) return null;
        const target = Number(getComputedStyle(el).opacity) === 0 ? (el.closest('label') ?? el) : el;
        const box = target.getBoundingClientRect();
        const x = box.left + box.width / 2;
        const y = Math.min(box.bottom - 2, window.innerHeight - 1);
        const top = document.elementFromPoint(x, y);
        return top && top.closest('.rail') ? (el.getAttribute('aria-label') || el.textContent?.trim() || el.tagName) : null;
      });
      if (covered) hidden.push(covered);
    }
    expect(hidden, `${size.width}×${size.height}: focused but behind the camera bar`).toEqual([]);
  }
});
