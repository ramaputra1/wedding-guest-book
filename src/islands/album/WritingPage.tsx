import type { AlbumCopy } from '../../config/site';
import type { AlbumPage } from '../../lib/types';

interface Props {
  page: AlbumPage | null;
  blankLabel: string;
  onRetry?: (versionId: string) => void;
  copy?: AlbumCopy;
}

/** Warm writing paper with faint ruled lines. Phase 5 puts the canvas here. */
export function WritingPage({ page, blankLabel, onRetry, copy }: Props) {
  const pending = page?.pending;
  return (
    <div class="writing-page">
      {/* The ruling pattern is defined once in Album; see album__defs. */}
      <svg class="writing-page__rules" aria-hidden="true" focusable="false">
        <rect width="100%" height="100%" fill="url(#writing-rules)" />
      </svg>
      {page ? (
        <img class="writing-page__ink" src={page.src} alt={page.alt} loading="lazy" decoding="async" />
      ) : (
        <span class="visually-hidden">{blankLabel}</span>
      )}
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
