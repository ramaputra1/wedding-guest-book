/**
 * The upload queue's rules, run in-process with a fake network and an
 * in-memory store standing in for IndexedDB. The real browser path is
 * covered by tests/e2e/upload-failure.spec.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFailure, type MediaCommit, type PartTarget } from '../src/lib/api';
import type { QueueItem, QueueStore } from '../src/lib/queue/store';
import { backoffMs, classify, Uploader, type UploadApi } from '../src/lib/queue/uploader';

class MemoryStore implements QueueStore {
  rows = new Map<string, QueueItem>();
  async put(item: QueueItem) {
    this.rows.set(item.mediaId, structuredClone(item));
  }
  async all() {
    return [...this.rows.values()];
  }
  async remove(id: string) {
    this.rows.delete(id);
  }
}

type Call = { op: 'entry' | 'put' | 'commit' | 'png' | 'page'; detail: string };

function fakeApi(failures: Partial<Record<string, () => never>> = {}) {
  const calls: Call[] = [];
  const api: UploadApi = {
    async createEntry(id: string) {
      calls.push({ op: 'entry', detail: id });
      failures.entry?.();
    },
    async putMediaPart(target: PartTarget) {
      calls.push({ op: 'put', detail: target.part });
      failures[`put:${target.part}`]?.();
    },
    async commitMedia(commit: MediaCommit) {
      calls.push({ op: 'commit', detail: commit.id });
      failures.commit?.();
    },
    async putCanvasPng(canvasId: string) {
      calls.push({ op: 'png', detail: canvasId });
      failures.png?.();
    },
    async commitCanvas(id: string, _entryId: string, strokes: string) {
      calls.push({ op: 'page', detail: `${id} ${strokes}` });
      failures.page?.();
    },
  };
  return { api, calls };
}

const network = () => {
  throw new ApiFailure(0, 'network', 'offline');
};

function item(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    mediaId: 'ipad1-01KCZ5X0Q8V2M7H4R9T3B6N1JD',
    entryId: 'ipad1-01KCZ5X0Q8V2M7H4R9T3B6N1JE',
    createEntry: true,
    kind: 'photo',
    width: 2560,
    height: 1920,
    original: new Blob(['photo']),
    thumb: new Blob(['thumb']),
    createdAt: 1,
    stored: [],
    attempts: 0,
    nextAttemptAt: 0,
    state: 'saving',
    ...overrides,
  };
}

function setup(api: UploadApi, store = new MemoryStore()) {
  const saved: QueueItem[] = [];
  let unauthorized = 0;
  const uploader = new Uploader({
    store,
    api,
    onChange: () => undefined,
    onSaved: (i) => saved.push(i),
    onUnauthorized: () => unauthorized++,
  });
  return { uploader, store, saved, unauthorized: () => unauthorized };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('a capture is saved only when the server confirms it', () => {
  it('creates the entry, stores each file, commits, then releases the local copy', async () => {
    const { api, calls } = fakeApi();
    const { uploader, store, saved } = setup(api);
    await uploader.start();
    await uploader.enqueue(item());
    expect(store.rows.size).toBe(1); // written to the queue before any network
    await vi.runAllTimersAsync();
    expect(calls.map((c) => `${c.op}:${c.detail}`)).toEqual([
      'entry:ipad1-01KCZ5X0Q8V2M7H4R9T3B6N1JE',
      'put:original',
      'put:thumb',
      'commit:ipad1-01KCZ5X0Q8V2M7H4R9T3B6N1JD',
    ]);
    expect(store.rows.size).toBe(0);
    expect(saved).toHaveLength(1);
  });

  it('a video also sends its poster', async () => {
    const { api, calls } = fakeApi();
    const { uploader } = setup(api);
    await uploader.start();
    await uploader.enqueue(item({ kind: 'video', poster: new Blob(['poster']), durationMs: 9_000, container: 'mp4', createEntry: false }));
    await vi.runAllTimersAsync();
    expect(calls.filter((c) => c.op === 'put').map((c) => c.detail)).toEqual(['original', 'thumb', 'poster']);
  });
});

describe('a handwritten page goes through the same queue', () => {
  const page = (overrides: Partial<QueueItem> = {}) =>
    item({ kind: 'canvas', thumb: undefined, original: new Blob(['png']), strokes: '{"format":"guestbook-strokes"}', width: 2000, height: 1500, ...overrides });

  it('stores the PNG, then commits the strokes as a new version, then releases the local copy', async () => {
    const { api, calls } = fakeApi();
    const { uploader, store, saved } = setup(api);
    await uploader.start();
    await uploader.enqueue(page());
    await vi.runAllTimersAsync();
    expect(calls.map((c) => `${c.op}:${c.detail}`)).toEqual([
      'entry:ipad1-01KCZ5X0Q8V2M7H4R9T3B6N1JE',
      'png:ipad1-01KCZ5X0Q8V2M7H4R9T3B6N1JD',
      'page:ipad1-01KCZ5X0Q8V2M7H4R9T3B6N1JD {"format":"guestbook-strokes"}',
    ]);
    expect(store.rows.size).toBe(0);
    expect(saved).toHaveLength(1);
  });

  it('offline: the page stays queued with its PNG remembered, and only the commit is retried', async () => {
    let offline = true;
    const { api, calls } = fakeApi({ page: () => (offline ? network() : (undefined as never)) });
    const { uploader, store, saved } = setup(api);
    await uploader.start();
    await uploader.enqueue(page({ createEntry: false }));
    await vi.advanceTimersByTimeAsync(0);
    expect(saved).toHaveLength(0);
    expect([...store.rows.values()][0].stored).toEqual(['original']);
    offline = false;
    await vi.runAllTimersAsync();
    expect(saved).toHaveLength(1);
    expect(calls.filter((c) => c.op === 'png')).toHaveLength(1);
  });
});

describe('network failure', () => {
  it('keeps the item queued, remembers what arrived, and resends only what is missing', async () => {
    let thumbFails = true;
    const { api, calls } = fakeApi({ 'put:thumb': () => (thumbFails ? network() : (undefined as never)) });
    const { uploader, store, saved } = setup(api);
    await uploader.start();
    await uploader.enqueue(item());
    await vi.advanceTimersByTimeAsync(10);

    const queued = store.rows.get('ipad1-01KCZ5X0Q8V2M7H4R9T3B6N1JD')!;
    expect(queued.state).toBe('saving');
    expect(queued.attempts).toBe(1);
    expect(queued.stored).toEqual(['original']);
    expect(saved).toHaveLength(0);

    thumbFails = false;
    await vi.advanceTimersByTimeAsync(backoffMs(1) + 10);
    expect(saved).toHaveLength(1);
    expect(store.rows.size).toBe(0);
    // The original was not sent twice.
    expect(calls.filter((c) => c.detail === 'original')).toHaveLength(1);
  });

  it('shows "Not saved" after repeated failures, but never drops the item, and keeps trying', async () => {
    let down = true;
    const { api } = fakeApi({ commit: () => (down ? network() : (undefined as never)) });
    const { uploader, store, saved } = setup(api);
    await uploader.start();
    await uploader.enqueue(item());
    await vi.advanceTimersByTimeAsync(backoffMs(1) + backoffMs(2) + backoffMs(3) + 100);
    expect(store.rows.get('ipad1-01KCZ5X0Q8V2M7H4R9T3B6N1JD')?.state).toBe('failed');

    down = false;
    await vi.advanceTimersByTimeAsync(60_000 + 100); // the periodic retry of failed items
    expect(saved).toHaveLength(1);
    expect(store.rows.size).toBe(0);
  });

  it('"Tap to try again" retries at once', async () => {
    let down = true;
    const { api } = fakeApi({ commit: () => (down ? network() : (undefined as never)) });
    const { uploader, saved } = setup(api);
    await uploader.start();
    await uploader.enqueue(item());
    await vi.advanceTimersByTimeAsync(10);
    down = false;
    uploader.retry('ipad1-01KCZ5X0Q8V2M7H4R9T3B6N1JD');
    await vi.advanceTimersByTimeAsync(10);
    expect(saved).toHaveLength(1);
  });
});

describe('the queue survives a restart', () => {
  it('a new uploader on the same store resumes what was left', async () => {
    const store = new MemoryStore();
    await store.put(item({ stored: ['original'], attempts: 2 }));
    const { api, calls } = fakeApi();
    const { uploader, saved } = setup(api, store);
    await uploader.start();
    await vi.runAllTimersAsync();
    expect(saved).toHaveLength(1);
    expect(calls.filter((c) => c.op === 'put').map((c) => c.detail)).toEqual(['thumb']);
  });
});

describe('failures that a retry cannot fix', () => {
  it('a refused file is "Not saved" and stays, without retry storms', async () => {
    const tooLong = () => {
      throw new ApiFailure(413, 'payload_too_large', 'Videos stop at 15 seconds.');
    };
    const { api, calls } = fakeApi({ commit: tooLong });
    const { uploader, store } = setup(api);
    await uploader.start();
    await uploader.enqueue(item());
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    const queued = store.rows.get('ipad1-01KCZ5X0Q8V2M7H4R9T3B6N1JD')!;
    expect(queued.state).toBe('failed');
    expect(queued.error).toMatchObject({ permanent: true, message: 'Videos stop at 15 seconds.' });
    expect(calls.filter((c) => c.op === 'commit')).toHaveLength(1);
  });

  it('an expired session pauses everything and asks to sign in; nothing is lost', async () => {
    const expired = () => {
      throw new ApiFailure(401, 'unauthorized', 'Sign in on this iPad to do that.');
    };
    const { api } = fakeApi({ entry: expired });
    const { uploader, store, unauthorized } = setup(api);
    await uploader.start();
    await uploader.enqueue(item());
    await vi.advanceTimersByTimeAsync(10);
    expect(unauthorized()).toBe(1);
    expect(store.rows.size).toBe(1);
  });

  it('a file that is already saved (an earlier reply was lost) counts as stored', async () => {
    const alreadySaved = () => {
      throw new ApiFailure(409, 'already_saved', 'This item is already saved.');
    };
    const { api } = fakeApi({ 'put:original': alreadySaved });
    const { uploader, saved } = setup(api);
    await uploader.start();
    await uploader.enqueue(item());
    await vi.runAllTimersAsync();
    expect(saved).toHaveLength(1);
  });
});

describe('classify and backoff', () => {
  it('sorts failures into retry, permanent and sign-in', () => {
    expect(classify(new TypeError('fetch failed')).kind).toBe('retry');
    expect(classify(new ApiFailure(0, 'network', 'x')).kind).toBe('retry');
    expect(classify(new ApiFailure(503, 'server_error', 'x')).kind).toBe('retry');
    expect(classify(new ApiFailure(409, 'upload_incomplete', 'x')).kind).toBe('retry');
    expect(classify(new ApiFailure(415, 'unsupported_media_type', 'x')).kind).toBe('permanent');
    expect(classify(new ApiFailure(401, 'unauthorized', 'x')).kind).toBe('unauthorized');
  });

  it('doubles from 2 s and caps at a minute', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(backoffMs)).toEqual([2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000]);
  });
});
