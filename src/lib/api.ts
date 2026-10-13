/**
 * The browser's typed client for /api. Same-origin, so the HttpOnly session
 * cookie travels with every request on its own; page JavaScript never sees it.
 */
import type { AlbumCopy } from '../config/site';
import type { AlbumLook } from './settings';
import type { AlbumEntry, ApiEntries, ApiEntry, ApiError, ApiErrorCode, ApiSession, ApiSettings, ApiStats, DeviceId, MediaKind, VideoContainer } from './types';

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

/** The album's look. `fresh` skips any cached copy (a signed-in iPad always wants the latest). */
export function getSettings(fresh = false): Promise<ApiSettings> {
  return call<ApiSettings>('/api/settings', fresh ? { cache: 'no-store' } : undefined);
}

/** Saves a new look for the whole album: a new row, never over the last one. */
export function saveSettings(id: string, look: AlbumLook): Promise<ApiSettings> {
  return call<ApiSettings>('/api/settings', postJson({ id, look }));
}

export function getStats(): Promise<ApiStats> {
  return call<ApiStats>('/api/stats', { cache: 'no-store' });
}

/** Creates an entry; a repeat of the same id is a success, not a duplicate. */
export function createEntry(id: string): Promise<ApiEntry> {
  return call<ApiEntry>('/api/entries', postJson({ id }));
}

export type MediaPart = 'original' | 'thumb' | 'poster';

export interface PartTarget {
  mediaId: string;
  entryId: string;
  kind: MediaKind;
  part: MediaPart;
  container?: VideoContainer;
}

/** Streams one file of a media item to storage. Not saved until committed. */
export function putMediaPart(target: PartTarget, file: Blob): Promise<unknown> {
  const query = new URLSearchParams({ entryId: target.entryId, kind: target.kind });
  if (target.container) query.set('container', target.container);
  return call(`/api/media/${target.mediaId}/${target.part}?${query}`, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
}

/** Takes a photo or video out of the album. Nothing is erased (see functions/api/media/[id].ts). */
export function removeMedia(mediaId: string): Promise<unknown> {
  return call(`/api/media/${mediaId}`, { method: 'DELETE' });
}

export interface MediaCommit {
  id: string;
  entryId: string;
  kind: MediaKind;
  width: number;
  height: number;
  durationMs?: number;
  container?: VideoContainer;
}

/** Writes the media row once every file is stored. Only its success means "Saved". */
export function commitMedia(commit: MediaCommit): Promise<unknown> {
  return call('/api/media', postJson(commit));
}

/** Streams a page version's PNG to storage. Not saved until committed. */
export function putCanvasPng(canvasId: string, entryId: string, png: Blob): Promise<unknown> {
  return call(`/api/canvas/${canvasId}?${new URLSearchParams({ entryId })}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png' },
    body: png,
  });
}

/**
 * Saves a new version of a page. `strokes` is the stroke JSON as text, sent
 * as-is so a large page is never parsed and re-serialised on the iPad.
 */
export function commitCanvas(id: string, entryId: string, strokes: string): Promise<{ version: number }> {
  return call('/api/canvas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: `{"id":${JSON.stringify(id)},"entryId":${JSON.stringify(entryId)},"strokes":${strokes}}`,
  });
}

/** The latest saved version of a page, to keep writing on it. Null when it has none. */
export async function getLatestStrokes(entryId: string): Promise<{ version: number; createdAt: number; strokes: unknown } | null> {
  try {
    return await call(`/api/canvas?${new URLSearchParams({ entryId })}`, { cache: 'no-store' });
  } catch (failure) {
    if (failure instanceof ApiFailure && failure.status === 404) return null;
    throw failure;
  }
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
      // The album shows thumbnails; the viewer fetches the full file on tap.
      src: item.thumbUrl,
      fullSrc: item.url,
      posterSrc: item.posterUrl ?? undefined,
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
