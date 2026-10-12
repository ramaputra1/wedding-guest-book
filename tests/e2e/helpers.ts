import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import type { ApiEntry, ApiStats } from '../../src/lib/types';

export async function signIn(page: Page, device: 'ipad1' | 'ipad2' = 'ipad1') {
  await page.goto(`/${device}`);
  await page.locator('#passphrase').fill(process.env.E2E_PASSPHRASE!);
  await page.keyboard.press('Enter');
  await expect(page.locator('.rail')).toBeVisible();
}

/** Presses a spread's "+" — the only way to aim the camera at it. */
export async function addTo(page: Page, spreadId = 'new-spread') {
  const plus = page.locator(`[data-spread-id="${spreadId}"] .numbers__add`);
  await plus.click();
  await expect(plus).toHaveAttribute('aria-pressed', 'true');
}

/** Taps a spread's page — the only way to open it for writing. */
export async function openPage(page: Page, spreadId = 'new-spread') {
  await page.locator(`[data-spread-id="${spreadId}"] .writing-page__choose`).click();
  await expect(page.locator(`[data-spread-id="${spreadId}"] .writing-page--live canvas.writing-page__pen`)).toBeVisible();
}

/** Waits until the viewfinder shows real frames and the shutter is ready. */
export async function cameraReady(page: Page) {
  await page.waitForFunction(() => (document.querySelector<HTMLVideoElement>('video.mount__live')?.videoWidth ?? 0) > 0, null, { timeout: 20_000 });
  await expect(page.locator('.shutter')).toBeEnabled();
}

/** The album as the server has it, fresh. */
export function serverEntries(page: Page): Promise<ApiEntry[]> {
  return page.evaluate(async () => (await (await fetch('/api/entries', { cache: 'no-store' })).json()).entries);
}

export function serverStats(page: Page): Promise<ApiStats> {
  return page.evaluate(async () => (await fetch('/api/stats', { cache: 'no-store' })).json());
}

/** What is in the page's IndexedDB capture queue right now. */
export function queued(page: Page): Promise<Array<{ mediaId: string; entryId: string; state: string; stored: string[]; attempts: number }>> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('guestbook-queue');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('captures')) return resolve([]);
          const all = db.transaction('captures').objectStore('captures').getAll();
          all.onsuccess = () =>
            resolve(all.result.map((i) => ({ mediaId: i.mediaId, entryId: i.entryId, state: i.state, stored: i.stored, attempts: i.attempts })));
          all.onerror = () => reject(all.error);
        };
      }),
  );
}

/** Every capture confirmed saved and released from the queue. */
export async function allSaved(page: Page) {
  await expect.poll(async () => (await queued(page)).length, { timeout: 60_000 }).toBe(0);
  await expect(page.locator('.mount-status')).toHaveCount(0);
}

export async function shutter(page: Page) {
  await page.locator('.shutter').click();
}

/** Total media items the server has saved. */
export async function savedMediaCount(page: Page): Promise<number> {
  return (await serverEntries(page)).reduce((n, entry) => n + entry.media.length, 0);
}

/**
 * Presses the shutter and waits until the server really has one more item
 * and the queue is empty. (Checking the queue alone races the encoder: right
 * after the press, the photo is not in the queue yet.)
 */
export async function shootAndWaitSaved(page: Page) {
  const before = await savedMediaCount(page);
  await shutter(page);
  await expect.poll(() => savedMediaCount(page), { timeout: 60_000 }).toBe(before + 1);
  await allSaved(page);
}

/**
 * Puts a spread on the server straight through the API, from the signed-in
 * page (its cookie travels with each request) — quicker than taking each
 * item on the self-timer. `count` photos, then `videos` copies of the fake
 * camera's 3-second recording (it has sound). Returns the entry id.
 */
export function seedEntry(page: Page, count: number, options: { videos?: number; device?: 'ipad1' | 'ipad2' } = {}): Promise<string> {
  const { videos = 0, device = 'ipad1' } = options;
  const mp4 = videos > 0 ? readFileSync('tests/fixtures/fake-camera-3s.mp4').toString('base64') : '';
  return page.evaluate(
    async ({ count, videos, device, mp4 }) => {
      const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
      let last = 0;
      const ulid = () => {
        const now = Math.max(Date.now(), last + 1);
        last = now;
        let time = '';
        for (let t = now, i = 0; i < 10; i++, t = Math.floor(t / 32)) time = alphabet[t % 32] + time;
        let random = '';
        for (let i = 0; i < 16; i++) random += alphabet[Math.floor(Math.random() * 32)];
        return `${device}-${time}${random}`;
      };
      const jpeg = async (width: number, height: number) => {
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext('2d')!;
        context.fillStyle = `hsl(${Math.random() * 360} 60% 50%)`;
        context.fillRect(0, 0, width, height);
        return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
      };
      const send = async (path: string, init: RequestInit) => {
        const response = await fetch(path, init);
        if (!response.ok) throw new Error(`${init.method} ${path}: ${response.status} ${await response.text()}`);
      };
      const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const put = (id: string, part: string, kind: string, body: Blob, type: string) =>
        send(`/api/media/${id}/${part}?entryId=${entryId}&kind=${kind}${kind === 'video' ? '&container=mp4' : ''}`, {
          method: 'PUT',
          headers: { 'content-type': type },
          body,
        });

      const entryId = ulid();
      await send('/api/entries', json({ id: entryId }));
      for (let i = 0; i < count; i++) {
        const id = ulid();
        await put(id, 'original', 'photo', await jpeg(640, 480), 'image/jpeg');
        await put(id, 'thumb', 'photo', await jpeg(160, 120), 'image/jpeg');
        await send('/api/media', json({ id, entryId, kind: 'photo', width: 640, height: 480 }));
      }
      const video = mp4 ? new Blob([Uint8Array.from(atob(mp4), (c) => c.charCodeAt(0))], { type: 'video/mp4' }) : null;
      for (let i = 0; i < videos; i++) {
        const id = ulid();
        await put(id, 'original', 'video', video!, 'video/mp4');
        await put(id, 'thumb', 'video', await jpeg(160, 120), 'image/jpeg');
        await put(id, 'poster', 'video', await jpeg(640, 480), 'image/jpeg');
        await send('/api/media', json({ id, entryId, kind: 'video', width: 640, height: 480, durationMs: 3_000, container: 'mp4' }));
      }
      return entryId;
    },
    { count, videos, device, mp4 },
  );
}
