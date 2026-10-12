import { useEffect, useRef, useState } from 'preact/hooks';
import { commitCanvas, commitMedia, createEntry, putCanvasPng, putMediaPart } from '../../lib/api';
import { indexedDbQueue, requestPersistentStorage, type QueueItem } from '../../lib/queue/store';
import { Uploader } from '../../lib/queue/uploader';

interface Options {
  /** Uploads run only while the iPad is signed in. */
  enabled: boolean;
  onSaved: (item: QueueItem) => void;
  onUnauthorized: () => void;
}

/** One uploader per page, fed from IndexedDB; the queue survives reloads. */
export function useUploader({ enabled, onSaved, onUnauthorized }: Options) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const uploader = useRef<Uploader | null>(null);
  // Callbacks change every render; the uploader always calls the latest.
  const callbacks = useRef({ onSaved, onUnauthorized });
  callbacks.current = { onSaved, onUnauthorized };

  useEffect(() => {
    const instance = new Uploader({
      store: indexedDbQueue,
      api: { createEntry, putMediaPart, commitMedia, putCanvasPng, commitCanvas },
      onChange: setItems,
      onSaved: (item) => callbacks.current.onSaved(item),
      onUnauthorized: () => callbacks.current.onUnauthorized(),
    });
    instance.pause();
    uploader.current = instance;
    void requestPersistentStorage();
    void instance.start();
  }, []);

  useEffect(() => {
    if (enabled) uploader.current?.resume();
    else uploader.current?.pause();
  }, [enabled]);

  return {
    items,
    enqueue: (item: QueueItem) => uploader.current?.enqueue(item) ?? Promise.resolve(),
    retry: (mediaId: string) => uploader.current?.retry(mediaId),
    discard: (mediaId: string) => uploader.current?.discard(mediaId) ?? Promise.resolve(),
  };
}
