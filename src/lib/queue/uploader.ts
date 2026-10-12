/**
 * Moves captures from the queue to the server, one at a time, oldest first:
 *   create the entry if new → store each missing file → commit.
 * Only a successful commit removes an item from the queue. Failures retry with
 * exponential backoff; after a few attempts the item shows "Not saved" but is
 * still retried — when the connection returns, every minute, and on tap.
 */
import { ApiFailure, type MediaCommit, type MediaPart, type PartTarget } from '../api';
import type { QueueError, QueueItem, QueueStore } from './store';

export interface UploadApi {
  createEntry(id: string): Promise<unknown>;
  putMediaPart(target: PartTarget, file: Blob): Promise<unknown>;
  commitMedia(commit: MediaCommit): Promise<unknown>;
}

export interface UploaderOptions {
  store: QueueStore;
  api: UploadApi;
  /** Every change to the queue, for the UI. */
  onChange: (items: QueueItem[]) => void;
  /** An item is saved on the server and gone from the queue. */
  onSaved: (item: QueueItem) => void;
  /** The session expired: uploads wait until the iPad signs in again. */
  onUnauthorized: () => void;
  now?: () => number;
  /** Shown as "Not saved" after this many failed attempts. */
  attemptsBeforeFailed?: number;
}

const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS = 60_000;
/** Items already showing "Not saved" are still tried this often. */
const FAILED_RETRY_MS = 60_000;

export function backoffMs(attempt: number): number {
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1));
}

export function requiredParts(item: Pick<QueueItem, 'kind'>): MediaPart[] {
  return item.kind === 'video' ? ['original', 'thumb', 'poster'] : ['original', 'thumb'];
}

type Outcome =
  | { kind: 'retry'; error: QueueError }
  | { kind: 'permanent'; error: QueueError }
  | { kind: 'unauthorized'; error: QueueError };

/** Decides whether a failure is worth retrying. */
export function classify(failure: unknown): Outcome {
  if (!(failure instanceof ApiFailure)) {
    return { kind: 'retry', error: { code: 'network', message: String(failure), permanent: false } };
  }
  const error = { code: failure.code, message: failure.message, permanent: false };
  if (failure.status === 401) return { kind: 'unauthorized', error };
  // No connection, server trouble, or files not all there yet: try again.
  if (failure.code === 'network' || failure.status >= 500 || failure.status === 408 || failure.status === 429) {
    return { kind: 'retry', error };
  }
  if (failure.code === 'upload_incomplete' || failure.code === 'entry_not_found') return { kind: 'retry', error };
  // Anything else is the request itself being refused — too long, wrong type.
  return { kind: 'permanent', error: { ...error, permanent: true } };
}

export class Uploader {
  private items = new Map<string, QueueItem>();
  private running = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private paused = false;
  private readonly now: () => number;
  private readonly attemptsBeforeFailed: number;

  constructor(private readonly options: UploaderOptions) {
    this.now = options.now ?? Date.now;
    this.attemptsBeforeFailed = options.attemptsBeforeFailed ?? 4;
  }

  /** Loads whatever survived a reload or a crash, and resumes. */
  async start(): Promise<void> {
    for (const item of await this.options.store.all()) this.items.set(item.mediaId, item);
    this.emit();
    if (typeof window !== 'undefined') window.addEventListener('online', () => this.retryAll());
    this.kick();
  }

  /** Writes the capture to the queue first; only then tries the network. */
  async enqueue(item: QueueItem): Promise<void> {
    await this.options.store.put(item);
    this.items.set(item.mediaId, item);
    this.emit();
    this.kick();
  }

  /** "Tap to try again", or the connection came back. */
  retry(mediaId: string): void {
    const item = this.items.get(mediaId);
    if (!item) return;
    void this.save({ ...item, state: 'saving', nextAttemptAt: 0, error: undefined });
  }

  retryAll(): void {
    for (const item of this.items.values()) {
      if (!item.error?.permanent) this.retry(item.mediaId);
    }
  }

  /** Signed out: hold everything, lose nothing. */
  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    this.retryAll();
  }

  /** Removes an item that can never be saved, after the person confirmed it. */
  async discard(mediaId: string): Promise<void> {
    await this.options.store.remove(mediaId);
    this.items.delete(mediaId);
    this.emit();
  }

  snapshot(): QueueItem[] {
    return [...this.items.values()].sort((a, b) => a.createdAt - b.createdAt);
  }

  private emit() {
    this.options.onChange(this.snapshot());
  }

  private async save(item: QueueItem) {
    this.items.set(item.mediaId, item);
    await this.options.store.put(item);
    this.emit();
    this.kick();
  }

  /** Runs the loop now if idle, else schedules the next due retry. */
  private kick() {
    if (this.running || this.paused) return;
    clearTimeout(this.timer);
    const due = this.snapshot().filter((item) => !item.error?.permanent);
    if (due.length === 0) return;
    const next = Math.min(...due.map((item) => item.nextAttemptAt));
    const wait = Math.max(0, next - this.now());
    this.timer = setTimeout(() => void this.run(), wait);
  }

  private async run() {
    if (this.running || this.paused) return;
    this.running = true;
    try {
      while (!this.paused) {
        const now = this.now();
        const item = this.snapshot().find((candidate) => !candidate.error?.permanent && candidate.nextAttemptAt <= now);
        if (!item) break;
        await this.upload(item);
      }
    } finally {
      this.running = false;
      this.kick();
    }
  }

  private async upload(item: QueueItem) {
    const { api } = this.options;
    let current = { ...item, stored: [...item.stored] };
    try {
      if (current.createEntry) await api.createEntry(current.entryId);
      for (const part of requiredParts(current)) {
        if (current.stored.includes(part)) continue;
        const file = part === 'original' ? current.original : part === 'thumb' ? current.thumb : current.poster;
        if (!file) throw new ApiFailure(400, 'bad_request', `The ${part} file is missing from this capture.`);
        try {
          await api.putMediaPart(
            { mediaId: current.mediaId, entryId: current.entryId, kind: current.kind, part, container: current.container },
            file,
          );
        } catch (failure) {
          // Already committed by an earlier attempt whose reply was lost: fine.
          if (!(failure instanceof ApiFailure && failure.code === 'already_saved')) throw failure;
        }
        current = { ...current, stored: [...current.stored, part] };
        this.items.set(current.mediaId, current);
        await this.options.store.put(current);
      }
      await api.commitMedia({
        id: current.mediaId,
        entryId: current.entryId,
        kind: current.kind,
        width: current.width,
        height: current.height,
        durationMs: current.durationMs,
        container: current.container,
      });
      // Confirmed on the server: only now does the local copy go.
      await this.options.store.remove(current.mediaId);
      this.items.delete(current.mediaId);
      this.emit();
      this.options.onSaved(current);
    } catch (failure) {
      await this.fail(current, classify(failure));
    }
  }

  private async fail(item: QueueItem, outcome: Outcome) {
    const attempts = item.attempts + 1;
    let next: QueueItem;
    if (outcome.kind === 'unauthorized') {
      next = { ...item, attempts, state: 'failed', error: outcome.error, nextAttemptAt: this.now() + FAILED_RETRY_MS };
      this.paused = true;
      this.options.onUnauthorized();
    } else if (outcome.kind === 'permanent') {
      next = { ...item, attempts, state: 'failed', error: outcome.error, nextAttemptAt: Number.MAX_SAFE_INTEGER };
    } else {
      // A missing entry or missing files: rebuild from the start next time.
      const reset =
        outcome.error.code === 'entry_not_found' ? { createEntry: true } : outcome.error.code === 'upload_incomplete' ? { stored: [] } : {};
      const failed = attempts >= this.attemptsBeforeFailed;
      next = {
        ...item,
        ...reset,
        attempts,
        state: failed ? 'failed' : 'saving',
        error: outcome.error,
        nextAttemptAt: this.now() + (failed ? FAILED_RETRY_MS : backoffMs(attempts)),
      };
    }
    this.items.set(next.mediaId, next);
    await this.options.store.put(next);
    this.emit();
  }
}
