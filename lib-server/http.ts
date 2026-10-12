/**
 * Every Function answers in typed JSON with a correct status code. Errors carry
 * a machine-readable `code` and a human-readable `message` that says what
 * happened and what to do (DESIGN.md, Words).
 */
import type { ApiError, ApiErrorCode } from '../src/lib/types';

export function json<T>(body: T, status = 200, headers: HeadersInit = {}): Response {
  const response = new Response(JSON.stringify(body), { status, headers });
  response.headers.set('Content-Type', 'application/json; charset=utf-8');
  if (!response.headers.has('Cache-Control')) response.headers.set('Cache-Control', 'no-store');
  return response;
}

export function error(status: number, code: ApiErrorCode, message: string): Response {
  return json<ApiError>({ code, message }, status);
}

export const errors = {
  unauthorized: () => error(401, 'unauthorized', 'Sign in on this iPad to do that.'),
  badRequest: (message: string) => error(400, 'bad_request', message),
  notConfigured: () =>
    error(500, 'server_not_configured', 'The guest book is missing a server setting. The owner needs to finish the Cloudflare setup.'),
};

/** Reads a JSON object body, refusing anything else or anything larger than maxBytes. */
export async function readJsonObject(request: Request, maxBytes: number): Promise<Record<string, unknown> | Response> {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    return error(415, 'unsupported_media_type', 'Send this as JSON.');
  }
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return error(413, 'payload_too_large', 'That request is too large.');
  }
  const text = await request.text();
  if (text.length > maxBytes) return error(413, 'payload_too_large', 'That request is too large.');
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    // fall through
  }
  return errors.badRequest('The request body is not valid JSON.');
}
