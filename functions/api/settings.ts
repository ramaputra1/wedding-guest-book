/**
 * GET  /api/settings — public: the album's look (colour, frame, paper,
 *      watermark, theme), which the public album is drawn with too.
 * POST /api/settings — session: save a new look from Settings on an iPad.
 *
 * A save is a new row, never an update: the newest is the look in use and
 * every earlier one stays (migrations/0003_album_settings.sql).
 */
import { DEFAULT_LOOK, parseLook } from '../../src/lib/settings';
import type { ApiSettings } from '../../src/lib/types';
import { insertSettings, isMissingSettingsTable, latestSettings } from '../../lib-server/db';
import type { Env, RequestData } from '../../lib-server/env';
import { requireSession } from '../../lib-server/guard';
import { error, errors, json, readJsonObject } from '../../lib-server/http';
import { parseId } from '../../lib-server/ids';

// As for the album itself (entries.ts): visitors share one cached copy this long.
const PUBLIC_CACHE_SECONDS = 30;

export const onRequestGet: PagesFunction<Env, string, RequestData> = async ({ request, env, data, waitUntil }) => {
  // A signed-in iPad must see a look it just saved, so it never reads the cache.
  const cacheable = !data.session;
  const cacheKey = new Request(new URL(request.url).toString(), { method: 'GET' });
  if (cacheable) {
    const cached = await caches.default.match(cacheKey);
    if (cached) return cached;
  }

  const row = await latestSettings(env.DB);
  // A row that no longer reads as a look (it cannot happen through the API)
  // falls back to the designed album rather than breaking it.
  const look = (row && parseLook(JSON.parse(row.data))) || DEFAULT_LOOK;
  const response = json<ApiSettings>({ look, savedAt: row ? row.created_at : null }, 200, {
    'Cache-Control': cacheable ? `public, max-age=0, s-maxage=${PUBLIC_CACHE_SECONDS}` : 'private, no-store',
  });
  if (cacheable) waitUntil(caches.default.put(cacheKey, response.clone()));
  return response;
};

export const onRequestPost: PagesFunction<Env, string, RequestData> = async (context) => {
  const session = requireSession(context);
  if (session instanceof Response) return session;
  const { request, env } = context;

  const body = await readJsonObject(request, 4_096);
  if (body instanceof Response) return body;

  const parsed = parseId(body.id);
  if (!parsed) return errors.badRequest('The settings need an id like "ipad1-01JA2BX7F3K9XYZ…".');
  if (parsed.deviceId !== session.deviceId) {
    return error(400, 'id_wrong_device', `This iPad is signed in as ${session.deviceId}; its ids must start with "${session.deviceId}-".`);
  }
  const look = parseLook(body.look);
  if (!look) return errors.badRequest('Those settings are not ones the album offers, or the watermark is longer than 24 characters.');

  const savedAt = Date.now();
  try {
    await insertSettings(env.DB, { id: body.id as string, deviceId: session.deviceId, data: JSON.stringify(look), createdAt: savedAt });
  } catch (failure) {
    if (isMissingSettingsTable(failure)) {
      return error(503, 'migration_missing', "Settings aren't set up on this database yet. The owner needs to apply migration 0003_album_settings.");
    }
    throw failure;
  }
  return json<ApiSettings>({ look, savedAt }, 201);
};
