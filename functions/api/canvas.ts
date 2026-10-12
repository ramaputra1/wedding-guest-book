/**
 * GET  /api/canvas?entryId=… — session required. The strokes of the page's
 *      latest version, so a writer can carry on where the page was left.
 * POST /api/canvas — session required. Saves a new version of an entry's
 * handwritten page: the stroke JSON goes into D1, next to the PNG already
 * stored by PUT /api/canvas/{id}. A save never overwrites — every version
 * stays, so an accidental "clear" is always recoverable.
 */
import { entryExists, findCanvas, insertCanvas, latestCanvas } from '../../lib-server/db';
import type { Env, RequestData } from '../../lib-server/env';
import { canvasKey } from '../../lib-server/files';
import { requireSession } from '../../lib-server/guard';
import { error, errors, json, readJsonObject } from '../../lib-server/http';
import { idTime, parseId } from '../../lib-server/ids';

// D1 allows rows up to 2 MB; strokes for a full page stay well under this.
const MAX_STROKE_BYTES = 1_500_000;
const MAX_STROKES = 20_000;

/**
 * The stroke JSON must be a page that can be redrawn later: the format the
 * album writes (src/lib/canvas/strokes.ts), with points that are numbers.
 */
function isStrokeDocument(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const doc = value as Record<string, unknown>;
  if (doc.format !== 'guestbook-strokes' || doc.version !== 1 || !Array.isArray(doc.strokes)) return false;
  if (doc.strokes.length > MAX_STROKES) return false;
  return doc.strokes.every((stroke: unknown) => {
    if (typeof stroke !== 'object' || stroke === null) return false;
    const { tool, points } = stroke as Record<string, unknown>;
    return (
      (tool === 'pen' || tool === 'pencil' || tool === 'eraser') &&
      Array.isArray(points) &&
      points.every((p) => Array.isArray(p) && p.length === 3 && p.every((n) => typeof n === 'number' && Number.isFinite(n)))
    );
  });
}

export const onRequestGet: PagesFunction<Env, string, RequestData> = async (context) => {
  const session = requireSession(context);
  if (session instanceof Response) return session;
  const entryId = new URL(context.request.url).searchParams.get('entryId');
  if (!parseId(entryId)) return errors.badRequest('The entry id is not valid.');
  const row = await latestCanvas(context.env.DB, entryId as string);
  if (!row) return error(404, 'not_found', 'This page has not been written on yet.');
  return json({ id: row.id, version: row.version, createdAt: row.created_at, strokes: JSON.parse(row.stroke_data) as unknown });
};

export const onRequestPost: PagesFunction<Env, string, RequestData> = async (context) => {
  const session = requireSession(context);
  if (session instanceof Response) return session;
  const { request, env } = context;

  const body = await readJsonObject(request, MAX_STROKE_BYTES + 4_096);
  if (body instanceof Response) return body;

  const canvas = parseId(body.id);
  if (!canvas) return errors.badRequest('The canvas id is not valid.');
  if (canvas.deviceId !== session.deviceId) {
    return error(400, 'id_wrong_device', `This iPad is signed in as ${session.deviceId}; its ids must start with "${session.deviceId}-".`);
  }
  if (!parseId(body.entryId)) return errors.badRequest('The entry id is not valid.');
  if (!isStrokeDocument(body.strokes)) {
    return errors.badRequest('The page needs its strokes in the guest book stroke format.');
  }
  const strokeData = JSON.stringify(body.strokes);
  if (strokeData.length > MAX_STROKE_BYTES) return error(413, 'payload_too_large', 'That page has too many strokes to save.');
  const createdAt = idTime(canvas.ulid);
  if (createdAt === null) return errors.badRequest("The canvas id's time is not plausible. Check the iPad's date and time.");

  const id = body.id as string;
  const entryId = body.entryId as string;

  const existing = await findCanvas(env.DB, id);
  if (existing) {
    return existing.entry_id === entryId
      ? json({ id, version: existing.version, saved: true }, 200)
      : error(409, 'conflict', 'That canvas id is already saved on a different entry.');
  }
  if (!(await entryExists(env.DB, entryId))) {
    return error(404, 'entry_not_found', 'That entry does not exist yet. Save the entry first, then its page.');
  }
  const r2Key = canvasKey(entryId, id);
  if (!(await env.MEDIA.head(r2Key))) {
    return error(409, 'upload_incomplete', "The page image hasn't arrived. Upload it, then save again.");
  }

  const created = await insertCanvas(env.DB, { id, entryId, r2Key, strokeData, createdAt });
  const saved = await findCanvas(env.DB, id);
  if (!saved) return error(500, 'server_error', 'The page was not saved. Try again.');
  return json({ id, version: saved.version, saved: true }, created ? 201 : 200);
};
