/**
 * Automated accessibility scan (Phase 7): axe-core against WCAG 2.0, 2.1 and
 * 2.2, levels A and AA, on every screen and every state a person can reach —
 * the cover, the public album and its viewer, sign-in, the writer's album
 * with the camera on, a page being written, Settings, the confirm dialog,
 * and the archive's offline viewer. Zero violations is the bar.
 *
 * The scan catches perhaps half of what matters; the keyboard pass
 * (keyboard.spec.ts) and the owner's own pass cover more.
 */
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { expect, test, type Page } from '@playwright/test';
import { addTo, cameraReady, openPage, seedEntry, signIn } from './helpers';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

interface Violation {
  id: string;
  impact: string | null;
  help: string;
  nodes: Array<{ target: string[]; failureSummary?: string }>;
}

/** Runs axe on the page as it is now; returns the violations, readably. */
async function scan(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: AXE });
  const violations = await page.evaluate(async (tags) => {
    const axe = (window as unknown as { axe: { run: (ctx: Document, options: unknown) => Promise<{ violations: Violation[] }> } }).axe;
    return (await axe.run(document, { runOnly: { type: 'tag', values: tags } })).violations;
  }, TAGS);
  return violations.flatMap((v) => v.nodes.map((n) => `${v.id} (${v.impact}): ${v.help} — ${n.target.join(' ')}`));
}

async function expectClean(page: Page, where: string) {
  const problems = await scan(page);
  expect(problems, `${where}:\n${problems.join('\n')}`).toEqual([]);
}

test('the public site: cover, album and full-screen viewer', async ({ page }) => {
  await signIn(page);
  const entryId = await seedEntry(page, 2, { videos: 1 });
  await page.context().clearCookies();
  await page.route(/\/api\/(entries|settings)$/, (route) => route.continue({ url: `${route.request().url()}?visitor=${Date.now()}` }));

  await page.goto('/');
  await expectClean(page, 'cover');

  await page.locator('#album').scrollIntoViewIfNeeded();
  await page.locator(`[data-spread-id="${entryId}"]`).scrollIntoViewIfNeeded();
  await expect(page.locator(`[data-spread-id="${entryId}"] .mount__expand`)).toBeVisible();
  await expectClean(page, 'public album');

  await page.locator(`[data-spread-id="${entryId}"] .mount__expand`).click();
  await expect(page.locator('dialog.viewer')).toBeVisible();
  await expectClean(page, 'viewer open');
});

test('an iPad: sign-in, the album with the camera on, a page being written', async ({ page }) => {
  await page.goto('/ipad2');
  await expect(page.locator('#passphrase')).toBeVisible();
  await expectClean(page, 'sign-in');

  await signIn(page);
  const entryId = await seedEntry(page, 2, { videos: 1 });
  await page.reload();
  await addTo(page, entryId);
  await cameraReady(page);
  await expectClean(page, 'writer album, camera aimed');

  await openPage(page, entryId);
  await expectClean(page, 'page being written');
});

test('an iPad: Settings, and the confirm dialogs', async ({ page }) => {
  await signIn(page);
  const entryId = await seedEntry(page, 1);
  await page.reload();

  await page.locator('.writer__settings').click();
  await expect(page.locator('dialog.settings')).toBeVisible();
  await expectClean(page, 'Settings');
  await page.keyboard.press('Escape');

  await page.locator(`[data-spread-id="${entryId}"] .mount__delete`).click();
  await expect(page.locator('dialog.confirm')).toBeVisible();
  await expectClean(page, 'Delete confirm');
  await page.keyboard.press('Escape');

  await openPage(page, entryId);
  const pen = (await page.locator('.writing-page--live canvas.writing-page__pen').boundingBox())!;
  await page.mouse.move(pen.x + 30, pen.y + 30);
  await page.mouse.down();
  await page.mouse.move(pen.x + 120, pen.y + 50, { steps: 5 });
  await page.mouse.up();
  await page.locator('.writing-tool', { hasText: 'Clear' }).click();
  await expect(page.locator('dialog.confirm')).toBeVisible();
  await expectClean(page, 'Clear confirm');
});

test("the archive's offline viewer", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page);
  await seedEntry(page, 2, { videos: 1 });
  const archive = mkdtempSync(join(tmpdir(), 'guestbook-a11y-archive-'));
  try {
    await promisify(execFile)(
      process.execPath,
      ['--experimental-strip-types', '--no-warnings', 'scripts/export-archive.ts', '--target', 'local', '--persist-to', process.env.E2E_STATE_DIR!, '--out', archive],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    await page.goto(pathToFileURL(join(archive, 'viewer.html')).href);
    await expect(page.locator('.spread').first()).toBeVisible();
    await expectClean(page, 'viewer.html');
  } finally {
    rmSync(archive, { recursive: true, force: true });
  }
});

test('the scan is real: it catches violations planted on the page', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const img = document.createElement('img');
    img.src = '/favicon.svg';
    document.body.append(img);
    const button = document.createElement('button');
    document.body.append(button);
  });
  const problems = await scan(page);
  expect(problems.some((p) => p.startsWith('image-alt'))).toBe(true);
  expect(problems.some((p) => p.startsWith('button-name'))).toBe(true);
  // Contrast here is one axe can only call "incomplete" (the page's layers are
  // in the way); that blind spot is why contrast.spec.ts measures text itself.
});
