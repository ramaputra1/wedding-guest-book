/**
 * The sign-in guess limit that makes a six-digit PIN safe (migration 0004;
 * functions/api/auth/login.ts). Its own server, with a small limit and a
 * short window: three wrong PINs within five seconds, and new sign-ins wait.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassphrase } from '../lib-server/passphrase';
import { freshState, randomSigningKey, startServer, type TestServer } from './setup/server';

const PIN = '191226';
const LOCK_SECONDS = 5;
let server: TestServer;
let state: { dir: string; remove(): void };

const login = (pin: string, deviceId = 'ipad1') =>
  fetch(`${server.url}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: server.url },
    body: JSON.stringify({ deviceId, passphrase: pin }),
  });

beforeAll(async () => {
  state = freshState();
  server = await startServer({ signingKey: randomSigningKey(), passphraseHash: await hashPassphrase(PIN) }, state.dir, undefined, {
    LOGIN_MAX_FAILURES: '3',
    LOGIN_LOCK_SECONDS: String(LOCK_SECONDS),
  });
}, 180_000);

afterAll(async () => {
  await server?.stop();
  state?.remove();
});

describe('a six-digit PIN, with guesses limited', () => {
  it('the right PIN signs in', async () => {
    const response = await login(PIN);
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toMatch(/^__Host-gb_session=/);
  });

  it('after three wrong PINs every new sign-in waits — even with the right PIN — and a signed-in iPad carries on', async () => {
    const signedIn = (await login(PIN, 'ipad2')).headers.get('set-cookie')!.split(';')[0];

    for (const wrong of ['000000', '111111', '222222']) {
      const response = await login(wrong);
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ code: 'wrong_passphrase' });
    }

    const locked = await login(PIN);
    expect(locked.status).toBe(429);
    expect(await locked.json()).toMatchObject({ code: 'too_many_attempts', message: expect.stringMatching(/^Too many wrong tries\. Try again in 1 minute\.$/) });
    const retryAfter = Number(locked.headers.get('retry-after'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(LOCK_SECONDS);

    // Guessing more changes nothing and records nothing new: still locked, still the same wait or less.
    expect((await login('333333')).status).toBe(429);

    // The iPad already signed in is untouched.
    const session = await fetch(`${server.url}/api/auth/session`, { headers: { cookie: signedIn } });
    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({ deviceId: 'ipad2' });

    // Once the window passes, the right PIN works again.
    await new Promise((resolve) => setTimeout(resolve, (LOCK_SECONDS + 1) * 1_000));
    expect((await login(PIN)).status).toBe(200);
  }, 60_000);

  it('without migration 0004 there is no guess limit, so sign-in is refused with a clear reason — never left open', async () => {
    execFileSync(join('node_modules', '.bin', 'wrangler'), ['d1', 'execute', 'wedding-guestbook', '--local', '--persist-to', state.dir, '--command', 'DROP TABLE login_failures'], {
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
      stdio: 'pipe',
    });
    const response = await login(PIN);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'migration_missing', message: expect.stringContaining('0004_login_failures') });
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});
