/**
 * Passphrase hashing: PBKDF2-SHA256 via Web Crypto.
 *
 * Stored form: "pbkdf2-sha256$<iterations>$<salt b64url>$<hash b64url>",
 * produced by scripts/hash-passphrase.mjs and kept only in the encrypted
 * WRITER_PASSPHRASE_HASH variable.
 *
 * Why 20,000 iterations and not the 600,000 usually recommended: the Workers
 * free plan allows about 10 ms of CPU per request, and 100,000 iterations
 * already take ~23 ms on an M2 Pro. The hash never leaves Cloudflare's
 * encrypted store, so the real defence is a long passphrase — the script
 * refuses short ones. The count is stored in the hash, so it can be raised.
 */
import { fromBase64Url, timingSafeEqual, toBase64Url, utf8, type Bytes } from './bytes';

export const PASSPHRASE_ITERATIONS = 20_000;
// Workers refuse PBKDF2 above 100,000 iterations; below 10,000 is too weak to accept.
const MIN_ITERATIONS = 10_000;
const MAX_ITERATIONS = 100_000;
const SCHEME = 'pbkdf2-sha256';

async function derive(passphrase: string, salt: Bytes, iterations: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', utf8(passphrase), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassphrase(passphrase: string, iterations = PASSPHRASE_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(passphrase, salt, iterations);
  return `${SCHEME}$${iterations}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

/** True only for the right passphrase. A malformed stored hash is false, never an exception. */
export async function verifyPassphrase(passphrase: string, stored: string): Promise<boolean> {
  const [scheme, iterationText, saltText, hashText, ...extra] = stored.split('$');
  if (scheme !== SCHEME || extra.length > 0) return false;
  const iterations = Number(iterationText);
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) return false;
  const salt = fromBase64Url(saltText ?? '');
  const expected = fromBase64Url(hashText ?? '');
  if (!salt || !expected || expected.length !== 32) return false;
  return timingSafeEqual(await derive(passphrase, salt, iterations), expected);
}

export function isWellFormedHash(stored: string | undefined): stored is string {
  return typeof stored === 'string' && stored.startsWith(`${SCHEME}$`) && stored.split('$').length === 4;
}
