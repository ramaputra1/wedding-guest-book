/**
 * POST /api/auth/login — PIN (or passphrase) in, signed HttpOnly session
 * cookie out. The device id in the body is only the label the session will
 * carry; the PIN is what grants writing, and it is checked in constant time.
 *
 * A six-digit PIN can be guessed by a script unless guesses are limited, so
 * they are: after LOGIN_MAX_FAILURES wrong tries within LOGIN_LOCK_SECONDS,
 * every new sign-in is refused until the oldest of them ages out — checked
 * before any hashing, so a flood of guesses costs little. The lock is global,
 * not per address: an attacker with many addresses gets no more guesses.
 * Signed-in iPads are not affected; their sessions do not pass through here.
 */
import { isDeviceId } from '../../../src/lib/devices';
import type { ApiSession } from '../../../src/lib/types';
import { isMissingLoginTable, recentLoginFailures, recordLoginFailure } from '../../../lib-server/db';
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
    return errors.badRequest('Enter the PIN.');
  }
  if (!env.WRITER_PASSPHRASE_HASH || !env.SESSION_SIGNING_KEY) return errors.notConfigured();

  const { loginMaxFailures, loginLockSeconds, sessionTtlDays } = limits(env);
  const now = Date.now();
  let recent;
  try {
    recent = await recentLoginFailures(env.DB, now - loginLockSeconds * 1_000);
  } catch (failure) {
    // Without the guess limit a short PIN is not safe, so sign-in waits for it.
    if (isMissingLoginTable(failure)) {
      return error(503, 'migration_missing', "Sign-in isn't fully set up on this database yet. The owner needs to apply migration 0004_login_failures.");
    }
    throw failure;
  }
  if (recent.count >= loginMaxFailures) {
    // Free again once the oldest wrong try leaves the window.
    const waitSeconds = Math.max(1, Math.ceil(((recent.oldest ?? now) + loginLockSeconds * 1_000 - now) / 1_000));
    const minutes = Math.ceil(waitSeconds / 60);
    return error(429, 'too_many_attempts', `Too many wrong tries. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`, {
      'Retry-After': String(waitSeconds),
    });
  }

  if (!(await verifyPassphrase(passphrase, env.WRITER_PASSPHRASE_HASH))) {
    await recordLoginFailure(env.DB, now);
    return error(401, 'wrong_passphrase', "That didn't match. Check it and try again.");
  }

  const ttlSeconds = sessionTtlDays * 86_400;
  const issuedAt = Date.now();
  const session = { deviceId, issuedAt, expiresAt: issuedAt + ttlSeconds * 1_000 };
  const token = await signSession(session, env.SESSION_SIGNING_KEY);

  return json<ApiSession>({ deviceId, expiresAt: session.expiresAt }, 200, {
    'Set-Cookie': sessionCookie(token, ttlSeconds),
  });
};
