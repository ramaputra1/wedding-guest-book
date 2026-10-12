import { expect, type Page } from '@playwright/test';
import type { ApiEntry, ApiStats } from '../../src/lib/types';

export async function signIn(page: Page, device: 'ipad1' | 'ipad2' = 'ipad1') {
  await page.goto(`/${device}`);
  await page.locator('#passphrase').fill(process.env.E2E_PASSPHRASE!);
  await page.keyboard.press('Enter');
  await expect(page.locator('.rail')).toBeVisible();
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
