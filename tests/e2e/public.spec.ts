/**
 * A visitor at `/` has no path to any write (Phase 7) — verified by request,
 * not by looking for buttons. From the public page's own context, with the
 * browser's own cookies (none), every write the API has is attempted; each is
 * refused, and nothing changed. Then the page is used as a visitor would, and
 * it sends nothing but reads.
 */
import { expect, test } from '@playwright/test';
import { seedEntry, serverEntries, signIn } from './helpers';

test('every write endpoint refuses a visitor, including one claiming to be an iPad, and nothing changes', async ({ page }) => {
  // Something real to aim at.
  await signIn(page);
  const entryId = await seedEntry(page, 1);
  const before = await serverEntries(page);
  const mediaId = before.find((e) => e.id === entryId)!.media[0].id;
  await page.context().clearCookies();

  await page.goto('/');
  const results = await page.evaluate(
    async ({ entryId, mediaId }) => {
      const id = 'ipad1-01KZZZZZZZZZZZZZZZZZZZZZZZ';
      const json = (method: string, body: unknown): RequestInit => ({
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const attempts: Array<[string, string, RequestInit]> = [
        ['create an entry', '/api/entries', json('POST', { id, deviceId: 'ipad1', device_id: 'ipad1' })],
        ['create an entry, device in the query', '/api/entries?deviceId=ipad1&device=ipad1', json('POST', { id })],
        ['upload a photo', `/api/media/${id}/original?entryId=${entryId}&kind=photo`, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]) }],
        ['save a photo', '/api/media', json('POST', { id, entryId, kind: 'photo', width: 1, height: 1 })],
        ['upload a page image', `/api/canvas/${id}?entryId=${entryId}`, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) }],
        ['save a page', '/api/canvas', json('POST', { id, entryId, strokes: { format: 'guestbook-strokes', version: 1, width: 1000, height: 750, strokes: [] } })],
        ['delete a photo', `/api/media/${mediaId}`, { method: 'DELETE' }],
        ['change the look', '/api/settings', json('POST', { id, look: { leaf: 'wine', frame: 'plain', paper: 'white', theme: 'confetti', watermark: { text: 'x', position: 'top' } } })],
        ['read a page\'s strokes', `/api/canvas?entryId=${entryId}`, {}],
        ['read the storage stats', '/api/stats', {}],
        ['sign out', '/api/auth/logout', { method: 'POST' }],
        ['a guessed admin route', '/api/admin', json('POST', {})],
      ];
      const out: Array<{ what: string; status: number; code: string | null }> = [];
      for (const [what, path, init] of attempts) {
        const response = await fetch(path, init);
        const body = (await response.json().catch(() => null)) as { code?: string } | null;
        out.push({ what, status: response.status, code: body?.code ?? null });
      }
      return out;
    },
    { entryId, mediaId },
  );

  for (const result of results) {
    expect(result, result.what).toEqual({ what: result.what, status: 401, code: 'unauthorized' });
  }

  // Nothing changed: same entries, same items, the photo not deleted, the look unchanged.
  await signIn(page);
  const after = await serverEntries(page);
  expect(after.map((e) => [e.id, e.media.length])).toEqual(before.map((e) => [e.id, e.media.length]));
  expect(after.some((e) => e.id === 'ipad1-01KZZZZZZZZZZZZZZZZZZZZZZZ')).toBe(false);
  const look = await page.evaluate(async () => (await (await fetch('/api/settings', { cache: 'no-store' })).json()).look.leaf);
  expect(look).not.toBe('wine');
});

test('using the public album as a visitor sends only reads', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method())) writes.push(`${request.method()} ${request.url()}`);
  });
  await page.goto('/');
  await page.locator('#album').scrollIntoViewIfNeeded();
  await expect(page.locator('.book, .album__empty').first()).toBeVisible();
  // Every button on the public album, pressed.
  for (const button of await page.locator('#album button').all()) {
    if (await button.isVisible()) await button.click({ trial: false }).catch(() => undefined);
    await page.keyboard.press('Escape');
  }
  expect(writes).toEqual([]);
  await expect(page.locator('.rail, .numbers__add, .mount__delete, .mount__cancel, .writing-page__choose, .writer__settings, #passphrase')).toHaveCount(0);
});
