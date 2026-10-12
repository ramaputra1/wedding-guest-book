/**
 * DELETE /api/media/{mediaId} — session required. Takes a photo or video out
 * of the album (owner request after Phase 5). Either iPad may remove any item.
 *
 * Nothing is erased. The removal is a new row in media_removals; the media
 * row and its files stay, so a guest's mistake can be undone by the owner
 * (docs/ARCHITECTURE.md, "Removing a photo or video").
 */
import { findMedia, insertRemoval } from '../../../lib-server/db';
import type { Env, RequestData } from '../../../lib-server/env';
import { requireSession } from '../../../lib-server/guard';
import { error, errors, json } from '../../../lib-server/http';
import { parseId } from '../../../lib-server/ids';

export const onRequestDelete: PagesFunction<Env, 'id', RequestData> = async (context) => {
  const session = requireSession(context);
  if (session instanceof Response) return session;
  const { env, params } = context;

  const mediaId = String(params.id);
  if (!parseId(mediaId)) return errors.badRequest('The media id is not valid.');
  if (!(await findMedia(env.DB, mediaId))) return error(404, 'not_found', 'That photo or video is not in the album.');

  // Removing an item that is already removed changes nothing and is not an error.
  await insertRemoval(env.DB, { mediaId, deviceId: session.deviceId, removedAt: Date.now() });
  return json({ id: mediaId, removed: true });
};
