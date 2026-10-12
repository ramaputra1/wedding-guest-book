/**
 * GET /api/stats — session required. Counts and storage used, for the
 * writer's storage gauge (Phase 4).
 */
import type { ApiStats } from '../../src/lib/types';
import { counts } from '../../lib-server/db';
import type { Env, RequestData } from '../../lib-server/env';
import { requireSession } from '../../lib-server/guard';
import { json } from '../../lib-server/http';

// R2's free storage allowance (docs/DECISIONS.md, D2).
const R2_FREE_BYTES = 10_000_000_000;

/** Canvas PNG sizes are not in D1, so they are summed from the bucket listing. */
async function canvasBytes(bucket: R2Bucket): Promise<number> {
  let total = 0;
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: 'canvases/', cursor });
    for (const object of page.objects) total += object.size;
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return total;
}

export const onRequestGet: PagesFunction<Env, string, RequestData> = async (context) => {
  const session = requireSession(context);
  if (session instanceof Response) return session;
  const { env } = context;

  const [rows, pngBytes] = await Promise.all([counts(env.DB), canvasBytes(env.MEDIA)]);
  return json<ApiStats>({
    entries: rows.entries,
    media: rows.media,
    canvasVersions: rows.canvases,
    bytesUsed: rows.mediaBytes + pngBytes,
    bytesAllowance: R2_FREE_BYTES,
  });
};
