/**
 * GET /api/files/{r2 key} — public. Serves a stored photo, video, poster,
 * thumbnail or page image. Only keys in the shapes the API writes are served;
 * anything else in the bucket is unreachable from here.
 *
 * Byte ranges are supported because Safari will not play a video without them.
 */
import type { Env, RequestData } from '../../../lib-server/env';
import { SERVABLE_KEY } from '../../../lib-server/files';
import { error } from '../../../lib-server/http';

function parseRange(header: string | null, size: number): { offset: number; length: number } | null | 'invalid' {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === '' && match[2] === '')) return 'invalid';
  if (match[1] === '') {
    const suffix = Math.min(Number(match[2]), size);
    return suffix === 0 ? 'invalid' : { offset: size - suffix, length: suffix };
  }
  const start = Number(match[1]);
  const end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  return start > end || start >= size ? 'invalid' : { offset: start, length: end - start + 1 };
}

async function serve(context: EventContext<Env, 'key', RequestData>, withBody: boolean): Promise<Response> {
  const { env, params, request } = context;
  const key = Array.isArray(params.key) ? params.key.join('/') : String(params.key);
  if (!SERVABLE_KEY.test(key)) return error(404, 'not_found', 'There is no file here.');

  const head = await env.MEDIA.head(key);
  if (!head) return error(404, 'not_found', 'There is no file here.');

  const headers = new Headers({
    'Content-Type': head.httpMetadata?.contentType ?? 'application/octet-stream',
    // Keys are never reused once committed, so a stored file never changes.
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Accept-Ranges': 'bytes',
    ETag: head.httpEtag,
    'X-Content-Type-Options': 'nosniff',
  });

  const range = parseRange(request.headers.get('Range'), head.size);
  if (range === 'invalid') {
    headers.set('Content-Range', `bytes */${head.size}`);
    return new Response(null, { status: 416, headers });
  }
  if (!withBody) {
    headers.set('Content-Length', String(head.size));
    return new Response(null, { status: 200, headers });
  }

  const object = await env.MEDIA.get(key, range ? { range } : undefined);
  if (!object) return error(404, 'not_found', 'There is no file here.');
  if (range) {
    headers.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${head.size}`);
    headers.set('Content-Length', String(range.length));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set('Content-Length', String(head.size));
  return new Response(object.body, { status: 200, headers });
}

export const onRequestGet: PagesFunction<Env, 'key', RequestData> = (context) => serve(context, true);
export const onRequestHead: PagesFunction<Env, 'key', RequestData> = (context) => serve(context, false);
