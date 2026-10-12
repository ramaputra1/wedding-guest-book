/**
 * Types shared by the album island and (from Phase 3) the API client.
 * Types only — they erase at compile time, so this file is safe to import
 * from both sides of the client/server line.
 */

export type DeviceId = 'ipad1' | 'ipad2';

export type MediaKind = 'photo' | 'video';

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
