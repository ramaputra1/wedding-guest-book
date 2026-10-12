/**
 * GET  /api/entries — public: every entry with its media and latest canvas.
 * POST /api/entries — session: create an entry from an id made on the iPad.
 */
import type { ApiEntries, ApiEntry } from '../../src/lib/types';
import { findEntry, insertEntry, listEntries } from '../../lib-server/db';
import type { Env, RequestData } from '../../lib-server/env';
import { requireSession } from '../../lib-server/guard';
import { error, errors, json, readJsonObject } from '../../lib-server/http';
import { idTime, parseId } from '../../lib-server/ids';

// Guests reading the album share one cached copy for this long. Each read
// scans every row, and D1's free plan allows 5 million row reads a day.
// (The edge cache only operates on a custom domain; on *.pages.dev it is skipped.)
const PUBLIC_CACHE_SECONDS = 30;
const MAX_TITLE = 200;
const MAX_NOTE = 2_000;

export const onRequestGet: PagesFunction<Env, string, RequestData> = async ({ request, env, data, waitUntil }) => {
  // A signed-in iPad must see its own writes at once, so it never reads the cache.
  const cacheable = !data.session;
  const cacheKey = new Request(new URL(request.url).toString(), { method: 'GET' });
  if (cacheable) {
    const cached = await caches.default.match(cacheKey);
    if (cached) return cached;
  }

  const response = json<ApiEntries>({ entries: await listEntries(env.DB) }, 200, {
    // s-maxage: only Cloudflare's edge keeps the shared copy. A browser cache
    // is keyed by URL, not cookie, so letting browsers keep it would show an
    // iPad its own stale album right after it signs in or saves.
    'Cache-Control': cacheable ? `public, max-age=0, s-maxage=${PUBLIC_CACHE_SECONDS}` : 'private, no-store',
  });
  if (cacheable) waitUntil(caches.default.put(cacheKey, response.clone()));
  return response;
};

function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length > max) return undefined;
  return value.trim() === '' ? null : value;
}

export const onRequestPost: PagesFunction<Env, string, RequestData> = async (context) => {
  const session = requireSession(context);
  if (session instanceof Response) return session;
  const { request, env } = context;

  const body = await readJsonObject(request, 16_384);
  if (body instanceof Response) return body;

  const parsed = parseId(body.id);
  if (!parsed) return errors.badRequest('The entry needs an id like "ipad1-01JA2BX7F3K9XYZ…".');
  // The label comes from the session, never from the request: an id made on
  // the other iPad, or a device_id field in the body or query, changes nothing.
  if (parsed.deviceId !== session.deviceId) {
    return error(400, 'id_wrong_device', `This iPad is signed in as ${session.deviceId}; its ids must start with "${session.deviceId}-".`);
  }
  const createdAt = idTime(parsed.ulid);
  if (createdAt === null) return errors.badRequest("The entry id's time is not plausible. Check the iPad's date and time.");

  const title = optionalText(body.title, MAX_TITLE);
  const note = optionalText(body.note, MAX_NOTE);
  if (title === undefined) return errors.badRequest(`The title must be text of at most ${MAX_TITLE} characters.`);
  if (note === undefined) return errors.badRequest(`The note must be text of at most ${MAX_NOTE} characters.`);

  const id = body.id as string;
  const created = await insertEntry(env.DB, { id, deviceId: session.deviceId, title, note, createdAt });
  const row = await findEntry(env.DB, id);
  if (!row) return error(500, 'server_error', 'The entry was not saved. Try again.');

  const entry: ApiEntry = {
    id: row.id,
    deviceId: row.device_id,
    title: row.title,
    note: row.note,
    createdAt: row.created_at,
    media: [],
    canvas: null,
  };
  // 201 the first time; 200 when a retry finds it already saved.
  return json(entry, created ? 201 : 200);
};
