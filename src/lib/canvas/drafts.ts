/**
 * The page in progress, kept on the iPad between strokes, so a reload, a
 * crash or a dead battery never costs a guest what they were writing — and
 * so a version saved while offline is what the next edit builds on.
 *
 * A convenience, not a store of record (that is D1 + R2, then the archive):
 * kept in localStorage, removed once the server has the version.
 */
import type { Stroke } from './strokes';

export interface Draft {
  strokes: Stroke[];
  /**
   * Strokes written since the last Save. False means the strokes were saved
   * on this iPad and are queued or already uploaded; the draft is then removed
   * once the server confirms.
   */
  unsaved: boolean;
  /** Epoch ms of the last change. */
  updatedAt: number;
}

const key = (pageId: string) => `guestbook-page:${pageId}`;

export function readDraft(pageId: string): Draft | null {
  try {
    const raw = localStorage.getItem(key(pageId));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

export function writeDraft(pageId: string, draft: Draft): void {
  try {
    localStorage.setItem(key(pageId), JSON.stringify(draft));
  } catch {
    // Full or blocked: the page still works, only without the safety net.
  }
}

export function removeDraft(pageId: string): void {
  try {
    localStorage.removeItem(key(pageId));
  } catch {
    // Nothing to do.
  }
}

/** A new spread's draft takes its entry's id once the entry exists. */
export function moveDraft(from: string, to: string): void {
  const draft = readDraft(from);
  if (!draft) return;
  writeDraft(to, draft);
  removeDraft(from);
}
