/**
 * Shared test helpers. Requests go to the real Functions over HTTP, exactly
 * as an iPad's would — nothing is called in-process, nothing is mocked.
 */
import sharp from 'sharp';
import { ulid } from 'ulid';
import { inject } from 'vitest';
import { SESSION_COOKIE, signSession } from '../lib-server/session';
import type { DeviceId } from '../src/lib/types';

export const baseUrl = () => inject('baseUrl');

export const newId = (device: DeviceId) => `${device}-${ulid()}`;

/** A cookie header value, e.g. "__Host-gb_session=…". */
export type Cookie = string;

export interface Call {
  method?: string;
  cookie?: Cookie;
  json?: unknown;
  body?: BodyInit;
  contentType?: string;
  headers?: Record<string, string>;
}

export async function call(path: string, { method = 'GET', cookie, json, body, contentType, headers = {} }: Call = {}): Promise<Response> {
  const h: Record<string, string> = { ...headers };
  if (cookie) h.Cookie = cookie;
  if (json !== undefined) h['Content-Type'] = 'application/json';
  else if (contentType) h['Content-Type'] = contentType;
  return fetch(baseUrl() + path, { method, headers: h, body: json !== undefined ? JSON.stringify(json) : body });
}

export async function login(device: DeviceId, passphrase = inject('passphrase')): Promise<Cookie> {
  const response = await call('/api/auth/login', { method: 'POST', json: { deviceId: device, passphrase } });
  if (response.status !== 200) throw new Error(`login failed: ${response.status} ${await response.text()}`);
  const setCookie = response.headers.get('set-cookie') ?? '';
  return setCookie.split(';')[0];
}

/** A session token signed with any key — the forger's view of the world. */
export async function cookieSignedWith(key: string, device: DeviceId, expiresAt = Date.now() + 86_400_000): Promise<Cookie> {
  const token = await signSession({ deviceId: device, issuedAt: Date.now() - 1_000, expiresAt }, key);
  return `${SESSION_COOKIE}=${token}`;
}

// Tiny but genuine files, so signature checks see real bytes.
type Bytes = Uint8Array<ArrayBuffer>;
let jpegBytes: Bytes | undefined;
let pngBytes: Bytes | undefined;

export async function jpeg(): Promise<Bytes> {
  jpegBytes ??= Uint8Array.from(await sharp({ create: { width: 64, height: 48, channels: 3, background: '#336699' } }).jpeg().toBuffer());
  return jpegBytes;
}

export async function png(): Promise<Bytes> {
  pngBytes ??= Uint8Array.from(await sharp({ create: { width: 80, height: 60, channels: 4, background: '#EFE8DA' } }).png().toBuffer());
  return pngBytes;
}

/** An ISO-BMFF header ("ftyp" + brand) followed by padding — enough for the signature check. */
export function mp4(brand = 'isom', size = 4_096): Bytes {
  const bytes = new Uint8Array(size);
  bytes.set([0, 0, 0, 0x18], 0);
  bytes.set(new TextEncoder().encode('ftyp' + brand), 4);
  return bytes;
}

export async function createEntry(cookie: Cookie, device: DeviceId): Promise<string> {
  const id = newId(device);
  const response = await call('/api/entries', { method: 'POST', cookie, json: { id } });
  if (response.status !== 201) throw new Error(`createEntry: ${response.status} ${await response.text()}`);
  return id;
}

/** Uploads a photo's original and thumbnail; does not commit it. */
export async function uploadPhotoFiles(cookie: Cookie, device: DeviceId, entryId: string, mediaId = newId(device)): Promise<string> {
  for (const part of ['original', 'thumb']) {
    const response = await call(`/api/media/${mediaId}/${part}?entryId=${entryId}&kind=photo`, {
      method: 'PUT',
      cookie,
      body: await jpeg(),
      contentType: 'image/jpeg',
    });
    if (response.status !== 201) throw new Error(`upload ${part}: ${response.status} ${await response.text()}`);
  }
  return mediaId;
}

export function commitPhoto(cookie: Cookie, mediaId: string, entryId: string): Promise<Response> {
  return call('/api/media', { method: 'POST', cookie, json: { id: mediaId, entryId, kind: 'photo', width: 64, height: 48 } });
}

export async function uploadCanvasPng(cookie: Cookie, device: DeviceId, entryId: string, canvasId = newId(device)): Promise<string> {
  const response = await call(`/api/canvas/${canvasId}?entryId=${entryId}`, { method: 'PUT', cookie, body: await png(), contentType: 'image/png' });
  if (response.status !== 201) throw new Error(`upload canvas: ${response.status} ${await response.text()}`);
  return canvasId;
}

export function commitCanvas(cookie: Cookie, canvasId: string, entryId: string): Promise<Response> {
  return call('/api/canvas', { method: 'POST', cookie, json: { id: canvasId, entryId, strokes: [{ points: [[1, 2, 0.5], [3, 4, 0.6]] }] } });
}

/** The album as a signed-in iPad sees it: fresh, never the public cache. */
export async function freshEntries(cookie: Cookie) {
  const response = await call('/api/entries', { cookie });
  return ((await response.json()) as { entries: import('../src/lib/types').ApiEntry[] }).entries;
}
