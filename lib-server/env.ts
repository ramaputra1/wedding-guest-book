/**
 * Bindings and variables available to Pages Functions.
 * Declared by hand rather than generated, so type generation never reads a
 * secrets file. Secrets are optional here because a missing one must produce
 * a clear 500, not a crash.
 */
import type { Session } from './session';

export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  /** Secret. Output of scripts/hash-passphrase.mjs. */
  WRITER_PASSPHRASE_HASH?: string;
  /** Secret. At least 32 characters, e.g. `openssl rand -base64 32`. */
  SESSION_SIGNING_KEY?: string;
  SESSION_TTL_DAYS?: string;
  MAX_VIDEO_DURATION_MS?: string;
  MAX_VIDEO_BYTES?: string;
  MAX_PHOTO_BYTES?: string;
}

/** What the middleware hands to handlers. */
export interface RequestData extends Record<string, unknown> {
  session?: Session;
}

export interface Limits {
  sessionTtlDays: number;
  maxVideoDurationMs: number;
  maxVideoBytes: number;
  maxPhotoBytes: number;
}

function positiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** Defaults match docs/SETUP-CLOUDFLARE.md §6. */
export function limits(env: Env): Limits {
  return {
    sessionTtlDays: positiveInt(env.SESSION_TTL_DAYS, 180),
    maxVideoDurationMs: positiveInt(env.MAX_VIDEO_DURATION_MS, 15_000),
    maxVideoBytes: positiveInt(env.MAX_VIDEO_BYTES, 15_000_000),
    maxPhotoBytes: positiveInt(env.MAX_PHOTO_BYTES, 8_000_000),
  };
}
