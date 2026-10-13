/**
 * The gate in front of every /api route. Deny by default: a request needs a
 * valid signed session unless it is on the short public list below. Handlers
 * check again before writing (lib-server/guard.ts), so this is never the only
 * lock — but it is the first.
 *
 * Lives in functions/api/ rather than functions/ so that static pages and
 * images never invoke a Function (each invocation counts against the free
 * plan's 100,000 a day).
 */
import { isWellFormedHash } from '../../lib-server/passphrase';
import type { Env, RequestData } from '../../lib-server/env';
import { error, errors } from '../../lib-server/http';
import { MIN_SIGNING_KEY_LENGTH, SESSION_COOKIE, readCookie, verifySession } from '../../lib-server/session';

/** The only routes anyone may use without signing in. Everything else needs a session. */
const PUBLIC_ROUTES: ReadonlyArray<{ method: string; path: RegExp }> = [
  { method: 'GET', path: /^\/api\/entries$/ },
  // The album's look: the public album is drawn with it too.
  { method: 'GET', path: /^\/api\/settings$/ },
  { method: 'GET', path: /^\/api\/files\/.+$/ },
  { method: 'POST', path: /^\/api\/auth\/login$/ },
];

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const onRequest: PagesFunction<Env, string, RequestData> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  // A write from another site's page is refused outright. SameSite=Lax already
  // keeps the cookie off such requests; this is the second fence.
  if (!SAFE_METHODS.has(request.method)) {
    const origin = request.headers.get('Origin');
    if (origin !== null && origin !== url.origin) {
      return error(403, 'cross_origin', 'Requests from other sites are not accepted.');
    }
  }

  const method = request.method === 'HEAD' ? 'GET' : request.method;
  const isPublic = PUBLIC_ROUTES.some((route) => route.method === method && route.path.test(url.pathname));

  // Without its secrets the server cannot sign anyone in — but the public
  // album must still be readable, so only public reads pass.
  const signingKey = env.SESSION_SIGNING_KEY;
  if (!signingKey || signingKey.length < MIN_SIGNING_KEY_LENGTH || !isWellFormedHash(env.WRITER_PASSPHRASE_HASH)) {
    return isPublic && method === 'GET' ? context.next() : errors.notConfigured();
  }

  const token = readCookie(request.headers.get('Cookie'), SESSION_COOKIE);
  const session = token ? await verifySession(token, signingKey) : null;
  if (session) context.data.session = session;

  if (!isPublic && !session) return errors.unauthorized();

  return context.next();
};
