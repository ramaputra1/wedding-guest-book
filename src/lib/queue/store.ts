/**
 * The capture queue in IndexedDB: a transit buffer, never a store of record
 * (WebKit may clear it after seven days without use, and iOS caps it near
 * 1 GB). A capture is written here before anything else, and removed only
 * once the server has confirmed it saved.
 */
import { openDB, type IDBPDatabase } from 'idb';
import type { MediaPart } from '../api';
import type { MediaKind, SaveState, VideoContainer } from '../types';

export interface QueueError {
  code: string;
  message: string;
  /** No retry can fix it (e.g. a video over the length limit). */
  permanent: boolean;
}

export interface QueueItem {
  mediaId: string;
  entryId: string;
  /** The capture started a new spread: create the entry before the media. */
  createEntry: boolean;
  kind: MediaKind;
  container?: VideoContainer;
  width: number;
  height: number;
  durationMs?: number;
  original: Blob;
  thumb: Blob;
  poster?: Blob;
  /** Epoch ms. */
  createdAt: number;
  /** Parts already stored, so a retry re-sends only what is missing. */
  stored: MediaPart[];
  attempts: number;
  /** Epoch ms before which no automatic retry happens. */
  nextAttemptAt: number;
  state: SaveState;
  error?: QueueError;
}

export interface QueueStore {
  put(item: QueueItem): Promise<void>;
  all(): Promise<QueueItem[]>;
  remove(mediaId: string): Promise<void>;
}

const DB_NAME = 'guestbook-queue';
const STORE = 'captures';

let database: Promise<IDBPDatabase> | undefined;

function db(): Promise<IDBPDatabase> {
  database ??= openDB(DB_NAME, 1, {
    upgrade(upgrade) {
      upgrade.createObjectStore(STORE, { keyPath: 'mediaId' });
    },
  });
  return database;
}

export const indexedDbQueue: QueueStore = {
  async put(item) {
    await (await db()).put(STORE, item);
  },
  async all() {
    const items = (await (await db()).getAll(STORE)) as QueueItem[];
    return items.sort((a, b) => a.createdAt - b.createdAt || a.mediaId.localeCompare(b.mediaId));
  },
  async remove(mediaId) {
    await (await db()).delete(STORE, mediaId);
  },
};

/** Asks the browser not to evict the queue under storage pressure. Best effort. */
export async function requestPersistentStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // Not supported or refused; the queue still works, only less protected.
  }
}
