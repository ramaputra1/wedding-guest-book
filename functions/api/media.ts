/**
 * POST /api/media — session required. Commits a media item whose files are
 * already in R2 (PUT /api/media/{id}/{part}) by writing its D1 row. Only when
 * this returns 201 or 200 may the iPad mark the capture "Saved" and release
 * its local copy (CLAUDE.md, Data integrity, rule 3).
 */
import type { MediaKind } from '../../src/lib/types';
import { entryExists, findMedia, insertMedia } from '../../lib-server/db';
import { limits, type Env, type RequestData } from '../../lib-server/env';
import { mediaKey } from '../../lib-server/files';
import { requireSession } from '../../lib-server/guard';
import { error, errors, json, readJsonObject } from '../../lib-server/http';
import { idTime, parseId } from '../../lib-server/ids';

const MAX_DIMENSION = 20_000;
// MediaRecorder stops a hair after the requested cap; this much is a stop, not a longer video.
const DURATION_TOLERANCE_MS = 500;

function dimension(value: unknown): number | null {
  return Number.isInteger(value) && (value as number) > 0 && (value as number) <= MAX_DIMENSION ? (value as number) : null;
}

export const onRequestPost: PagesFunction<Env, string, RequestData> = async (context) => {
  const session = requireSession(context);
  if (session instanceof Response) return session;
  const { request, env } = context;

  const body = await readJsonObject(request, 4_096);
  if (body instanceof Response) return body;

  const media = parseId(body.id);
  if (!media) return errors.badRequest('The media id is not valid.');
  if (media.deviceId !== session.deviceId) {
    return error(400, 'id_wrong_device', `This iPad is signed in as ${session.deviceId}; its ids must start with "${session.deviceId}-".`);
  }
  if (!parseId(body.entryId)) return errors.badRequest('The entry id is not valid.');
  const kind = body.kind;
  if (kind !== 'photo' && kind !== 'video') return errors.badRequest('Say whether this is a photo or a video.');
  const width = dimension(body.width);
  const height = dimension(body.height);
  if (width === null || height === null) return errors.badRequest('Width and height must be whole numbers of pixels.');

  let durationMs: number | null = null;
  if (kind === 'video') {
    const max = limits(env).maxVideoDurationMs;
    if (!Number.isInteger(body.durationMs) || (body.durationMs as number) <= 0) {
      return errors.badRequest('A video needs its duration in milliseconds.');
    }
    durationMs = body.durationMs as number;
    if (durationMs > max + DURATION_TOLERANCE_MS) {
      return error(413, 'payload_too_large', `Videos stop at ${max / 1000} seconds. This one is longer and was not saved.`);
    }
  }
  const createdAt = idTime(media.ulid);
  if (createdAt === null) return errors.badRequest("The media id's time is not plausible. Check the iPad's date and time.");

  const id = body.id as string;
  const entryId = body.entryId as string;

  // A retry of something already saved is a success, not a duplicate.
  const existing = await findMedia(env.DB, id);
  if (existing) {
    return existing.entry_id === entryId && existing.kind === kind
      ? json({ id, saved: true }, 200)
      : error(409, 'conflict', 'That media id is already saved with different details.');
  }
  if (!(await entryExists(env.DB, entryId))) {
    return error(404, 'entry_not_found', 'That entry does not exist yet. Save the entry first, then its media.');
  }

  const keys = {
    original: mediaKey(kind as MediaKind, 'original', entryId, id),
    thumb: mediaKey(kind as MediaKind, 'thumb', entryId, id),
    poster: kind === 'video' ? mediaKey('video', 'poster', entryId, id) : null,
  };
  const heads = await Promise.all([env.MEDIA.head(keys.original), env.MEDIA.head(keys.thumb), keys.poster ? env.MEDIA.head(keys.poster) : null]);
  const [original, thumb, poster] = heads;
  if (!original || !thumb || (keys.poster && !poster)) {
    return error(409, 'upload_incomplete', "Some of this item's files haven't arrived. Upload them, then save again.");
  }

  const created = await insertMedia(env.DB, {
    id,
    entryId,
    kind: kind as MediaKind,
    r2Key: keys.original,
    posterKey: keys.poster,
    thumbKey: keys.thumb,
    width,
    height,
    durationMs,
    bytes: original.size + thumb.size + (poster?.size ?? 0),
    createdAt,
  });
  // Two retries racing each other: one inserts, the other finds it saved.
  return json({ id, saved: true }, created ? 201 : 200);
};
