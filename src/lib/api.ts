/**
 * The browser's typed client for /api. Same-origin, so the HttpOnly session
 * cookie travels with every request on its own; page JavaScript never sees it.
 */
import type { AlbumCopy } from '../config/site';
import type { AlbumEntry, ApiEntries, ApiEntry, ApiError, ApiErrorCode, ApiSession, DeviceId } from './types';

export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode | 'network',
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: 'same-origin', ...init });
  } catch {
    throw new ApiFailure(0, 'network', 'The guest book could not be reached.');
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = body as Partial<ApiError> | null;
    throw new ApiFailure(response.status, failure?.code ?? 'server_error', failure?.message ?? `Request failed (${response.status}).`);
  }
  return body as T;
}

const postJson = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/** Whether this browser is signed in, and as which device. Null when signed out. */
export async function getSession(): Promise<ApiSession | null> {
  try {
    return await call<ApiSession>('/api/auth/session');
  } catch (failure) {
    if (failure instanceof ApiFailure && failure.status === 401) return null;
    throw failure;
  }
}

export function signIn(deviceId: DeviceId, passphrase: string): Promise<ApiSession> {
  return call<ApiSession>('/api/auth/login', postJson({ deviceId, passphrase }));
}

export function signOut(): Promise<unknown> {
  return call('/api/auth/logout', { method: 'POST' });
}

/** Converts the API's entries into what the album draws. */
export function toAlbumEntry(entry: ApiEntry, copy: AlbumCopy): AlbumEntry {
  return {
    id: entry.id,
    deviceId: entry.deviceId,
    createdAt: entry.createdAt,
    media: entry.media.map((item) => ({
      id: item.id,
      kind: item.kind,
      // The album shows thumbnails; full media is fetched on tap (Phase 4).
      src: item.thumbUrl,
      width: item.width ?? 4,
      height: item.height ?? 3,
      alt: entry.title ?? (item.kind === 'video' ? copy.videoAlt : copy.photoAlt),
      durationMs: item.durationMs ?? undefined,
    })),
    page: entry.canvas ? { src: entry.canvas.url, alt: entry.title ?? copy.handwrittenPage } : null,
  };
}

/** `fresh` for a signed-in iPad: it must see its own writes, never any cached copy. */
export async function getAlbum(copy: AlbumCopy, fresh = false): Promise<AlbumEntry[]> {
  const { entries } = await call<ApiEntries>('/api/entries', fresh ? { cache: 'no-store' } : undefined);
  return entries.map((entry) => toAlbumEntry(entry, copy));
}
