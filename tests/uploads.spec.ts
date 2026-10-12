/**
 * Server-side upload validation (CLAUDE.md, Security rule 6): the file's own
 * bytes decide its type, sizes and durations are capped, and a saved item's
 * files can never be replaced. Phase 4 adds the network-failure cases.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { call, commitPhoto, createEntry, freshEntries, jpeg, login, mp4, newId, uploadPhotoFiles, type Cookie } from './helpers';

let cookie: Cookie;
let entryId: string;

beforeAll(async () => {
  cookie = await login('ipad1');
  entryId = await createEntry(cookie, 'ipad1');
});

const put = (path: string, body: Uint8Array<ArrayBuffer>, contentType: string) => call(path, { method: 'PUT', cookie, body, contentType });

describe('the bytes decide the type', () => {
  it('text claiming to be a JPEG is refused and not kept', async () => {
    const id = newId('ipad1');
    const response = await put(`/api/media/${id}/original?entryId=${entryId}&kind=photo`, new TextEncoder().encode('not a jpeg, only pretending'), 'image/jpeg');
    expect(response.status).toBe(415);
    expect((await call(`/api/files/photos/${entryId}/${id}.jpg`)).status).toBe(404);
  });

  it('a QuickTime .mov is refused as a video', async () => {
    const response = await put(`/api/media/${newId('ipad1')}/original?entryId=${entryId}&kind=video`, mp4('qt  '), 'video/mp4');
    expect(response.status).toBe(415);
  });

  it('a JPEG uploaded as a video is refused', async () => {
    const response = await put(`/api/media/${newId('ipad1')}/original?entryId=${entryId}&kind=video`, await jpeg(), 'video/mp4');
    expect(response.status).toBe(415);
  });

  it('the stored content type comes from the check, not the client', async () => {
    const id = newId('ipad1');
    for (const part of ['original', 'thumb']) {
      expect((await put(`/api/media/${id}/${part}?entryId=${entryId}&kind=photo`, await jpeg(), 'text/html')).status).toBe(201);
    }
    expect((await commitPhoto(cookie, id, entryId)).status).toBe(201);
    const file = await call(`/api/files/photos/${entryId}/${id}.jpg`);
    expect(file.headers.get('content-type')).toBe('image/jpeg');
    expect(file.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

describe('size and duration ceilings', () => {
  it('a photo over MAX_PHOTO_BYTES is refused before it is stored', async () => {
    const big = new Uint8Array(8_000_001);
    big.set(await jpeg());
    const response = await put(`/api/media/${newId('ipad1')}/original?entryId=${entryId}&kind=photo`, big, 'image/jpeg');
    expect(response.status).toBe(413);
  });

  it('a video longer than 15 seconds is not saved', async () => {
    const id = newId('ipad1');
    await put(`/api/media/${id}/original?entryId=${entryId}&kind=video`, mp4(), 'video/mp4');
    await put(`/api/media/${id}/thumb?entryId=${entryId}&kind=video`, await jpeg(), 'image/jpeg');
    await put(`/api/media/${id}/poster?entryId=${entryId}&kind=video`, await jpeg(), 'image/jpeg');
    const commit = (durationMs: number) =>
      call('/api/media', { method: 'POST', cookie, json: { id, entryId, kind: 'video', width: 1280, height: 720, durationMs } });
    expect((await commit(16_000)).status).toBe(413);
    expect((await commit(15_000)).status).toBe(201);
  });

  it('a photo has no poster frame', async () => {
    const response = await put(`/api/media/${newId('ipad1')}/poster?entryId=${entryId}&kind=photo`, await jpeg(), 'image/jpeg');
    expect(response.status).toBe(400);
  });
});

describe('nothing is saved until every file is stored — and nothing saved is ever replaced', () => {
  it('committing before the files arrive is refused', async () => {
    const response = await commitPhoto(cookie, newId('ipad1'), entryId);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'upload_incomplete' });
  });

  it("media for an entry that doesn't exist is refused", async () => {
    const response = await put(`/api/media/${newId('ipad1')}/original?entryId=${newId('ipad1')}&kind=photo`, await jpeg(), 'image/jpeg');
    expect(response.status).toBe(404);
  });

  it("a saved item's files cannot be overwritten", async () => {
    const id = await uploadPhotoFiles(cookie, 'ipad1', entryId);
    expect((await commitPhoto(cookie, id, entryId)).status).toBe(201);
    const response = await put(`/api/media/${id}/original?entryId=${entryId}&kind=photo`, await jpeg(), 'image/jpeg');
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'already_saved' });
  });

  it('committing the same item twice gives one row', async () => {
    const id = await uploadPhotoFiles(cookie, 'ipad1', entryId);
    expect((await commitPhoto(cookie, id, entryId)).status).toBe(201);
    expect((await commitPhoto(cookie, id, entryId)).status).toBe(200);
    const media = (await freshEntries(cookie)).find((e) => e.id === entryId)?.media ?? [];
    expect(media.filter((m) => m.id === id)).toHaveLength(1);
  });
});

describe('serving files', () => {
  it('honours byte ranges, which Safari needs to play video', async () => {
    const id = newId('ipad1');
    await put(`/api/media/${id}/original?entryId=${entryId}&kind=video`, mp4('isom', 4_096), 'video/mp4');
    const response = await call(`/api/files/videos/${entryId}/${id}.mp4`, { headers: { Range: 'bytes=0-99' } });
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 0-99/4096');
    expect((await response.arrayBuffer()).byteLength).toBe(100);
    expect((await call(`/api/files/videos/${entryId}/${id}.mp4`, { headers: { Range: 'bytes=9000-' } })).status).toBe(416);
  });

  it('serves only keys the API writes', async () => {
    for (const path of ['/api/files/wrangler.toml', '/api/files/photos/x.jpg', `/api/files/other/${entryId}/${entryId}.jpg`]) {
      expect((await call(path)).status).toBe(404);
    }
  });
});
