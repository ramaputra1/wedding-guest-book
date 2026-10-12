/**
 * Two iPads writing at once (docs/TESTING.md §2). All requests in a burst are
 * started before any is awaited, so they genuinely overlap at the server.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  call,
  commitCanvas,
  commitPhoto,
  createEntry,
  freshEntries,
  login,
  newId,
  uploadCanvasPng,
  uploadPhotoFiles,
  type Cookie,
} from './helpers';
import type { DeviceId } from '../src/lib/types';

let cookies: Record<DeviceId, Cookie>;
const deviceFor = (i: number): DeviceId => (i % 2 === 0 ? 'ipad1' : 'ipad2');

beforeAll(async () => {
  cookies = { ipad1: await login('ipad1'), ipad2: await login('ipad2') };
});

describe('200 simultaneous entries from both iPads', () => {
  it('produce 200 distinct rows, each labelled with its own device, none lost', async () => {
    const before = (await freshEntries(cookies.ipad1)).length;
    const planned = Array.from({ length: 200 }, (_, i) => ({ id: newId(deviceFor(i)), device: deviceFor(i) }));

    const responses = await Promise.all(
      planned.map(({ id, device }) => call('/api/entries', { method: 'POST', cookie: cookies[device], json: { id } })),
    );
    expect(responses.map((r) => r.status)).toEqual(Array(200).fill(201));

    const after = await freshEntries(cookies.ipad2);
    expect(after.length).toBe(before + 200);
    const stored = new Map(after.map((entry) => [entry.id, entry]));
    expect(new Set(planned.map((p) => p.id)).size).toBe(200);
    for (const { id, device } of planned) {
      expect(stored.get(id)?.deviceId).toBe(device);
      expect(id.startsWith(`${device}-`)).toBe(true);
    }
  });

  it('retrying 20 already-saved entries creates nothing new', async () => {
    const planned = Array.from({ length: 20 }, (_, i) => ({ id: newId(deviceFor(i)), device: deviceFor(i) }));
    const send = () =>
      Promise.all(planned.map(({ id, device }) => call('/api/entries', { method: 'POST', cookie: cookies[device], json: { id } })));
    expect((await send()).map((r) => r.status)).toEqual(Array(20).fill(201));
    const count = (await freshEntries(cookies.ipad1)).length;
    expect((await send()).map((r) => r.status)).toEqual(Array(20).fill(200));
    expect((await freshEntries(cookies.ipad1)).length).toBe(count);
  });
});

describe('200 simultaneous media items from both iPads', () => {
  it('produce 200 distinct media rows across shared entries, none lost', async () => {
    // Both iPads add to the same few entries, as when guests crowd one spread.
    const entries = [await createEntry(cookies.ipad1, 'ipad1'), await createEntry(cookies.ipad2, 'ipad2')];
    const planned = Array.from({ length: 200 }, (_, i) => ({ device: deviceFor(i), entryId: entries[i % 3 === 0 ? 0 : 1] }));

    const ids = await Promise.all(planned.map(({ device, entryId }) => uploadPhotoFiles(cookies[device], device, entryId)));
    const commits = await Promise.all(ids.map((id, i) => commitPhoto(cookies[planned[i].device], id, planned[i].entryId)));
    expect(commits.map((r) => r.status)).toEqual(Array(200).fill(201));

    const stored = (await freshEntries(cookies.ipad1)).filter((entry) => entries.includes(entry.id)).flatMap((entry) => entry.media);
    expect(stored.length).toBe(200);
    expect(new Set(stored.map((m) => m.id))).toEqual(new Set(ids));
    // Every row's file is really in storage.
    const sample = await Promise.all(stored.slice(0, 20).map((m) => call(m.url)));
    expect(sample.every((r) => r.status === 200)).toBe(true);
  });
});

describe('canvas versions', () => {
  it('both iPads saving the same page in the same instant both survive, as distinct versions', async () => {
    const entryId = await createEntry(cookies.ipad1, 'ipad1');
    const [a, b] = await Promise.all([
      uploadCanvasPng(cookies.ipad1, 'ipad1', entryId),
      uploadCanvasPng(cookies.ipad2, 'ipad2', entryId),
    ]);
    const [ra, rb] = await Promise.all([commitCanvas(cookies.ipad1, a, entryId), commitCanvas(cookies.ipad2, b, entryId)]);
    expect([ra.status, rb.status]).toEqual([201, 201]);
    const versions = [((await ra.json()) as { version: number }).version, ((await rb.json()) as { version: number }).version];
    expect(versions.sort()).toEqual([1, 2]);

    // Neither PNG was overwritten: both files exist under their own keys.
    for (const id of [a, b]) expect((await call(`/api/files/canvases/${entryId}/${id}.png`)).status).toBe(200);
    // The album shows the higher version.
    const entry = (await freshEntries(cookies.ipad1)).find((e) => e.id === entryId);
    expect(entry?.canvas?.version).toBe(2);
  });

  it('50 simultaneous saves of one page give versions 1–50, each exactly once', async () => {
    const entryId = await createEntry(cookies.ipad2, 'ipad2');
    const ids = await Promise.all(Array.from({ length: 50 }, (_, i) => uploadCanvasPng(cookies[deviceFor(i)], deviceFor(i), entryId)));
    const responses = await Promise.all(ids.map((id, i) => commitCanvas(cookies[deviceFor(i)], id, entryId)));
    expect(responses.map((r) => r.status)).toEqual(Array(50).fill(201));
    const versions = await Promise.all(responses.map(async (r) => ((await r.json()) as { version: number }).version));
    expect(versions.sort((x, y) => x - y)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });
});

describe('the counts add up', () => {
  it('stats agree with the album', async () => {
    const entries = await freshEntries(cookies.ipad1);
    const stats = (await (await call('/api/stats', { cookie: cookies.ipad1 })).json()) as { entries: number; media: number };
    expect(stats.entries).toBe(entries.length);
    expect(stats.media).toBe(entries.reduce((n, e) => n + e.media.length, 0));
  });
});
