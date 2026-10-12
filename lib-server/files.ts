/**
 * R2 object keys and the checks that decide what may be stored.
 * The file's own bytes decide its type; whatever the client claims is ignored.
 */
import type { MediaKind } from '../src/lib/types';
import type { Limits } from './env';

export type MediaPart = 'original' | 'thumb' | 'poster';
export type FileFormat = 'jpeg' | 'png' | 'mp4' | 'mov';
/** The container a video arrives in: MP4 from the in-page recorder, QuickTime from the native-camera fallback. */
export type VideoContainer = 'mp4' | 'mov';

const CONTENT_TYPES: Record<FileFormat, string> = { jpeg: 'image/jpeg', png: 'image/png', mp4: 'video/mp4', mov: 'video/quicktime' };
const EXTENSIONS: Record<FileFormat, string> = { jpeg: 'jpg', png: 'png', mp4: 'mp4', mov: 'mov' };

export function isVideoContainer(value: unknown): value is VideoContainer {
  return value === 'mp4' || value === 'mov';
}

// Thumbnails aim for ~40 KB and posters for one frame; these ceilings only stop abuse.
const THUMB_MAX_BYTES = 1_000_000;
const POSTER_MAX_BYTES = 2_000_000;

export interface PartSpec {
  format: FileFormat;
  maxBytes: number;
}

export function partSpec(kind: MediaKind, part: MediaPart, limits: Limits, container: VideoContainer = 'mp4'): PartSpec | null {
  if (part === 'thumb') return { format: 'jpeg', maxBytes: THUMB_MAX_BYTES };
  if (part === 'poster') return kind === 'video' ? { format: 'jpeg', maxBytes: POSTER_MAX_BYTES } : null;
  return kind === 'photo'
    ? { format: 'jpeg', maxBytes: limits.maxPhotoBytes }
    : { format: container, maxBytes: limits.maxVideoBytes };
}

/** docs/ARCHITECTURE.md, R2 key layout. A video's extension follows its real container. */
export function mediaKey(kind: MediaKind, part: MediaPart, entryId: string, mediaId: string, container: VideoContainer = 'mp4'): string {
  const folder = part === 'thumb' ? 'thumbs' : part === 'poster' ? 'posters' : kind === 'photo' ? 'photos' : 'videos';
  const format: FileFormat = part === 'original' && kind === 'video' ? container : 'jpeg';
  return `${folder}/${entryId}/${mediaId}.${EXTENSIONS[format]}`;
}

/**
 * Keyed by the canvas id, not `v{version}` as ARCHITECTURE.md first drew it:
 * the version is assigned by the database at save time, after the PNG is
 * already stored, and two iPads saving the same page at once would compute
 * the same `v{n}` and overwrite each other's PNG. An id key cannot collide.
 */
export function canvasKey(entryId: string, canvasId: string): string {
  return `canvases/${entryId}/${canvasId}.png`;
}

export function contentType(format: FileFormat): string {
  return CONTENT_TYPES[format];
}

/** Checks the file's leading bytes against the format it must be. */
export function hasSignature(bytes: Uint8Array, format: FileFormat): boolean {
  switch (format) {
    case 'jpeg':
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case 'png':
      return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b);
    case 'mp4': {
      // ISO base media: bytes 4–7 are "ftyp", with any brand but QuickTime's.
      const box = String.fromCharCode(...bytes.slice(4, 8));
      const brand = String.fromCharCode(...bytes.slice(8, 12));
      return box === 'ftyp' && brand !== 'qt  ';
    }
    case 'mov': {
      // QuickTime, from the native-camera fallback: "ftyp" + "qt  ". Accepted
      // so a guest's video is never lost when the camera permission was
      // refused — even though iOS's HEVC .mov may not play in desktop Chrome
      // or Firefox. The in-page recorder always produces MP4 (H.264).
      const box = String.fromCharCode(...bytes.slice(4, 8));
      const brand = String.fromCharCode(...bytes.slice(8, 12));
      return box === 'ftyp' && brand === 'qt  ';
    }
  }
}

/** Keys the public file route will serve — media and canvases, nothing else. */
export const SERVABLE_KEY = /^(photos|videos|posters|thumbs|canvases)\/(ipad[12]-[0-9A-HJKMNP-TV-Z]{26})\/(ipad[12]-[0-9A-HJKMNP-TV-Z]{26})\.(jpg|mp4|mov|png)$/;
