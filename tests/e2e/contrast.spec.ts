/**
 * Text contrast where axe cannot judge it (Phase 7). axe-core marks text as
 * "incomplete" — neither pass nor violation — when a pseudo-element or an
 * overlapping layer is near it: the underlined numbers, "Delete", the
 * writing tools, the whole Settings sheet. This measures those itself: every
 * visible piece of text against the solid colours actually behind it,
 * composited, for WCAG AA (4.5:1; 3:1 for large text).
 *
 * Left out, as WCAG leaves them out: disabled controls, and the watermark (a
 * mark, hidden from assistive technology). The cover's names and date sit on
 * the photograph and were measured per pixel in Phase 1.
 */
import { expect, test, type Page } from '@playwright/test';
import { addTo, cameraReady, openPage, seedEntry, signIn } from './helpers';

interface Finding {
  text: string;
  ratio: number;
  needed: number;
  where: string;
}

interface Measured {
  /** How many pieces of text were measured: a check that measured nothing proves nothing. */
  measured: number;
  findings: Finding[];
}

/** Every visible text on the page whose contrast is below AA. */
function lowContrast(page: Page): Promise<Measured> {
  return page.evaluate(() => {
    type RGBA = [number, number, number, number];
    const parse = (value: string): RGBA => {
      const n = value.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
      return [n[0], n[1], n[2], n.length > 3 ? n[3] : 1];
    };
    const over = (top: RGBA, bottom: RGBA): RGBA => {
      const a = top[3] + bottom[3] * (1 - top[3]);
      if (a === 0) return [0, 0, 0, 0];
      const mix = (i: number) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a;
      return [mix(0), mix(1), mix(2), a];
    };
    const luminance = ([r, g, b]: RGBA) => {
      const c = [r, g, b].map((v) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    /** The solid colour behind an element: its own background and its ancestors', composited. */
    const backdrop = (element: Element): RGBA => {
      const layers: RGBA[] = [];
      for (let node: Element | null = element; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        const bg = parse(style.backgroundColor);
        if (bg[3] > 0) layers.push(bg);
        if (bg[3] >= 1) break;
      }
      let color: RGBA = [255, 255, 255, 1];
      for (const layer of layers.reverse()) color = over(layer, color);
      return color;
    };

    const findings: Array<{ text: string; ratio: number; needed: number; where: string }> = [];
    let measured = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const element = node.parentElement;
      if (!element || seen.has(element) || !node.textContent?.trim()) continue;
      seen.add(element);
      if (element.closest('.hero, .writing-page__watermark, script, style, template, [hidden], .visually-hidden')) continue;
      if (element.closest('button:disabled, fieldset:disabled, [aria-disabled="true"]')) continue;
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0 || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
      let hidden = false;
      for (let a: Element | null = element; a; a = a.parentElement) if (Number(getComputedStyle(a).opacity) === 0) hidden = true;
      if (hidden) continue;
      measured++;
      const bg = backdrop(element);
      const fg = over(parse(style.color), bg);
      const [l1, l2] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
      const ratio = (l1 + 0.05) / (l2 + 0.05);
      const size = parseFloat(style.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
      const needed = large ? 3 : 4.5;
      if (ratio < needed) {
        findings.push({ text: node.textContent.trim().slice(0, 40), ratio: Math.round(ratio * 100) / 100, needed, where: element.className || element.tagName });
      }
    }
    return { measured, findings };
  });
}

async function saveLook(page: Page, leaf: string, paper = 'ruled') {
  await page.evaluate(
    async ({ leaf, paper }) => {
      const a = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
      let t = '';
      for (let n = Date.now(), i = 0; i < 10; i++, n = Math.floor(n / 32)) t = a[n % 32] + t;
      let r = '';
      for (let i = 0; i < 16; i++) r += a[Math.floor(Math.random() * 32)];
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: `ipad1-${t}${r}`, look: { leaf, frame: 'corners', paper, theme: 'botanical', watermark: { text: 'R & A', position: 'top-end' } } }),
      });
    },
    { leaf, paper },
  );
}

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  // Back to the designed album for the next test, signing in again only if this one signed out.
  if (!(await page.evaluate(async () => (await fetch('/api/auth/session')).ok).catch(() => false))) await signIn(page);
  await page.evaluate(async () => {
    const a = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    let t = '';
    for (let n = Date.now(), i = 0; i < 10; i++, n = Math.floor(n / 32)) t = a[n % 32] + t;
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: `ipad1-${t}0000000000000000`, look: { leaf: 'midnight', frame: 'corners', paper: 'ruled', theme: 'none', watermark: { text: '', position: 'bottom-end' } } }),
    });
  });
});

test('the measure is real: it catches faint text planted on the page', async ({ page }) => {
  await page.goto('/ipad1');
  await page.evaluate(() => {
    const p = document.createElement('p');
    p.textContent = 'Too faint to read';
    p.style.cssText = 'color:#2a2d33';
    document.querySelector('main')!.prepend(p);
  });
  expect((await lowContrast(page)).findings.map((f) => f.text)).toContain('Too faint to read');
});

for (const leaf of ['midnight', 'navy', 'wine']) {
  test(`every text meets AA on the iPad, with the album in ${leaf}`, async ({ page }) => {
    await signIn(page);
    const entryId = await seedEntry(page, 2, { videos: 1 });
    await saveLook(page, leaf, leaf === 'wine' ? 'white' : 'ruled');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-leaf', leaf);

    const checks: Array<[string, () => Promise<void>]> = [
      ['album', async () => undefined],
      ['camera aimed', async () => {
        await addTo(page, entryId);
        await cameraReady(page);
      }],
      ['page being written', async () => openPage(page, entryId)],
      ['Settings', async () => {
        await page.locator('.writer__settings').click();
        await expect(page.locator('dialog.settings')).toBeVisible();
      }],
    ];
    for (const [where, reach] of checks) {
      await reach();
      const { measured, findings } = await lowContrast(page);
      expect(measured, where).toBeGreaterThan(where === 'Settings' ? 40 : 10);
      expect(findings, `${where}:\n${findings.map((f) => `${f.ratio}:1 < ${f.needed}:1  "${f.text}"  (${f.where})`).join('\n')}`).toEqual([]);
    }
  });
}

test('every text meets AA on the public album', async ({ page }) => {
  await signIn(page);
  await seedEntry(page, 2, { videos: 1 });
  await page.context().clearCookies();
  await page.route(/\/api\/(entries|settings)$/, (route) => route.continue({ url: `${route.request().url()}?visitor=${Date.now()}` }));
  await page.goto('/');
  await page.locator('#album').scrollIntoViewIfNeeded();
  await expect(page.locator('.book')).toBeVisible();
  const { measured, findings } = await lowContrast(page);
  expect(measured).toBeGreaterThan(5);
  expect(findings, findings.map((f) => `${f.ratio}:1 < ${f.needed}:1  "${f.text}"  (${f.where})`).join('\n')).toEqual([]);
});
