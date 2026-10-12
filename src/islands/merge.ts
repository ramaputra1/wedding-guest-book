/**
 * The album as the writer sees it: what the server has saved, plus every
 * capture still on its way. A fresh capture appears at once, marked
 * "Saving…", in the spread it was taken for — or as a new spread.
 */
import type { QueueItem } from '../lib/queue/store';
import type { AlbumEntry, AlbumMedia, DeviceId } from '../lib/types';

export interface PendingLabels {
  photoAlt: string;
  videoAlt: string;
  pageAlt: string;
}

export function pendingMedia(item: QueueItem, thumbUrl: string, labels: PendingLabels): AlbumMedia {
  return {
    id: item.mediaId,
    kind: item.kind === 'video' ? 'video' : 'photo',
    src: thumbUrl,
    width: item.width,
    height: item.height,
    alt: item.kind === 'video' ? labels.videoAlt : labels.photoAlt,
    durationMs: item.durationMs,
    pending: { state: item.state, code: item.error?.code, message: item.error?.message, permanent: item.error?.permanent },
  };
}

export function mergeAlbum(
  saved: AlbumEntry[],
  queue: QueueItem[],
  thumbUrls: ReadonlyMap<string, string>,
  device: DeviceId,
  labels: PendingLabels,
): AlbumEntry[] {
  const entries = saved.map((entry) => ({ ...entry, media: [...entry.media] }));
  const byId = new Map(entries.map((entry) => [entry.id, entry]));

  for (const item of queue) {
    const url = thumbUrls.get(item.mediaId);
    if (!url) continue;
    let entry = byId.get(item.entryId);
    if (!entry) {
      // A new spread that the server does not know about yet.
      entry = { id: item.entryId, deviceId: device, createdAt: item.createdAt, media: [], page: null };
      byId.set(entry.id, entry);
      entries.push(entry);
    }
    if (item.kind === 'canvas') {
      // A page version still on its way: newer than anything the server has.
      // The queue is oldest first, so the newest pending version is shown last.
      entry.page = {
        src: url,
        alt: labels.pageAlt,
        pending: { state: item.state, code: item.error?.code, message: item.error?.message, permanent: item.error?.permanent, versionId: item.mediaId },
      };
      continue;
    }
    // Already saved: the server's copy wins, the queue simply has not caught up.
    if (entry.media.some((media) => media.id === item.mediaId)) continue;
    entry.media.push(pendingMedia(item, url, labels));
  }
  return entries;
}
