/**
 * PUT /api/canvas/{canvasId}?entryId=… — session required. Stores the
 * flattened PNG of one canvas version in R2. Committed by POST /api/canvas;
 * once committed, its PNG can never be replaced.
 */
import { entryExists, findCanvas } from '../../../lib-server/db';
import { limits, type Env, type RequestData } from '../../../lib-server/env';
import { canvasKey } from '../../../lib-server/files';
import { requireSession } from '../../../lib-server/guard';
import { error, errors, json } from '../../../lib-server/http';
import { parseId } from '../../../lib-server/ids';
import { storeUpload } from '../../../lib-server/upload';

export const onRequestPut: PagesFunction<Env, 'id', RequestData> = async (context) => {
  const session = requireSession(context);
  if (session instanceof Response) return session;
  const { request, env, params } = context;

  const canvasId = String(params.id);
  const entryId = new URL(request.url).searchParams.get('entryId');
  const canvas = parseId(canvasId);
  if (!canvas) return errors.badRequest('The canvas id is not valid.');
  if (canvas.deviceId !== session.deviceId) {
    return error(400, 'id_wrong_device', `This iPad is signed in as ${session.deviceId}; its ids must start with "${session.deviceId}-".`);
  }
  if (!parseId(entryId)) return errors.badRequest('The entry id is not valid.');

  if (await findCanvas(env.DB, canvasId)) {
    return error(409, 'already_saved', 'This page version is already saved. It cannot be replaced; save a new version instead.');
  }
  if (!(await entryExists(env.DB, entryId as string))) {
    return error(404, 'entry_not_found', 'That entry does not exist yet. Save the entry first, then its page.');
  }

  const stored = await storeUpload(env.MEDIA, request, canvasKey(entryId as string, canvasId), 'png', limits(env).maxPhotoBytes);
  if (stored instanceof Response) return stored;
  return json(stored, 201);
};
