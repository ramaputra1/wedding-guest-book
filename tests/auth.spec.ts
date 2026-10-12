/**
 * Authorization — the real security test (docs/TESTING.md §1).
 * Every protected endpoint is attacked individually; nothing is assumed from
 * the middleware. Then the store is checked to prove the attempts left no trace.
 */
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { fromBase64Url, toBase64Url } from '../lib-server/bytes';
import { SESSION_COOKIE } from '../lib-server/session';
import { freshState, randomSigningKey, startServer, type TestServer } from './setup/server';
import {
  call,
  commitCanvas,
  commitPhoto,
  cookieSignedWith,
  createEntry,
  freshEntries,
  jpeg,
  login,
  newId,
  png,
  uploadCanvasPng,
  uploadPhotoFiles,
  type Call,
  type Cookie,
} from './helpers';

let ipad1: Cookie;
let entryId: string;
/** Every id a rejected request tried to create, to prove none exists afterwards. */
const attemptedEntries: string[] = [];
const attemptedFiles: string[] = [];
/** Saved items a rejected request tried to delete: each must still be in the album. */
const attemptedRemovals: string[] = [];

beforeAll(async () => {
  ipad1 = await login('ipad1');
  entryId = await createEntry(ipad1, 'ipad1');
});

/** The same payload with the device swapped and the original signature kept. */
function tamper(cookie: Cookie): Cookie {
  const [body, signature] = cookie.slice(SESSION_COOKIE.length + 1).split('.');
  const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body)!));
  payload.d = 'ipad2';
  payload.exp = Date.now() + 10 * 365 * 86_400_000;
  return `${SESSION_COOKIE}=${toBase64Url(new TextEncoder().encode(JSON.stringify(payload)))}.${signature}`;
}

const BAD_COOKIES: Array<[string, () => Promise<Cookie | undefined>]> = [
  ['no cookie', async () => undefined],
  ['malformed cookie', async () => `${SESSION_COOKIE}=this-is-not-a-session`],
  ['garbage with a dot', async () => `${SESSION_COOKIE}=%%%.%%%`],
  ['forged: valid payload, signed with another key', () => cookieSignedWith(randomSigningKey(), 'ipad1')],
  ['tampered: real signature, payload edited', async () => tamper(ipad1)],
  ['expired: signed with the real key', () => cookieSignedWith(inject('signingKey'), 'ipad1', Date.now() - 1_000)],
  ['unsigned: payload with an empty signature', async () => `${tamper(ipad1).split('.')[0]}.`],
];

/** Each protected endpoint, with a request that would succeed if authorized. */
const PROTECTED: Array<[string, () => Promise<[string, Call]>]> = [
  ['POST /api/entries', async () => {
    const id = newId('ipad1');
    attemptedEntries.push(id);
    return ['/api/entries', { method: 'POST', json: { id } }];
  }],
  ['PUT /api/media/{id}/original', async () => {
    const id = newId('ipad1');
    attemptedFiles.push(`photos/${entryId}/${id}.jpg`);
    return [`/api/media/${id}/original?entryId=${entryId}&kind=photo`, { method: 'PUT', body: await jpeg(), contentType: 'image/jpeg' }];
  }],
  ['POST /api/media', async () => ['/api/media', { method: 'POST', json: { id: newId('ipad1'), entryId, kind: 'photo', width: 64, height: 48 } }]],
  ['PUT /api/canvas/{id}', async () => {
    const id = newId('ipad1');
    attemptedFiles.push(`canvases/${entryId}/${id}.png`);
    return [`/api/canvas/${id}?entryId=${entryId}`, { method: 'PUT', body: await png(), contentType: 'image/png' }];
  }],
  ['POST /api/canvas', async () => ['/api/canvas', { method: 'POST', json: { id: newId('ipad1'), entryId, strokes: [] } }]],
  ['GET /api/canvas', async () => [`/api/canvas?entryId=${entryId}`, {}]],
  ['DELETE /api/media/{id}', async () => {
    const id = await uploadPhotoFiles(ipad1, 'ipad1', entryId);
    expect((await commitPhoto(ipad1, id, entryId)).status).toBe(201);
    attemptedRemovals.push(id);
    return [`/api/media/${id}`, { method: 'DELETE' }];
  }],
  ['GET /api/stats', async () => ['/api/stats', {}]],
  ['GET /api/auth/session', async () => ['/api/auth/session', {}]],
  ['POST /api/auth/logout', async () => ['/api/auth/logout', { method: 'POST' }]],
];

describe.each(PROTECTED)('%s', (_name, makeRequest) => {
  it.each(BAD_COOKIES)('rejects %s with 401', async (_case, makeCookie) => {
    const [path, init] = await makeRequest();
    const response = await call(path, { ...init, cookie: await makeCookie() });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'unauthorized' });
  });
});

describe('valid session', () => {
  it('POST /api/entries → 201', async () => {
    const id = newId('ipad1');
    const response = await call('/api/entries', { method: 'POST', cookie: ipad1, json: { id } });
    expect(response.status).toBe(201);
  });

  it('PUT media parts → 201, POST /api/media → 201', async () => {
    const mediaId = await uploadPhotoFiles(ipad1, 'ipad1', entryId);
    expect((await commitPhoto(ipad1, mediaId, entryId)).status).toBe(201);
  });

  it('PUT /api/canvas/{id} → 201, POST /api/canvas → 201', async () => {
    const canvasId = await uploadCanvasPng(ipad1, 'ipad1', entryId);
    expect((await commitCanvas(ipad1, canvasId, entryId)).status).toBe(201);
  });

  it('GET /api/stats → 200', async () => {
    const response = await call('/api/stats', { cookie: ipad1 });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ entries: expect.any(Number), bytesAllowance: 10_000_000_000 });
  });

  it('GET /api/auth/session → 200 with the device', async () => {
    const response = await call('/api/auth/session', { cookie: ipad1 });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ deviceId: 'ipad1' });
  });

  it('POST /api/auth/logout → 200 and clears the cookie', async () => {
    const throwaway = await login('ipad1');
    const response = await call('/api/auth/logout', { method: 'POST', cookie: throwaway });
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toMatch(new RegExp(`^${SESSION_COOKIE}=; .*Max-Age=0`));
  });
});

describe('public routes', () => {
  it('GET /api/entries works with no cookie', async () => {
    const response = await call('/api/entries');
    expect(response.status).toBe(200);
    expect(await response.json()).toHaveProperty('entries');
  });

  it('GET /api/files/… works with no cookie', async () => {
    const mediaId = await uploadPhotoFiles(ipad1, 'ipad1', entryId);
    await commitPhoto(ipad1, mediaId, entryId);
    const response = await call(`/api/files/photos/${entryId}/${mediaId}.jpg`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
  });

  it('an unknown /api route is denied, not exposed', async () => {
    expect((await call('/api/admin')).status).toBe(401);
    expect((await call('/api/entries', { method: 'DELETE' })).status).toBe(401);
  });
});

describe('sign-in', () => {
  it('a wrong passphrase is 401 and sets no cookie', async () => {
    const response = await call('/api/auth/login', { method: 'POST', json: { deviceId: 'ipad1', passphrase: 'wrong' } });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'wrong_passphrase' });
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('the cookie is HttpOnly, Secure, SameSite=Lax, host-only, and long-lived', async () => {
    const response = await call('/api/auth/login', { method: 'POST', json: { deviceId: 'ipad2', passphrase: inject('passphrase') } });
    const header = response.headers.get('set-cookie') ?? '';
    expect(header.startsWith(`${SESSION_COOKIE}=`)).toBe(true);
    expect(header).toContain('HttpOnly');
    expect(header).toContain('Secure');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Path=/');
    expect(header).not.toMatch(/Domain=/i);
    expect(header).toContain(`Max-Age=${180 * 86_400}`);
  });

  it('only ipad1 and ipad2 can be named as the device', async () => {
    for (const deviceId of ['ipad3', 'admin', '', null]) {
      const response = await call('/api/auth/login', { method: 'POST', json: { deviceId, passphrase: inject('passphrase') } });
      expect(response.status).toBe(400);
    }
  });

  it('a write from another site is refused even with a valid cookie', async () => {
    const response = await call('/api/entries', {
      method: 'POST',
      cookie: ipad1,
      json: { id: newId('ipad1') },
      headers: { Origin: 'https://attacker.example' },
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'cross_origin' });
  });
});

describe('a client-supplied device id never grants or changes anything', () => {
  it('device_id in the body and query is ignored; the label comes from the session', async () => {
    const id = newId('ipad1');
    const response = await call('/api/entries?device_id=ipad2&deviceId=ipad2', {
      method: 'POST',
      cookie: ipad1,
      json: { id, device_id: 'ipad2', deviceId: 'ipad2' },
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ id, deviceId: 'ipad1' });
    const stored = (await freshEntries(ipad1)).find((entry) => entry.id === id);
    expect(stored?.deviceId).toBe('ipad1');
  });

  it("an ipad1 session cannot write an id that claims to be ipad2's", async () => {
    const id = newId('ipad2');
    const response = await call('/api/entries', { method: 'POST', cookie: ipad1, json: { id } });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'id_wrong_device' });
    expect((await freshEntries(ipad1)).some((entry) => entry.id === id)).toBe(false);
  });

  it('no cookie plus a device id in body or query is still 401', async () => {
    const id = newId('ipad1');
    attemptedEntries.push(id);
    for (const path of ['/api/entries', '/api/entries?device_id=ipad1']) {
      const response = await call(path, { method: 'POST', json: { id, device_id: 'ipad1', deviceId: 'ipad1' } });
      expect(response.status).toBe(401);
    }
  });
});

describe('rejected requests left no trace', () => {
  it('no attempted entry exists', async () => {
    const ids = new Set((await freshEntries(ipad1)).map((entry) => entry.id));
    expect(attemptedEntries.length).toBeGreaterThan(0);
    expect(attemptedEntries.filter((id) => ids.has(id))).toEqual([]);
  });

  it('no item a rejected request tried to delete has left the album', async () => {
    const media = new Set((await freshEntries(ipad1)).flatMap((entry) => entry.media.map((item) => item.id)));
    expect(attemptedRemovals.length).toBeGreaterThan(0);
    expect(attemptedRemovals.filter((id) => !media.has(id))).toEqual([]);
  });

  it('no attempted file exists in storage', async () => {
    expect(attemptedFiles.length).toBeGreaterThan(0);
    for (const key of attemptedFiles) expect((await call(`/api/files/${key}`)).status).toBe(404);
  });
});

describe('rotating SESSION_SIGNING_KEY revokes every session', () => {
  let server: TestServer | undefined;
  const state = freshState();
  afterAll(async () => {
    await server?.stop();
    state.remove();
  });

  it('a cookie issued under the old key is refused; a new sign-in works', async () => {
    const passphraseHash = inject('passphraseHash');
    server = await startServer({ signingKey: randomSigningKey(), passphraseHash }, state.dir);
    const signIn = () => fetch(`${server!.url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: 'ipad1', passphrase: inject('passphrase') }),
    });
    const oldCookie = (await signIn()).headers.get('set-cookie')!.split(';')[0];
    const sessionWith = (cookie: string) => fetch(`${server!.url}/api/auth/session`, { headers: { Cookie: cookie } });
    expect((await sessionWith(oldCookie)).status).toBe(200);

    await server.stop();
    server = await startServer({ signingKey: randomSigningKey(), passphraseHash }, state.dir);

    expect((await sessionWith(oldCookie)).status).toBe(401);
    const write = await fetch(`${server.url}/api/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: oldCookie },
      body: JSON.stringify({ id: newId('ipad1') }),
    });
    expect(write.status).toBe(401);

    const newCookie = (await signIn()).headers.get('set-cookie')!.split(';')[0];
    expect((await sessionWith(newCookie)).status).toBe(200);
  });
});
