/**
 * GET /api/auth/session — tells the writer page whether this browser is
 * signed in, and as which device. Needed because the cookie is HttpOnly:
 * page JavaScript cannot read it, by design. Session required.
 */
import type { ApiSession } from '../../../src/lib/types';
import type { Env, RequestData } from '../../../lib-server/env';
import { requireSession } from '../../../lib-server/guard';
import { json } from '../../../lib-server/http';

export const onRequestGet: PagesFunction<Env, string, RequestData> = async (context) => {
  const session = requireSession(context);
  if (session instanceof Response) return session;
  return json<ApiSession>({ deviceId: session.deviceId, expiresAt: session.expiresAt });
};
