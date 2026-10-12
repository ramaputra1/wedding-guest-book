/**
 * The second lock on every write. The middleware already refused any request
 * without a valid session; handlers check again before touching D1 or R2, so
 * a routing mistake can never turn into an unauthenticated write.
 */
import type { Env, RequestData } from './env';
import { errors } from './http';
import type { Session } from './session';

export function requireSession(context: EventContext<Env, string, RequestData>): Session | Response {
  return context.data.session ?? errors.unauthorized();
}
