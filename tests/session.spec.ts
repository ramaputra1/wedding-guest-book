/** Unit tests for the session and passphrase primitives, run in-process. */
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { timingSafeEqual } from '../lib-server/bytes';
import { hashPassphrase, verifyPassphrase } from '../lib-server/passphrase';
import { signSession, verifySession } from '../lib-server/session';

const key = 'k'.repeat(44);
const session = { deviceId: 'ipad1' as const, issuedAt: 1_800_000_000_000, expiresAt: 1_900_000_000_000 };

describe('session tokens', () => {
  it('round-trip with the right key', async () => {
    const token = await signSession(session, key);
    expect(await verifySession(token, key, 1_850_000_000_000)).toEqual(session);
  });

  it('fail with another key, after expiry, or after any edit', async () => {
    const token = await signSession(session, key);
    expect(await verifySession(token, 'x'.repeat(44), 1_850_000_000_000)).toBeNull();
    expect(await verifySession(token, key, 1_900_000_000_000)).toBeNull();
    const [body, signature] = token.split('.');
    const flipped = body.slice(0, -2) + (body.at(-2) === 'A' ? 'B' : 'A') + body.at(-1);
    expect(await verifySession(`${flipped}.${signature}`, key, 1_850_000_000_000)).toBeNull();
    expect(await verifySession(`${body}.`, key, 1_850_000_000_000)).toBeNull();
    expect(await verifySession(body, key, 1_850_000_000_000)).toBeNull();
  });
});

describe('timingSafeEqual', () => {
  it('compares whole arrays', () => {
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
  });
});

describe('passphrases', () => {
  it('verify only the right passphrase', async () => {
    const stored = await hashPassphrase('four ordinary words together');
    expect(await verifyPassphrase('four ordinary words together', stored)).toBe(true);
    expect(await verifyPassphrase('four ordinary words togethe', stored)).toBe(false);
    expect(await verifyPassphrase('', stored)).toBe(false);
  });

  it('reject malformed or out-of-range hashes instead of throwing', async () => {
    for (const stored of ['', 'plain', 'pbkdf2-sha256$1$AA$AA', 'pbkdf2-sha256$999999$AA$AA', 'md5$20000$AA$AA']) {
      expect(await verifyPassphrase('anything', stored)).toBe(false);
    }
  });

  it('scripts/hash-passphrase.mjs produces a hash the server accepts', async () => {
    const passphrase = 'a long passphrase typed on an ipad';
    const run = spawnSync('node', ['scripts/hash-passphrase.mjs'], { input: passphrase + '\n', encoding: 'utf8' });
    expect(run.status).toBe(0);
    const hash = run.stdout.trim();
    expect(hash).toMatch(/^pbkdf2-sha256\$20000\$/);
    expect(await verifyPassphrase(passphrase, hash)).toBe(true);
  });

  it('the script refuses a short passphrase and a command-line argument', () => {
    expect(spawnSync('node', ['scripts/hash-passphrase.mjs'], { input: 'short\n', encoding: 'utf8' }).status).toBe(1);
    expect(spawnSync('node', ['scripts/hash-passphrase.mjs', 'on the command line'], { encoding: 'utf8' }).status).toBe(1);
  });
});
