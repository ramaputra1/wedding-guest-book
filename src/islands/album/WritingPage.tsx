import type { AlbumCopy } from '../../config/site';
import type { AlbumLook } from '../../lib/settings';
import type { AlbumPage } from '../../lib/types';
import { Watermark } from './Watermark';

interface Props {
  page: AlbumPage | null;
  blankLabel: string;
  onRetry?: (versionId: string) => void;
  /** Writer iPads: tapping the page opens it for writing. */
  onWrite?: () => void;
  writeLabel?: string;
  watermark?: AlbumLook['watermark'];
  copy?: AlbumCopy;
}

/** Warm writing paper with faint ruled lines, and the saved handwriting on it. */
export function WritingPage({ page, blankLabel, onRetry, onWrite, writeLabel, watermark, copy }: Props) {
  const pending = page?.pending;
  return (
    <div class="writing-page">
      {/* The ruling pattern is defined once in Album; see album__defs. */}
      <svg class="writing-page__rules" aria-hidden="true" focusable="false">
        <rect width="100%" height="100%" fill="url(#writing-rules)" />
      </svg>
      <Watermark mark={watermark} />
      {page ? (
        <img class="writing-page__ink" src={page.src} alt={page.alt} loading="lazy" decoding="async" />
      ) : (
        <span class="visually-hidden">{blankLabel}</span>
      )}
      {/* The whole sheet is the target, laid over it: a page is chosen by
          touching the page itself, not anything beside it. */}
      {onWrite && <button type="button" class="writing-page__choose" aria-label={writeLabel} onClick={onWrite} />}
      {pending && copy && (
        pending.state === 'failed' ? (
          <div class="mount-status mount-status--failed" role="alert">
            <button type="button" class="mount-status__retry" onClick={() => onRetry?.(pending.versionId)}>
              {pending.permanent && pending.message ? pending.message : copy.page.notSaved}
            </button>
          </div>
        ) : (
          <p class="mount-status mount-status--saving">{copy.save.saving}</p>
        )
      )}
    </div>
  );
}
