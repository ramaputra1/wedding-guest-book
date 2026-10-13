import { useEffect, useRef, useState } from 'preact/hooks';
import type { AlbumCopy, PageCopy } from '../../config/site';
import { getLatestStrokes } from '../../lib/api';
import { readDraft, removeDraft, writeDraft, type Draft } from '../../lib/canvas/drafts';
import { attachPageInput } from '../../lib/canvas/pointer';
import { drawStroke, fromDocument, newStroke, PAGE_HEIGHT, PAGE_WIDTH, renderPage, type InkToken, type Stroke, type Tool } from '../../lib/canvas/strokes';
import type { AlbumLook } from '../../lib/settings';
import type { AlbumPage } from '../../lib/types';
import { ConfirmDialog } from './ConfirmDialog';
import { Watermark } from './Watermark';

/** The draft key for the writer's fresh, not-yet-created spread. */
export const NEW_PAGE_KEY = 'new-spread';

interface Props {
  /** The entry this page belongs to; null for the new spread. */
  entryId: string | null;
  /** The server holds at least one saved version to build on. */
  hasSavedVersion: boolean;
  /** "Spread 3", for the canvas's text alternative. */
  spreadName: string;
  /** The page's newest version while it is still on its way to storage. */
  pending?: AlbumPage['pending'];
  onSave: (strokes: Stroke[]) => Promise<void>;
  /** The pen touched the page / lifted: nothing may animate nearby meanwhile. */
  onPenDown: () => void;
  onPenUp: () => void;
  onRetry?: (versionId: string) => void;
  onDiscard?: (versionId: string) => void;
  watermark?: AlbumLook['watermark'];
  /** Cancel: close the page without saving (owner request). */
  onClose: () => void;
  copy: AlbumCopy;
}

type Load = 'loading' | 'ready' | 'unavailable';

const INKS: ReadonlyArray<{ token: InkToken; label: keyof PageCopy; class: string }> = [
  { token: 'ink', label: 'inkBlueBlack', class: 'ink-swatch ink-swatch--ink' },
  { token: 'ink-sepia', label: 'inkSepia', class: 'ink-swatch ink-swatch--sepia' },
  { token: 'ink-oxblood', label: 'inkOxblood', class: 'ink-swatch ink-swatch--oxblood' },
];

const TOOLS: ReadonlyArray<{ tool: Tool; label: keyof PageCopy }> = [
  { tool: 'pen', label: 'pen' },
  { tool: 'pencil', label: 'pencil' },
  { tool: 'eraser', label: 'eraser' },
];

/** The ink's colour, read from the design tokens, so the canvas never invents one. */
function tokenColor(token: InkToken): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim();
}

/** At least 2× the CSS size: anything less and the saved strokes look soft. */
const backingScale = () => Math.max(2, window.devicePixelRatio || 1);

function setPageTransform(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  context.setTransform(canvas.width / PAGE_WIDTH, 0, 0, canvas.height / PAGE_HEIGHT, 0, 0);
}

function clear(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
}

/**
 * The writing page as a canvas, for the writer's destination spread.
 *
 * Two canvases: finished strokes on the lower one, the stroke being written
 * on the upper one, redrawn once per frame — so a long page never slows the
 * pen down. Both are backed at 2× the CSS size. An eraser stroke works on the
 * lower canvas directly, from a snapshot taken when it began.
 */
export function WritingCanvas({ entryId, hasSavedVersion, spreadName, pending, onSave, onPenDown, onPenUp, onRetry, onDiscard, watermark, onClose, copy }: Props) {
  const pageKey = entryId ?? NEW_PAGE_KEY;
  const [load, setLoad] = useState<Load>('loading');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [unsaved, setUnsaved] = useState(false);
  /** What is on screen is a saved version (even an empty one) — "Saved", not "Save". */
  const [isSaved, setIsSaved] = useState(false);
  const [tool, setTool] = useState<Tool>('pen');
  const [ink, setInk] = useState<InkToken>('ink');
  const [saving, setSaving] = useState(false);
  /** Strokes taken off by Undo, newest last, for Redo. Any new stroke empties it. */
  const redoRef = useRef<Stroke[]>([]);
  const [redoCount, setRedoCount] = useState(0);
  /** Which question is open, if any. */
  const [asking, setAsking] = useState<'clear' | 'discard' | null>(null);
  /**
   * This iPad's copy of a version saved but not yet confirmed by the server,
   * as the page opened with it. Leaving without saving puts it back, so what
   * was saved is still what the page reopens with.
   */
  const savedDraft = useRef<Draft | null>(null);

  const box = useRef<HTMLDivElement>(null);
  const lower = useRef<HTMLCanvasElement>(null);
  const upper = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const choice = useRef({ tool, ink });
  choice.current = { tool, ink };
  const pen = useRef({ onPenDown, onPenUp });
  pen.current = { onPenDown, onPenUp };

  /**
   * Records the page's strokes. The lower canvas is redrawn here, in the same
   * task — never in an effect after the next paint, or the finished stroke
   * would blink out for a frame between the two canvases.
   */
  const commit = (next: Stroke[], isUnsaved: boolean, redraw = true) => {
    strokesRef.current = next;
    if (redraw && lower.current) renderPage(lower.current, next);
    setStrokes(next);
    setUnsaved(isUnsaved);
    writeDraft(pageKey, { strokes: next, unsaved: isUnsaved, updatedAt: Date.now() });
  };

  // What to start from: unsaved work on this iPad always wins; otherwise the
  // newer of this iPad's last save and the server's latest version. Decided
  // once per page: the album refreshing after a save must not reload the page
  // under the pen.
  useEffect(() => {
    let cancelled = false;
    const done = (list: Stroke[], isUnsaved: boolean, fromSaved: boolean) => {
      if (cancelled) return;
      strokesRef.current = list;
      setStrokes(list);
      setUnsaved(isUnsaved);
      setIsSaved(fromSaved && !isUnsaved);
      setLoad('ready');
    };
    const draft = readDraft(pageKey);
    savedDraft.current = draft && !draft.unsaved ? draft : null;
    if (draft?.unsaved || !entryId || !hasSavedVersion) {
      done(draft?.strokes ?? [], draft?.unsaved ?? false, draft !== null);
      return;
    }
    setLoad('loading');
    getLatestStrokes(entryId)
      .then((latest) => {
        const server = latest ? (fromDocument(latest.strokes) ?? []) : [];
        if (draft && (!latest || draft.updatedAt >= latest.createdAt)) done(draft.strokes, false, true);
        else done(server, false, latest !== null);
      })
      // Without the saved strokes a new version would drop them from the album's
      // view, so the page waits rather than guess — unless this iPad has its own copy.
      .catch(() => (draft ? done(draft.strokes, false, true) : !cancelled && setLoad('unavailable')));
    return () => {
      cancelled = true;
    };
  }, [pageKey]);

  // Size both canvases to the page at 2× and redraw from the strokes, which are
  // in page units — so this also covers rotation, and undo survives it.
  useEffect(() => {
    if (load !== 'ready' || !box.current) return;
    const fit = () => {
      const area = box.current?.getBoundingClientRect();
      if (!area || !lower.current || !upper.current) return;
      const scale = backingScale();
      for (const canvas of [lower.current, upper.current]) {
        const width = Math.round(area.width * scale);
        const height = Math.round(area.height * scale);
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
      }
      renderPage(lower.current, strokesRef.current);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box.current);
    return () => observer.disconnect();
  }, [load]);

  // The pen.
  useEffect(() => {
    const top = upper.current;
    const bottom = lower.current;
    if (load !== 'ready' || !top || !bottom) return;
    // desynchronized: Chrome skips the compositor for lower latency; others ignore it.
    const upperContext = top.getContext('2d', { desynchronized: true }) as CanvasRenderingContext2D;
    const lowerContext = bottom.getContext('2d') as CanvasRenderingContext2D;
    let current: Stroke | null = null;
    let predicted: [number, number, number][] = [];
    let snapshot: HTMLCanvasElement | null = null;
    let frame = 0;

    const paint = () => {
      frame = 0;
      if (!current) return;
      if (current.tool === 'eraser' && snapshot) {
        clear(lowerContext, bottom);
        lowerContext.drawImage(snapshot, 0, 0);
        setPageTransform(lowerContext, bottom);
        drawStroke(lowerContext, current, { predicted: [] });
      } else {
        clear(upperContext, top);
        setPageTransform(upperContext, top);
        drawStroke(upperContext, current, { predicted });
      }
    };

    const detach = attachPageInput(top, {
      start(pressure) {
        const { tool: chosen, ink: chosenInk } = choice.current;
        current = newStroke(chosen, chosenInk, tokenColor(chosen === 'pencil' ? 'ink-soft' : chosenInk), pressure);
        if (chosen === 'eraser') {
          snapshot = document.createElement('canvas');
          snapshot.width = bottom.width;
          snapshot.height = bottom.height;
          snapshot.getContext('2d')?.drawImage(bottom, 0, 0);
        }
        pen.current.onPenDown();
      },
      move(points, next) {
        if (!current) return;
        current.points.push(...points);
        predicted = next;
        if (!frame) frame = requestAnimationFrame(paint);
      },
      end() {
        cancelAnimationFrame(frame);
        frame = 0;
        const finished = current;
        current = null;
        snapshot = null;
        if (finished && finished.points.length > 0 && finished.tool !== 'eraser') {
          // Ink goes down on the lower canvas before it leaves the upper one.
          setPageTransform(lowerContext, bottom);
          drawStroke(lowerContext, finished);
          clear(upperContext, top);
          commit([...strokesRef.current, finished], true, false);
          forgetRedo();
        } else {
          clear(upperContext, top);
          if (finished && finished.points.length > 0) {
            commit([...strokesRef.current, finished], true);
            forgetRedo();
          } else renderPage(bottom, strokesRef.current);
        }
        pen.current.onPenUp();
      },
      cancel() {
        // A palm, not a stroke: as if it never touched.
        cancelAnimationFrame(frame);
        frame = 0;
        current = null;
        snapshot = null;
        clear(upperContext, top);
        renderPage(bottom, strokesRef.current);
        pen.current.onPenUp();
      },
    });
    return () => {
      detach();
      cancelAnimationFrame(frame);
    };
  }, [load]);

  function forgetRedo() {
    redoRef.current = [];
    setRedoCount(0);
  }

  const undo = () => {
    const last = strokesRef.current.at(-1);
    if (!last) return;
    redoRef.current = [...redoRef.current, last];
    setRedoCount(redoRef.current.length);
    commit(strokesRef.current.slice(0, -1), true);
  };

  const redo = () => {
    const next = redoRef.current.at(-1);
    if (!next) return;
    redoRef.current = redoRef.current.slice(0, -1);
    setRedoCount(redoRef.current.length);
    commit([...strokesRef.current, next], true);
  };

  const clearPage = () => {
    setAsking(null);
    commit([], true);
    forgetRedo();
  };

  /** Cancel: straight out when nothing is unsaved; otherwise only after asking. */
  const cancel = () => (unsaved ? setAsking('discard') : onClose());

  const discardAndClose = () => {
    setAsking(null);
    // Back to how the page stood at its last save on this iPad, or to the
    // server's version: the strokes written since are what goes.
    if (savedDraft.current) writeDraft(pageKey, savedDraft.current);
    else removeDraft(pageKey);
    onClose();
  };

  const save = async () => {
    if (!unsaved || saving) return;
    setSaving(true);
    try {
      await onSave(strokesRef.current);
      setUnsaved(false);
      setIsSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const count = strokes.length;
  const description = `${copy.page.label}, ${spreadName}. ${count} ${count === 1 ? copy.page.stroke : copy.page.strokes}. ${copy.page.hint}`;
  const saveLabel = unsaved || !isSaved ? copy.page.save : copy.page.saved;

  return (
    <div class="writing-desk">
      <div class="writing-page writing-page--live" ref={box}>
        <svg class="writing-page__rules" aria-hidden="true" focusable="false">
          <rect width="100%" height="100%" fill="url(#writing-rules)" />
        </svg>
        <Watermark mark={watermark} />
        {load === 'ready' ? (
          <>
            <canvas ref={lower} class="writing-page__ink" aria-hidden="true" />
            <canvas ref={upper} class="writing-page__pen" role="img" aria-label={description} />
          </>
        ) : (
          <p class={load === 'unavailable' ? 'writing-page__note writing-page__note--problem' : 'writing-page__note'} role="status">
            {load === 'unavailable' ? copy.page.unavailable : copy.page.loading}
          </p>
        )}
        {pending && (
          <div class={pending.state === 'failed' ? 'mount-status mount-status--failed' : 'mount-status mount-status--saving'} role={pending.state === 'failed' ? 'alert' : undefined}>
            {pending.state === 'failed' ? (
              <>
                <button type="button" class="mount-status__retry" onClick={() => onRetry?.(pending.versionId)}>
                  {pending.permanent && pending.message ? pending.message : copy.page.notSaved}
                </button>
                {pending.permanent && (
                  <button type="button" class="mount-status__remove" onClick={() => onDiscard?.(pending.versionId)}>
                    {copy.save.remove}
                  </button>
                )}
              </>
            ) : (
              copy.save.saving
            )}
          </div>
        )}
      </div>

      <div class="writing-tools" role="group" aria-label={copy.page.tools}>
        <div class="writing-tools__set">
          {TOOLS.map(({ tool: option, label }) => (
            <button key={option} type="button" class="writing-tool" aria-pressed={tool === option} onClick={() => setTool(option)}>
              {copy.page[label]}
            </button>
          ))}
        </div>
        <div class="writing-tools__set" role="group" aria-label={copy.page.inks}>
          {INKS.map(({ token, label, class: swatch }) => (
            <button
              key={token}
              type="button"
              class={swatch}
              aria-pressed={tool === 'pen' && ink === token}
              aria-label={copy.page[label]}
              onClick={() => {
                setInk(token);
                setTool('pen');
              }}
            />
          ))}
        </div>
        <div class="writing-tools__set">
          <button type="button" class="writing-tool writing-tool--icon" aria-label={copy.page.undo} title={copy.page.undo} disabled={count === 0 || load !== 'ready'} onClick={undo}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
            </svg>
          </button>
          <button type="button" class="writing-tool writing-tool--icon" aria-label={copy.page.redo} title={copy.page.redo} disabled={redoCount === 0 || load !== 'ready'} onClick={redo}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
              <path d="m15 14 5-5-5-5" />
              <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
            </svg>
          </button>
          <button type="button" class="writing-tool" disabled={count === 0 || load !== 'ready'} onClick={() => setAsking('clear')}>
            {copy.page.clear}
          </button>
          <button type="button" class="writing-tool" disabled={saving} onClick={cancel}>
            {copy.page.cancel}
          </button>
          <button type="button" class="writing-tool writing-tool--save" disabled={!unsaved || saving || load !== 'ready'} onClick={() => void save()}>
            {saveLabel}
          </button>
        </div>
      </div>
      {asking === 'clear' && (
        <ConfirmDialog
          question={copy.page.clearQuestion}
          detail={copy.page.clearDetail}
          yes={copy.page.clearYes}
          no={copy.page.no}
          onConfirm={clearPage}
          onCancel={() => setAsking(null)}
        />
      )}
      {asking === 'discard' && (
        <ConfirmDialog
          question={copy.page.discardQuestion}
          detail={copy.page.discardDetail}
          yes={copy.page.discardYes}
          no={copy.page.no}
          onConfirm={discardAndClose}
          onCancel={() => setAsking(null)}
        />
      )}
    </div>
  );
}
