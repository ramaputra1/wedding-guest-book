/**
 * Types shared by the album island and (from Phase 3) the API client.
 * Types only — they erase at compile time, so this file is safe to import
 * from both sides of the client/server line.
 */

export type DeviceId = 'ipad1' | 'ipad2';

export type MediaKind = 'photo' | 'video';

/** MP4 from the in-page recorder; QuickTime only from the native-camera fallback. */
export type VideoContainer = 'mp4' | 'mov';

/** Where an item stands between capture and storage. */
export type SaveState = 'saving' | 'failed';

/** One photo or video, as the album displays it. */
export interface AlbumMedia {
  id: string;
  kind: MediaKind;
  /** What the mount shows: the photo, or a video's poster frame. */
  src: string;
  srcSet?: string;
  width: number;
  height: number;
  alt: string;
  /** Videos only. */
  durationMs?: number;
  /** The full photo or video, fetched only when a visitor opens the item. */
  fullSrc?: string;
  /** Videos: the poster frame, shown before playback. */
  posterSrc?: string;
  /** Present only while the item is still on its way to storage (Phase 4 queue). */
  pending?: { state: SaveState; code?: string; message?: string; permanent?: boolean };
}

/** A handwritten page, as the album displays it: the flattened image. */
export interface AlbumPage {
  src: string;
  alt: string;
}

/** One spread: media on the left, the handwriting that belongs to it on the right. */
export interface AlbumEntry {
  id: string;
  deviceId: DeviceId;
  /** Epoch milliseconds. */
  createdAt: number;
  media: AlbumMedia[];
  page: AlbumPage | null;
}

export type AlbumMode = 'view' | 'write';

// ---------------------------------------------------------------------------
// The HTTP API (functions/api). Shapes only; see docs/ARCHITECTURE.md, API.
// ---------------------------------------------------------------------------

export type ApiErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'wrong_passphrase'
  | 'cross_origin'
  | 'not_found'
  | 'entry_not_found'
  | 'already_saved'
  | 'upload_incomplete'
  | 'id_wrong_device'
  | 'conflict'
  | 'length_required'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'server_not_configured'
  | 'server_error';

export interface ApiError {
  code: ApiErrorCode;
  message: string;
}

export interface ApiSession {
  deviceId: DeviceId;
  /** Epoch ms. */
  expiresAt: number;
}

export interface ApiMedia {
  id: string;
  kind: MediaKind;
  /** Same-origin URLs under /api/files/. */
  url: string;
  thumbUrl: string;
  posterUrl: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  /** Every stored file of this item together: original, thumbnail, poster. */
  bytes: number;
  createdAt: number;
}

export interface ApiCanvas {
  id: string;
  version: number;
  url: string;
  createdAt: number;
}

export interface ApiEntry {
  id: string;
  deviceId: DeviceId;
  title: string | null;
  note: string | null;
  createdAt: number;
  media: ApiMedia[];
  /** The latest version only. */
  canvas: ApiCanvas | null;
}

export interface ApiEntries {
  entries: ApiEntry[];
}

export interface ApiStats {
  entries: number;
  media: number;
  canvasVersions: number;
  /** Media plus canvas PNGs, as stored in R2. */
  bytesUsed: number;
  /** R2's free storage allowance; the gauge measures bytesUsed against it. */
  bytesAllowance: number;
}
