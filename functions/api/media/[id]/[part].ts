/**
 * PUT /api/media/{mediaId}/{original|thumb|poster}?entryId=…&kind=photo|video[&container=mp4|mov]
 * Session required. Stores one file of a media item in R2. The item is not
 * saved until POST /api/media commits it — until then, a retry may upload the
 * same part again. Once committed, its files can never be replaced.
 */
import type { MediaKind } from '../../../../src/lib/types';
import { entryExists, findMedia } from '../../../../lib-server/db';
import { limits, type Env, type RequestData } from '../../../../lib-server/env';
import { isVideoContainer, mediaKey, partSpec, type MediaPart, type VideoContainer } from '../../../../lib-server/files';
import { requireSession } from '../../../../lib-server/guard';
import { error, errors, json } from '../../../../lib-server/http';
import { parseId } from '../../../../lib-server/ids';
import { storeUpload } from '../../../../lib-server/upload';

const PARTS: readonly MediaPart[] = ['original', 'thumb', 'poster'];
const KINDS: readonly MediaKind[] = ['photo', 'video'];

export const onRequestPut: PagesFunction<Env, 'id' | 'part', RequestData> = async (context) => {
  const session = requireSession(context);
  if (session instanceof Response) return session;
  const { request, env, params } = context;
  const url = new URL(request.url);

  const mediaId = String(params.id);
  const part = String(params.part) as MediaPart;
  const entryId = url.searchParams.get('entryId');
  const kind = url.searchParams.get('kind') as MediaKind | null;
  // Recorded video is MP4; the native-camera fallback gives QuickTime.
  const containerParam = url.searchParams.get('container') ?? 'mp4';

  const media = parseId(mediaId);
  if (!media) return errors.badRequest('The media id is not valid.');
  if (media.deviceId !== session.deviceId) {
    return error(400, 'id_wrong_device', `This iPad is signed in as ${session.deviceId}; its ids must start with "${session.deviceId}-".`);
  }
  if (!PARTS.includes(part)) return errors.badRequest('The file part must be original, thumb or poster.');
  if (!kind || !KINDS.includes(kind)) return errors.badRequest('Say whether this is a photo or a video (kind=photo|video).');
  if (!parseId(entryId)) return errors.badRequest('The entry id is not valid.');

  if (!isVideoContainer(containerParam)) return errors.badRequest('A video container must be mp4 or mov.');
  const container: VideoContainer = containerParam;
  const spec = partSpec(kind, part, limits(env), container);
  if (!spec) return errors.badRequest('Only videos have a poster frame.');

  if (await findMedia(env.DB, mediaId)) {
    return error(409, 'already_saved', 'This item is already saved. Its files cannot be replaced.');
  }
  if (!(await entryExists(env.DB, entryId as string))) {
    return error(404, 'entry_not_found', 'That entry does not exist yet. Save the entry first, then its media.');
  }

  const key = mediaKey(kind, part, entryId as string, mediaId, container);
  const stored = await storeUpload(env.MEDIA, request, key, spec.format, spec.maxBytes);
  if (stored instanceof Response) return stored;
  return json(stored, 201);
};
