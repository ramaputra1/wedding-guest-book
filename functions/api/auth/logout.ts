/** POST /api/auth/logout — clears this browser's session cookie. Session required. */
import type { Env, RequestData } from '../../../lib-server/env';
import { requireSession } from '../../../lib-server/guard';
import { json } from '../../../lib-server/http';
import { clearedSessionCookie } from '../../../lib-server/session';

export const onRequestPost: PagesFunction<Env, string, RequestData> = async (context) => {
  const session = requireSession(context);
  if (session instanceof Response) return session;
  return json({ signedOut: true }, 200, { 'Set-Cookie': clearedSessionCookie() });
};
