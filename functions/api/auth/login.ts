/**
 * POST /api/auth/login — passphrase in, signed HttpOnly session cookie out.
 * The device id in the body is only the label the session will carry; the
 * passphrase is what grants writing, and it is checked in constant time.
 */
import { isDeviceId } from '../../../src/lib/devices';
import type { ApiSession } from '../../../src/lib/types';
import { limits, type Env, type RequestData } from '../../../lib-server/env';
import { error, errors, json, readJsonObject } from '../../../lib-server/http';
import { verifyPassphrase } from '../../../lib-server/passphrase';
import { sessionCookie, signSession } from '../../../lib-server/session';

export const onRequestPost: PagesFunction<Env, string, RequestData> = async ({ request, env }) => {
  const body = await readJsonObject(request, 4_096);
  if (body instanceof Response) return body;

  const { deviceId, passphrase } = body;
  if (!isDeviceId(deviceId)) return errors.badRequest('Sign in from /ipad1 or /ipad2.');
  if (typeof passphrase !== 'string' || passphrase.length === 0 || passphrase.length > 1_024) {
    return errors.badRequest('Enter the passphrase.');
  }
  if (!env.WRITER_PASSPHRASE_HASH || !env.SESSION_SIGNING_KEY) return errors.notConfigured();

  if (!(await verifyPassphrase(passphrase, env.WRITER_PASSPHRASE_HASH))) {
    return error(401, 'wrong_passphrase', "That passphrase didn't match. Check it and try again.");
  }

  const ttlSeconds = limits(env).sessionTtlDays * 86_400;
  const issuedAt = Date.now();
  const session = { deviceId, issuedAt, expiresAt: issuedAt + ttlSeconds * 1_000 };
  const token = await signSession(session, env.SESSION_SIGNING_KEY);

  return json<ApiSession>({ deviceId, expiresAt: session.expiresAt }, 200, {
    'Set-Cookie': sessionCookie(token, ttlSeconds),
  });
};
