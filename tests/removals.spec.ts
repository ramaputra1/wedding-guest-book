/**
 * Deleting a photo or video (owner request after Phase 5). Nothing is erased:
 * the item leaves the album, its row and files stay, and the removal is its
 * own row — so it can be undone (docs/ARCHITECTURE.md, "Removing a photo or
 * video"). Either iPad may delete any item.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { call, commitPhoto, createEntry, freshEntries, login, newId, uploadPhotoFiles, type Cookie } from './helpers';

let ipad1: Cookie;
let ipad2: Cookie;

beforeAll(async () => {
  [ipad1, ipad2] = await Promise.all([login('ipad1'), login('ipad2')]);
});

async function savedPhoto(entryId: string) {
  const id = await uploadPhotoFiles(ipad1, 'ipad1', entryId);
  expect((await commitPhoto(ipad1, id, entryId)).status).toBe(201);
  return id;
}

const albumIds = async (cookie: Cookie) => new Set((await freshEntries(cookie)).flatMap((entry) => entry.media.map((item) => item.id)));
// The public album is served from a shared cache for up to 30 s (entries.ts);
// a unique query reads past it, as a visitor arriving later would.
const publicIds = async () =>
  new Set((((await (await call(`/api/entries?after-delete=${Date.now()}`)).json()) as { entries: { media: { id: string }[] }[] }).entries).flatMap((e) => e.media.map((m) => m.id)));

describe('DELETE /api/media/{id}', () => {
  it('takes the item out of the album — for both iPads and the public — and keeps its files', async () => {
    const entryId = await createEntry(ipad1, 'ipad1');
    const keep = await savedPhoto(entryId);
    const gone = await savedPhoto(entryId);
    const file = (await freshEntries(ipad1)).find((e) => e.id === entryId)!.media.find((m) => m.id === gone)!.url;
    const stats = async () => (await (await call('/api/stats', { cookie: ipad1 })).json()) as { media: number; bytesUsed: number };
    const before = await stats();

    // The other iPad may delete it: either iPad can delete any item.
    const response = await call(`/api/media/${gone}`, { method: 'DELETE', cookie: ipad2 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: gone, removed: true });

    for (const ids of [await albumIds(ipad1), await albumIds(ipad2), await publicIds()]) {
      expect(ids.has(gone)).toBe(false);
      expect(ids.has(keep)).toBe(true);
    }
    // Not erased: the file is still in storage, so the removal can be undone.
    expect((await call(file.replace(/^https?:\/\/[^/]+/, ''))).status).toBe(200);
    // The album counts one item fewer; storage still holds its bytes.
    const after = await stats();
    expect(after.media).toBe(before.media - 1);
    expect(after.bytesUsed).toBe(before.bytesUsed);
  });

  it('deleting twice is fine and changes nothing more', async () => {
    const entryId = await createEntry(ipad1, 'ipad1');
    const id = await savedPhoto(entryId);
    expect((await call(`/api/media/${id}`, { method: 'DELETE', cookie: ipad1 })).status).toBe(200);
    expect((await call(`/api/media/${id}`, { method: 'DELETE', cookie: ipad1 })).status).toBe(200);
    expect((await albumIds(ipad1)).has(id)).toBe(false);
  });

  it('an unknown item is 404, a malformed id is 400', async () => {
    const unknown = await call(`/api/media/${newId('ipad1')}`, { method: 'DELETE', cookie: ipad1 });
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toMatchObject({ code: 'not_found' });
    expect((await call('/api/media/not-an-id', { method: 'DELETE', cookie: ipad1 })).status).toBe(400);
  });

  it('a delete from another site is refused, and the item stays', async () => {
    const entryId = await createEntry(ipad1, 'ipad1');
    const id = await savedPhoto(entryId);
    const response = await call(`/api/media/${id}`, { method: 'DELETE', cookie: ipad1, headers: { Origin: 'https://evil.example' } });
    expect(response.status).toBe(403);
    expect((await albumIds(ipad1)).has(id)).toBe(true);
  });
});
