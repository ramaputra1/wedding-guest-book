/**
 * The writer session: a signed cookie, HMAC-SHA256 via Web Crypto.
 *
 * Token: base64url(JSON payload) "." base64url(HMAC of that text).
 * The payload says which device signed in and until when. It carries no
 * permissions beyond "this browser knew the passphrase": the device id is a
 * label for writes, never an authorization.
 *
 * Rotating SESSION_SIGNING_KEY invalidates every session at once — that is
 * how a lost iPad is revoked (docs/ARCHITECTURE.md, Authentication).
 */
import type { DeviceId } from '../src/lib/types';
import { isDeviceId } from '../src/lib/devices';
import { fromBase64Url, toBase64Url, utf8 } from './bytes';

export const SESSION_COOKIE = '__Host-gb_session';
const PAYLOAD_VERSION = 1;
/** A signing key shorter than this is a configuration mistake, not a key. */
export const MIN_SIGNING_KEY_LENGTH = 32;

export interface Session {
  deviceId: DeviceId;
  /** Epoch ms. */
  issuedAt: number;
  /** Epoch ms. */
  expiresAt: number;
}

interface Payload {
  v: number;
  d: string;
  iat: number;
  exp: number;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', utf8(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signSession(session: Session, secret: string): Promise<string> {
  const payload: Payload = { v: PAYLOAD_VERSION, d: session.deviceId, iat: session.issuedAt, exp: session.expiresAt };
  const body = toBase64Url(utf8(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), utf8(body));
  return `${body}.${toBase64Url(signature)}`;
}

/** Returns the session if the token is genuine and unexpired, otherwise null. */
export async function verifySession(token: string, secret: string, now = Date.now()): Promise<Session | null> {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signatureText] = parts;
  const signature = fromBase64Url(signatureText);
  const bodyBytes = fromBase64Url(body);
  if (!signature || !bodyBytes) return null;

  // crypto.subtle.verify compares the MAC in constant time; the signature is
  // checked before the payload is even parsed.
  const genuine = await crypto.subtle.verify('HMAC', await hmacKey(secret), signature, utf8(body));
  if (!genuine) return null;

  let payload: Partial<Payload>;
  try {
    payload = JSON.parse(new TextDecoder().decode(bodyBytes)) as Partial<Payload>;
  } catch {
    return null;
  }
  if (payload.v !== PAYLOAD_VERSION || !isDeviceId(payload.d)) return null;
  if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number') return null;
  if (payload.exp <= now) return null;
  return { deviceId: payload.d, issuedAt: payload.iat, expiresAt: payload.exp };
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

/** HttpOnly so page JavaScript can never read it; Secure + __Host- so it only travels over HTTPS to this exact host. */
export function sessionCookie(token: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}
