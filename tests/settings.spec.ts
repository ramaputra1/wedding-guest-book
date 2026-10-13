/**
 * The album's look (Settings, owner request after Phase 5): public to read,
 * session to save, every value from a fixed list, the watermark at most 24
 * characters. A save is a new row; the newest is the look in use.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, type AlbumLook } from '../src/lib/settings';
import { call, login, newId, type Cookie } from './helpers';

let ipad1: Cookie;
let ipad2: Cookie;

beforeAll(async () => {
  [ipad1, ipad2] = await Promise.all([login('ipad1'), login('ipad2')]);
});

const look = (overrides: Partial<AlbumLook> = {}): AlbumLook => ({ ...DEFAULT_LOOK, ...overrides });
const save = (cookie: Cookie, body: unknown, device: 'ipad1' | 'ipad2' = 'ipad1') =>
  call('/api/settings', { method: 'POST', cookie, json: { id: newId(device), look: body } });
const read = async (cookie?: Cookie) => (await (await call(`/api/settings${cookie ? '' : `?visitor=${Date.now()}`}`, { cookie })).json()) as { look: AlbumLook; savedAt: number | null };

describe('GET /api/settings', () => {
  it('is public: a visitor gets the look, so the online album is drawn with it', async () => {
    const response = await call('/api/settings');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ look: { leaf: expect.any(String), watermark: { text: expect.any(String) } } });
  });
});

describe('POST /api/settings', () => {
  it('saves a look that both iPads and visitors then see', async () => {
    const chosen = look({ leaf: 'forest', frame: 'polaroid', paper: 'dotted', theme: 'botanical', watermark: { text: 'R & A', position: 'top-end' } });
    const response = await save(ipad1, chosen);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ look: chosen, savedAt: expect.any(Number) });
    expect((await read(ipad1)).look).toEqual(chosen);
    expect((await read(ipad2)).look).toEqual(chosen);
    expect((await read()).look).toEqual(chosen);
  });

  it('the newest save is the look in use, whichever iPad made it', async () => {
    await save(ipad1, look({ leaf: 'wine' }));
    await save(ipad2, look({ leaf: 'navy' }), 'ipad2');
    expect((await read(ipad1)).look.leaf).toBe('navy');
  });

  it('trims the watermark, and counts characters as people do: 24 emoji fit, 25 letters do not', async () => {
    expect((await save(ipad1, look({ watermark: { text: '  RA  ', position: 'center' } }))).status).toBe(201);
    expect((await read(ipad1)).look.watermark).toEqual({ text: 'RA', position: 'center' });
    expect((await save(ipad1, look({ watermark: { text: '💍'.repeat(24), position: 'top' } }))).status).toBe(201);
    expect((await save(ipad1, look({ watermark: { text: 'x'.repeat(25), position: 'top' } }))).status).toBe(400);
  });

  it.each([
    ['an album colour not on the list', { ...DEFAULT_LOOK, leaf: 'hotpink' }],
    ['CSS smuggled in as a frame', { ...DEFAULT_LOOK, frame: "corners'] body { display: none } [x='" }],
    ['an unknown paper', { ...DEFAULT_LOOK, paper: 'papyrus' }],
    ['an unknown theme', { ...DEFAULT_LOOK, theme: 'disco' }],
    ['an unknown watermark place', { ...DEFAULT_LOOK, watermark: { text: 'RA', position: 'left' } }],
    ['a line break in the watermark', { ...DEFAULT_LOOK, watermark: { text: 'R\nA', position: 'top' } }],
    ['no watermark at all', { leaf: 'midnight', frame: 'corners', paper: 'ruled', theme: 'none' }],
    ['not a look', 'midnight'],
  ])('%s is refused with 400, and the look in use does not change', async (_case, body) => {
    const before = (await read(ipad1)).look;
    const response = await save(ipad1, body);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'bad_request' });
    expect((await read(ipad1)).look).toEqual(before);
  });

  it("an id from the other iPad is refused: the session says who saved it", async () => {
    const response = await call('/api/settings', { method: 'POST', cookie: ipad1, json: { id: newId('ipad2'), look: look() } });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'id_wrong_device' });
  });

  it('back to the designed album', async () => {
    expect((await save(ipad1, DEFAULT_LOOK)).status).toBe(201);
    expect((await read(ipad1)).look).toEqual(DEFAULT_LOOK);
  });
});
