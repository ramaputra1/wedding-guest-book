/**
 * The handwritten page's API (Phase 5): every save is a new version, the
 * stroke JSON must be a page that can be redrawn later, and a writer can
 * fetch the latest strokes to carry on.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { call, commitCanvas, createEntry, login, newId, strokeDocument, uploadCanvasPng, type Cookie } from './helpers';

let cookie: Cookie;

beforeAll(async () => {
  cookie = await login('ipad1');
});

async function saveVersion(entryId: string, strokes: unknown = strokeDocument()) {
  const id = await uploadCanvasPng(cookie, 'ipad1', entryId);
  return { id, response: await commitCanvas(cookie, id, entryId, strokes) };
}

describe('the stroke JSON must be a page that can be redrawn', () => {
  it.each([
    ['a bare array', [{ points: [[1, 2, 0.5]] }]],
    ['another format', { ...strokeDocument(), format: 'svg' }],
    ['an unknown tool', { ...strokeDocument(), strokes: [{ tool: 'brush', points: [[1, 2, 0.5]] }] }],
    ['points that are not numbers', { ...strokeDocument(), strokes: [{ tool: 'pen', points: [['1', 2, 0.5]] }] }],
    ['points missing their pressure', { ...strokeDocument(), strokes: [{ tool: 'pen', points: [[1, 2]] }] }],
  ])('%s is refused with 400 and nothing is saved', async (_case, strokes) => {
    const entryId = await createEntry(cookie, 'ipad1');
    const { response } = await saveVersion(entryId, strokes);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'bad_request' });
    expect((await call(`/api/canvas?entryId=${entryId}`, { cookie })).status).toBe(404);
  });

  it('an empty page (everything cleared) is a valid version', async () => {
    const entryId = await createEntry(cookie, 'ipad1');
    const { response } = await saveVersion(entryId, { ...strokeDocument(), strokes: [] });
    expect(response.status).toBe(201);
  });
});

describe('GET /api/canvas — the latest version, to keep writing', () => {
  it('a page never written on is 404', async () => {
    const entryId = await createEntry(cookie, 'ipad1');
    const response = await call(`/api/canvas?entryId=${entryId}`, { cookie });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'not_found' });
  });

  it('returns the newest version and its strokes exactly as saved; older versions stay', async () => {
    const entryId = await createEntry(cookie, 'ipad1');
    const first = strokeDocument([[10, 20, 0.3]]);
    const second = strokeDocument([[10, 20, 0.3], [500.5, 375.2, 0.91]]);
    expect((await saveVersion(entryId, first)).response.status).toBe(201);
    const { id } = await saveVersion(entryId, second);
    const response = await call(`/api/canvas?entryId=${entryId}`, { cookie });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id, version: 2, createdAt: expect.any(Number), strokes: second });
  });

  it('an invalid entry id is 400', async () => {
    expect((await call('/api/canvas?entryId=nope', { cookie })).status).toBe(400);
    expect((await call(`/api/canvas?entryId=${newId('ipad1')}`, { cookie })).status).toBe(404);
  });
});
